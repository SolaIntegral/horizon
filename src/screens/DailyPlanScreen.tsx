import { useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { subscribeScheduledTasks, type Task } from '../lib/tasks'
import { subscribeActiveActions, setActionDeferredTo, type Action } from '../lib/actions'
import {
  subscribeDailyPlan,
  upsertDailyPlan,
  type DailyPlan,
  type RequiredGoalCondition,
  type TimeSlot,
} from '../lib/dailyPlans'
import { buildDailySchedule, type CandidateAction, type FixedEvent } from '../lib/dailyPlanEngine'
import { addDays, combineDateAndTime, formatDateKey } from '../lib/dateUtils'
import HelpButton from '../components/HelpButton'

type Fatigue = 'good' | 'normal' | 'tired'

const fatigueRatio: Record<Fatigue, number> = { good: 0.8, normal: 0.75, tired: 0.5 }
const fatigueLabel: Record<Fatigue, string> = { good: '良い', normal: '普通', tired: 'しんどい' }

type DayTab = 'today' | 'tomorrow' | 'plus2'

interface FixedEventDraft {
  title: string
  start: string // HH:mm
  end: string // HH:mm
}

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

function timeToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function DailyPlanScreen() {
  const { user } = useAuth()
  const today = useMemo(() => new Date(), [])
  const todayKey = formatDateKey(today)
  const tomorrowKey = formatDateKey(addDays(today, 1))
  const plus2Key = formatDateKey(addDays(today, 2))

  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([])
  const [activeActions, setActiveActions] = useState<Action[]>([])
  const [plan, setPlan] = useState<DailyPlan | null>(null)
  const [activeTab, setActiveTab] = useState<DayTab>('today')
  const [editingSetup, setEditingSetup] = useState(false)
  const [showAllCandidates, setShowAllCandidates] = useState(false)

  const [fatigue, setFatigue] = useState<Fatigue>('normal')
  const [sleepHours, setSleepHours] = useState('7')
  const [requiredGoalText, setRequiredGoalText] = useState('')
  const [requiredGoalCondition, setRequiredGoalCondition] = useState<RequiredGoalCondition>('action_done')
  const [requiredGoalTimeMinutes, setRequiredGoalTimeMinutes] = useState('60')
  const [requiredActionIds, setRequiredActionIds] = useState<string[]>([])
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([])
  const [dayEndTimeInput, setDayEndTimeInput] = useState('22:00')
  const [fixedEventsDraft, setFixedEventsDraft] = useState<FixedEventDraft[]>([])
  const [saving, setSaving] = useState(false)

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

  const taskMap = useMemo(() => new Map(scheduledTasks.map((t) => [t.id, t])), [scheduledTasks])
  const actionMap = useMemo(() => new Map(activeActions.map((a) => [a.id, a])), [activeActions])
  const actionTitleOf = (id: string) => actionMap.get(id)?.title ?? '(削除されたAction)'

  const rankedCandidates = useMemo(() => {
    return activeActions
      .map((a) => {
        const task = taskMap.get(a.taskId)
        let reason = 'その他'
        let priority = 3
        if (task?.deadline) {
          const days = (task.deadline.toDate().getTime() - Date.now()) / 86400000
          if (days <= 3) {
            reason = '締切が近い'
            priority = 0
          }
        }
        if (priority === 3 && task?.status === 'interrupted') {
          reason = '中断中'
          priority = 1
        }
        if (priority === 3 && task?.status === 'in_progress') {
          reason = '進行中'
          priority = 2
        }
        return { action: a, reason, priority }
      })
      .sort((a, b) => a.priority - b.priority)
  }, [activeActions, taskMap])

  const visibleCandidates = showAllCandidates ? rankedCandidates : rankedCandidates.slice(0, 5)

  const toggleRequired = (actionId: string) => {
    setRequiredActionIds((prev) => {
      if (prev.includes(actionId)) return prev.filter((id) => id !== actionId)
      if (prev.length >= 2) return prev
      return [...prev, actionId]
    })
    setSelectedActionIds((prev) => (prev.includes(actionId) ? prev : [...prev, actionId]))
  }

  const toggleSelected = (actionId: string) => {
    setSelectedActionIds((prev) => (prev.includes(actionId) ? prev.filter((id) => id !== actionId) : [...prev, actionId]))
    if (requiredActionIds.includes(actionId)) {
      setRequiredActionIds((prev) => prev.filter((id) => id !== actionId))
    }
  }

  const addFixedEventRow = () => setFixedEventsDraft((prev) => [...prev, { title: '', start: '09:00', end: '10:00' }])
  const updateFixedEventRow = (i: number, patch: Partial<FixedEventDraft>) =>
    setFixedEventsDraft((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const removeFixedEventRow = (i: number) => setFixedEventsDraft((prev) => prev.filter((_, idx) => idx !== i))

  const startEditingSetup = () => {
    if (plan) {
      setRequiredGoalText(plan.requiredGoal ?? '')
      setRequiredGoalCondition(plan.requiredGoalCondition ?? 'action_done')
      setRequiredGoalTimeMinutes(String(plan.requiredGoalTimeMinutes ?? 60))
      setRequiredActionIds(plan.requiredActionIds ?? [])
      setSelectedActionIds(plan.selectedActionIds ?? [])
      setDayEndTimeInput(plan.dayEndTime ? timeToHHMM(plan.dayEndTime.toDate()) : '22:00')
      setFixedEventsDraft(
        plan.calendarBusySlots.map((s) => ({ title: s.title ?? '', start: timeToHHMM(s.start.toDate()), end: timeToHHMM(s.end.toDate()) })),
      )
    }
    setEditingSetup(true)
  }

  const handleCreatePlan = async () => {
    if (!user) return
    setSaving(true)
    try {
      const dayStart = new Date()
      const dayEnd = combineDateAndTime(today, dayEndTimeInput)
      const fixedEvents: FixedEvent[] = fixedEventsDraft
        .filter((f) => f.start && f.end)
        .map((f) => ({ start: combineDateAndTime(today, f.start), end: combineDateAndTime(today, f.end), title: f.title || undefined }))

      const ratio = fatigueRatio[fatigue]
      const requiredActions: CandidateAction[] = requiredActionIds.map((id) => ({
        actionId: id,
        estimatedMinutes: actionMap.get(id)?.estimatedMinutes ?? 15,
      }))
      const otherActionIds = selectedActionIds.filter((id) => !requiredActionIds.includes(id))
      const otherActions: CandidateAction[] = otherActionIds.map((id) => ({
        actionId: id,
        estimatedMinutes: actionMap.get(id)?.estimatedMinutes ?? 15,
      }))

      const result = buildDailySchedule({ dayStart, dayEnd, fixedEvents, fillRatio: ratio, requiredActions, otherActions })

      const updates: Partial<Omit<DailyPlan, 'id' | 'userId' | 'date' | 'createdAt'>> = {
        requiredActionIds,
        selectedActionIds: [...requiredActionIds, ...otherActionIds],
        calendarBusySlots: fixedEvents.map((f) => {
          const slot: TimeSlot = { start: Timestamp.fromDate(f.start), end: Timestamp.fromDate(f.end) }
          if (f.title) slot.title = f.title
          return slot
        }),
        plannedSlots: result.plannedSlots.map((p) => ({ actionId: p.actionId, start: Timestamp.fromDate(p.start), end: Timestamp.fromDate(p.end) })),
        freeTimeSlots: [],
        bufferSlots: result.bufferSlots.map((b) => ({ start: Timestamp.fromDate(b.start), end: Timestamp.fromDate(b.end) })),
        dayEndTime: Timestamp.fromDate(dayEnd),
      }
      if (requiredGoalText.trim()) updates.requiredGoal = requiredGoalText.trim()
      if (requiredActionIds.length > 0) {
        updates.requiredGoalCondition = requiredGoalCondition
        if (requiredGoalCondition === 'time_worked') {
          const mins = parseInt(requiredGoalTimeMinutes, 10)
          if (mins > 0) updates.requiredGoalTimeMinutes = mins
        }
      }

      await upsertDailyPlan(user.uid, todayKey, updates)
      setEditingSetup(false)
    } finally {
      setSaving(false)
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
              </HelpButton>
            </div>
            <p className="text-lg text-on-surface-variant">{today.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
          </div>
          {plan && !editingSetup && (
            <button onClick={startEditingSetup} className="neumorphic-raised px-4 py-2 rounded-full text-sm font-bold text-primary">
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

        {activeTab === 'today' && editingSetup && (
          <div className="space-y-8">
            <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest">今日の状態</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-outline">睡眠時間（時間・目安）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-outline">今の体調</label>
                  <div className="flex gap-2">
                    {(['good', 'normal', 'tired'] as Fatigue[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFatigue(f)}
                        className={`flex-1 py-2 rounded-full text-xs font-bold ${
                          fatigue === f ? 'neumorphic-sunken text-primary' : 'neumorphic-raised text-on-surface-variant'
                        }`}
                      >
                        {fatigueLabel[f]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest">今日中に終わらせたいこと（必須目標・任意）</h3>
              <textarea
                className="w-full h-16 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                placeholder="例：報告書のドラフトを送れる状態にする"
                value={requiredGoalText}
                onChange={(e) => setRequiredGoalText(e.target.value)}
              />
              {requiredActionIds.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-outline">達成条件</label>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['task_done', 'タスク全体が完了'],
                        ['action_done', '選んだActionまで完了'],
                        ['time_worked', '一定時間作業したら終わり'],
                      ] as [RequiredGoalCondition, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setRequiredGoalCondition(value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                          requiredGoalCondition === value ? 'neumorphic-sunken text-primary' : 'neumorphic-raised text-on-surface-variant'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {requiredGoalCondition === 'time_worked' && (
                    <input
                      type="number"
                      min={1}
                      className="w-32 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                      value={requiredGoalTimeMinutes}
                      onChange={(e) => setRequiredGoalTimeMinutes(e.target.value)}
                    />
                  )}
                </div>
              )}
              <p className="text-xs text-outline">下の候補から「必須」に指定すると、午前中に優先配置します（最大2件）。</p>
            </section>

            <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-outline uppercase tracking-widest">今日進めるAction</h3>
                <button onClick={() => setShowAllCandidates((v) => !v)} className="text-xs font-bold text-primary hover:underline">
                  {showAllCandidates ? 'おすすめのみ表示' : 'すべて表示'}
                </button>
              </div>
              {visibleCandidates.length === 0 && <p className="text-sm text-outline">候補となるActionがありません。Planでタスクを分割しましょう。</p>}
              <div className="space-y-2">
                {visibleCandidates.map(({ action, reason }) => {
                  const isRequired = requiredActionIds.includes(action.id)
                  const isSelected = selectedActionIds.includes(action.id)
                  return (
                    <div
                      key={action.id}
                      className={`flex items-center gap-3 p-3 rounded-lg ${isSelected ? 'neumorphic-sunken' : 'neumorphic-raised'}`}
                    >
                      <button onClick={() => toggleSelected(action.id)} className="flex-1 text-left">
                        <p className="text-sm font-bold text-on-surface">{action.taskTitle}</p>
                        <p className="text-xs text-on-surface-variant">
                          {action.title} ・ {action.estimatedMinutes}分 ・ <span className="text-primary">{reason}</span>
                        </p>
                      </button>
                      <button
                        onClick={() => toggleRequired(action.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                          isRequired ? 'bg-primary text-white' : 'neumorphic-raised text-on-surface-variant'
                        }`}
                      >
                        必須
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-outline uppercase tracking-widest">固定予定（カレンダー連携までの仮入力）</h3>
                <button onClick={addFixedEventRow} className="text-xs font-bold text-primary hover:underline">
                  + 追加
                </button>
              </div>
              {fixedEventsDraft.length === 0 && <p className="text-sm text-outline">固定予定はありません。</p>}
              <div className="space-y-2">
                {fixedEventsDraft.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="flex-1 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                      placeholder="予定名"
                      value={f.title}
                      onChange={(e) => updateFixedEventRow(i, { title: e.target.value })}
                    />
                    <input
                      type="time"
                      className="p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                      value={f.start}
                      onChange={(e) => updateFixedEventRow(i, { start: e.target.value })}
                    />
                    <span className="text-xs text-outline">〜</span>
                    <input
                      type="time"
                      className="p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                      value={f.end}
                      onChange={(e) => updateFixedEventRow(i, { end: e.target.value })}
                    />
                    <button onClick={() => removeFixedEventRow(i)} className="text-outline hover:text-secondary">
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-2 border-t border-outline-variant/20">
                <label className="text-xs font-bold text-outline">今日の終了予定時刻</label>
                <input
                  type="time"
                  className="p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                  value={dayEndTimeInput}
                  onChange={(e) => setDayEndTimeInput(e.target.value)}
                />
              </div>
            </section>

            <button
              onClick={handleCreatePlan}
              disabled={saving}
              className="btn-squish w-full neumorphic-raised bg-primary text-on-primary py-4 rounded-full font-bold text-lg disabled:opacity-50"
            >
              {saving ? '予定表を作成しています…' : '予定表を作成'}
            </button>
          </div>
        )}

        {activeTab === 'today' && !editingSetup && plan && (
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
