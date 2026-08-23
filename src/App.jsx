import './App.css'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import TopBar from './components/TopBar'
import Dashboard from './pages/Dashboard'
import AIEmployees from './pages/AIEmployees'
import HolyWater from './pages/HolyWater'
import HolyWaterEquipment from './pages/HolyWaterEquipment'
import FieldsPastures from './pages/FieldsPastures'
import Finance from './pages/Finance'
import IntelligenceCenter from './pages/IntelligenceCenter'
import GenesisCompanion from './pages/GenesisCompanion'
import DailyBriefing from './pages/DailyBriefing'
import AdminAISettings from './pages/AdminAISettings'
import TeamLead from './pages/TeamLead'
import Deliverables from './pages/Deliverables'
import LoginPage from './pages/Login'
import LandingPage from './pages/LandingPage'
import { supabase } from './lib/supabaseClient'

function Placeholder({ title }) {
  return (
    <>
      <h1>{title}</h1>
      <p>This Genesis OS module is ready to build.</p>
    </>
  )
}

function AuthenticatedApp({ user }) {
  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Genesis OS</h2>
        <p>Command Center</p>

        <nav>
          <Link to="/app">🏠 Dashboard</Link>
          <Link to="/app/intelligence-center">🧭 Intelligence Center</Link>
          <Link to="/app/genesis-companion">🗣 Genesis Companion</Link>
          <Link to="/app/daily-briefing">🌅 Daily Briefing</Link>
          <Link to="/app/admin-ai-settings">🛡 Admin AI Settings</Link>
          <Link to="/app/ai-employees">🤖 AI Employees</Link>
          <Link to="/app/team-lead">🧑‍💼 Team Lead</Link>
          <Link to="/app/deliverables">📦 Deliverables</Link>
          <Link to="/app/holy-water">🏜 Holy Water Ranch Co.</Link>
          <Link to="/app/fields-pastures">🌾 Fields & Pastures</Link>
          <Link to="/app/time-traveler">📚 Time Traveler</Link>
          <Link to="/app/farm">🚜 Farm</Link>
          <Link to="/app/finance">💰 Finance</Link>
          <Link to="/app/ideas">💡 Ideas</Link>
        </nav>
      </aside>

      <div className="main-shell">
        <TopBar user={user} onLogout={handleLogout} />
        <main className="main">
          <Routes>
            <Route path="/app" element={<Dashboard />} />
            <Route path="/app/intelligence-center" element={<IntelligenceCenter />} />
            <Route path="/app/genesis-companion" element={<GenesisCompanion />} />
            <Route path="/app/daily-briefing" element={<DailyBriefing />} />
            <Route path="/app/admin-ai-settings" element={<AdminAISettings />} />
            <Route path="/app/ai-employees" element={<AIEmployees />} />
            <Route path="/app/team-lead" element={<TeamLead />} />
            <Route path="/app/deliverables" element={<Deliverables />} />
            <Route path="/app/holy-water" element={<HolyWater />} />
            <Route path="/app/holy-water/equipment" element={<HolyWaterEquipment />} />
            <Route path="/app/fields-pastures" element={<FieldsPastures />} />
            <Route path="/app/time-traveler" element={<Placeholder title="Time Traveler" />} />
            <Route path="/app/farm" element={<FieldsPastures />} />
            <Route path="/app/finance" element={<Finance />} />
            <Route path="/app/ideas" element={<Placeholder title="Ideas" />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let active = true

    async function initializeAuth() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      setAuthReady(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (!authReady) {
    return <div className="auth-loading">Loading Genesis OS…</div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
        <Route path="/build-my-team" element={<Navigate to="/login?mode=signup" replace />} />
        <Route path="*" element={user ? <AuthenticatedApp user={user} /> : <Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App