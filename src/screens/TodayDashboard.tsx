import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { subscribeActiveActions, subscribeDoneActions, skipAction, overwriteAction, setActionDeferredTo, completeAction, type Action } from '../lib/actions'
import { subscribeScheduledTasks, type Task } from '../lib/tasks'
import { subscribeActiveWorkSession, countInterruptions, type WorkSession } from '../lib/workSessions'
import { subscribeDailyPlan, subscribeDailyPlansForWeek, upsertDailyPlan, type DailyPlan } from '../lib/dailyPlans'
import { completeDailyReview } from '../lib/dailyReviews'
import { getStatusMessage } from '../lib/statusMessages'
import { computeDayPhase, selectCurrentMission } from '../lib/dayPhase'
import { addDays, formatDateKey, getWeekDays } from '../lib/dateUtils'
import HelpButton from '../components/HelpButton'
import MorningSetupForm from '../components/MorningSetupForm'

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
  const navigate = useNavigate()
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
  const [completedBanner, setCompletedBanner] = useState(() => searchParams.get('completed'))
  const [tick, setTick] = useState(0)

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editMinutes, setEditMinutes] = useState('')

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reflection, setReflection] = useState('')
  const [tomorrowNotes, setTomorrowNotes] = useState('')
  const [savingReview, setSavingReview] = useState(false)

  // §10: Mission-not-started support
  const [notStartedStep, setNotStartedStep] = useState<null | 'reason'>(null)
  const [notStartedPendingAction, setNotStartedPendingAction] = useState<null | 'reschedule' | 'switch'>(null)
  const [notStartedReason, setNotStartedReason] = useState<string | null>(null)

  // §13: early-finish choice
  const [earlyFinish, setEarlyFinish] = useState(() => searchParams.get('early') === '1')

  // §14.2: proactive replan suggestion, dismissed for the rest of this visit
  const [replanBannerDismissed, setReplanBannerDismissed] = useState(false)

  // Week-not-planned nudge: a lightweight, dismiss-for-this-visit banner
  // (not a blocking phase — planning ahead is optional, per the app's own
  // "necessary the night before or that morning" philosophy).
  const [weekPlans, setWeekPlans] = useState<Map<string, DailyPlan | null>>(new Map())
  const [weekBannerDismissed, setWeekBannerDismissed] = useState(false)

  const [interruptionCount, setInterruptionCount] = useState(0)

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

  const restOfWeekKeys = useMemo(
    () => getWeekDays(today).filter((d) => d.getTime() > today.getTime()).map(formatDateKey),
    [today],
  )

  useEffect(() => {
    if (!user || restOfWeekKeys.length === 0) return
    return subscribeDailyPlansForWeek(user.uid, restOfWeekKeys, setWeekPlans)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, restOfWeekKeys])

  // Query params (?log=1 from the Hori menu, ?completed=... from Overlay's
  // Done button) are one-shot triggers — strip them from the URL once read
  // so a refresh doesn't keep re-showing the banner/log.
  useEffect(() => {
    if (searchParams.get('log') || searchParams.get('completed') || searchParams.get('early')) {
      navigate('/', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const isMissionOverdue =
    dayPhase === 'mission_ready' && !!currentSlot && new Date() > currentSlot.start.toDate() && !activeSession

  useEffect(() => {
    if (!user || !currentActionId) {
      setInterruptionCount(0)
      return
    }
    let cancelled = false
    countInterruptions(user.uid, currentActionId).then((n) => {
      if (!cancelled) setInterruptionCount(n)
    })
    return () => {
      cancelled = true
    }
  }, [user, currentActionId])

  // §14.2: Hori-initiated proactive replan — if the remaining estimated work
  // wouldn't fit before today's end time, offer to reflow the schedule.
  const remainingEstimateMinutes = useMemo(() => {
    if (!dailyPlan) return 0
    return dailyPlan.plannedSlots.reduce((sum, s) => {
      const a = actionsById.get(s.actionId)
      if (!a || a.status === 'done' || a.status === 'skipped') return sum
      return sum + a.estimatedMinutes
    }, 0)
  }, [dailyPlan, actionsById])

  const scheduleAtRisk = useMemo(() => {
    if (!dailyPlan?.dayEndTime || remainingEstimateMinutes === 0) return false
    const projectedEnd = new Date(Date.now() + remainingEstimateMinutes * 60000)
    return projectedEnd > dailyPlan.dayEndTime.toDate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyPlan, remainingEstimateMinutes, tick])

  // Only judge once every remaining day of the week has reported at least
  // one snapshot — otherwise the still-loading empty Map would flash "not
  // planned" even for a week that's actually fully planned.
  const weekNeedsPlanning = useMemo(() => {
    if (restOfWeekKeys.length === 0 || weekPlans.size < restOfWeekKeys.length) return false
    return restOfWeekKeys.some((key) => {
      const plan = weekPlans.get(key)
      return !plan || plan.plannedSlots.length === 0
    })
  }, [restOfWeekKeys, weekPlans])

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
    if (!user) return
    await skipAction(action.id, action.taskId, user.uid)
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

  const handleContinueWorking = async () => {
    if (!user) return
    await upsertDailyPlan(user.uid, todayKey, { eveningPromptAnswer: 'continue_working' })
  }

  const notStartedReasons = ['疲れている', 'やることが曖昧', '気が乗らない', '別の予定が入った', '必要な情報・返信待ち', 'その他']

  const closeNotStarted = () => {
    setNotStartedStep(null)
    setNotStartedPendingAction(null)
    setNotStartedReason(null)
  }

  const handleRescheduleMission = async () => {
    if (!user || !dailyPlan || !currentActionId || !currentSlot) return
    const durationMs = currentSlot.end.toDate().getTime() - currentSlot.start.toDate().getTime()
    const newStart = new Date()
    const newEnd = new Date(newStart.getTime() + durationMs)
    const nextSlots = dailyPlan.plannedSlots.map((s) =>
      s.actionId === currentActionId ? { actionId: s.actionId, start: Timestamp.fromDate(newStart), end: Timestamp.fromDate(newEnd) } : s,
    )
    await upsertDailyPlan(user.uid, todayKey, { plannedSlots: nextSlots })
    closeNotStarted()
  }

  const handleSwitchMissionToday = async () => {
    if (!user || !dailyPlan || !currentActionId) return
    const nextSlots = dailyPlan.plannedSlots.filter((s) => s.actionId !== currentActionId)
    await upsertDailyPlan(user.uid, todayKey, { plannedSlots: nextSlots })
    await setActionDeferredTo(currentActionId, Timestamp.fromDate(addDays(today, 1)))
    closeNotStarted()
  }

  const handleConfirmNotStartedReason = () => {
    if (notStartedPendingAction === 'reschedule') handleRescheduleMission()
    else if (notStartedPendingAction === 'switch') handleSwitchMissionToday()
  }

  const handleBringForwardNext = async () => {
    if (!user || !dailyPlan) return
    const next = selectCurrentMission(dailyPlan, actionsById)
    if (!next) return
    const durationMs = next.slotEnd.getTime() - next.slotStart.getTime()
    const newStart = new Date()
    const newEnd = new Date(newStart.getTime() + durationMs)
    const nextSlots = dailyPlan.plannedSlots.map((s) =>
      s.actionId === next.actionId ? { actionId: s.actionId, start: Timestamp.fromDate(newStart), end: Timestamp.fromDate(newEnd) } : s,
    )
    await upsertDailyPlan(user.uid, todayKey, { plannedSlots: nextSlots })
    setEarlyFinish(false)
  }

  const handleSaveReview = async () => {
    if (!user || !dailyPlan) return
    setSavingReview(true)
    try {
      const completedActionIds = dailyPlan.plannedSlots
        .map((s) => s.actionId)
        .filter((id) => actionsById.get(id)?.status === 'done')
      const incompleteActionIds = dailyPlan.plannedSlots.map((s) => s.actionId).filter((id) => !completedActionIds.includes(id))
      await completeDailyReview(user.uid, todayKey, { completedActionIds, incompleteActionIds, reflection, tomorrowNotes })
      await upsertDailyPlan(user.uid, todayKey, { dayCompletedAt: Timestamp.now(), eveningPromptAnswer: 'reviewed' })
      setReviewOpen(false)
    } finally {
      setSavingReview(false)
    }
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

        {weekNeedsPlanning && !weekBannerDismissed && (
          <div className="neumorphic-raised rounded-xl p-4 bg-primary/5 border border-primary/20 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-primary">今週の残りの予定がまだ埋まっていません。</p>
            <div className="flex gap-2">
              <button
                onClick={() => setWeekBannerDismissed(true)}
                className="text-xs font-bold text-on-surface-variant hover:text-primary"
              >
                閉じる
              </button>
              <Link to="/plan/week" className="btn-squish neumorphic-raised bg-primary text-white px-4 py-1.5 rounded-full text-xs font-bold">
                週の予定を立てる
              </Link>
            </div>
          </div>
        )}

        {completedBanner && (
          <div className="neumorphic-raised rounded-xl p-4 bg-primary/10 border border-primary/20 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-primary">✓ 「{completedBanner}」を完了しました！</p>
              <button
                onClick={() => {
                  setCompletedBanner(null)
                  setEarlyFinish(false)
                }}
                className="text-primary/60 hover:text-primary"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            {earlyFinish && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-primary/80">予定より早く終わりました。</p>
                <button
                  onClick={() => setEarlyFinish(false)}
                  className="btn-squish neumorphic-raised bg-surface text-primary px-4 py-1.5 rounded-full text-xs font-bold"
                >
                  自由時間にする
                </button>
                <button
                  onClick={handleBringForwardNext}
                  className="btn-squish neumorphic-raised bg-primary text-white px-4 py-1.5 rounded-full text-xs font-bold"
                >
                  次のMissionを前倒しする
                </button>
              </div>
            )}
          </div>
        )}

        {scheduleAtRisk && !replanBannerDismissed && (dayPhase === 'working' || dayPhase === 'break' || dayPhase === 'mission_ready') && (
          <div className="neumorphic-raised rounded-xl p-4 bg-secondary/5 border border-secondary/20 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-secondary">このままだと後ろの予定が入らなくなりそうです。残りの計画を見直しますか？</p>
            <div className="flex gap-2">
              <button
                onClick={() => setReplanBannerDismissed(true)}
                className="text-xs font-bold text-on-surface-variant hover:text-secondary"
              >
                変更しない
              </button>
              <Link
                to="/plan?replan=1"
                className="btn-squish neumorphic-raised bg-secondary text-white px-4 py-1.5 rounded-full text-xs font-bold"
              >
                修正案を確認
              </Link>
            </div>
          </div>
        )}

        {dayPhase === 'morning_setup' && (
          <MorningSetupForm activeActions={activeActions} scheduledTasks={scheduledTasks} existingPlan={dailyPlan} onComplete={() => {}} />
        )}

        {dayPhase === 'evening_prompt' && !reviewOpen && (
          <div className="neumorphic-raised rounded-2xl p-10 bg-surface text-center space-y-4">
            <span className="material-symbols-outlined text-4xl text-primary/60">bedtime</span>
            <p className="text-lg font-medium text-on-surface">今日はもう遅い時間です。今日はどうしますか？</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                onClick={() => setReviewOpen(true)}
                className="btn-squish neumorphic-raised bg-primary text-white font-bold py-3 px-6 rounded-full"
              >
                今日を振り返る
              </button>
              <Link to="/plan?tab=tomorrow" className="btn-squish neumorphic-raised bg-surface text-primary font-bold py-3 px-6 rounded-full">
                明日の計画を確認する
              </Link>
              <button
                onClick={handleContinueWorking}
                className="btn-squish neumorphic-raised bg-surface text-on-surface-variant font-bold py-3 px-6 rounded-full"
              >
                まだ作業を続ける
              </button>
            </div>
          </div>
        )}

        {dayPhase === 'evening_prompt' && reviewOpen && (
          <div className="neumorphic-raised rounded-2xl p-8 bg-surface space-y-4">
            <h3 className="text-lg font-bold text-on-surface">今日の振り返り</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-outline">今日気づいたこと・学んだこと（任意）</label>
              <textarea
                className="w-full h-20 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-outline">明日への引き継ぎメモ（任意）</label>
              <textarea
                className="w-full h-20 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                value={tomorrowNotes}
                onChange={(e) => setTomorrowNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setReviewOpen(false)} className="px-4 py-2 rounded-full text-sm text-on-surface-variant">
                キャンセル
              </button>
              <button
                onClick={handleSaveReview}
                disabled={savingReview}
                className="px-6 py-2 rounded-full text-sm font-bold bg-primary text-white disabled:opacity-50"
              >
                {savingReview ? '保存しています…' : '保存して終了'}
              </button>
            </div>
          </div>
        )}

        {dayPhase === 'day_complete' && (
          <div className="neumorphic-raised rounded-2xl p-10 bg-surface text-center space-y-4">
            <span className="material-symbols-outlined text-4xl text-primary/60">task_alt</span>
            {dailyPlan?.dayCompletedAt ? (
              <>
                <p className="text-lg font-medium text-on-surface">今日はお疲れさまでした。</p>
                <p className="text-sm text-on-surface-variant">振り返りを保存しました。ゆっくり休んでください。</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-on-surface">今日の予定はすべて完了しました。</p>
                <p className="text-sm text-on-surface-variant">お疲れさまでした。予定を追加するか、少し休みましょう。</p>
              </>
            )}
            <Link
              to="/plan"
              className="inline-block btn-squish neumorphic-raised bg-primary text-white font-bold py-3 px-8 rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              予定を見直す
            </Link>
          </div>
        )}

        {(dayPhase === 'working' || dayPhase === 'break' || dayPhase === 'mission_ready') && currentAction && (
          <div className="neumorphic-raised rounded-2xl p-8 bg-surface space-y-6 ring-4 ring-primary/5">
            <div className="flex items-center justify-between gap-2">
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
              <Link to="/plan?replan=1" className="text-xs font-bold text-on-surface-variant hover:text-primary">
                予定を確認する
              </Link>
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

            {interruptionCount >= 2 && (
              <div className="neumorphic-sunken rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-secondary font-bold">このMissionは何度か中断されています。分割してみませんか？</p>
                <Link to="/plan?replan=1" className="text-xs font-bold text-secondary hover:underline">
                  計画を見直す
                </Link>
              </div>
            )}

            {!editing && isMissionOverdue && !notStartedStep && (
              <div className="neumorphic-sunken rounded-xl p-5 space-y-3">
                <p className="text-sm font-bold text-on-surface">予定していた時間を過ぎています。まず5分だけ始めてみましょう？</p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to={`/overlay/${currentAction.taskId}/${currentAction.id}?shortStart=1`}
                    className="btn-squish neumorphic-raised bg-primary text-white font-bold py-3 px-6 rounded-full"
                  >
                    5分だけ始める
                  </Link>
                  <button
                    onClick={() => {
                      setNotStartedPendingAction('reschedule')
                      setNotStartedStep('reason')
                    }}
                    className="btn-squish neumorphic-raised bg-surface text-on-surface-variant font-bold py-3 px-6 rounded-full"
                  >
                    予定をずらす
                  </button>
                  <button
                    onClick={() => {
                      setNotStartedPendingAction('switch')
                      setNotStartedStep('reason')
                    }}
                    className="btn-squish neumorphic-raised bg-surface text-on-surface-variant font-bold py-3 px-6 rounded-full"
                  >
                    別のMissionにする
                  </button>
                </div>
              </div>
            )}

            {!editing && isMissionOverdue && notStartedStep === 'reason' && (
              <div className="neumorphic-sunken rounded-xl p-5 space-y-3">
                <p className="text-sm font-bold text-on-surface">よろしければ理由を教えてください（任意）</p>
                <div className="flex flex-wrap gap-2">
                  {notStartedReasons.map((r) => (
                    <button
                      key={r}
                      onClick={() => setNotStartedReason(r)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                        notStartedReason === r ? 'neumorphic-raised bg-secondary/10 text-secondary' : 'neumorphic-raised text-on-surface-variant'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={closeNotStarted} className="text-sm font-bold text-on-surface-variant hover:text-primary">
                    やめる
                  </button>
                  <button
                    onClick={handleConfirmNotStartedReason}
                    className="btn-squish neumorphic-raised bg-primary text-white px-6 py-2 rounded-full text-sm font-bold ml-auto"
                  >
                    {notStartedPendingAction === 'reschedule' ? 'この予定にずらす' : '別のMissionにする'}
                  </button>
                </div>
              </div>
            )}

            {!editing && !isMissionOverdue && (
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
                {status === 'done' ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-primary text-white">
                    <span className="material-symbols-outlined text-base">check</span>
                  </div>
                ) : action ? (
                  <button
                    onClick={() => user && completeAction(action.id, action.taskId, user.uid)}
                    title="完了にする"
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-primary hover:text-white transition-colors ${
                      status === 'current' ? 'bg-primary/20 text-primary' : 'bg-surface-container text-outline'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {status === 'current' ? 'play_arrow' : 'schedule'}
                    </span>
                  </button>
                ) : (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      status === 'current' ? 'bg-primary/20 text-primary' : 'bg-surface-container text-outline'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {status === 'current' ? 'play_arrow' : 'schedule'}
                    </span>
                  </div>
                )}
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
