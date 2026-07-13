import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { subscribeIdeas } from '../lib/ideas'
import { subscribeActiveWorkSession, type WorkSession } from '../lib/workSessions'
import { subscribeDailyPlan, type DailyPlan } from '../lib/dailyPlans'
import { getBreakOverrunLevel } from '../lib/dayPhase'
import { formatDateKey } from '../lib/dateUtils'
import BuildPlanPanel from './buildplan/BuildPlanPanel'

const EVENING_HOUR = 23

export default function GlobalFab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [ideaPanelOpen, setIdeaPanelOpen] = useState(false)
  const [hasUnorganized, setHasUnorganized] = useState(false)
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null)

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeIdeas(user.uid, (ideas) => {
      setHasUnorganized(ideas.some((i) => i.status === 'raw'))
    })
    const unsub2 = subscribeActiveWorkSession(user.uid, setActiveSession)
    const unsub3 = subscribeDailyPlan(user.uid, formatDateKey(new Date()), setDailyPlan)
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [user])

  // Lightweight "something needs a look" signal — approximated without a full
  // DayPhase computation (that needs the day's Action map, which GlobalFab
  // doesn't otherwise subscribe to). Mission-start-delay support is Phase3
  // work and deliberately not covered here yet.
  const breakOverrunHeavy = getBreakOverrunLevel(activeSession, new Date()) === 'heavy'
  const eveningDue = new Date().getHours() >= EVENING_HOUR && !!dailyPlan
  const needsAttention = hasUnorganized || breakOverrunHeavy || eveningDue

  const menuItems = [
    { icon: 'add_task', label: 'タスク追加', onClick: () => navigate('/inbox') },
    { icon: 'lightbulb', label: 'アイデア記録', onClick: () => setIdeaPanelOpen(true) },
    { icon: 'history', label: '今日の記録を見る', onClick: () => navigate('/?log=1') },
    { icon: 'calendar_month', label: '今日の計画を見直す', onClick: () => navigate('/plan?replan=1') },
  ]

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <div className="fixed bottom-24 right-5 md:bottom-10 md:right-10 z-50 flex flex-col items-end gap-3">
        {open &&
          menuItems.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick()
                setOpen(false)
              }}
              className="flex items-center gap-2 bg-primary text-white rounded-full pl-4 pr-5 py-3 shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              <span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}

        <button
          onClick={() => setOpen((v) => !v)}
          className="relative w-14 h-14 md:w-16 md:h-16 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
          aria-label="Horiメニュー"
        >
          <span className={`material-symbols-outlined text-3xl transition-transform ${open ? 'rotate-45' : ''}`}>add</span>
          {!open && needsAttention && <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-2 border-white animate-pulse"></span>}
        </button>
      </div>

      {ideaPanelOpen && <BuildPlanPanel initialTab="ideas" onClose={() => setIdeaPanelOpen(false)} />}
    </>
  )
}
