import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { createFollowUpTask, getTask, savePlan, type Task } from '../lib/tasks'
import { createAction } from '../lib/actions'
import { suggestActionBreakdown, suggestActionBreakdownBatch, type ActionSuggestion, type BatchTaskInput } from '../lib/ai'
import { getEndOfWeek, formatDateKey } from '../lib/dateUtils'
import { ACTIONS_PER_TASK_CAP, splitOverflowActions } from '../lib/actionSplit'
import HelpButton from '../components/HelpButton'

type Phase = 'loading' | 'input' | 'reviewing' | 'empty'

interface TaskInput {
  taskId: string
  title: string
  outputGoal: string
  currentState: string
  userDraftSteps: string
  deadlineInput: string // yyyy-mm-dd
  deadlineLabelText: string
}

interface TaskReview {
  taskId: string
  title: string
  actions: ActionSuggestion[]
  status: 'pending' | 'confirmed' | 'error'
  busy: boolean
}

function lastDayOfThisMonth(): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + 1, 0)
  return d
}

export default function BatchDiagnoseScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const taskIds = (location.state as { taskIds?: string[] } | null)?.taskIds ?? []

  const [phase, setPhase] = useState<Phase>(taskIds.length === 0 ? 'empty' : 'loading')
  const [inputs, setInputs] = useState<TaskInput[]>([])
  const [reviews, setReviews] = useState<TaskReview[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (taskIds.length === 0) return
    let cancelled = false
    ;(async () => {
      const tasks = await Promise.all(taskIds.map((id) => getTask(id)))
      if (cancelled) return
      const loaded: TaskInput[] = []
      tasks.forEach((task: Task | null, i) => {
        if (!task) return
        loaded.push({
          taskId: taskIds[i],
          title: task.title || task.originalInput,
          outputGoal: task.outputGoal ?? '',
          currentState: task.currentState ?? '',
          userDraftSteps: '',
          deadlineInput: '',
          deadlineLabelText: '',
        })
      })
      setInputs(loaded)
      setPhase(loaded.length === 0 ? 'empty' : 'input')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateInput = (taskId: string, patch: Partial<TaskInput>) => {
    setInputs((prev) => prev.map((i) => (i.taskId === taskId ? { ...i, ...patch } : i)))
  }

  const applyDeadlinePreset = (taskId: string, preset: 'this_week' | 'this_month' | 'asap') => {
    if (preset === 'asap') {
      updateInput(taskId, { deadlineLabelText: 'できるだけ早く', deadlineInput: '' })
      return
    }
    const d = preset === 'this_week' ? getEndOfWeek() : lastDayOfThisMonth()
    updateInput(taskId, { deadlineLabelText: preset === 'this_week' ? '今週中' : '今月中', deadlineInput: formatDateKey(d) })
  }

  const canSubmit = inputs.length > 0 && inputs.every((i) => i.outputGoal.trim() && i.currentState.trim())

  const handleBatchSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const batchInputs: BatchTaskInput[] = inputs.map((i) => ({
        taskId: i.taskId,
        title: i.title,
        outputGoal: i.outputGoal.trim(),
        currentState: i.currentState.trim(),
        userDraftSteps: i.userDraftSteps.trim() || undefined,
        deadlineHint: i.deadlineLabelText || i.deadlineInput || undefined,
      }))
      const results = await suggestActionBreakdownBatch(batchInputs)
      setReviews(
        results.map((r) => ({
          taskId: r.taskId,
          title: inputs.find((i) => i.taskId === r.taskId)?.title ?? '',
          actions: r.actions,
          status: r.actions.length > 0 ? 'pending' : 'error',
          busy: false,
        })),
      )
      setPhase('reviewing')
    } catch {
      setError('分割に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  const updateReviewAction = (taskId: string, index: number, patch: Partial<ActionSuggestion>) => {
    setReviews((prev) =>
      prev.map((r) => (r.taskId === taskId ? { ...r, actions: r.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)) } : r)),
    )
  }

  const removeReviewAction = (taskId: string, index: number) => {
    setReviews((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, actions: r.actions.filter((_, i) => i !== index) } : r)))
  }

  const addReviewAction = (taskId: string) => {
    setReviews((prev) =>
      prev.map((r) =>
        r.taskId === taskId ? { ...r, actions: [...r.actions, { title: '', estimatedMinutes: 30, completionCriteria: '' }] } : r,
      ),
    )
  }

  const handleRegenerate = async (taskId: string) => {
    const input = inputs.find((i) => i.taskId === taskId)
    if (!input) return
    setReviews((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, busy: true } : r)))
    try {
      const result = await suggestActionBreakdown({
        title: input.title,
        outputGoal: input.outputGoal.trim(),
        currentState: input.currentState.trim(),
        userDraftSteps: input.userDraftSteps.trim() || undefined,
        deadlineHint: input.deadlineLabelText || input.deadlineInput || undefined,
      })
      setReviews((prev) =>
        prev.map((r) =>
          r.taskId === taskId ? { ...r, actions: result.actions, status: result.actions.length > 0 ? 'pending' : 'error', busy: false } : r,
        ),
      )
    } catch {
      setReviews((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, busy: false } : r)))
    }
  }

  const [splitConfirmTaskId, setSplitConfirmTaskId] = useState<string | null>(null)
  const [bulkSplitConfirmPending, setBulkSplitConfirmPending] = useState(false)

  const confirmTask = async (taskId: string, skipSplitCheck = false) => {
    if (!user) return
    const input = inputs.find((i) => i.taskId === taskId)
    const review = reviews.find((r) => r.taskId === taskId)
    if (!input || !review || review.actions.length === 0) return
    if (!skipSplitCheck && review.actions.length > ACTIONS_PER_TASK_CAP) {
      setSplitConfirmTaskId(taskId)
      return
    }
    setReviews((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, busy: true } : r)))
    try {
      const { primary, overflow } = splitOverflowActions(review.actions)
      const deadline = input.deadlineInput ? Timestamp.fromDate(new Date(`${input.deadlineInput}T23:59:59`)) : null
      const plan = { title: input.title, outputGoal: input.outputGoal.trim(), currentState: input.currentState.trim(), deadline }
      await savePlan(taskId, plan)
      for (const action of primary) {
        await createAction(user.uid, taskId, input.title, action.title, action.estimatedMinutes, {
          completionCriteria: action.completionCriteria,
        })
      }
      if (overflow.length > 0) {
        const followUpTaskId = await createFollowUpTask(user.uid, taskId, plan)
        const followUpTitle = `${input.title}（続き）`
        for (const action of overflow) {
          await createAction(user.uid, followUpTaskId, followUpTitle, action.title, action.estimatedMinutes, {
            completionCriteria: action.completionCriteria,
          })
        }
      }
      setReviews((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, status: 'confirmed', busy: false } : r)))
    } catch {
      setReviews((prev) => prev.map((r) => (r.taskId === taskId ? { ...r, busy: false } : r)))
    }
  }

  const pendingReviews = () => reviews.filter((r) => r.status === 'pending' && r.actions.length > 0)

  const confirmAllPending = async () => {
    const pending = pendingReviews()
    if (pending.some((r) => r.actions.length > ACTIONS_PER_TASK_CAP) && !bulkSplitConfirmPending) {
      setBulkSplitConfirmPending(true)
      return
    }
    setBulkSplitConfirmPending(false)
    for (const r of pending) {
      await confirmTask(r.taskId, true)
    }
    navigate('/')
  }

  const pendingCount = reviews.filter((r) => r.status === 'pending' && r.actions.length > 0).length
  const overflowTasksInBulk = pendingReviews().filter((r) => r.actions.length > ACTIONS_PER_TASK_CAP)

  if (phase === 'empty') {
    return (
      <div className="flex-grow flex flex-col items-center justify-center gap-4">
        <p className="text-on-surface-variant">整理するタスクが選ばれていません。</p>
        <button onClick={() => navigate('/inbox')} className="text-primary font-bold">
          Inboxに戻る
        </button>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="flex-grow flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-4xl font-bold text-primary">まとめて整理する</h2>
            <HelpButton title="一括Diagnoseの使い方">
              <p>Inboxで選んだ複数のタスクを、まとめて1回のAIリクエストでActionに分割する画面です。</p>
              <p>各タスクについて「完了したらどうなる状態か」「現在地」は必須、「締切までに必要なこと」（自由記述、書いた内容をAIが優先して整えます）と「締切」は任意です。</p>
              <p>「まとめて分割する」を押すと全タスクを一度に処理します。結果はタスクごとに編集・再生成・個別確定できます。確定しなかったタスクはInboxに残り、次回開くと再分割し直します。</p>
            </HelpButton>
          </div>
          <p className="text-lg text-on-surface-variant">{inputs.length}件のタスクを整理します</p>
        </header>

        {phase === 'input' && (
          <div className="space-y-6">
            {inputs.map((input) => (
              <section key={input.taskId} className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
                <h3 className="text-lg font-bold text-on-surface">{input.title}</h3>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-outline">完了したらどうなる状態か</label>
                  <textarea
                    className="w-full h-16 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                    value={input.outputGoal}
                    onChange={(e) => updateInput(input.taskId, { outputGoal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-outline">現在地</label>
                    <button
                      onClick={() => updateInput(input.taskId, { currentState: '未着手' })}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      未着手
                    </button>
                  </div>
                  <textarea
                    className="w-full h-16 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                    value={input.currentState}
                    onChange={(e) => updateInput(input.taskId, { currentState: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-outline">締切までに必要なこと（任意・思いつく順に1行ずつ）</label>
                  <textarea
                    className="w-full h-20 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                    placeholder={'例：\n関連する資料を探す\n構成を整理する\n文章を書く'}
                    value={input.userDraftSteps}
                    onChange={(e) => updateInput(input.taskId, { userDraftSteps: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-outline">締切（任意）</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      className="p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                      value={input.deadlineInput}
                      onChange={(e) => updateInput(input.taskId, { deadlineInput: e.target.value, deadlineLabelText: '' })}
                    />
                    {(['this_week', 'this_month', 'asap'] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => applyDeadlinePreset(input.taskId, preset)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                          input.deadlineLabelText === (preset === 'this_week' ? '今週中' : preset === 'this_month' ? '今月中' : 'できるだけ早く')
                            ? 'neumorphic-sunken text-primary'
                            : 'neumorphic-raised text-on-surface-variant'
                        }`}
                      >
                        {preset === 'this_week' ? '今週中' : preset === 'this_month' ? '今月中' : 'できるだけ早く'}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ))}

            <button
              onClick={handleBatchSubmit}
              disabled={!canSubmit || submitting}
              className="btn-squish w-full neumorphic-raised bg-primary text-on-primary py-4 rounded-full font-bold text-lg disabled:opacity-50"
            >
              {submitting ? '分割しています…' : `まとめて分割する（${inputs.length}件）`}
            </button>
            {error && <p className="text-sm text-secondary text-center">{error}</p>}
          </div>
        )}

        {phase === 'reviewing' && (
          <div className="space-y-6">
            {reviews.map((review) => (
              <section
                key={review.taskId}
                className={`neumorphic-raised p-6 rounded-lg bg-surface space-y-4 ${review.status === 'confirmed' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-on-surface">{review.title}</h3>
                  {review.status === 'confirmed' && (
                    <span className="text-xs font-bold text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">check_circle</span>確定済み
                    </span>
                  )}
                  {review.status === 'error' && <span className="text-xs font-bold text-secondary">分割できませんでした</span>}
                </div>

                {review.status !== 'confirmed' && (
                  <>
                    <div className="space-y-3">
                      {review.actions.map((action, i) => (
                        <div key={i} className="neumorphic-sunken rounded-lg p-4 bg-surface space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              className="flex-1 p-2 text-sm font-bold neumorphic-raised border-none rounded-lg bg-surface"
                              value={action.title}
                              onChange={(e) => updateReviewAction(review.taskId, i, { title: e.target.value })}
                            />
                            <input
                              type="number"
                              min={1}
                              className="w-20 p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                              value={action.estimatedMinutes}
                              onChange={(e) => updateReviewAction(review.taskId, i, { estimatedMinutes: parseInt(e.target.value, 10) || 0 })}
                            />
                            <span className="text-xs text-on-surface-variant">分</span>
                            <button onClick={() => removeReviewAction(review.taskId, i)} className="text-outline hover:text-secondary transition-colors">
                              <span className="material-symbols-outlined text-base">close</span>
                            </button>
                          </div>
                          <input
                            className="w-full p-2 text-xs neumorphic-raised border-none rounded-lg bg-surface text-on-surface-variant"
                            value={action.completionCriteria}
                            onChange={(e) => updateReviewAction(review.taskId, i, { completionCriteria: e.target.value })}
                            placeholder="完了条件"
                          />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addReviewAction(review.taskId)} className="text-xs font-bold text-primary hover:underline">
                      + Actionを追加
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleRegenerate(review.taskId)}
                        disabled={review.busy}
                        className="neumorphic-raised px-4 py-2 rounded-full text-xs font-bold text-on-surface-variant disabled:opacity-50"
                      >
                        {review.busy ? '再生成中…' : 'このタスクだけ再生成'}
                      </button>
                      <button
                        onClick={() => confirmTask(review.taskId)}
                        disabled={review.busy || review.actions.length === 0}
                        className="btn-squish neumorphic-raised bg-primary text-white px-6 py-2 rounded-full text-sm font-bold disabled:opacity-50 ml-auto"
                      >
                        この内容で確定
                      </button>
                    </div>
                  </>
                )}
              </section>
            ))}

            {pendingCount > 0 && (
              <button
                onClick={confirmAllPending}
                className="btn-squish w-full neumorphic-raised bg-primary text-on-primary py-4 rounded-full font-bold text-lg"
              >
                {pendingCount}件のタスクをActionにする
              </button>
            )}
          </div>
        )}
      </div>

      {splitConfirmTaskId &&
        (() => {
          const review = reviews.find((r) => r.taskId === splitConfirmTaskId)
          if (!review) return null
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
              <div className="neumorphic-raised bg-surface rounded-xl p-6 max-w-sm space-y-4">
                <h3 className="text-lg font-bold text-on-surface">Actionが{ACTIONS_PER_TASK_CAP}件を超えています</h3>
                <p className="text-sm text-on-surface-variant">
                  「{review.title}」の{ACTIONS_PER_TASK_CAP + 1}件目以降（{review.actions.length - ACTIONS_PER_TASK_CAP}件）は「{review.title}（続き）」として新しいタスクに分けて登録します。元のタスクが完了するまで、そちらは今日の候補には表示されません。
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setSplitConfirmTaskId(null)} className="px-4 py-2 rounded-full text-sm font-bold text-on-surface-variant">
                    やめる
                  </button>
                  <button
                    onClick={() => {
                      const taskId = splitConfirmTaskId
                      setSplitConfirmTaskId(null)
                      void confirmTask(taskId, true)
                    }}
                    className="btn-squish neumorphic-raised bg-primary text-white px-6 py-2 rounded-full text-sm font-bold"
                  >
                    分けて登録する
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      {bulkSplitConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="neumorphic-raised bg-surface rounded-xl p-6 max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-on-surface">Actionが{ACTIONS_PER_TASK_CAP}件を超えるタスクがあります</h3>
            <p className="text-sm text-on-surface-variant">
              次のタスクは{ACTIONS_PER_TASK_CAP + 1}件目以降を「（続き）」タスクに分けて登録します。元のタスクが完了するまで、そちらは今日の候補には表示されません。
            </p>
            <ul className="text-sm text-on-surface list-disc list-inside">
              {overflowTasksInBulk.map((r) => (
                <li key={r.taskId}>
                  {r.title}（{r.actions.length}件 → {ACTIONS_PER_TASK_CAP}件 + 続き{r.actions.length - ACTIONS_PER_TASK_CAP}件）
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-3">
              <button onClick={() => setBulkSplitConfirmPending(false)} className="px-4 py-2 rounded-full text-sm font-bold text-on-surface-variant">
                やめる
              </button>
              <button
                onClick={confirmAllPending}
                className="btn-squish neumorphic-raised bg-primary text-white px-6 py-2 rounded-full text-sm font-bold"
              >
                分けて登録する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
