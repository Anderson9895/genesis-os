import './App.css'
import TopBar from './components/TopBar'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import AIEmployees from './pages/AIEmployees'
function Placeholder({ title }) {
  return (
    <>
      <h1>{title}</h1>
      <p>This Genesis OS module is ready to build.</p>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
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
<TopBar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ai-employees" element={<AIEmployees />} />
            <Route path="/holy-water" element={<Placeholder title="Holy Water Ranch Co." />} />
            <Route path="/time-traveler" element={<Placeholder title="Time Traveler" />} />
            <Route path="/farm" element={<Placeholder title="Farm Operations" />} />
            <Route path="/finance" element={<Placeholder title="Finance" />} />
            <Route path="/ideas" element={<Placeholder title="Ideas" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App