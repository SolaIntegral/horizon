import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import GlobalFab from './GlobalFab'

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background selection:bg-primary selection:text-white overflow-hidden">
      <Sidebar />
      <main className="flex-grow flex flex-col h-screen overflow-hidden">
        <Outlet />
      </main>
      <MobileNav />
      <GlobalFab />
    </div>
  )
}
