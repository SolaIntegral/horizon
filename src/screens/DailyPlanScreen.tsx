import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { subscribeScheduledTasks, type Task } from '../lib/tasks'
import { subscribeActiveActions, setActionDeferredTo, type Action } from '../lib/actions'
import { subscribeDailyPlan, upsertDailyPlan, type DailyPlan, type PlannedSlot, type TimeSlot } from '../lib/dailyPlans'
import { buildDailySchedule, type CandidateAction, type FixedEvent } from '../lib/dailyPlanEngine'
import { addDays, combineDateAndTime, formatDateKey, timeToHHMM } from '../lib/dateUtils'
import HelpButton from '../components/HelpButton'
import MorningSetupForm from '../components/MorningSetupForm'

type DayTab = 'today' | 'tomorrow' | 'plus2'

const REPLAN_FILL_RATIO = 0.75

const replanReasons = ['急な予定が入った', '体調・集中力が変わった', 'Missionを想定より大きかった', '優先度が変わった', '必要な情報が揃っていない', 'その他']

interface TimelineBlock {
  key: string
  start: Date
  end: Date
  kind: 'fixed' | 'action' | 'buffer'
  title: string
  actionId?: string
  sourceIndex?: number // index into plan.plannedSlots, for 'action' blocks
}

function toTimelineBlocks(plan: DailyPlan, actionTitleOf: (id: string) => string): TimelineBlock[] {
  const blocks: TimelineBlock[] = []
  plan.calendarBusySlots.forEach((s, i) => {
    blocks.push({ key: `fixed-${i}`, start: s.start.toDate(), end: s.end.toDate(), kind: 'fixed', title: s.title || '固定予定' })
  })
  plan.plannedSlots.forEach((s, i) => {
    blocks.push({
      key: `action-${i}`,
      start: s.start.toDate(),
      end: s.end.toDate(),
      kind: 'action',
      title: actionTitleOf(s.actionId),
      actionId: s.actionId,
      sourceIndex: i,
    })
  })
  plan.bufferSlots.forEach((s, i) => {
    blocks.push({ key: `buffer-${i}`, start: s.start.toDate(), end: s.end.toDate(), kind: 'buffer', title: 'バッファ' })
  })
  return blocks.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

export default function DailyPlanScreen() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const today = useMemo(() => new Date(), [])
  const todayKey = formatDateKey(today)
  const tomorrowKey = formatDateKey(addDays(today, 1))
  const plus2Key = formatDateKey(addDays(today, 2))

  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([])
  const [activeActions, setActiveActions] = useState<Action[]>([])
  const [plan, setPlan] = useState<DailyPlan | null>(null)
  const [activeTab, setActiveTab] = useState<DayTab>('today')
  const [editingSetup, setEditingSetup] = useState(false)

  const [replanStep, setReplanStep] = useState<null | 'reason' | 'compare'>(null)
  const [replanReason, setReplanReason] = useState<string | null>(null)
  const [replanProposal, setReplanProposal] = useState<{ plannedSlots: PlannedSlot[]; bufferSlots: TimeSlot[] } | null>(null)
  const [applyingReplan, setApplyingReplan] = useState(false)

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeScheduledTasks(user.uid, setScheduledTasks)
    const unsub2 = subscribeActiveActions(user.uid, setActiveActions)
    const unsub3 = subscribeDailyPlan(user.uid, todayKey, (p) => {
      setPlan(p)
      if (!p) setEditingSetup(true)
    })
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, todayKey])

  // Wait for the plan to actually load before entering the replan reason
  // step — flipping into it immediately from the URL param risked the user
  // (or a fast test) clicking a reason before `plan` existed, silently no-op'ing.
  useEffect(() => {
    if (searchParams.get('replan') === '1' && plan && !editingSetup && replanStep === null) {
      setReplanStep('reason')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, editingSetup])

  const actionMap = useMemo(() => new Map(activeActions.map((a) => [a.id, a])), [activeActions])
  const actionTitleOf = (id: string) => actionMap.get(id)?.title ?? '(削除されたAction)'
  const taskMap = useMemo(() => new Map(scheduledTasks.map((t) => [t.id, t])), [scheduledTasks])

  const closeReplan = () => {
    setReplanStep(null)
    setReplanReason(null)
    setReplanProposal(null)
    if (searchParams.get('replan')) setSearchParams({}, { replace: true })
  }

  const handleSelectReplanReason = (reason: string) => {
    if (!plan?.dayEndTime) return
    setReplanReason(reason)

    const fixedEvents: FixedEvent[] = plan.calendarBusySlots.map((s) => ({ start: s.start.toDate(), end: s.end.toDate(), title: s.title }))
    const requiredIds = plan.requiredActionIds ?? []
    const requiredActions: CandidateAction[] = requiredIds
      .filter((id) => actionMap.has(id))
      .map((id) => ({ actionId: id, estimatedMinutes: actionMap.get(id)!.estimatedMinutes }))
    const otherActions: CandidateAction[] = plan.selectedActionIds
      .filter((id) => actionMap.has(id) && !requiredIds.includes(id))
      .map((id) => ({ actionId: id, estimatedMinutes: actionMap.get(id)!.estimatedMinutes }))

    const result = buildDailySchedule({
      dayStart: new Date(),
      dayEnd: plan.dayEndTime.toDate(),
      fixedEvents,
      fillRatio: REPLAN_FILL_RATIO,
      requiredActions,
      otherActions,
    })

    setReplanProposal({
      plannedSlots: result.plannedSlots.map((p) => ({ actionId: p.actionId, start: Timestamp.fromDate(p.start), end: Timestamp.fromDate(p.end) })),
      bufferSlots: result.bufferSlots.map((b) => ({ start: Timestamp.fromDate(b.start), end: Timestamp.fromDate(b.end) })),
    })
    setReplanStep('compare')
  }

  const handleApplyReplan = async () => {
    if (!user || !replanProposal) return
    setApplyingReplan(true)
    try {
      await upsertDailyPlan(user.uid, todayKey, { plannedSlots: replanProposal.plannedSlots, bufferSlots: replanProposal.bufferSlots })
      closeReplan()
    } finally {
      setApplyingReplan(false)
    }
  }

  const handleChangeBlockStart = async (index: number, newStartHHMM: string) => {
    if (!user || !plan) return
    const block = plan.plannedSlots[index]
    if (!block) return
    const durationMs = block.end.toDate().getTime() - block.start.toDate().getTime()
    const newStart = combineDateAndTime(today, newStartHHMM)
    const newEnd = new Date(newStart.getTime() + durationMs)
    const nextSlots = plan.plannedSlots.map((s, i) => (i === index ? { actionId: s.actionId, start: Timestamp.fromDate(newStart), end: Timestamp.fromDate(newEnd) } : s))
    await upsertDailyPlan(user.uid, todayKey, { plannedSlots: nextSlots })
  }

  const handleMoveToTomorrow = async (index: number) => {
    if (!user || !plan) return
    const block = plan.plannedSlots[index]
    if (!block) return
    const nextSlots = plan.plannedSlots.filter((_, i) => i !== index)
    await upsertDailyPlan(user.uid, todayKey, { plannedSlots: nextSlots })
    await setActionDeferredTo(block.actionId, Timestamp.fromDate(addDays(today, 1)))
  }

  const moveBlock = async (index: number, direction: -1 | 1) => {
    if (!user || !plan) return
    const otherIndex = index + direction
    const slots = plan.plannedSlots
    if (otherIndex < 0 || otherIndex >= slots.length) return
    const a = slots[index]
    const b = slots[otherIndex]
    const nextSlots = slots.map((s, i) => {
      if (i === index) return { actionId: a.actionId, start: b.start, end: b.end }
      if (i === otherIndex) return { actionId: b.actionId, start: a.start, end: a.end }
      return s
    })
    await upsertDailyPlan(user.uid, todayKey, { plannedSlots: nextSlots })
  }

  const notScheduledIds = plan ? plan.selectedActionIds.filter((id) => !plan.plannedSlots.some((s) => s.actionId === id)) : []

  const tomorrowPreview = useMemo(() => {
    return activeActions.filter((a) => {
      if (a.deferredTo && formatDateKey(a.deferredTo.toDate()) === tomorrowKey) return true
      const task = taskMap.get(a.taskId)
      return task?.deadline && formatDateKey(task.deadline.toDate()) === tomorrowKey
    })
  }, [activeActions, taskMap, tomorrowKey])

  const plus2Preview = useMemo(() => {
    return activeActions.filter((a) => {
      if (a.deferredTo && formatDateKey(a.deferredTo.toDate()) === plus2Key) return true
      const task = taskMap.get(a.taskId)
      return task?.deadline && formatDateKey(task.deadline.toDate()) === plus2Key
    })
  }, [activeActions, taskMap, plus2Key])

  const timelineBlocks = plan ? toTimelineBlocks(plan, actionTitleOf) : []

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-4xl font-bold text-primary">Today's Plan</h2>
              <HelpButton title="Planの使い方（1日の予定表）">
                <p>1日の時間割を作る画面です。まず今の体調・睡眠時間、今日中に終わらせたいこと（必須目標）、今日進めるAction、固定予定（会議など）、終了予定時刻を入力します。</p>
                <p>「必須」に指定したAction（最大2件）は午前中に優先配置されます。体調が「しんどい」場合は詰め込む量を自動的に減らし、空き時間の一部は必ず「バッファ」として空けておきます。</p>
                <p>固定予定は、Googleカレンダー連携が入るまでの仮の手入力です。</p>
                <p>「予定表を作成」を押すと時間割ができます。各Actionの開始時刻の変更・並び替え（↑↓）・「明日に回す」で自由に調整できます。「今日は入りませんでした」に出たActionは、今日の枠には収まらなかったものです。</p>
                <p>「明日」「3日後まで」タブは締切や「明日に回す」で回したActionの簡易プレビューです。本格的な時間割は当日の朝にあらためて作成してください。</p>
                <p>Horiメニューの「今日の計画を見直す」からは、理由を選ぶと残り時間だけを組み直した修正案を確認できます（現在の予定と比較してから適用できます）。</p>
              </HelpButton>
            </div>
            <p className="text-lg text-on-surface-variant">{today.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
          </div>
          {plan && !editingSetup && !replanStep && (
            <button onClick={() => setEditingSetup(true)} className="neumorphic-raised px-4 py-2 rounded-full text-sm font-bold text-primary">
              予定を作り直す
            </button>
          )}
        </header>

        <div className="flex gap-3">
          {(['today', 'tomorrow', 'plus2'] as DayTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                activeTab === tab ? 'neumorphic-sunken text-primary' : 'neumorphic-raised text-on-surface-variant'
              }`}
            >
              {tab === 'today' ? '今日' : tab === 'tomorrow' ? '明日' : '3日後まで'}
            </button>
          ))}
        </div>

        {activeTab === 'today' && !editingSetup && replanStep === 'reason' && (
          <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
            <h3 className="text-lg font-bold text-on-surface">計画を見直す理由は？</h3>
            <div className="flex flex-wrap gap-2">
              {replanReasons.map((r) => (
                <button key={r} onClick={() => handleSelectReplanReason(r)} className="px-4 py-2 neumorphic-raised rounded-full text-sm font-bold text-on-surface-variant">
                  {r}
                </button>
              ))}
            </div>
            <button onClick={closeReplan} className="text-sm font-bold text-on-surface-variant hover:text-primary">
              キャンセル
            </button>
          </section>
        )}

        {activeTab === 'today' && !editingSetup && replanStep === 'compare' && replanProposal && plan && (
          <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-6">
            <h3 className="text-lg font-bold text-on-surface">修正案を確認</h3>
            {replanReason && <p className="text-xs text-outline">理由: {replanReason}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-outline uppercase tracking-widest">現在の予定</h4>
                {[...plan.plannedSlots]
                  .sort((a, b) => a.start.toMillis() - b.start.toMillis())
                  .map((s, i) => (
                    <div key={i} className="neumorphic-sunken rounded-lg p-3 text-sm">
                      <span className="font-bold text-outline">{formatTime(s.start.toDate())}</span> {actionTitleOf(s.actionId)}
                    </div>
                  ))}
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">新しい提案</h4>
                {replanProposal.plannedSlots.map((s, i) => (
                  <div key={i} className="neumorphic-raised rounded-lg p-3 text-sm ring-1 ring-primary/20">
                    <span className="font-bold text-primary">{formatTime(s.start.toDate())}</span> {actionTitleOf(s.actionId)}
                  </div>
                ))}
                {replanProposal.plannedSlots.length === 0 && <p className="text-sm text-outline">残り時間に収まるActionがありません。</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={closeReplan} className="px-4 py-2 rounded-full text-sm font-bold text-on-surface-variant">
                やめる
              </button>
              <button
                onClick={handleApplyReplan}
                disabled={applyingReplan}
                className="btn-squish neumorphic-raised bg-primary text-white px-6 py-2 rounded-full text-sm font-bold disabled:opacity-50"
              >
                {applyingReplan ? '適用しています…' : 'この案を適用する'}
              </button>
            </div>
          </section>
        )}

        {activeTab === 'today' && editingSetup && (
          <MorningSetupForm
            activeActions={activeActions}
            scheduledTasks={scheduledTasks}
            existingPlan={plan}
            onComplete={() => setEditingSetup(false)}
          />
        )}

        {activeTab === 'today' && !editingSetup && !replanStep && plan && (
          <div className="space-y-6">
            {plan.requiredGoal && (
              <div className="neumorphic-sunken p-5 rounded-lg bg-primary/5 border-l-4 border-primary">
                <p className="text-xs font-bold text-primary uppercase mb-1">今日中に終わらせたいこと</p>
                <p className="text-sm text-on-surface">{plan.requiredGoal}</p>
              </div>
            )}

            <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-3">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest">予定表</h3>
              {timelineBlocks.length === 0 && <p className="text-sm text-outline">予定はまだありません。</p>}
              {timelineBlocks.map((block) => {
                const actionIndex = block.sourceIndex ?? -1
                return (
                  <div
                    key={block.key}
                    className={`flex items-center gap-4 p-4 rounded-lg ${
                      block.kind === 'action' ? 'neumorphic-raised' : block.kind === 'fixed' ? 'neumorphic-sunken bg-surface-container-high' : 'border-2 border-dashed border-outline-variant/30'
                    }`}
                  >
                    <div className="text-xs font-bold text-on-surface-variant w-28 flex-shrink-0">
                      {formatTime(block.start)} – {formatTime(block.end)}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${block.kind === 'buffer' ? 'text-outline' : 'text-on-surface'}`}>{block.title}</p>
                      {block.kind === 'fixed' && <p className="text-[10px] text-outline uppercase font-bold">固定予定</p>}
                    </div>
                    {block.kind === 'action' && actionIndex >= 0 && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          type="time"
                          className="p-1.5 text-xs neumorphic-sunken border-none rounded-lg bg-surface w-24"
                          value={timeToHHMM(block.start)}
                          onChange={(e) => handleChangeBlockStart(actionIndex, e.target.value)}
                        />
                        <button onClick={() => moveBlock(actionIndex, -1)} className="text-outline hover:text-primary">
                          <span className="material-symbols-outlined text-base">arrow_upward</span>
                        </button>
                        <button onClick={() => moveBlock(actionIndex, 1)} className="text-outline hover:text-primary">
                          <span className="material-symbols-outlined text-base">arrow_downward</span>
                        </button>
                        <button onClick={() => handleMoveToTomorrow(actionIndex)} className="text-xs font-bold text-secondary hover:underline">
                          明日に回す
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>

            {notScheduledIds.length > 0 && (
              <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-2">
                <h3 className="text-xs font-bold text-outline uppercase tracking-widest">今日は入りませんでした</h3>
                {notScheduledIds.map((id) => (
                  <p key={id} className="text-sm text-on-surface-variant">
                    {actionTitleOf(id)}
                  </p>
                ))}
              </section>
            )}
          </div>
        )}

        {activeTab !== 'today' && (
          <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-3">
            <h3 className="text-xs font-bold text-outline uppercase tracking-widest">
              {activeTab === 'tomorrow' ? '明日の仮予定' : '3日後までの仮予定'}
            </h3>
            <p className="text-xs text-outline">締切が近いActionと、今日から回したActionの簡易プレビューです。当日の朝、あらためて予定表を作成してください。</p>
            {(activeTab === 'tomorrow' ? tomorrowPreview : plus2Preview).length === 0 && (
              <p className="text-sm text-outline py-4">対象のActionはありません。</p>
            )}
            {(activeTab === 'tomorrow' ? tomorrowPreview : plus2Preview).map((a) => (
              <div key={a.id} className="p-3 rounded-lg neumorphic-sunken">
                <p className="text-sm font-bold text-on-surface">{a.taskTitle}</p>
                <p className="text-xs text-on-surface-variant">
                  {a.title} ・ {a.estimatedMinutes}分
                </p>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
