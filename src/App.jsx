import './App.css'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import TopBar from './components/TopBar'
import Dashboard from './pages/Dashboard'
import AIEmployees from './pages/AIEmployees'
import HolyWater from './pages/HolyWater'
import HolyWaterEquipment from './pages/HolyWaterEquipment'
import LoginPage from './pages/Login'
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
          <Link to="/">🏠 Dashboard</Link>
          <Link to="/ai-employees">🤖 AI Employees</Link>
          <Link to="/holy-water">🏜 Holy Water Ranch Co.</Link>
          <Link to="/time-traveler">📚 Time Traveler</Link>
          <Link to="/farm">🚜 Farm</Link>
          <Link to="/finance">💰 Finance</Link>
          <Link to="/ideas">💡 Ideas</Link>
        </nav>
      </aside>

      <div className="main-shell">
        <TopBar user={user} onLogout={handleLogout} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ai-employees" element={<AIEmployees />} />
            <Route path="/holy-water" element={<HolyWater />} />
            <Route path="/holy-water/equipment" element={<HolyWaterEquipment />} />
            <Route path="/time-traveler" element={<Placeholder title="Time Traveler" />} />
            <Route path="/farm" element={<Placeholder title="Farm Operations" />} />
            <Route path="/finance" element={<Placeholder title="Finance" />} />
            <Route path="/ideas" element={<Placeholder title="Ideas" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
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
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="*" element={user ? <AuthenticatedApp user={user} /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App