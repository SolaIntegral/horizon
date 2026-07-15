import { useState } from 'react'
import { Link } from 'react-router-dom'
import BuildPlanPanel from './buildplan/BuildPlanPanel'
import TodayFixPanel from './TodayFixPanel'

export default function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const [buildPlanOpen, setBuildPlanOpen] = useState(false)
  const [todayFixOpen, setTodayFixOpen] = useState(false)

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-10 h-10 rounded-full neumorphic-raised bg-surface flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          aria-label="設定メニュー"
        >
          <span className="material-symbols-outlined">settings</span>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-48 neumorphic-raised bg-surface rounded-xl p-2">
            <Link
              to="/growth"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-lg">auto_stories</span>
              Growth
            </Link>
            <button
              onClick={() => {
                setBuildPlanOpen(true)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-lg">flag</span>
              Build Plan
            </button>
            <button
              onClick={() => {
                setTodayFixOpen(true)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-lg">build</span>
              今日のミッションを修正
            </button>
          </div>
        )}
      </div>

      {buildPlanOpen && <BuildPlanPanel initialTab="roadmap" onClose={() => setBuildPlanOpen(false)} />}
      {todayFixOpen && <TodayFixPanel onClose={() => setTodayFixOpen(false)} />}
    </>
  )
}
