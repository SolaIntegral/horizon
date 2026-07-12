import { useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import type { Task } from '../lib/tasks'
import type { Action } from '../lib/actions'
import { upsertDailyPlan, type DailyPlan, type RequiredGoalCondition, type TimeSlot } from '../lib/dailyPlans'
import { buildDailySchedule, type CandidateAction, type FixedEvent } from '../lib/dailyPlanEngine'
import { combineDateAndTime, formatDateKey, timeToHHMM } from '../lib/dateUtils'

type Fatigue = 'good' | 'normal' | 'tired'

const fatigueRatio: Record<Fatigue, number> = { good: 0.8, normal: 0.75, tired: 0.5 }
const fatigueLabel: Record<Fatigue, string> = { good: '良い', normal: '普通', tired: 'しんどい' }

interface FixedEventDraft {
  title: string
  start: string // HH:mm
  end: string // HH:mm
}

// The "今日の予定を作る" wizard — shared by Today (morning_setup phase, no
// navigation) and the Plan screen's "予定を作り直す" re-edit flow.
export default function MorningSetupForm({
  activeActions,
  scheduledTasks,
  existingPlan,
  onComplete,
}: {
  activeActions: Action[]
  scheduledTasks: Task[]
  existingPlan: DailyPlan | null
  onComplete: () => void
}) {
  const { user } = useAuth()
  const today = useMemo(() => new Date(), [])
  const todayKey = formatDateKey(today)

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
    if (!existingPlan) return
    setRequiredGoalText(existingPlan.requiredGoal ?? '')
    setRequiredGoalCondition(existingPlan.requiredGoalCondition ?? 'action_done')
    setRequiredGoalTimeMinutes(String(existingPlan.requiredGoalTimeMinutes ?? 60))
    setRequiredActionIds(existingPlan.requiredActionIds ?? [])
    setSelectedActionIds(existingPlan.selectedActionIds ?? [])
    setDayEndTimeInput(existingPlan.dayEndTime ? timeToHHMM(existingPlan.dayEndTime.toDate()) : '22:00')
    setFixedEventsDraft(
      existingPlan.calendarBusySlots.map((s) => ({
        title: s.title ?? '',
        start: timeToHHMM(s.start.toDate()),
        end: timeToHHMM(s.end.toDate()),
      })),
    )
    // Snapshot once on mount only — this is a re-edit starting point, not a live sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const taskMap = useMemo(() => new Map(scheduledTasks.map((t) => [t.id, t])), [scheduledTasks])
  const actionMap = useMemo(() => new Map(activeActions.map((a) => [a.id, a])), [activeActions])

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
      onComplete()
    } finally {
      setSaving(false)
    }
  }

  return (
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
  )
}
