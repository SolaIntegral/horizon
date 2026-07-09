import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'

const navItems = [
  { path: '/', icon: 'today', label: 'Today' },
  { path: '/inbox', icon: 'all_inbox', label: 'Inbox' },
  { path: '/diagnose', icon: 'psychology', label: 'Diagnose' },
  { path: '/capacity', icon: 'battery_5_bar', label: 'Capacity' },
  { path: '/overlay', icon: 'timer', label: 'Overlay' },
  { path: '/growth', icon: 'auto_stories', label: 'Growth' },
]

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const displayName = user?.displayName || user?.email || 'User'

  const handleLogout = async () => {
    setMenuOpen(false)
    await signOut(auth)
    navigate('/login')
  }

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 bg-surface-container-low shadow-sm py-8 px-6 sticky top-0 border-r border-outline-variant/10">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-primary tracking-tight">Horizon</h1>
        <p className="text-sm text-on-surface-variant mt-1 opacity-70">Ready for focus?</p>
      </div>
      <nav className="flex-grow space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-4 p-3 font-semibold rounded-full transition-all group ${
              location.pathname === item.path
                ? 'text-primary bg-primary-fixed/20 border-r-4 border-primary rounded-r-none'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span
              className={`material-symbols-outlined ${
                location.pathname === item.path ? 'fill-1' : 'group-hover:scale-110 transition-transform'
              }`}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto space-y-6">
        <Link
          to="/inbox"
          className="w-full btn-squish neumorphic-raised bg-surface-container-low text-primary font-bold gap-2 p-3 flex items-center justify-center rounded-full"
        >
          <span className="material-symbols-outlined">add</span>
          <span>Quick Dump</span>
        </Link>

        <div className="relative">
          {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />}

          {menuOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-full neumorphic-raised bg-surface rounded-xl p-2 z-20">
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-secondary hover:bg-surface-container-high transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                Log out
              </button>
            </div>
          )}

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="relative z-20 w-full flex items-center gap-3 p-2 bg-surface-container-high/50 rounded-full hover:bg-surface-container-high transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {getInitials(displayName)}
            </div>
            <div className="flex flex-col items-start overflow-hidden">
              <span className="text-sm font-bold truncate w-28">{displayName}</span>
              <span className="text-[10px] uppercase tracking-widest opacity-50 font-bold">Account</span>
            </div>
          </button>
        </div>
      </div>
    </aside>
  )
}
