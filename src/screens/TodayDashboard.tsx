import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { subscribeActiveActions, subscribeDoneActions, skipAction, type Action } from '../lib/actions'
import { subscribeThisWeekTasks, type Task } from '../lib/tasks'
import { subscribeUserSettings, setMainGoal, type UserSettings } from '../lib/userSettings'
import { subscribeActiveWorkSession, type WorkSession } from '../lib/workSessions'
import { getStatusMessage } from '../lib/statusMessages'

type QuickStatus = 'working' | 'break' | 'replan'

const quickStatusLabel: Record<QuickStatus, string> = {
  working: 'Working',
  break: 'On Break',
  replan: 'Replanning',
}

function isWithinDays(date: Date, days: number): boolean {
  const diffMs = date.getTime() - Date.now()
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000
}

function isToday(date: Date): boolean {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  )
}

export default function TodayDashboard() {
  const { user } = useAuth()
  const [activeActions, setActiveActions] = useState<Action[]>([])
  const [doneActions, setDoneActions] = useState<Action[]>([])
  const [thisWeekTasks, setThisWeekTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [quickStatus, setQuickStatus] = useState<QuickStatus>('working')
  const [goalEditing, setGoalEditing] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalHours, setGoalHours] = useState('5')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeActiveActions(user.uid, setActiveActions)
    const unsub2 = subscribeDoneActions(user.uid, setDoneActions)
    const unsub3 = subscribeThisWeekTasks(user.uid, setThisWeekTasks)
    const unsub4 = subscribeUserSettings(user.uid, setSettings)
    const unsub5 = subscribeActiveWorkSession(user.uid, setActiveSession)
    return () => {
      unsub1()
      unsub2()
      unsub3()
      unsub4()
      unsub5()
    }
  }, [user])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const taskIdsWithActiveAction = useMemo(() => new Set(activeActions.map((a) => a.taskId)), [activeActions])

  const completedActionsToday = useMemo(
    () => doneActions.filter((a) => a.completedAt && isToday(a.completedAt.toDate())).length,
    [doneActions],
  )

  const tasksNearDeadlineUndecomposed = useMemo(
    () =>
      thisWeekTasks.filter(
        (t) => t.dueDate && isWithinDays(t.dueDate.toDate(), 3) && !taskIdsWithActiveAction.has(t.id),
      ).length,
    [thisWeekTasks, taskIdsWithActiveAction],
  )

  const totalActiveMinutes = useMemo(
    () => activeActions.reduce((sum, a) => sum + (a.estimatedMinutes || 0), 0),
    [activeActions],
  )

  const maxSkipCount = useMemo(
    () => thisWeekTasks.reduce((max, t) => Math.max(max, t.skipCount ?? 0), 0),
    [thisWeekTasks],
  )

  const statusMessage = useMemo(
    () =>
      getStatusMessage({
        completedActionsToday,
        tasksNearDeadlineUndecomposed,
        totalActiveMinutes,
        maxSkipCount,
        activeSession: activeSession
          ? {
              type: activeSession.type,
              elapsedMinutes: (Date.now() - activeSession.startedAt.toDate().getTime()) / 60000,
              plannedMinutes: activeSession.plannedMinutes,
            }
          : null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completedActionsToday, tasksNearDeadlineUndecomposed, totalActiveMinutes, maxSkipCount, activeSession, tick],
  )

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const handleSkip = async (action: Action) => {
    await skipAction(action.id, action.taskId)
  }

  const handleSaveGoal = async () => {
    if (!user || !goalName.trim()) return
    const minutes = Math.max(1, Math.round(parseFloat(goalHours) * 60))
    await setMainGoal(user.uid, { name: goalName.trim(), weeklyTargetMinutes: minutes })
    setGoalEditing(false)
  }

  const startGoalEdit = () => {
    setGoalName(settings?.mainGoal?.name ?? '')
    setGoalHours(settings?.mainGoal ? String(Math.round(settings.mainGoal.weeklyTargetMinutes / 60)) : '5')
    setGoalEditing(true)
  }

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-primary tracking-tight">Today</h2>
            <p className="text-lg text-on-surface-variant">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/inbox"
              className="btn-squish neumorphic-raised bg-primary text-white font-bold p-3 px-6 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined">add_task</span>
              <span>Add Task</span>
            </Link>
            <button className="p-3 neumorphic-raised rounded-full flex items-center justify-center hover:text-primary transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined">layers</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 neumorphic-raised rounded-lg p-6 flex flex-col justify-between bg-surface">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary rounded-full pulse"></div>
                <span className="text-sm font-bold text-primary">Status: {quickStatusLabel[quickStatus]}</span>
              </div>
            </div>
            <div className="flex items-center gap-8 mb-8">
              <div className="flex-shrink-0 w-24 h-24 neumorphic-sunken rounded-full flex items-center justify-center overflow-hidden bg-surface">
                <span className="material-symbols-outlined text-5xl text-primary/60">psychology</span>
              </div>
              <p className="text-lg font-medium italic text-on-surface">"{statusMessage}"</p>
            </div>
            <div className="flex gap-4">
              {(['working', 'break', 'replan'] as QuickStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setQuickStatus(s)}
                  className={`flex-1 btn-squish py-3 rounded-full capitalize ${
                    quickStatus === s
                      ? 'neumorphic-sunken text-primary border-2 border-primary/20'
                      : 'neumorphic-raised hover:bg-surface-container'
                  }`}
                >
                  {s === 'working' ? 'Work' : s === 'break' ? 'Break' : 'Replan'}
                </button>
              ))}
            </div>
          </section>

          <section className="neumorphic-raised rounded-lg p-6 border-t-8 border-primary/40 flex flex-col bg-surface">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-primary">Main Time</h3>
              <span className="material-symbols-outlined text-primary/40">verified_user</span>
            </div>
            {goalEditing ? (
              <div className="flex-grow flex flex-col justify-center gap-3">
                <input
                  className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                  placeholder="目標名 (例: Thesis)"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                  placeholder="週の目標時間 (h)"
                  value={goalHours}
                  onChange={(e) => setGoalHours(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setGoalEditing(false)}
                    className="flex-1 py-2 rounded-full text-xs font-bold text-on-surface-variant hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveGoal}
                    className="flex-1 py-2 rounded-full text-xs font-bold bg-primary text-white"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : settings?.mainGoal ? (
              <div className="flex-grow flex flex-col items-center justify-center space-y-4">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      className="text-surface-container-highest"
                      cx="64"
                      cy="64"
                      fill="transparent"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                    ></circle>
                    <circle
                      className="text-primary"
                      cx="64"
                      cy="64"
                      fill="transparent"
                      r="56"
                      stroke="currentColor"
                      strokeDasharray="351.8"
                      strokeDashoffset="351.8"
                      strokeWidth="12"
                    ></circle>
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-2xl font-bold">0%</span>
                    <span className="text-[10px] font-bold uppercase opacity-50">of goal</span>
                  </div>
                </div>
                <div className="text-center">
                  <button onClick={startGoalEdit} className="text-sm font-bold hover:text-primary transition-colors">
                    {settings.mainGoal.name}
                  </button>
                  <p className="text-on-surface-variant text-xs mt-1">
                    Goal: {Math.round(settings.mainGoal.weeklyTargetMinutes / 60)}h / week
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center gap-3">
                <p className="text-sm text-on-surface-variant text-center">週のメイン目標がまだありません</p>
                <button
                  onClick={startGoalEdit}
                  className="neumorphic-raised px-4 py-2 rounded-full text-sm font-bold text-primary"
                >
                  目標を設定
                </button>
              </div>
            )}
          </section>
        </div>

        <section className="space-y-4">
          <h3 className="text-xl font-bold text-primary px-2">Next 15 Actions</h3>
          {activeActions.length === 0 && (
            <div className="neumorphic-raised rounded-xl p-8 bg-surface text-center text-on-surface-variant">
              現在アクティブなActionはありません。Diagnoseで「Create Next 15」から作成しましょう。
            </div>
          )}
          {activeActions.map((action) => (
            <div
              key={action.id}
              className="neumorphic-raised rounded-xl p-8 bg-surface relative overflow-hidden ring-4 ring-primary/5"
            >
              <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                <div className="flex-grow space-y-4 w-full">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                      Next 15 Action
                    </span>
                    <span className="text-xs text-on-surface-variant">Focus: Deep Work</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary leading-tight">{action.taskTitle}</h3>
                    <p className="text-lg text-on-surface-variant mt-2">Action: {action.title}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 font-bold bg-surface-container-highest px-4 py-2 rounded-full text-sm">
                      <span className="material-symbols-outlined text-sm">timer</span> {action.estimatedMinutes}m
                    </div>
                    <div className="flex items-center gap-2 font-bold bg-surface-container-highest px-4 py-2 rounded-full text-sm">
                      <span className="material-symbols-outlined text-sm">psychology</span>
                      {action.estimatedMinutes <= 15 ? 'Low Load' : action.estimatedMinutes <= 30 ? 'Med Load' : 'High Load'}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col w-full md:w-auto gap-4">
                  <Link
                    to={`/overlay/${action.taskId}/${action.id}`}
                    className="w-full md:w-48 py-4 neumorphic-raised bg-primary text-white text-xl font-bold rounded-full hover:scale-105 active:scale-95 transition-all text-center"
                  >
                    Start
                  </Link>
                  <div className="flex gap-4">
                    <button className="flex-1 py-2 neumorphic-raised rounded-full text-sm hover:bg-surface-container">
                      Make Smaller
                    </button>
                    <button
                      onClick={() => handleSkip(action)}
                      className="flex-1 py-2 neumorphic-raised rounded-full text-sm hover:bg-surface-container"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
