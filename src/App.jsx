import './App.css'

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
        <h1>Welcome, Anderson.</h1>
        <p>Your AI business command center is alive and growing.</p>

        <div className="grid">
          <div className="card"><h2>💰 Revenue</h2><strong>$0</strong><p>Starting line</p></div>
          <div className="card"><h2>🤖 AI Employees</h2><strong>7</strong><p>Planned agents</p></div>
          <div className="card"><h2>🏜 Holy Water Ranch Co.</h2><strong>Active</strong><p>First business hub</p></div>
          <div className="card"><h2>📚 Time Traveler</h2><strong>Ready</strong><p>Stories, books, and brand</p></div>
          <div className="card"><h2>🚜 Farm</h2><strong>Online</strong><p>Farm operations module</p></div>
          <div className="card"><h2>💡 Ideas</h2><strong>Growing</strong><p>Opportunity center</p></div>
        </div>
      </main>
    </div>
  )
}

export default App