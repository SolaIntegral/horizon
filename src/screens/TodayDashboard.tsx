import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { subscribeActiveActions, subscribeDoneActions, skipAction, overwriteAction, type Action } from '../lib/actions'
import { subscribeScheduledTasks, type Task } from '../lib/tasks'
import { subscribeActiveWorkSession, type WorkSession } from '../lib/workSessions'
import { subscribeDailyPlan, type DailyPlan } from '../lib/dailyPlans'
import { getStatusMessage } from '../lib/statusMessages'
import { computeDayPhase, selectCurrentMission } from '../lib/dayPhase'
import { formatDateKey } from '../lib/dateUtils'
import HelpButton from '../components/HelpButton'

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

function formatTime(d: Date): string {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

export default function TodayDashboard() {
  const { user } = useAuth()
  const today = useMemo(() => new Date(), [])
  const todayKey = formatDateKey(today)

  const [activeActions, setActiveActions] = useState<Action[]>([])
  const [doneActions, setDoneActions] = useState<Action[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([])
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null)
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [searchParams] = useSearchParams()
  const [showLog, setShowLog] = useState(() => searchParams.get('log') === '1')
  const [showDetail, setShowDetail] = useState(false)
  const [tick, setTick] = useState(0)

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editMinutes, setEditMinutes] = useState('')

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeActiveActions(user.uid, setActiveActions)
    const unsub2 = subscribeDoneActions(user.uid, setDoneActions)
    const unsub3 = subscribeScheduledTasks(user.uid, setScheduledTasks)
    const unsub4 = subscribeDailyPlan(user.uid, todayKey, setDailyPlan)
    const unsub5 = subscribeActiveWorkSession(user.uid, setActiveSession)
    return () => {
      unsub1()
      unsub2()
      unsub3()
      unsub4()
      unsub5()
    }
  }, [user, todayKey])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const actionsById = useMemo(() => {
    const map = new Map<string, Action>()
    activeActions.forEach((a) => map.set(a.id, a))
    doneActions.forEach((a) => map.set(a.id, a))
    return map
  }, [activeActions, doneActions])

  const dayPhase = useMemo(
    () => computeDayPhase({ now: new Date(), dailyPlan, activeSession, actionsById }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dailyPlan, activeSession, actionsById, tick],
  )

  const currentMissionSlot = useMemo(() => selectCurrentMission(dailyPlan, actionsById), [dailyPlan, actionsById])

  // An active session takes priority over slot order (§2 of the design doc):
  // if the user is mid-focus/break, that's the current Mission regardless of
  // where it sits in today's plan.
  const currentActionId = activeSession?.actionId ?? currentMissionSlot?.actionId ?? null
  const currentAction = currentActionId ? actionsById.get(currentActionId) ?? null : null
  const currentSlot = dailyPlan?.plannedSlots.find((s) => s.actionId === currentActionId) ?? null

  const taskIdsWithActiveAction = useMemo(() => new Set(activeActions.map((a) => a.taskId)), [activeActions])

  const completedActionsToday = useMemo(
    () => doneActions.filter((a) => a.completedAt && isToday(a.completedAt.toDate())).length,
    [doneActions],
  )

  const tasksNearDeadlineUndecomposed = useMemo(
    () =>
      scheduledTasks.filter(
        (t) => t.deadline && isWithinDays(t.deadline.toDate(), 3) && !taskIdsWithActiveAction.has(t.id),
      ).length,
    [scheduledTasks, taskIdsWithActiveAction],
  )

  const totalActiveMinutes = useMemo(
    () => activeActions.reduce((sum, a) => sum + (a.estimatedMinutes || 0), 0),
    [activeActions],
  )

  const maxSkipCount = useMemo(
    () => scheduledTasks.reduce((max, t) => Math.max(max, t.skipCount ?? 0), 0),
    [scheduledTasks],
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

  const todayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const handleSkip = async (action: Action) => {
    await skipAction(action.id, action.taskId)
  }

  const startEdit = (action: Action) => {
    setEditTitle(action.title)
    setEditMinutes(String(action.estimatedMinutes))
    setEditing(true)
  }

  const saveEdit = async (action: Action) => {
    const minutes = parseInt(editMinutes, 10)
    if (!editTitle.trim() || !minutes || minutes <= 0) return
    await overwriteAction(action.id, editTitle.trim(), minutes)
    setEditing(false)
  }

  const missionLog = useMemo(() => {
    if (!dailyPlan) return []
    return [...dailyPlan.plannedSlots]
      .sort((a, b) => a.start.toMillis() - b.start.toMillis())
      .map((slot) => {
        const action = actionsById.get(slot.actionId)
        const status: 'done' | 'current' | 'upcoming' =
          action?.status === 'done' || action?.status === 'skipped'
            ? 'done'
            : slot.actionId === currentActionId
              ? 'current'
              : 'upcoming'
        return { slot, action, status }
      })
  }, [dailyPlan, actionsById, currentActionId])

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold text-primary tracking-tight">Today</h2>
            <HelpButton title="Todayの使い方">
              <p>今、進めるべきミッション（Action）を1つだけ表示する画面です。</p>
              <p>
                今日のPlanで選んだActionが、開始時刻の早いものから順に1つずつ表示されます。作業中・休憩中はその内容がそのまま表示され、実際のWorkSessionと連動します。
              </p>
              <p>「今日のミッションを見る」で、今日1日の流れ（完了済み・現在・これから）を確認できます。</p>
              <p>タスクの追加・アイデアの記録・今日の計画の見直しは、右下のHoriメニューから行えます。</p>
            </HelpButton>
          </div>
          <p className="text-lg text-on-surface-variant">{todayLabel}</p>
        </header>

        {dayPhase === 'morning_setup' && (
          <div className="neumorphic-raised rounded-2xl p-10 bg-surface text-center space-y-4">
            <span className="material-symbols-outlined text-4xl text-primary/60">wb_twilight</span>
            <p className="text-lg font-medium text-on-surface">今日の予定がまだありません。</p>
            <p className="text-sm text-on-surface-variant">Planで今日の予定表を作ると、ここに最初のミッションが表示されます。</p>
            <Link
              to="/plan"
              className="inline-block btn-squish neumorphic-raised bg-primary text-white font-bold py-3 px-8 rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              今日の予定を作る
            </Link>
          </div>
        )}

        {(dayPhase === 'evening_prompt' || dayPhase === 'day_complete') && (
          <div className="neumorphic-raised rounded-2xl p-10 bg-surface text-center space-y-4">
            <span className="material-symbols-outlined text-4xl text-primary/60">task_alt</span>
            <p className="text-lg font-medium text-on-surface">今日の予定はすべて完了しました。</p>
            <p className="text-sm text-on-surface-variant">お疲れさまでした。明日の予定を作るか、少し休みましょう。</p>
            <Link
              to="/plan"
              className="inline-block btn-squish neumorphic-raised bg-primary text-white font-bold py-3 px-8 rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              明日の予定を作る
            </Link>
          </div>
        )}

        {(dayPhase === 'working' || dayPhase === 'break' || dayPhase === 'mission_ready') && currentAction && (
          <div className="neumorphic-raised rounded-2xl p-8 bg-surface space-y-6 ring-4 ring-primary/5">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${dayPhase === 'break' ? 'bg-secondary' : 'bg-primary'} ${
                  dayPhase === 'working' ? 'pulse' : ''
                }`}
              ></div>
              <span className="text-sm font-bold text-primary">
                {dayPhase === 'break' ? '休憩中' : dayPhase === 'working' ? '作業中' : '次のミッション'}
              </span>
            </div>

            <div className="flex items-start gap-4">
              <span className="text-xs text-on-surface-variant bg-surface-container-highest px-3 py-1 rounded-full font-bold">
                {currentAction.taskTitle}
              </span>
            </div>

            {editing ? (
              <div className="space-y-3">
                <input
                  className="w-full p-3 text-xl font-bold neumorphic-sunken border-none rounded-lg bg-surface"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    className="w-24 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                    value={editMinutes}
                    onChange={(e) => setEditMinutes(e.target.value)}
                  />
                  <span className="text-sm text-on-surface-variant">分</span>
                  <div className="flex-1"></div>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-full text-sm text-on-surface-variant">
                    Cancel
                  </button>
                  <button
                    onClick={() => saveEdit(currentAction)}
                    className="px-4 py-2 rounded-full text-sm font-bold bg-primary text-white"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <h2 className="text-2xl font-bold text-on-surface leading-tight">{currentAction.title}</h2>
            )}

            <p className="text-lg font-medium italic text-on-surface-variant">"{statusMessage}"</p>

            {!editing && (
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to={`/overlay/${currentAction.taskId}/${currentAction.id}`}
                  className="btn-squish neumorphic-raised bg-primary text-white font-bold py-4 px-10 rounded-full hover:scale-105 active:scale-95 transition-all text-lg"
                >
                  {dayPhase === 'mission_ready' ? '開始する' : '作業へ戻る'}
                </Link>
                <button onClick={() => setShowDetail((v) => !v)} className="text-sm font-bold text-primary hover:underline">
                  {showDetail ? '詳細を閉じる' : '詳細を見る'}
                </button>
                {dayPhase === 'mission_ready' && (
                  <div className="flex gap-3 ml-auto">
                    <button onClick={() => startEdit(currentAction)} className="text-sm font-bold text-on-surface-variant hover:text-primary">
                      Edit
                    </button>
                    <button onClick={() => handleSkip(currentAction)} className="text-sm font-bold text-on-surface-variant hover:text-primary">
                      Skip
                    </button>
                  </div>
                )}
              </div>
            )}

            {showDetail && (
              <div className="neumorphic-sunken rounded-xl p-5 space-y-2 text-sm text-on-surface-variant">
                {currentSlot && (
                  <p>
                    予定時間: {formatTime(currentSlot.start.toDate())} – {formatTime(currentSlot.end.toDate())}
                  </p>
                )}
                <p>見積り時間: {currentAction.estimatedMinutes}分</p>
                {currentAction.completionCriteria && <p>完了条件: {currentAction.completionCriteria}</p>}
                <p className="text-xs text-outline">今日の予定表で次に来るミッションです。</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-lg">{showLog ? 'expand_less' : 'expand_more'}</span>
            今日のミッションを見る
          </button>
        </div>

        {showLog && (
          <section className="neumorphic-raised rounded-2xl p-6 bg-surface space-y-3">
            {missionLog.length === 0 && <p className="text-sm text-on-surface-variant text-center py-4">今日の予定はまだありません。</p>}
            {missionLog.map(({ slot, action, status }) => (
              <div
                key={slot.actionId}
                className={`flex items-center gap-4 p-3 rounded-lg ${
                  status === 'current' ? 'neumorphic-raised ring-2 ring-primary/20' : 'neumorphic-sunken'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    status === 'done' ? 'bg-primary text-white' : status === 'current' ? 'bg-primary/20 text-primary' : 'bg-surface-container text-outline'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {status === 'done' ? 'check' : status === 'current' ? 'play_arrow' : 'schedule'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${status === 'done' ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                    {action?.title ?? '(削除されたAction)'}
                  </p>
                  <p className="text-xs text-outline">{formatTime(slot.start.toDate())}</p>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
