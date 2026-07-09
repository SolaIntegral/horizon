import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { subscribeIdeas } from '../../lib/ideas'
import BuildPlanPanel from './BuildPlanPanel'

export default function BuildPlanFAB() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [hasUnorganized, setHasUnorganized] = useState(false)

  useEffect(() => {
    if (!user) return
    return subscribeIdeas(user.uid, (ideas) => {
      setHasUnorganized(ideas.some((i) => i.status === 'raw'))
    })
  }, [user])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="実装アイデアを見る・思いつきを追加"
        className="hidden md:flex fixed bottom-32 right-10 items-center gap-2 bg-orange-500 text-white rounded-full pl-4 pr-5 py-3 shadow-xl hover:scale-105 active:scale-95 transition-all z-40"
      >
        <span className="material-symbols-outlined text-xl">flag</span>
        <span className="font-bold text-sm">Build Plan</span>
        {hasUnorganized && <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-2 border-white"></span>}
      </button>

      <button
        onClick={() => setOpen(true)}
        title="Build Plan"
        className="md:hidden fixed bottom-24 right-5 flex items-center justify-center w-12 h-12 bg-orange-500 text-white rounded-full shadow-xl active:scale-95 transition-all z-40"
      >
        <span className="material-symbols-outlined">flag</span>
        {hasUnorganized && <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-2 border-white"></span>}
      </button>

      {open && <BuildPlanPanel onClose={() => setOpen(false)} />}
    </>
  )
}
