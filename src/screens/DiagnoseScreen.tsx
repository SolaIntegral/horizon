import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { diagnoseTask, type TaskDiagnosis } from '../lib/ai'
import { createAction } from '../lib/actions'
import { createDiagnosedTask, getTask, saveDiagnosis, scheduleTaskLater, scheduleTaskThisWeek, type Task } from '../lib/tasks'

const riskColor: Record<TaskDiagnosis['riskLevel'], string> = {
  HIGH: 'text-secondary',
  MEDIUM: 'text-primary',
  LOW: 'text-outline',
}

export default function DiagnoseScreen() {
  const { user } = useAuth()
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()

  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId ?? null)
  const [rawInput, setRawInput] = useState('')
  const [diagnosis, setDiagnosis] = useState<TaskDiagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingTask, setLoadingTask] = useState(!!taskId)
  const [scheduling, setScheduling] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState(false)

  useEffect(() => {
    if (!taskId) return
    let cancelled = false

    const load = async () => {
      setLoadingTask(true)
      let task: Task | null = null
      try {
        task = await getTask(taskId)
      } catch {
        // Transient: right after creating a doc, the auth token used for the
        // first read can occasionally lag — retry once after a short delay.
        await new Promise((resolve) => setTimeout(resolve, 500))
        try {
          task = await getTask(taskId)
        } catch {
          if (!cancelled) setError('タスクの読み込みに失敗しました。もう一度お試しください。')
        }
      }
      if (cancelled) return
      if (task) {
        setRawInput(task.originalInput)
        if (task.title) {
          setDiagnosis({
            title: task.title,
            riskLevel: task.riskLevel ?? 'LOW',
            riskLabel: task.riskLabel ?? '',
            riskReason: task.riskReason ?? '',
            suggestedAction: task.suggestedAction ?? '',
            estimatedMinutes: task.estimatedMinutes ?? 0,
          })
        }
      } else if (!error) {
        setError('タスクが見つかりませんでした。')
      }
      setLoadingTask(false)
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const handleDiagnose = async () => {
    if (!rawInput.trim() || !user) return
    setLoading(true)
    setError(null)
    setScheduled(false)
    try {
      const result = await diagnoseTask(rawInput)
      setDiagnosis(result)
      if (activeTaskId) {
        await saveDiagnosis(activeTaskId, result)
      } else {
        const newId = await createDiagnosedTask(user.uid, rawInput, result)
        setActiveTaskId(newId)
      }
    } catch {
      setError('Diagnosis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDoThisWeek = async () => {
    if (!activeTaskId) return
    setScheduling('week')
    try {
      await scheduleTaskThisWeek(activeTaskId)
      setScheduled(true)
    } finally {
      setScheduling(null)
    }
  }

  const handleCreateNext15 = async () => {
    if (!activeTaskId || !user || !diagnosis) return
    setScheduling('next15')
    try {
      await scheduleTaskThisWeek(activeTaskId)
      await createAction(user.uid, activeTaskId, diagnosis.title, diagnosis.suggestedAction)
      setScheduled(true)
      navigate('/')
    } finally {
      setScheduling(null)
    }
  }

  const handleDoLater = async () => {
    if (!activeTaskId) return
    setScheduling('later')
    try {
      await scheduleTaskLater(activeTaskId)
      setScheduled(true)
    } finally {
      setScheduling(null)
    }
  }

  if (loadingTask) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <header>
          <h2 className="text-4xl font-bold text-primary mb-2">Task Diagnose</h2>
          <p className="text-lg text-on-surface-variant">Let's refine your focus for maximum impact.</p>
        </header>

        <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
          <h3 className="text-xs font-bold text-outline uppercase tracking-widest">Task Note</h3>
          <textarea
            className="w-full h-28 p-4 text-sm neumorphic-sunken border-none rounded-lg focus:ring-2 focus:ring-primary/20 placeholder-outline/50 resize-none bg-surface"
            placeholder="Need to finish that marketing report by Friday..."
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
          />
          <button
            className="btn-squish neumorphic-raised bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            onClick={handleDiagnose}
            disabled={loading || !rawInput.trim()}
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            {loading ? 'Diagnosing…' : 'Diagnose'}
          </button>
          {error && <p className="text-sm text-secondary">{error}</p>}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
          <div className="space-y-8">
            <section className="neumorphic-raised p-6 rounded-lg bg-surface">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest mb-6">Task Summary</h3>
              <div className="space-y-4">
                <p className="text-xs text-outline">Original Input:</p>
                <p className="text-sm italic text-on-surface-variant px-4 py-3 neumorphic-sunken rounded-lg bg-surface">
                  {diagnosis ? `"${rawInput}"` : 'Enter a task note above and click Diagnose.'}
                </p>
                {diagnosis && (
                  <div className="pt-2">
                    <h4 className="text-2xl font-bold text-primary mb-1">{diagnosis.title}</h4>
                    <div className="flex flex-wrap gap-4 mt-4">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className="material-symbols-outlined text-outline">schedule</span>
                        {diagnosis.estimatedMinutes}m Est.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="neumorphic-raised p-6 rounded-lg bg-surface">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest mb-6">Risk Assessment</h3>
              {diagnosis ? (
                <div className="flex items-center gap-8">
                  <div className="w-32 h-32 rounded-full neumorphic-sunken flex items-center justify-center relative p-1 overflow-hidden">
                    <div className="absolute inset-0 risk-gauge opacity-30"></div>
                    <div className="absolute inset-2 bg-surface rounded-full"></div>
                    <div className="text-center relative z-10">
                      <p className={`text-xl font-bold ${riskColor[diagnosis.riskLevel]}`}>{diagnosis.riskLevel}</p>
                      <p className="text-[10px] text-outline font-bold">RISK</p>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className={`text-lg font-bold mb-1 ${riskColor[diagnosis.riskLevel]}`}>{diagnosis.riskLabel}</p>
                    <p className="text-sm text-outline leading-relaxed">{diagnosis.riskReason}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-outline">Risk assessment will appear here after diagnosis.</p>
              )}
            </section>
          </div>

          <div className="space-y-8">
            <section className="neumorphic-raised p-6 rounded-lg bg-surface">
              <h3 className="text-xs font-bold text-outline uppercase tracking-widest mb-6">Suggested Actions</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-squish neumorphic-raised bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                  onClick={handleDoThisWeek}
                  disabled={!diagnosis || scheduling !== null}
                >
                  <span className="material-symbols-outlined text-sm">calendar_today</span>
                  {scheduling === 'week' ? '...' : 'Do this week'}
                </button>
                <button
                  className="btn-squish neumorphic-raised bg-surface px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                  onClick={handleCreateNext15}
                  disabled={!diagnosis || scheduling !== null}
                >
                  <span className="material-symbols-outlined text-sm">bolt</span>
                  {scheduling === 'next15' ? '...' : 'Create Next 15'}
                </button>
                <button
                  className="btn-squish neumorphic-raised bg-surface px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                  onClick={handleDoLater}
                  disabled={!diagnosis || scheduling !== null}
                >
                  <span className="material-symbols-outlined text-sm">update</span>
                  {scheduling === 'later' ? '...' : 'Do later'}
                </button>
              </div>
              {scheduled && <p className="text-sm text-primary mt-4">✓ 保存しました</p>}
            </section>

            <section className="neumorphic-sunken p-6 rounded-lg bg-primary/5 border-l-4 border-primary">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary">auto_awesome</span>
                <h3 className="text-xs font-bold text-primary uppercase">AI Insight</h3>
              </div>
              <p className="text-on-surface-variant font-medium">
                {diagnosis
                  ? diagnosis.suggestedAction
                  : 'Your suggested first next-step will appear here after diagnosis.'}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
