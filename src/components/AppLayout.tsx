import { Link, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background selection:bg-primary selection:text-white overflow-hidden">
      <Sidebar />
      <main className="flex-grow flex flex-col h-screen overflow-hidden">
        <Outlet />
      </main>
      <MobileNav />

      <Link
        to="/inbox"
        className="hidden md:flex fixed bottom-10 right-10 w-16 h-16 rounded-full bg-primary text-white shadow-xl items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
      >
        <span className="material-symbols-outlined text-3xl group-hover:rotate-90 transition-transform">add</span>
      </Link>
    </div>
  )
}
