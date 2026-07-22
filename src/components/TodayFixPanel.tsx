import { useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { subscribeActiveActions, createAction, overwriteAction, deleteAction, completeAction, type Action } from '../lib/actions'
import { subscribeScheduledTasks, isTaskBlocked, type Task } from '../lib/tasks'
import { subscribeDailyPlan, upsertDailyPlan, type DailyPlan } from '../lib/dailyPlans'
import { formatDateKey, getWeekDays, isSameDay, combineDateAndTime } from '../lib/dateUtils'
import { subscribeUserSettings, DEFAULT_WEEKDAY_SCHEDULE, type WeekdayScheduleMap } from '../lib/userSettings'

// A deliberately low-traffic escape hatch for the rare case where AI got a
// Mission wrong or something needs an irregular manual fix — reached only
// via the settings-gear menu, not Today's main flow. `initialDate` lets it
// also serve mid-week new-task insertion into any day of the current week,
// not just today.
export default function TodayFixPanel({ onClose, initialDate }: { onClose: () => void; initialDate?: Date }) {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => initialDate ?? new Date())
  const todayKey = formatDateKey(selectedDate)
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate])

  const [activeActions, setActiveActions] = useState<Action[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([])
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null)
  const [weekdaySchedule, setWeekdaySchedule] = useState<WeekdayScheduleMap>(DEFAULT_WEEKDAY_SCHEDULE)

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeActiveActions(user.uid, setActiveActions)
    const unsub2 = subscribeScheduledTasks(user.uid, setScheduledTasks)
    const unsub3 = subscribeDailyPlan(user.uid, todayKey, setDailyPlan)
    const unsub4 = subscribeUserSettings(user.uid, (settings) => {
      if (settings?.weekdaySchedule) setWeekdaySchedule(settings.weekdaySchedule)
    })
    return () => {
      unsub1()
      unsub2()
      unsub3()
      unsub4()
    }
  }, [user, todayKey])

  const actionMap = useMemo(() => new Map(activeActions.map((a) => [a.id, a])), [activeActions])
  const todaysActions = useMemo(() => {
    if (!dailyPlan) return []
    return dailyPlan.selectedActionIds.map((id) => actionMap.get(id)).filter((a): a is Action => !!a)
  }, [dailyPlan, actionMap])

  const scheduledTaskIds = useMemo(() => new Set(scheduledTasks.map((t) => t.id)), [scheduledTasks])
  // Blocked follow-up Tasks ("続き") shouldn't be selectable here either —
  // same rule as MorningSetupForm's candidate list.
  const selectableTasks = useMemo(
    () => scheduledTasks.filter((t) => !isTaskBlocked(t, scheduledTaskIds)),
    [scheduledTasks, scheduledTaskIds],
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCriteria, setEditCriteria] = useState('')
  const [editMinutes, setEditMinutes] = useState('')

  const [addingNew, setAddingNew] = useState(false)
  const [newTaskId, setNewTaskId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newCriteria, setNewCriteria] = useState('')
  const [newMinutes, setNewMinutes] = useState('30')

  const startEdit = (a: Action) => {
    setEditingId(a.id)
    setEditTitle(a.title)
    setEditCriteria(a.completionCriteria ?? '')
    setEditMinutes(String(a.estimatedMinutes))
  }

  const saveEdit = async () => {
    if (!editingId) return
    const minutes = parseInt(editMinutes, 10)
    if (!editTitle.trim() || !minutes || minutes <= 0) return
    await overwriteAction(editingId, editTitle.trim(), minutes, editCriteria.trim())
    setEditingId(null)
  }

  const handleDelete = async (a: Action) => {
    if (!confirm(`「${a.title}」を削除しますか？この操作は元に戻せません。`)) return
    await deleteAction(a.id, a.taskId, a.estimatedMinutes)
    if (user && dailyPlan) {
      await upsertDailyPlan(user.uid, todayKey, {
        selectedActionIds: dailyPlan.selectedActionIds.filter((id) => id !== a.id),
        requiredActionIds: (dailyPlan.requiredActionIds ?? []).filter((id) => id !== a.id),
        plannedSlots: dailyPlan.plannedSlots.filter((s) => s.actionId !== a.id),
      })
    }
  }

  const startAddNew = () => {
    setAddingNew(true)
    setNewTaskId(selectableTasks[0]?.id ?? '')
    setNewTitle('')
    setNewCriteria('')
    setNewMinutes('30')
  }

  const handleAddNew = async () => {
    if (!user || !newTitle.trim() || !newTaskId) return
    const task = selectableTasks.find((t) => t.id === newTaskId)
    if (!task) return
    const minutes = parseInt(newMinutes, 10) || 30
    const newActionId = await createAction(user.uid, newTaskId, task.title, newTitle.trim(), minutes, {
      completionCriteria: newCriteria.trim() || undefined,
    })

    if (dailyPlan) {
      // Slot it in right after whatever's already scheduled — simple
      // placement, not a full re-run of the scheduling engine, since this is
      // meant to be a rare manual fix. The floor for an empty day is "now"
      // only when the selected day is today; a future day has no "now" to
      // anchor to, so fall back to that weekday's configured start time.
      const floor = isSameDay(selectedDate, new Date())
        ? new Date()
        : combineDateAndTime(selectedDate, (weekdaySchedule[String(selectedDate.getDay())] ?? DEFAULT_WEEKDAY_SCHEDULE[String(selectedDate.getDay())]).start)
      const lastEnd = dailyPlan.plannedSlots.reduce((latest, s) => {
        const end = s.end.toDate()
        return end > latest ? end : latest
      }, floor)
      const end = new Date(lastEnd.getTime() + minutes * 60000)
      await upsertDailyPlan(user.uid, todayKey, {
        selectedActionIds: [...dailyPlan.selectedActionIds, newActionId],
        plannedSlots: [...dailyPlan.plannedSlots, { actionId: newActionId, start: Timestamp.fromDate(lastEnd), end: Timestamp.fromDate(end) }],
      })
    }
    setAddingNew(false)
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose}></div>
      <div className="absolute bottom-0 inset-x-0 max-h-[88vh] rounded-t-2xl md:top-0 md:bottom-0 md:right-0 md:left-auto md:inset-x-auto md:max-h-none md:h-full md:w-[520px] md:rounded-l-2xl md:rounded-t-none bg-surface shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex-shrink-0 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-on-surface">Focusを修正</h2>
              <p className="text-sm text-on-surface-variant">AIの分割が違う・イレギュラーがあったときの修正用です</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>
          <div className="flex gap-1.5">
            {weekDays.map((d) => (
              <button
                key={formatDateKey(d)}
                onClick={() => setSelectedDate(d)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${
                  isSameDay(d, selectedDate) ? 'neumorphic-sunken text-primary' : 'neumorphic-raised text-on-surface-variant'
                }`}
              >
                {d.toLocaleDateString('ja-JP', { weekday: 'short' })}
                <br />
                {d.getDate()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {todaysActions.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">
              {selectedDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}にはActionがまだありません。
            </p>
          )}

          {todaysActions.map((a) => (
            <div key={a.id} className="neumorphic-raised bg-surface rounded-lg p-4 space-y-2">
              {editingId === a.id ? (
                <div className="space-y-2">
                  <input
                    className="w-full p-2 text-sm font-bold neumorphic-sunken border-none rounded-lg bg-surface"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="w-full p-2 text-xs neumorphic-sunken border-none rounded-lg bg-surface"
                    value={editCriteria}
                    onChange={(e) => setEditCriteria(e.target.value)}
                    placeholder="完了条件"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-20 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                      value={editMinutes}
                      onChange={(e) => setEditMinutes(e.target.value)}
                    />
                    <span className="text-xs text-on-surface-variant">分</span>
                    <div className="flex-1"></div>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-full text-xs font-bold text-on-surface-variant">
                      Cancel
                    </button>
                    <button onClick={saveEdit} className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-on-surface-variant">{a.taskTitle}</p>
                  <p className="text-sm font-bold text-on-surface">{a.title}</p>
                  {a.completionCriteria && <p className="text-xs text-on-surface-variant">完了条件: {a.completionCriteria}</p>}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-outline">{a.estimatedMinutes}分</span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => user && completeAction(a.id, a.taskId, user.uid)}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        完了にする
                      </button>
                      <button onClick={() => startEdit(a)} className="text-xs font-bold text-primary hover:underline">
                        編集
                      </button>
                      <button onClick={() => handleDelete(a)} className="text-xs font-bold text-secondary hover:underline">
                        削除
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {!addingNew ? (
            <button
              onClick={startAddNew}
              disabled={selectableTasks.length === 0}
              className="w-full py-3 neumorphic-raised rounded-full text-sm font-bold text-primary disabled:opacity-40"
            >
              + 手動でActionを追加
            </button>
          ) : (
            <div className="neumorphic-sunken bg-surface rounded-lg p-4 space-y-2">
              <label className="text-xs font-bold text-outline">紐づけるタスク</label>
              <select
                className="w-full p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                value={newTaskId}
                onChange={(e) => setNewTaskId(e.target.value)}
              >
                {selectableTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title || t.originalInput}
                  </option>
                ))}
              </select>
              <input
                className="w-full p-2 text-sm font-bold neumorphic-raised border-none rounded-lg bg-surface"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Actionの内容"
                autoFocus
              />
              <input
                className="w-full p-2 text-xs neumorphic-raised border-none rounded-lg bg-surface"
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                placeholder="完了条件（任意）"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="w-20 p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                  value={newMinutes}
                  onChange={(e) => setNewMinutes(e.target.value)}
                />
                <span className="text-xs text-on-surface-variant">分</span>
                <div className="flex-1"></div>
                <button onClick={() => setAddingNew(false)} className="px-3 py-1.5 rounded-full text-xs font-bold text-on-surface-variant">
                  Cancel
                </button>
                <button onClick={handleAddNew} className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white">
                  追加
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
