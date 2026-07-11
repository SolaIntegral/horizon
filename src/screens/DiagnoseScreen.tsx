import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { suggestActionBreakdown, type ActionSuggestion } from '../lib/ai'
import { createAction } from '../lib/actions'
import { createPlannedTask, getTask, savePlan, type Task } from '../lib/tasks'
import HelpButton from '../components/HelpButton'

export default function DiagnoseScreen() {
  const { user } = useAuth()
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()

  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId ?? null)
  const [rawInput, setRawInput] = useState('')
  const [title, setTitle] = useState('')
  const [outputGoal, setOutputGoal] = useState('')
  const [currentState, setCurrentState] = useState('')
  const [deadlineInput, setDeadlineInput] = useState('')
  const [suggestions, setSuggestions] = useState<ActionSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingTask, setLoadingTask] = useState(!!taskId)
  const [saved, setSaved] = useState(false)

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
        setTitle(task.title || task.originalInput)
        setOutputGoal(task.outputGoal ?? '')
        setCurrentState(task.currentState ?? '')
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

  const handleSuggestBreakdown = async () => {
    if (!title.trim() || !outputGoal.trim() || !currentState.trim() || !user) return
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const result = await suggestActionBreakdown({ title: title.trim(), outputGoal: outputGoal.trim(), currentState: currentState.trim() })
      setSuggestions(result.actions)
    } catch {
      setError('分割案の提案に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const updateSuggestion = (index: number, patch: Partial<ActionSuggestion>) => {
    setSuggestions((prev) => (prev ? prev.map((s, i) => (i === index ? { ...s, ...patch } : s)) : prev))
  }

  const removeSuggestion = (index: number) => {
    setSuggestions((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
  }

  const handleConfirmPlan = async () => {
    if (!user || !suggestions || suggestions.length === 0) return
    setSaving(true)
    try {
      const deadline = deadlineInput ? Timestamp.fromDate(new Date(`${deadlineInput}T23:59:59`)) : null
      const plan = { title: title.trim(), outputGoal: outputGoal.trim(), currentState: currentState.trim(), deadline }
      let finalTaskId = activeTaskId
      if (finalTaskId) {
        await savePlan(finalTaskId, plan)
      } else {
        finalTaskId = await createPlannedTask(user.uid, rawInput, plan)
        setActiveTaskId(finalTaskId)
      }
      for (const s of suggestions) {
        await createAction(user.uid, finalTaskId, plan.title, s.title, s.estimatedMinutes, { completionCriteria: s.completionCriteria })
      }
      setSaved(true)
      navigate('/')
    } finally {
      setSaving(false)
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
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-4xl font-bold text-primary">Plan this Task</h2>
            <HelpButton title="Planの使い方（タスクの分割）">
              <p>1つのタスクを、実際に取り組めるActionに分割する画面です。</p>
              <p>タイトル・完成イメージ（アウトプット）・現在地（どこまで出来ているか）・締切（任意）を入力し、「Actionへ分割してもらう」を押すと、AIが2〜6個のAction案を見積り時間・完了条件つきで提案します。</p>
              <p>提案はその場で編集・削除できます。「この分割で計画を確定」を押すとタスクが「計画済み」になり、各ActionがToday画面やPlan画面の候補に表示されるようになります。</p>
            </HelpButton>
          </div>
          <p className="text-lg text-on-surface-variant">完成イメージ・現在地を整理して、Actionに分割しましょう。</p>
        </header>

        <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
          <h3 className="text-xs font-bold text-outline uppercase tracking-widest">Task Note</h3>
          <textarea
            className="w-full h-20 p-4 text-sm neumorphic-sunken border-none rounded-lg focus:ring-2 focus:ring-primary/20 placeholder-outline/50 resize-none bg-surface"
            placeholder="Need to finish that marketing report by Friday..."
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
          />
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
          <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-5">
            <h3 className="text-xs font-bold text-outline uppercase tracking-widest">Plan</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-outline">タイトル</label>
              <input
                className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="タスクの短いタイトル"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-outline">完成イメージ（アウトプット）</label>
              <textarea
                className="w-full h-20 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                value={outputGoal}
                onChange={(e) => setOutputGoal(e.target.value)}
                placeholder="どうなったら終わりか"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-outline">現在地（どこまで出来ているか）</label>
              <textarea
                className="w-full h-20 p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
                value={currentState}
                onChange={(e) => setCurrentState(e.target.value)}
                placeholder="今どこまで進んでいるか"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-outline">締切（任意）</label>
              <input
                type="date"
                className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
              />
            </div>
            <button
              className="btn-squish neumorphic-raised bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 disabled:opacity-50"
              onClick={handleSuggestBreakdown}
              disabled={loading || !title.trim() || !outputGoal.trim() || !currentState.trim()}
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              {loading ? '分割案を考えています…' : 'Actionへ分割してもらう'}
            </button>
            {error && <p className="text-sm text-secondary">{error}</p>}
          </section>

          <section className="neumorphic-raised p-6 rounded-lg bg-surface space-y-4">
            <h3 className="text-xs font-bold text-outline uppercase tracking-widest">Suggested Actions</h3>
            {!suggestions && <p className="text-sm text-outline">分割案はここに表示されます。</p>}
            {suggestions && suggestions.length === 0 && <p className="text-sm text-outline">Actionがありません。</p>}
            <div className="space-y-3">
              {suggestions?.map((s, i) => (
                <div key={i} className="neumorphic-sunken rounded-lg p-4 bg-surface space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 p-2 text-sm font-bold neumorphic-raised border-none rounded-lg bg-surface"
                      value={s.title}
                      onChange={(e) => updateSuggestion(i, { title: e.target.value })}
                    />
                    <input
                      type="number"
                      min={1}
                      className="w-20 p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                      value={s.estimatedMinutes}
                      onChange={(e) => updateSuggestion(i, { estimatedMinutes: parseInt(e.target.value, 10) || 0 })}
                    />
                    <span className="text-xs text-on-surface-variant">分</span>
                    <button onClick={() => removeSuggestion(i)} className="text-outline hover:text-secondary transition-colors">
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                  <input
                    className="w-full p-2 text-xs neumorphic-raised border-none rounded-lg bg-surface text-on-surface-variant"
                    value={s.completionCriteria}
                    onChange={(e) => updateSuggestion(i, { completionCriteria: e.target.value })}
                    placeholder="完了条件"
                  />
                </div>
              ))}
            </div>
            {suggestions && suggestions.length > 0 && (
              <button
                className="btn-squish neumorphic-raised bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 disabled:opacity-50 w-full justify-center"
                onClick={handleConfirmPlan}
                disabled={saving}
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {saving ? '保存しています…' : 'この分割で計画を確定'}
              </button>
            )}
            {saved && <p className="text-sm text-primary">✓ 保存しました</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
