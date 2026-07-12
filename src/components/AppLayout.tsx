import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import GlobalFab from './GlobalFab'
import SettingsMenu from './SettingsMenu'

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background selection:bg-primary selection:text-white overflow-hidden">
      <Sidebar />
      <main className="flex-grow flex flex-col h-screen overflow-hidden">
        <Outlet />
      </main>
      <SettingsMenu />
      <GlobalFab />
    </div>
  )
}
