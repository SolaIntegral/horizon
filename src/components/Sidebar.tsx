import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { path: '/', icon: 'today', label: 'Today' },
  { path: '/inbox', icon: 'all_inbox', label: 'Inbox' },
  { path: '/diagnose', icon: 'psychology', label: 'Diagnose' },
  { path: '/capacity', icon: 'battery_5_bar', label: 'Capacity' },
  { path: '/overlay', icon: 'timer', label: 'Overlay' },
  { path: '/growth', icon: 'auto_stories', label: 'Growth' },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 bg-surface-container-low shadow-sm py-8 px-6 sticky top-0 border-r border-outline-variant/10">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-primary tracking-tight">AI Coach</h1>
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
        <div className="flex items-center gap-3 p-2 bg-surface-container-high/50 rounded-full">
          <img
            className="w-10 h-10 rounded-full object-cover shadow-inner"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuACNHPsiLUUdJfeHNcBRWmhXsmACr3Ku-7sUGFD9B8VHmwTzxjDAGAqE7HHoYysJIsOudzYxAmgOezqEeU3nQmwbvsBMPXpVp2r-MtXpng4JjvhWWQ9WxNDJ-UJJpA4azhhZJaoZw5nY9IpxXIWupEfB05knWecl0Ni39NFjuONpMRr-TTJAe32zn69u4J91TXamUbzYkD_BkwRNkvlAFjxdBUzw6wUtINWNnR9VRf_0cjUXLwNP3FRvb-Dzox34XhiYNBeAwUWk4xU"
            alt="avatar"
          />
          <div className="flex flex-col">
            <span className="text-sm font-bold truncate w-24">Alex Rivera</span>
            <span className="text-[10px] uppercase tracking-widest opacity-50 font-bold">Pro Account</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
