import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { subscribeActiveActions, type Action } from '../lib/actions'
import { subscribeScheduledTasks, type Task } from '../lib/tasks'
import { upsertDailyPlansBatch } from '../lib/dailyPlans'
import { buildDailySchedule, type CandidateAction, type PlannedBlock } from '../lib/dailyPlanEngine'
import { getWeekDays, formatDateKey, combineDateAndTime, formatTime } from '../lib/dateUtils'
import { subscribeUserSettings, setWeekdaySchedule, DEFAULT_WEEKDAY_SCHEDULE, type WeekdayScheduleMap } from '../lib/userSettings'
import { rankCandidateActions } from '../lib/candidateRanking'
import FixedEventEditor, { type FixedEventDraft } from '../components/FixedEventEditor'
import HelpButton from '../components/HelpButton'

type Step = 'setup' | 'board'

// 疲労度がまだ分からない週初めの下書き生成では、間を取ったやや控えめな
// 詰め込み度を使う（前夜の見直しで実際の体調に応じて調整し直せる）。
const WEEK_DRAFT_FILL_RATIO = 0.7

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

interface DraftDay {
  date: Date
  dateKey: string
  fixedEventsDraft: FixedEventDraft[]
  cardIds: string[]
  slots: PlannedBlock[]
}

function weekdayDefaultFor(date: Date, schedule: WeekdayScheduleMap) {
  return schedule[String(date.getDay())] ?? DEFAULT_WEEKDAY_SCHEDULE[String(date.getDay())]
}

// ドラッグでの並べ替え・日またぎ移動の後、その日のカード順のまま時刻を
// 詰め直す。下書き生成(buildDailySchedule)と違い、ユーザーが明示的に置いた
// 順序を尊重するためfillRatio=1(バッファを強制しない)で計算し、それでも
// 収まらない分は最後に単純追記する。
function packDayCards(
  date: Date,
  schedule: WeekdayScheduleMap,
  fixedEventsDraft: FixedEventDraft[],
  cardIds: string[],
  minutesOf: (id: string) => number,
): PlannedBlock[] {
  const weekdayDefault = weekdayDefaultFor(date, schedule)
  const dayStart = combineDateAndTime(date, weekdayDefault.start)
  const dayEnd = combineDateAndTime(date, weekdayDefault.end)
  const fixedEvents = fixedEventsDraft
    .filter((f) => f.start && f.end)
    .map((f) => ({ start: combineDateAndTime(date, f.start), end: combineDateAndTime(date, f.end), title: f.title || undefined }))
  const otherActions: CandidateAction[] = cardIds.map((id) => ({ actionId: id, estimatedMinutes: minutesOf(id) }))
  const result = buildDailySchedule({ dayStart, dayEnd, fixedEvents, fillRatio: 1, requiredActions: [], otherActions })
  if (result.unscheduledActionIds.length === 0) return result.plannedSlots

  let cursor = result.plannedSlots.length > 0 ? result.plannedSlots[result.plannedSlots.length - 1].end : dayEnd
  const overflow: PlannedBlock[] = result.unscheduledActionIds.map((id) => {
    const minutes = minutesOf(id)
    const start = cursor
    const end = new Date(cursor.getTime() + minutes * 60000)
    cursor = end
    return { actionId: id, start, end }
  })
  return [...result.plannedSlots, ...overflow]
}

interface DragState {
  cardId: string
  fromDayIndex: number
  pointerId: number
}

export default function WeeklyPlanScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // 今週のうち、今日以降の日だけを対象にする（過ぎた日を計画しても意味がないため）。
  const weekDays = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return getWeekDays(new Date()).filter((d) => d.getTime() >= startOfToday.getTime())
  }, [])

  const [activeActions, setActiveActions] = useState<Action[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([])
  const [weekdaySchedule, setWeekdayScheduleLocal] = useState<WeekdayScheduleMap>(DEFAULT_WEEKDAY_SCHEDULE)
  const [fixedEventsByDay, setFixedEventsByDay] = useState<Record<string, FixedEventDraft[]>>({})
  const [step, setStep] = useState<Step>('setup')
  const [draftDays, setDraftDays] = useState<DraftDay[] | null>(null)
  const [committing, setCommitting] = useState(false)
  const settingsLoadedRef = useRef(false)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [hover, setHover] = useState<{ dayIndex: number; index: number } | null>(null)

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeActiveActions(user.uid, setActiveActions)
    const unsub2 = subscribeScheduledTasks(user.uid, setScheduledTasks)
    const unsub3 = subscribeUserSettings(user.uid, (settings) => {
      if (settingsLoadedRef.current) return
      settingsLoadedRef.current = true
      if (settings?.weekdaySchedule) setWeekdayScheduleLocal(settings.weekdaySchedule)
    })
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [user])

  const actionMap = useMemo(() => new Map(activeActions.map((a) => [a.id, a])), [activeActions])
  const minutesOf = (id: string) => actionMap.get(id)?.estimatedMinutes ?? 15
  const rankedCandidates = useMemo(() => rankCandidateActions(activeActions, scheduledTasks), [activeActions, scheduledTasks])

  const updateWeekdayTime = (weekday: number, patch: Partial<{ start: string; end: string }>) => {
    setWeekdayScheduleLocal((prev) => {
      const current = prev[String(weekday)] ?? DEFAULT_WEEKDAY_SCHEDULE[String(weekday)]
      return { ...prev, [String(weekday)]: { ...current, ...patch } }
    })
  }

  const updateFixedEvents = (dateKey: string, next: FixedEventDraft[]) => {
    setFixedEventsByDay((prev) => ({ ...prev, [dateKey]: next }))
  }

  // その週で自分がまだ選んでいない候補Actionを、優先順位順に各日へ
  // 順に詰めていく（buildDailyScheduleの「収まらなかった分」を次の日の
  // キューへ引き継ぐことで、週全体への自動振り分けにしている）。
  const handleGenerateDrafts = async () => {
    let queue: CandidateAction[] = rankedCandidates.map(({ action }) => ({ actionId: action.id, estimatedMinutes: action.estimatedMinutes }))
    const days: DraftDay[] = []

    for (const date of weekDays) {
      const dateKey = formatDateKey(date)
      const fixedEventsDraft = fixedEventsByDay[dateKey] ?? []
      const weekdayDefault = weekdayDefaultFor(date, weekdaySchedule)
      const dayStart = combineDateAndTime(date, weekdayDefault.start)
      const dayEnd = combineDateAndTime(date, weekdayDefault.end)
      const fixedEvents = fixedEventsDraft
        .filter((f) => f.start && f.end)
        .map((f) => ({ start: combineDateAndTime(date, f.start), end: combineDateAndTime(date, f.end), title: f.title || undefined }))

      const result = buildDailySchedule({ dayStart, dayEnd, fixedEvents, fillRatio: WEEK_DRAFT_FILL_RATIO, requiredActions: [], otherActions: queue })

      days.push({
        date,
        dateKey,
        fixedEventsDraft,
        cardIds: result.plannedSlots.map((s) => s.actionId),
        slots: result.plannedSlots,
      })
      queue = result.unscheduledActionIds.map((id) => ({ actionId: id, estimatedMinutes: minutesOf(id) }))
    }

    setDraftDays(days)
    setStep('board')

    if (user) {
      // 曜日別の既定時刻は次回以降の週次セッション・前夜見直しでも使うので保存しておく。
      await setWeekdaySchedule(user.uid, weekdaySchedule)
    }
  }

  const handleCardPointerDown = (e: ReactPointerEvent<HTMLDivElement>, cardId: string, dayIndex: number) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ cardId, fromDayIndex: dayIndex, pointerId: e.pointerId })
  }

  const handleCardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const columnEl = el?.closest<HTMLElement>('[data-day-index]')
    if (!columnEl) {
      setHover(null)
      return
    }
    const dayIndex = Number(columnEl.dataset.dayIndex)
    const cardEls = Array.from(columnEl.querySelectorAll<HTMLElement>('[data-card-index]'))
    let index = cardEls.length
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect()
      if (e.clientY < rect.top + rect.height / 2) {
        index = i
        break
      }
    }
    setHover({ dayIndex, index })
  }

  const handleCardPointerUp = () => {
    if (drag && hover) {
      moveDraftCard(drag.cardId, drag.fromDayIndex, hover.dayIndex, hover.index)
    }
    setDrag(null)
    setHover(null)
  }

  const moveDraftCard = (cardId: string, fromDayIndex: number, toDayIndex: number, toIndex: number) => {
    setDraftDays((prev) => {
      if (!prev) return prev
      const next = prev.map((d) => ({ ...d, cardIds: [...d.cardIds] }))
      const fromDay = next[fromDayIndex]
      const idx = fromDay.cardIds.indexOf(cardId)
      if (idx === -1) return prev
      fromDay.cardIds.splice(idx, 1)

      const toDay = next[toDayIndex]
      let insertAt = toIndex
      if (fromDayIndex === toDayIndex && idx < insertAt) insertAt -= 1
      toDay.cardIds.splice(insertAt, 0, cardId)

      fromDay.slots = packDayCards(fromDay.date, weekdaySchedule, fromDay.fixedEventsDraft, fromDay.cardIds, minutesOf)
      if (toDayIndex !== fromDayIndex) {
        toDay.slots = packDayCards(toDay.date, weekdaySchedule, toDay.fixedEventsDraft, toDay.cardIds, minutesOf)
      }
      return next
    })
  }

  const handleCommit = async () => {
    if (!user || !draftDays) return
    setCommitting(true)
    try {
      await upsertDailyPlansBatch(
        user.uid,
        draftDays.map((d) => ({
          date: d.dateKey,
          updates: {
            selectedActionIds: d.cardIds,
            plannedSlots: d.slots.map((s) => ({ actionId: s.actionId, start: Timestamp.fromDate(s.start), end: Timestamp.fromDate(s.end) })),
            bufferSlots: [],
            freeTimeSlots: [],
            calendarBusySlots: d.fixedEventsDraft
              .filter((f) => f.start && f.end)
              .map((f) => {
                const slot = { start: Timestamp.fromDate(combineDateAndTime(d.date, f.start)), end: Timestamp.fromDate(combineDateAndTime(d.date, f.end)) } as {
                  start: Timestamp
                  end: Timestamp
                  title?: string
                }
                if (f.title) slot.title = f.title
                return slot
              }),
            dayEndTime: Timestamp.fromDate(combineDateAndTime(d.date, weekdayDefaultFor(d.date, weekdaySchedule).end)),
          },
        })),
      )
      navigate('/plan')
    } finally {
      setCommitting(false)
    }
  }

  const actionTitleOf = (id: string) => actionMap.get(id)?.title ?? '(削除されたAction)'
  const taskTitleOf = (id: string) => actionMap.get(id)?.taskTitle ?? ''

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-3xl font-bold text-primary">週の予定をまとめて立てる</h2>
              <p className="text-sm text-on-surface-variant">
                {weekDays[0]?.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 〜{' '}
                {weekDays[weekDays.length - 1]?.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
              </p>
            </div>
            <HelpButton title="週次プランニングの使い方">
              <p>まず曜日ごとの活動時間の目安と、分かっている固定予定（会議など）を入力します。</p>
              <p>「下書きを作る」を押すと、締切が近い順にActionが自動で各日に振り分けられます。カードをドラッグして曜日をまたいで動かしたり、同じ日の中で順番を入れ替えたりできます。</p>
              <p>時刻は各日の並び順から自動計算されます。「この内容で確定する」を押すと7日分がまとめて保存されます。</p>
              <p>体調はまだ分からないので、詰め込み具合はやや控えめにしています。前夜の見直し（Planの「明日」タブ）で実際の体調に応じて調整できます。</p>
            </HelpButton>
          </div>
          <button onClick={() => navigate('/plan')} className="text-sm font-bold text-on-surface-variant hover:text-primary">
            閉じる
          </button>
        </header>

        {step === 'setup' && (
          <div className="space-y-6">
            <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest">曜日ごとの活動時間</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {weekDays.map((d) => {
                  const weekday = d.getDay()
                  const value = weekdayDefaultFor(d, weekdaySchedule)
                  return (
                    <div key={formatDateKey(d)} className="flex items-center gap-2 neumorphic-sunken rounded-lg p-3">
                      <span className="text-sm font-bold text-on-surface w-16 flex-shrink-0">
                        {WEEKDAY_LABELS[weekday]}曜 ({d.getMonth() + 1}/{d.getDate()})
                      </span>
                      <input
                        type="time"
                        className="p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                        value={value.start}
                        onChange={(e) => updateWeekdayTime(weekday, { start: e.target.value })}
                      />
                      <span className="text-xs text-outline">〜</span>
                      <input
                        type="time"
                        className="p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                        value={value.end}
                        onChange={(e) => updateWeekdayTime(weekday, { end: e.target.value })}
                      />
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-6">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest">固定予定（分かっている分だけでOK）</h3>
              {weekDays.map((d) => {
                const dateKey = formatDateKey(d)
                return (
                  <div key={dateKey} className="space-y-2 pb-4 border-b border-outline-variant/10 last:border-0 last:pb-0">
                    <p className="text-xs font-bold text-on-surface-variant">
                      {WEEKDAY_LABELS[d.getDay()]}曜 ({d.getMonth() + 1}/{d.getDate()})
                    </p>
                    <FixedEventEditor title="" value={fixedEventsByDay[dateKey] ?? []} onChange={(next) => updateFixedEvents(dateKey, next)} />
                  </div>
                )
              })}
            </section>

            <button
              onClick={handleGenerateDrafts}
              className="btn-squish w-full neumorphic-raised bg-primary text-on-primary py-4 rounded-full font-bold text-lg"
            >
              下書きを作る
            </button>
          </div>
        )}

        {step === 'board' && draftDays && (
          <div className="space-y-6">
            <p className="text-xs text-outline">カードをドラッグして曜日をまたいで動かしたり、同じ日の中で順番を入れ替えたりできます。</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {draftDays.map((day, dayIndex) => (
                <div
                  key={day.dateKey}
                  data-day-index={dayIndex}
                  className={`flex-shrink-0 w-56 neumorphic-sunken rounded-lg p-3 space-y-2 min-h-[200px] ${
                    hover?.dayIndex === dayIndex ? 'ring-2 ring-primary/40' : ''
                  }`}
                >
                  <p className="text-xs font-bold text-on-surface text-center">
                    {WEEKDAY_LABELS[day.date.getDay()]}曜 ({day.date.getMonth() + 1}/{day.date.getDate()})
                  </p>
                  {day.slots.length === 0 && <p className="text-[11px] text-outline text-center py-6">配置なし</p>}
                  {day.slots.map((slot, cardIndex) => (
                    <div
                      key={slot.actionId}
                      data-card-index={cardIndex}
                      data-day-index={dayIndex}
                      onPointerDown={(e) => handleCardPointerDown(e, slot.actionId, dayIndex)}
                      onPointerMove={handleCardPointerMove}
                      onPointerUp={handleCardPointerUp}
                      onPointerCancel={handleCardPointerUp}
                      className={`neumorphic-raised rounded-lg p-2.5 text-xs touch-none select-none cursor-grab active:cursor-grabbing bg-surface ${
                        drag?.cardId === slot.actionId ? 'opacity-40' : ''
                      }`}
                    >
                      <p className="font-bold text-on-surface truncate">{actionTitleOf(slot.actionId)}</p>
                      <p className="text-on-surface-variant truncate">{taskTitleOf(slot.actionId)}</p>
                      <p className="text-primary font-mono mt-0.5">{formatTime(slot.start)} 〜 {formatTime(slot.end)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('setup')}
                disabled={committing}
                className="flex-1 neumorphic-raised bg-surface text-on-surface-variant py-3 rounded-full font-bold disabled:opacity-50"
              >
                入力に戻る
              </button>
              <button
                onClick={handleCommit}
                disabled={committing}
                className="btn-squish flex-1 neumorphic-raised bg-primary text-on-primary py-3 rounded-full font-bold disabled:opacity-50"
              >
                {committing ? '保存しています…' : 'この内容で確定する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
