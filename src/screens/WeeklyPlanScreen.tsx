import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
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

// 時間帯ボード(ドラッグ配置先)のレイアウト定数。分単位の時刻をそのままpxへ
// 変換して、カードの縦位置・高さが実際の時刻・所要時間と対応するようにする。
const PIXELS_PER_MINUTE = 1.4
const SNAP_MINUTES = 15
const MIN_BLOCK_HEIGHT = 40
const DAY_HEADER_HEIGHT = 24

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minutesOfDate(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function minutesLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = ((totalMinutes % 60) + 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// dateの「日」はそのまま、時刻だけを絶対分数(0時からの経過分。60を超えても
// Dateが自動繰り上げてくれる)で置き換える。
function dateAtMinutes(date: Date, totalMinutes: number): Date {
  const result = new Date(date)
  result.setHours(0, totalMinutes, 0, 0)
  return result
}

interface BoardItem {
  id: string
  kind: 'fixed' | 'action'
  start: Date
  end: Date
  title: string
  actionId?: string
}

function boardItemsForDay(day: DraftDay): BoardItem[] {
  const fixed: BoardItem[] = day.fixedEventsDraft
    .filter((f) => f.start && f.end)
    .map((f, i) => ({
      id: `fixed-${i}`,
      kind: 'fixed' as const,
      start: combineDateAndTime(day.date, f.start),
      end: combineDateAndTime(day.date, f.end),
      title: f.title || '固定予定',
    }))
  const actions: BoardItem[] = day.slots.map((s) => ({
    id: s.actionId,
    kind: 'action' as const,
    start: s.start,
    end: s.end,
    title: '',
    actionId: s.actionId,
  }))
  return [...fixed, ...actions]
}

interface ItemLayout {
  col: number
  cols: number
  top: number
  height: number
}

// 同じ時間帯に本当に重なるカード(固定予定・Action問わず)だけを横に並べて
// 全て掴めるようにするための列割り当て。開始時刻順に、空いている列があれば
// そこへ、なければ新しい列を追加する典型的なカレンダー表示のアルゴリズム。
// ここでの重なり判定は実際の開始/終了時刻で行い、表示上の最低高さ
// (MIN_BLOCK_HEIGHT)は考慮しない — 考慮すると、5分空きで連続する短い
// Action同士まで「重なっている」とみなされ、細い列に分割されて逆に読みにくく
// なるため。
function assignColumns(items: BoardItem[]): Map<string, { col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  const result = new Map<string, { col: number; cols: number }>()
  let cluster: BoardItem[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    const colEnds: number[] = []
    const colOf = new Map<string, number>()
    for (const it of cluster) {
      let placed = false
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= it.start.getTime()) {
          colEnds[c] = it.end.getTime()
          colOf.set(it.id, c)
          placed = true
          break
        }
      }
      if (!placed) {
        colEnds.push(it.end.getTime())
        colOf.set(it.id, colEnds.length - 1)
      }
    }
    const cols = colEnds.length
    for (const it of cluster) result.set(it.id, { col: colOf.get(it.id) ?? 0, cols })
    cluster = []
    clusterEnd = -Infinity
  }

  for (const it of sorted) {
    if (cluster.length > 0 && it.start.getTime() >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end.getTime())
  }
  flush()
  return result
}

// 列(重なりなし同士のグループ)ごとに割り当てた上で、各列内を開始時刻順に
// 積み上げて実際のtop/heightを決める。MIN_BLOCK_HEIGHTで底上げされた1枚の
// 高さが次のカードの本来の開始位置を追い越しそうな場合は、次のカードを
// その分だけ下にずらす(=時間軸上の位置よりカード同士の非重なりを優先する)。
// これにより、時間的には重ならない短いAction同士が縦につぶれて重なって
// 表示される事故を防ぐ。
function computeBoardLayout(items: BoardItem[], gridStartMinutes: number): Map<string, ItemLayout> {
  const columns = assignColumns(items)
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  const laneBottoms: number[] = []
  const GAP_PX = 3
  const result = new Map<string, ItemLayout>()

  for (const it of sorted) {
    const { col, cols } = columns.get(it.id) ?? { col: 0, cols: 1 }
    const desiredTop = (minutesOfDate(it.start) - gridStartMinutes) * PIXELS_PER_MINUTE
    const top = Math.max(desiredTop, (laneBottoms[col] ?? -Infinity) + GAP_PX)
    const naturalHeight = (minutesOfDate(it.end) - minutesOfDate(it.start)) * PIXELS_PER_MINUTE
    const height = Math.max(MIN_BLOCK_HEIGHT, naturalHeight)
    laneBottoms[col] = top + height
    result.set(it.id, { col, cols, top, height })
  }
  return result
}

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

interface DragState {
  cardId: string
  fromDayIndex: number
  pointerId: number
  durationMinutes: number
  grabOffsetPx: number
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
  const [hover, setHover] = useState<{ dayIndex: number; startMinutes: number } | null>(null)

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

  // 各ActionがそのTask内で何番目か(作成順)を出す。予定を組むときに
  // 「このActionの前にまだ他のActionが残っているか」を判断する材料になる。
  const taskActionOrder = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const a of activeActions) {
      const arr = map.get(a.taskId)
      if (arr) arr.push(a.id)
      else map.set(a.taskId, [a.id])
    }
    return map
  }, [activeActions])

  const actionIndexLabel = (id: string): string | null => {
    const action = actionMap.get(id)
    if (!action) return null
    const order = taskActionOrder.get(action.taskId)
    if (!order || order.length <= 1) return null
    const idx = order.indexOf(id)
    if (idx === -1) return null
    return `${idx + 1}/${order.length}`
  }

  // 時間帯ボードの縦軸の範囲(分)。曜日ごとの活動時間・固定予定・実際に
  // 置かれているカードの最小/最大を合わせて、はみ出さないようにする。
  const gridBounds = useMemo(() => {
    if (!draftDays) return { startMinutes: 8 * 60, endMinutes: 20 * 60 }
    let min = Infinity
    let max = -Infinity
    for (const day of draftDays) {
      const weekdayDefault = weekdayDefaultFor(day.date, weekdaySchedule)
      min = Math.min(min, hhmmToMinutes(weekdayDefault.start))
      max = Math.max(max, hhmmToMinutes(weekdayDefault.end))
      for (const f of day.fixedEventsDraft) {
        if (f.start) min = Math.min(min, hhmmToMinutes(f.start))
        if (f.end) max = Math.max(max, hhmmToMinutes(f.end))
      }
      for (const s of day.slots) {
        min = Math.min(min, minutesOfDate(s.start))
        max = Math.max(max, minutesOfDate(s.end))
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return { startMinutes: 8 * 60, endMinutes: 20 * 60 }
    return { startMinutes: Math.floor(min / 60) * 60, endMinutes: Math.ceil(max / 60) * 60 }
  }, [draftDays, weekdaySchedule])

  // 各日のカード配置(列・top・height)。短いActionが5分間隔などで詰まっていても
  // MIN_BLOCK_HEIGHTの底上げで隣のカードと重ならないよう、ここで縦位置を調整済み。
  const dayLayouts = useMemo(() => {
    if (!draftDays) return []
    return draftDays.map((day) => {
      const items = boardItemsForDay(day)
      const layout = computeBoardLayout(items, gridBounds.startMinutes)
      return { items, layout }
    })
  }, [draftDays, gridBounds.startMinutes])

  // 縦積みの底上げで最後のカードが時間軸の終わりより下にはみ出すことがあるため、
  // その分もボードの高さに含めてスクロール領域を確保する。
  const boardHeight = useMemo(() => {
    const natural = (gridBounds.endMinutes - gridBounds.startMinutes) * PIXELS_PER_MINUTE
    let maxBottom = natural
    for (const { layout } of dayLayouts) {
      for (const v of layout.values()) maxBottom = Math.max(maxBottom, v.top + v.height)
    }
    return maxBottom
  }, [dayLayouts, gridBounds])

  const hourMarks = useMemo(() => {
    const marks: number[] = []
    for (let m = gridBounds.startMinutes; m <= gridBounds.endMinutes; m += 60) marks.push(m)
    return marks
  }, [gridBounds])

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

  const handleCardPointerDown = (e: ReactPointerEvent<HTMLDivElement>, item: BoardItem, dayIndex: number) => {
    if (!item.actionId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const durationMinutes = (item.end.getTime() - item.start.getTime()) / 60000
    setDrag({ cardId: item.actionId, fromDayIndex: dayIndex, pointerId: e.pointerId, durationMinutes, grabOffsetPx: e.clientY - rect.top })
    setHover({ dayIndex, startMinutes: minutesOfDate(item.start) })
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
    const columnRect = columnEl.getBoundingClientRect()
    const rawMinutes = (e.clientY - columnRect.top - drag.grabOffsetPx) / PIXELS_PER_MINUTE + gridBounds.startMinutes
    const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES
    const clamped = Math.min(Math.max(snapped, gridBounds.startMinutes), gridBounds.endMinutes - drag.durationMinutes)
    setHover({ dayIndex, startMinutes: clamped })
  }

  const handleCardPointerUp = () => {
    if (drag && hover) {
      moveCardToTime(drag.cardId, drag.fromDayIndex, hover.dayIndex, hover.startMinutes)
    }
    setDrag(null)
    setHover(null)
  }

  // ドロップした時間帯にそのカードの開始時刻を差し替えるだけで、他の
  // カードの時刻には触れない — 上から自動で詰め直されていた以前の挙動と違い、
  // 置いた場所がそのままその日の予定になる。
  const moveCardToTime = (cardId: string, fromDayIndex: number, toDayIndex: number, startMinutes: number) => {
    setDraftDays((prev) => {
      if (!prev) return prev
      const next = prev.map((d) => ({ ...d, cardIds: [...d.cardIds], slots: [...d.slots] }))
      const fromDay = next[fromDayIndex]
      const slotIdx = fromDay.slots.findIndex((s) => s.actionId === cardId)
      if (slotIdx === -1) return prev
      const [slot] = fromDay.slots.splice(slotIdx, 1)

      const toDay = next[toDayIndex]
      const durationMinutes = (slot.end.getTime() - slot.start.getTime()) / 60000
      const start = dateAtMinutes(toDay.date, startMinutes)
      const end = new Date(start.getTime() + durationMinutes * 60000)
      toDay.slots.push({ actionId: cardId, start, end })
      toDay.slots.sort((a, b) => a.start.getTime() - b.start.getTime())
      toDay.cardIds = toDay.slots.map((s) => s.actionId)
      if (fromDayIndex !== toDayIndex) fromDay.cardIds = fromDay.slots.map((s) => s.actionId)
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
              <p>「下書きを作る」を押すと、締切が近い順にActionが自動で各日の時間帯に振り分けられます。カードをドラッグすると、曜日をまたいで動かしたり、同じ日の中で時刻を変えたりできます。ドロップした場所がそのままその時刻になります。</p>
              <p>カード右上の「2/4」のような数字は、そのActionが元のタスクの中で何番目かを表します。前のActionがまだ残っている場合の参考にしてください。</p>
              <p>「この内容で確定する」を押すと7日分がまとめて保存されます。</p>
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
            <p className="text-xs text-outline">
              カードをドラッグして、時間帯の中の置きたい時刻へ動かせます。カード右上の「2/4」のような数字は、そのタスク内で何番目のActionかを表します。
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <div className="flex-shrink-0 w-11">
                <div style={{ height: DAY_HEADER_HEIGHT }} />
                <div className="relative" style={{ height: boardHeight }}>
                  {hourMarks.map((m) => (
                    <div
                      key={m}
                      className="absolute right-1 -translate-y-1/2 text-[10px] text-outline font-mono"
                      style={{ top: (m - gridBounds.startMinutes) * PIXELS_PER_MINUTE }}
                    >
                      {minutesLabel(m)}
                    </div>
                  ))}
                </div>
              </div>

              {draftDays.map((day, dayIndex) => {
                const { items, layout } = dayLayouts[dayIndex] ?? { items: [], layout: new Map<string, ItemLayout>() }
                return (
                  <div key={day.dateKey} className="flex-shrink-0 w-40">
                    <p className="text-xs font-bold text-on-surface text-center" style={{ height: DAY_HEADER_HEIGHT }}>
                      {WEEKDAY_LABELS[day.date.getDay()]}曜 ({day.date.getMonth() + 1}/{day.date.getDate()})
                    </p>
                    <div
                      data-day-index={dayIndex}
                      className={`relative rounded-lg neumorphic-sunken overflow-hidden ${
                        hover?.dayIndex === dayIndex ? 'ring-2 ring-primary/40' : ''
                      }`}
                      style={{ height: boardHeight }}
                    >
                      {hourMarks.map((m) => (
                        <div
                          key={m}
                          className="absolute inset-x-0 border-t border-outline-variant/15"
                          style={{ top: (m - gridBounds.startMinutes) * PIXELS_PER_MINUTE }}
                        />
                      ))}

                      {items.length === 0 && <p className="text-[11px] text-outline text-center pt-6">配置なし</p>}

                      {items.map((item) => {
                        const { col, cols, top, height } = layout.get(item.id) ?? { col: 0, cols: 1, top: 0, height: MIN_BLOCK_HEIGHT }
                        const widthPct = 100 / cols
                        const style: CSSProperties = { top, height, left: `${col * widthPct}%`, width: `calc(${widthPct}% - 3px)` }

                        if (item.kind === 'fixed') {
                          return (
                            <div
                              key={item.id}
                              style={style}
                              className="absolute rounded-md bg-surface-container-high border border-outline-variant/30 p-1.5 text-[10px] leading-tight overflow-hidden"
                            >
                              <p className="font-bold text-on-surface-variant truncate">{item.title}</p>
                              <p className="text-outline font-mono">
                                {formatTime(item.start)}〜{formatTime(item.end)}
                              </p>
                            </div>
                          )
                        }

                        const label = actionIndexLabel(item.actionId!)
                        return (
                          <div
                            key={item.id}
                            onPointerDown={(e) => handleCardPointerDown(e, item, dayIndex)}
                            onPointerMove={handleCardPointerMove}
                            onPointerUp={handleCardPointerUp}
                            onPointerCancel={handleCardPointerUp}
                            style={style}
                            className={`absolute neumorphic-raised rounded-md p-1.5 text-[10px] leading-tight touch-none select-none cursor-grab active:cursor-grabbing bg-surface overflow-hidden ${
                              drag?.cardId === item.actionId ? 'opacity-40' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <p className="font-bold text-on-surface truncate">{actionTitleOf(item.actionId!)}</p>
                              {label && (
                                <span className="flex-shrink-0 text-[9px] font-bold text-primary bg-primary/10 rounded px-1">{label}</span>
                              )}
                            </div>
                            <p className="text-on-surface-variant truncate">{taskTitleOf(item.actionId!)}</p>
                            <p className="text-primary font-mono">
                              {formatTime(item.start)}〜{formatTime(item.end)}
                            </p>
                          </div>
                        )
                      })}

                      {drag && hover?.dayIndex === dayIndex && (
                        <div
                          className="absolute inset-x-1 rounded-md border-2 border-dashed border-primary/70 bg-primary/10 pointer-events-none flex justify-center"
                          style={{
                            top: (hover.startMinutes - gridBounds.startMinutes) * PIXELS_PER_MINUTE,
                            height: Math.max(MIN_BLOCK_HEIGHT, drag.durationMinutes * PIXELS_PER_MINUTE),
                          }}
                        >
                          <span className="text-[9px] font-bold text-primary mt-0.5">{minutesLabel(hover.startMinutes)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
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
