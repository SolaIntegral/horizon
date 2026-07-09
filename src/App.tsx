import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { ProtectedRoute, GuestRoute } from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import LoginScreen from './screens/LoginScreen'
import SignupScreen from './screens/SignupScreen'
import TodayDashboard from './screens/TodayDashboard'
import InboxScreen from './screens/InboxScreen'
import DiagnoseScreen from './screens/DiagnoseScreen'
import CapacityScreen from './screens/CapacityScreen'
import OverlayScreen from './screens/OverlayScreen'
import GrowthScreen from './screens/GrowthScreen'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/signup" element={<SignupScreen />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<TodayDashboard />} />
              <Route path="/inbox" element={<InboxScreen />} />
              <Route path="/diagnose/:taskId?" element={<DiagnoseScreen />} />
              <Route path="/capacity" element={<CapacityScreen />} />
              <Route path="/overlay" element={<OverlayScreen />} />
              <Route path="/overlay/:taskId/:actionId" element={<OverlayScreen />} />
              <Route path="/growth" element={<GrowthScreen />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
