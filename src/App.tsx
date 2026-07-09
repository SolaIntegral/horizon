import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import TodayDashboard from './screens/TodayDashboard'
import InboxScreen from './screens/InboxScreen'
import DiagnoseScreen from './screens/DiagnoseScreen'
import CapacityScreen from './screens/CapacityScreen'
import OverlayScreen from './screens/OverlayScreen'
import GrowthScreen from './screens/GrowthScreen'

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-background selection:bg-primary selection:text-white overflow-hidden">
        <Sidebar />
        <main className="flex-grow flex flex-col h-screen overflow-hidden">
          <Routes>
            <Route path="/" element={<TodayDashboard />} />
            <Route path="/inbox" element={<InboxScreen />} />
            <Route path="/diagnose" element={<DiagnoseScreen />} />
            <Route path="/capacity" element={<CapacityScreen />} />
            <Route path="/overlay" element={<OverlayScreen />} />
            <Route path="/growth" element={<GrowthScreen />} />
          </Routes>
        </main>
        <MobileNav />

        <Link
          to="/inbox"
          className="hidden md:flex fixed bottom-10 right-10 w-16 h-16 rounded-full bg-primary text-white shadow-xl items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
        >
          <span className="material-symbols-outlined text-3xl group-hover:rotate-90 transition-transform">
            add
          </span>
        </Link>
      </div>
    </BrowserRouter>
  )
}

export default App
