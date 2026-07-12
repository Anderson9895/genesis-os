import { useEffect, useState } from 'react'
import DashboardCard from '../components/DashboardCard'
import { dashboardCards } from '../data/dashboardData'
import { initialDashboardSummary } from '../lib/dashboardData'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function normalizeTask(task) {
  return {
    id: task.id,
    text: task.text,
    done: Boolean(task.done),
  }
}

function Dashboard() {
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [isUsingSupabase, setIsUsingSupabase] = useState(isSupabaseConfigured())
  const [summary, setSummary] = useState(initialDashboardSummary)
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadTasks() {
      if (!isSupabaseConfigured() || !supabase) {
        if (!ignore) {
          setTasks([])
          setIsUsingSupabase(false)
        }
        return
      }

      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user

        if (!user) {
          if (!ignore) {
            setTasks([])
            setIsUsingSupabase(false)
          }
          return
        }

        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })

        if (ignore) return

        if (!error && Array.isArray(data)) {
          setTasks(data.map(normalizeTask))
          setIsUsingSupabase(true)
          return
        }

        throw error ?? new Error('Unable to load tasks from Supabase')
      } catch (error) {
        if (ignore) return

        console.error('Unable to load tasks from Supabase.', error)
        setTasks([])
        setIsUsingSupabase(false)
      }
    }

    loadTasks()

    return () => {
      ignore = true
    }
  }, [])

  function replaceTasks(nextTasks) {
    setTasks(nextTasks)
  }

  async function toggleTask(id) {
    const currentTask = tasks.find((task) => task.id === id)

    if (!currentTask) return

    const nextDone = !currentTask.done

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user

        if (!user) return

        const { error } = await supabase
          .from('tasks')
          .update({ done: nextDone })
          .eq('id', id)
          .eq('user_id', user.id)

        if (!error) {
          replaceTasks(tasks.map((task) => (task.id === id ? { ...task, done: nextDone } : task)))
          return
        }

        throw error
      } catch (error) {
        console.error('Supabase task update failed.', error)
      }
    }

    replaceTasks(tasks.map((task) => (task.id === id ? { ...task, done: nextDone } : task)))
  }

  async function deleteTask(id) {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user

        if (!user) return

        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id)

        if (!error) {
          replaceTasks(tasks.filter((task) => task.id !== id))
          return
        }

        throw error
      } catch (error) {
        console.error('Supabase task deletion failed.', error)
      }
    }

    replaceTasks(tasks.filter((task) => task.id !== id))
  }

  async function addTask(event) {
    event.preventDefault()

    const cleanTask = newTask.trim()

    if (!cleanTask) return

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user

        if (!user) return

        const { data, error } = await supabase
          .from('tasks')
          .insert({ text: cleanTask, done: false, user_id: user.id })
          .select()

        if (!error && data && data[0]) {
          const insertedTask = {
            id: data[0].id,
            text: data[0].text,
            done: data[0].done,
          }

          replaceTasks([...tasks, insertedTask])
          setNewTask('')
          return
        }

        throw error ?? new Error('Unable to save task to Supabase')
      } catch (error) {
        console.error('Supabase task creation failed.', error)
      }
    }

    setNewTask('')
  }

  const completedCount = tasks.filter((task) => task.done).length
  const activeTasks = tasks.filter((task) => !task.done).length

  return (
    <>
      <div className="hero-panel">
        <div>
          <p className="eyebrow">CEO Command Center</p>
          <h1>Welcome, visionary leader.</h1>
          <p className="hero-copy">Your Genesis OS network is running smoothly with live AI operations, task follow-through, and cloud sync.</p>
        </div>
        <div className="hero-side">
          <div className="clock-card">
            <span className="clock-label">Local Time</span>
            <strong>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            <span>{clock.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        <article className="metric-card">
          <span>Live AI Employees</span>
          <strong>{summary.aiEmployeeCount}</strong>
          <small>Active agents online</small>
        </article>
        <article className="metric-card">
          <span>Active Tasks</span>
          <strong>{activeTasks}</strong>
          <small>Currently in motion</small>
        </article>
        <article className="metric-card">
          <span>Completed Today</span>
          <strong>{completedCount}</strong>
          <small>Mission wins</small>
        </article>
        <article className="metric-card">
          <span>Revenue Today</span>
          <strong>${summary.revenueToday}</strong>
          <small>Live revenue pulse</small>
        </article>
      </div>

      <section className="mission mission-grid">
        <div className="mission-column">
          <div className="mission-header">
            <h2>Current Mission</h2>
            <div className="mission-status-row">
              <span className={`status-badge ${isUsingSupabase ? 'working' : 'offline'}`}>
                {isUsingSupabase ? 'Cloud Sync' : 'Local Fallback'}
              </span>
              <span className="task-counter">
                {completedCount}/{tasks.length} completed{isUsingSupabase ? ' • Supabase' : ' • Local'}
              </span>
            </div>
          </div>
          <p className="mission-copy">{summary.currentMission}</p>

          <form onSubmit={addTask} className="task-form">
            <input
              type="text"
              placeholder="Add a new task"
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
            />
            <button type="submit">Add Task</button>
          </form>

          {tasks.map((task) => (
            <div className="task-item" key={task.id}>
              <label className="task">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleTask(task.id)}
                />
                <span className={task.done ? 'task-done' : ''}>
                  {task.text}
                </span>
              </label>
              <button
                type="button"
                className="delete-task-btn"
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete ${task.text}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="mission-column secondary-stack">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Notifications</h3>
              <span className="panel-pill">Live</span>
            </div>
            <ul className="panel-list">
              {summary.notifications.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>

          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Recent Activity</h3>
              <span className="panel-pill">Updated</span>
            </div>
            <ul className="panel-list">
              {summary.recentActivity.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <div className="dashboard-lower-grid">
        <section className="panel-card wide-card">
          <div className="panel-card-header">
            <h3>System Health</h3>
            <span className="panel-pill">{summary.systemHealth}</span>
          </div>
          <div className="status-grid">
            <div>
              <span className="status-label">Cloud Sync</span>
              <strong>{summary.cloudSync}</strong>
            </div>
            <div>
              <span className="status-label">Weather</span>
              <strong>{summary.weather}</strong>
            </div>
          </div>
        </section>

        <section className="panel-card wide-card">
          <div className="panel-card-header">
            <h3>Executive Snapshot</h3>
            <span className="panel-pill">Overview</span>
          </div>
          <div className="grid">
            {dashboardCards.map((card) => (
              <DashboardCard
                key={card.title}
                icon={card.icon}
                title={card.title}
                value={card.value}
                note={card.note}
              />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export default Dashboard
