import './App.css'
import Dashboard from './pages/Dashboard'

function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Genesis OS</h2>
        <p>Command Center</p>

        <nav>
          <button>🏠 Dashboard</button>
          <button>🤖 AI Employees</button>
          <button>🏜 Holy Water Ranch Co.</button>
          <button>📚 Time Traveler</button>
          <button>🚜 Farm</button>
          <button>💰 Finance</button>
          <button>💡 Ideas</button>
        </nav>
      </aside>

      <main className="main">
        <Dashboard />
      </main>
    </div>
  )
}

export default App