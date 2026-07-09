import { useEffect, useState } from 'react'

type OverlayState = 'working' | 'break' | 'paused'

const WORK_DURATION_SECONDS = 15 * 60

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0')
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0')
  return `${minutes}:${seconds}`
}

export default function OverlayScreen() {
  const [state, setState] = useState<OverlayState>('working')
  const [workRemaining, setWorkRemaining] = useState(WORK_DURATION_SECONDS)
  const [breakElapsed, setBreakElapsed] = useState(0)

  useEffect(() => {
    if (state === 'working') {
      setWorkRemaining(WORK_DURATION_SECONDS)
      const id = setInterval(() => {
        setWorkRemaining((prev) => (prev > 0 ? prev - 1 : 0))
      }, 1000)
      return () => clearInterval(id)
    }
    if (state === 'break') {
      setBreakElapsed(0)
      const id = setInterval(() => {
        setBreakElapsed((prev) => prev + 1)
      }, 1000)
      return () => clearInterval(id)
    }
  }, [state])

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-6 bg-background">
      <div className="fixed top-8 flex gap-2 p-2 bg-surface-container-highest rounded-full shadow-sm z-50">
        {(['working', 'break', 'paused'] as OverlayState[]).map((s) => (
          <button
            key={s}
            className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${
              state === s ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
            onClick={() => setState(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="w-full max-w-[360px] neumorphic-raised rounded-xl overflow-hidden bg-surface transition-all duration-300">
        {state === 'working' && (
          <div className="p-10 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Working</span>
              </div>
              <span className="material-symbols-outlined text-outline-variant">drag_handle</span>
            </div>
            <div className="text-center py-2">
              <h2 className="text-7xl font-bold tracking-tight text-primary">{formatClock(workRemaining)}</h2>
              <p className="font-bold text-xs text-on-surface-variant mt-2 uppercase tracking-widest">left</p>
            </div>
            <div className="neumorphic-sunken rounded-lg p-5 bg-surface">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-sm text-primary">bolt</span>
                <span className="text-[10px] font-bold uppercase text-outline">Next 15 min</span>
              </div>
              <p className="text-sm font-bold leading-relaxed text-on-surface">背景スライドの矛盾点を3つメモする</p>
            </div>
            <button className="btn-squish w-full bg-primary text-on-primary font-bold py-4 rounded-full shadow-lg shadow-primary/20">
              Done
            </button>
          </div>
        )}

        {state === 'break' && (
          <div className="p-10 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-secondary rounded-full"></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Break</span>
              </div>
              <span className="material-symbols-outlined text-outline-variant">drag_handle</span>
            </div>
            <div className="text-center py-2">
              <h2 className="text-7xl font-bold tracking-tight text-secondary">{formatClock(breakElapsed)}</h2>
              <p className="font-bold text-xs text-on-surface-variant mt-2 uppercase tracking-widest">elapsed</p>
            </div>
            <div className="neumorphic-sunken rounded-lg p-5 border-l-4 border-secondary/30 bg-surface">
              <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Returning Step</p>
              <p className="text-sm font-bold leading-relaxed text-on-surface">資料を閉じて次の見出しを見る</p>
            </div>
            <button className="btn-squish w-full bg-secondary text-on-secondary font-bold py-4 rounded-full shadow-lg shadow-secondary/20">
              Back to Work
            </button>
          </div>
        )}

        {state === 'paused' && (
          <div className="p-10 flex flex-col gap-8 text-center">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Paused</span>
              <span className="material-symbols-outlined text-outline-variant">drag_handle</span>
            </div>
            <div className="py-2">
              <p className="text-2xl font-bold text-primary">今日全部を取り戻さなくてOK。</p>
              <p className="text-sm text-on-surface-variant mt-2 font-bold">1つだけ残すならどれ？</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {['Main', 'Deadline', 'Easy'].map((l) => (
                <button key={l} className="p-4 neumorphic-raised rounded-xl text-xs font-bold hover:text-primary">
                  {l}
                </button>
              ))}
              <button className="p-4 neumorphic-raised bg-primary text-on-primary rounded-xl text-xs font-bold">
                Replan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
