import { useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { subscribeActiveActions, createAction, overwriteAction, deleteAction, type Action } from '../lib/actions'
import { subscribeScheduledTasks, type Task } from '../lib/tasks'
import { subscribeDailyPlan, upsertDailyPlan, type DailyPlan } from '../lib/dailyPlans'
import { formatDateKey } from '../lib/dateUtils'

// A deliberately low-traffic escape hatch for the rare case where AI got a
// Mission wrong or something needs an irregular manual fix — reached only
// via the settings-gear menu, not Today's main flow.
export default function TodayFixPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const today = useMemo(() => new Date(), [])
  const todayKey = formatDateKey(today)

  const [activeActions, setActiveActions] = useState<Action[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([])
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null)

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeActiveActions(user.uid, setActiveActions)
    const unsub2 = subscribeScheduledTasks(user.uid, setScheduledTasks)
    const unsub3 = subscribeDailyPlan(user.uid, todayKey, setDailyPlan)
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [user, todayKey])

  const actionMap = useMemo(() => new Map(activeActions.map((a) => [a.id, a])), [activeActions])
  const todaysActions = useMemo(() => {
    if (!dailyPlan) return []
    return dailyPlan.selectedActionIds.map((id) => actionMap.get(id)).filter((a): a is Action => !!a)
  }, [dailyPlan, actionMap])

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
    setNewTaskId(scheduledTasks[0]?.id ?? '')
    setNewTitle('')
    setNewCriteria('')
    setNewMinutes('30')
  }

  const handleAddNew = async () => {
    if (!user || !newTitle.trim() || !newTaskId) return
    const task = scheduledTasks.find((t) => t.id === newTaskId)
    if (!task) return
    const minutes = parseInt(newMinutes, 10) || 30
    const newActionId = await createAction(user.uid, newTaskId, task.title, newTitle.trim(), minutes, {
      completionCriteria: newCriteria.trim() || undefined,
    })

    if (dailyPlan) {
      // Slot it in right after whatever's already scheduled (or now, if
      // that's later) — simple placement, not a full re-run of the
      // scheduling engine, since this is meant to be a rare manual fix.
      const lastEnd = dailyPlan.plannedSlots.reduce((latest, s) => {
        const end = s.end.toDate()
        return end > latest ? end : latest
      }, new Date())
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
        <div className="p-6 border-b border-outline-variant/20 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-on-surface">今日のミッションを修正</h2>
              <p className="text-sm text-on-surface-variant">AIの分割が違う・イレギュラーがあったときの修正用です</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-container-high hover:bg-surface-container-highest transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {todaysActions.length === 0 && <p className="text-sm text-on-surface-variant text-center py-8">今日のActionはまだありません。</p>}

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
              disabled={scheduledTasks.length === 0}
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
                {scheduledTasks.map((t) => (
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
