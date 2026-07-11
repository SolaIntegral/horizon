import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { path: '/', icon: 'today', label: 'Today' },
  { path: '/inbox', icon: 'all_inbox', label: 'Inbox' },
  { path: '/diagnose', icon: 'psychology', label: 'Diagnose' },
  { path: '/plan', icon: 'calendar_month', label: 'Plan' },
  { path: '/growth', icon: 'auto_stories', label: 'Growth' },
]

export default function MobileNav() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-2 md:hidden bg-surface rounded-t-xl shadow-lg border-t border-outline-variant/10">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
            location.pathname === item.path ? 'text-primary scale-110' : 'text-on-surface-variant'
          }`}
        >
          <span className={`material-symbols-outlined ${location.pathname === item.path ? 'fill-1' : ''}`}>
            {item.icon}
          </span>
          <span className="text-[10px] font-bold">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
