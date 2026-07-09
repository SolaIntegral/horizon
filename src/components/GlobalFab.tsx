import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { subscribeIdeas } from '../lib/ideas'
import BuildPlanPanel from './buildplan/BuildPlanPanel'

export default function GlobalFab() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [showBuildPlan, setShowBuildPlan] = useState(false)
  const [hasUnorganized, setHasUnorganized] = useState(false)

  useEffect(() => {
    if (!user) return
    return subscribeIdeas(user.uid, (ideas) => {
      setHasUnorganized(ideas.some((i) => i.status === 'raw'))
    })
  }, [user])

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <div className="fixed bottom-24 right-5 md:bottom-10 md:right-10 z-50 flex flex-col items-end gap-3">
        {open && (
          <>
            <Link
              to="/inbox"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 bg-primary text-white rounded-full pl-4 pr-5 py-3 shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-xl">all_inbox</span>
              <span className="font-bold text-sm">Quick Dump</span>
            </Link>

            <button
              onClick={() => {
                setShowBuildPlan(true)
                setOpen(false)
              }}
              className="relative flex items-center gap-2 bg-orange-500 text-white rounded-full pl-4 pr-5 py-3 shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-xl">flag</span>
              <span className="font-bold text-sm">Build Plan</span>
              {hasUnorganized && <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-2 border-white"></span>}
            </button>
          </>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          className="relative w-14 h-14 md:w-16 md:h-16 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
        >
          <span className={`material-symbols-outlined text-3xl transition-transform ${open ? 'rotate-45' : ''}`}>add</span>
          {!open && hasUnorganized && <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-2 border-white"></span>}
        </button>
      </div>

      {showBuildPlan && <BuildPlanPanel onClose={() => setShowBuildPlan(false)} />}
    </>
  )
}
