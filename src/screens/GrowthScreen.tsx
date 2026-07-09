import { useState } from 'react'
import { checkQuizAnswer, generateGrowthMemo, type GrowthMemo, type QuizCheckResult } from '../lib/ai'

export default function GrowthScreen() {
  const [reflection, setReflection] = useState('')
  const [memo, setMemo] = useState<GrowthMemo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quizAnswer, setQuizAnswer] = useState('')
  const [quizResult, setQuizResult] = useState<QuizCheckResult | null>(null)
  const [checking, setChecking] = useState(false)

  const handleGenerate = async () => {
    if (!reflection.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await generateGrowthMemo(reflection)
      setMemo(result)
      setQuizAnswer('')
      setQuizResult(null)
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

  return (
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
                  onChange={(e) => setReflection(e.target.value)}
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
          </div>

          <div className="lg:col-span-4 space-y-8">
            <section className="neumorphic-raised p-6 rounded-lg bg-secondary-container text-on-secondary">
              <h4 className="text-xs font-bold uppercase mb-4">Tomorrow's Challenge</h4>
              <p className="text-sm leading-relaxed opacity-90">
                {memo ? memo.tomorrowChallenge : '振り返りを記録すると、明日のチャレンジが提案されます。'}
              </p>
            </section>

            <div className="space-y-4">
              <button className="w-full py-4 rounded-xl neumorphic-raised bg-secondary text-on-secondary font-bold flex items-center justify-center gap-3">
                <span className="material-symbols-outlined">save</span> Save Log
              </button>
              <button className="w-full py-4 rounded-xl neumorphic-raised bg-surface text-on-surface-variant font-bold flex items-center justify-center gap-3">
                <span className="material-symbols-outlined">description</span> Export Markdown
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
