import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { checkQuizAnswer, generateGrowthMemo, type GrowthMemo, type QuizCheckResult } from '../lib/ai'
import { saveGrowthLog, subscribeGrowthLogs, type GrowthLog } from '../lib/growthLogs'
import BuildPlanFAB from '../components/buildplan/BuildPlanFAB'

function buildMarkdown(log: { reflectionText: string; aiMemo: GrowthMemo; quizAnswer?: string; createdAt?: Date }): string {
  const date = (log.createdAt ?? new Date()).toLocaleString()
  const lines = [
    `# Growth Log - ${date}`,
    '',
    '## Reflection',
    log.reflectionText,
    '',
    '## AI Summary',
    log.aiMemo.summary,
    '',
    ...log.aiMemo.bulletPoints.map((b) => `- ${b}`),
    '',
    '## Quiz',
    `Q. ${log.aiMemo.quizQuestion}`,
    log.quizAnswer ? `A. ${log.quizAnswer}` : '',
    '',
    "## Tomorrow's Challenge",
    log.aiMemo.tomorrowChallenge,
  ]
  return lines.join('\n')
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function GrowthScreen() {
  const { user } = useAuth()
  const [reflection, setReflection] = useState('')
  const [memo, setMemo] = useState<GrowthMemo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quizAnswer, setQuizAnswer] = useState('')
  const [quizResult, setQuizResult] = useState<QuizCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logs, setLogs] = useState<GrowthLog[]>([])

  useEffect(() => {
    if (!user) return
    return subscribeGrowthLogs(user.uid, setLogs)
  }, [user])

  const handleGenerate = async () => {
    if (!reflection.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await generateGrowthMemo(reflection)
      setMemo(result)
      setQuizAnswer('')
      setQuizResult(null)
      setSaved(false)
    } catch {
      setError('Memo generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckAnswer = async () => {
    if (!memo || !quizAnswer.trim()) return
    setChecking(true)
    try {
      const result = await checkQuizAnswer(memo.quizQuestion, quizAnswer)
      setQuizResult(result)
    } catch {
      setQuizResult({ correct: false, feedback: '採点に失敗しました。もう一度お試しください。' })
    } finally {
      setChecking(false)
    }
  }

  const handleSaveLog = async () => {
    if (!user || !memo || !reflection.trim()) return
    setSaving(true)
    try {
      await saveGrowthLog(user.uid, reflection, memo, quizAnswer || undefined, quizResult?.correct)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const handleExportMarkdown = () => {
    if (!memo) return
    const markdown = buildMarkdown({ reflectionText: reflection, aiMemo: memo, quizAnswer })
    downloadMarkdown(`growth-log-${new Date().toISOString().slice(0, 10)}.md`, markdown)
  }

  const handleExportHistoryLog = (log: GrowthLog) => {
    const markdown = buildMarkdown({
      reflectionText: log.reflectionText,
      aiMemo: log.aiMemo,
      quizAnswer: log.quizAnswer,
      createdAt: log.createdAt?.toDate(),
    })
    downloadMarkdown(`growth-log-${log.id}.md`, markdown)
  }

  return (
    <>
    <BuildPlanFAB />
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <header>
          <h2 className="text-4xl font-bold text-primary">Growth Log</h2>
          <p className="text-lg text-on-surface-variant">Turn efforts into knowledge.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8 space-y-8">
            <section className="neumorphic-raised p-8 rounded-lg bg-surface">
              <h3 className="text-xl font-bold mb-4">今日、自分の言葉で説明できるようになったことは？</h3>
              <div className="neumorphic-sunken rounded-xl p-4 mb-6">
                <textarea
                  className="w-full bg-transparent border-none focus:ring-0 min-h-[150px] text-lg resize-none placeholder:opacity-30"
                  placeholder="Write your reflections here..."
                  value={reflection}
                  onChange={(e) => {
                    setReflection(e.target.value)
                    setSaved(false)
                  }}
                ></textarea>
              </div>
              <div className="flex items-center justify-end gap-4">
                {error && <p className="text-sm text-secondary">{error}</p>}
                <button
                  className="neumorphic-raised px-8 py-3 rounded-full font-bold text-primary flex items-center gap-2 hover:scale-105 transition-all disabled:opacity-50"
                  onClick={handleGenerate}
                  disabled={loading || !reflection.trim()}
                >
                  <span className="material-symbols-outlined">auto_fix_high</span>
                  {loading ? 'Generating…' : 'Generate AI Memo'}
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="neumorphic-sunken p-6 rounded-lg bg-surface/50 border-t-4 border-primary">
                <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">
                  AI Organized Memo
                </h4>
                {memo ? (
                  <>
                    <p className="text-on-surface leading-relaxed mb-4">{memo.summary}</p>
                    <ul className="text-sm text-on-surface-variant list-disc pl-5 space-y-2">
                      {memo.bulletPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    振り返りを書いて「Generate AI Memo」を押すと、ここに整理されたメモが表示されます。
                  </p>
                )}
              </div>
              <div className="neumorphic-raised p-6 rounded-lg bg-surface border-2 border-surface-container">
                <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">quiz</span> Quiz
                </h4>
                <p className="text-sm italic mb-4">{memo ? `Q. ${memo.quizQuestion}` : 'Q. ...'}</p>
                <input
                  className="w-full neumorphic-sunken border-none rounded-xl p-3 text-sm font-mono mb-4 bg-transparent disabled:opacity-50"
                  placeholder="Type here..."
                  value={quizAnswer}
                  onChange={(e) => setQuizAnswer(e.target.value)}
                  disabled={!memo}
                />
                <button
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50"
                  onClick={handleCheckAnswer}
                  disabled={!memo || checking || !quizAnswer.trim()}
                >
                  {checking ? 'Checking…' : 'Check'}
                </button>
                {quizResult && (
                  <p className={`text-sm mt-3 font-semibold ${quizResult.correct ? 'text-primary' : 'text-secondary'}`}>
                    {quizResult.correct ? '✓ ' : '✗ '}
                    {quizResult.feedback}
                  </p>
                )}
              </div>
            </section>

            {logs.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-xl font-bold text-primary border-b border-outline-variant/30 pb-2">
                  Previous Reflections
                </h3>
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="neumorphic-raised bg-surface rounded-lg p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs text-on-surface-variant font-bold">
                            {log.createdAt?.toDate().toLocaleString() ?? ''}
                          </p>
                          <p className="text-sm text-on-surface mt-1 line-clamp-2">{log.reflectionText}</p>
                          <p className="text-sm text-on-surface-variant mt-2">{log.aiMemo.summary}</p>
                        </div>
                        <button
                          onClick={() => handleExportHistoryLog(log)}
                          className="neumorphic-raised p-2 rounded-full flex-shrink-0"
                          title="Export Markdown"
                        >
                          <span className="material-symbols-outlined text-lg">download</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="lg:col-span-4 space-y-8">
            <section className="neumorphic-raised p-6 rounded-lg bg-secondary-container text-on-secondary">
              <h4 className="text-xs font-bold uppercase mb-4">Tomorrow's Challenge</h4>
              <p className="text-sm leading-relaxed opacity-90">
                {memo ? memo.tomorrowChallenge : '振り返りを記録すると、明日のチャレンジが提案されます。'}
              </p>
            </section>

            <div className="space-y-4">
              <button
                onClick={handleSaveLog}
                disabled={!memo || saving}
                className="w-full py-4 rounded-xl neumorphic-raised bg-secondary text-on-secondary font-bold flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">save</span>
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Log'}
              </button>
              <button
                onClick={handleExportMarkdown}
                disabled={!memo}
                className="w-full py-4 rounded-xl neumorphic-raised bg-surface text-on-surface-variant font-bold flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">description</span> Export Markdown
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
