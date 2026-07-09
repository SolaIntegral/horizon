import { useState } from 'react'
import { diagnoseTask, type TaskDiagnosis } from '../lib/ai'

const riskColor: Record<TaskDiagnosis['riskLevel'], string> = {
  HIGH: 'text-secondary',
  MEDIUM: 'text-primary',
  LOW: 'text-outline',
}

export default function DiagnoseScreen() {
  const [rawInput, setRawInput] = useState('')
  const [diagnosis, setDiagnosis] = useState<TaskDiagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDiagnose = async () => {
    if (!rawInput.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await diagnoseTask(rawInput)
      setDiagnosis(result)
    } catch {
      setError('Diagnosis failed. Please try again.')
    } finally {
      setLoading(false)
    }
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
                <button className="btn-squish neumorphic-raised bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">calendar_today</span> Do this week
                </button>
                <button className="btn-squish neumorphic-raised bg-surface px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">bolt</span> Create Next 15
                </button>
                <button className="btn-squish neumorphic-raised bg-surface px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">update</span> Do later
                </button>
              </div>
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
