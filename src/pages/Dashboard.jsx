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
    created_at: task.created_at || null,
    due_date: task.due_date || null,
  }
}

function isSameDay(firstDate, secondDate) {
  return firstDate.getFullYear() === secondDate.getFullYear()
    && firstDate.getMonth() === secondDate.getMonth()
    && firstDate.getDate() === secondDate.getDate()
}

function parseSafeDate(value) {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isEquipmentServiceDue(record, now) {
  const status = String(record.status || '').toLowerCase()

  if (status === 'maintenance due' || status === 'out of service' || status === 'in repair') {
    return true
  }

  const nextServiceDate = parseSafeDate(record.next_service_date)

  if (!nextServiceDate) return false

  return nextServiceDate <= now
}

function Dashboard() {
  const [tasks, setTasks] = useState([])
  const [livestockRecords, setLivestockRecords] = useState([])
  const [equipmentRecords, setEquipmentRecords] = useState([])
  const [newTask, setNewTask] = useState('')
  const [isUsingSupabase, setIsUsingSupabase] = useState(isSupabaseConfigured())
  const [summary, setSummary] = useState(initialDashboardSummary)
  const [clock, setClock] = useState(new Date())
  const [ranchBriefing, setRanchBriefing] = useState('Gathering ranch intelligence...')
  const [ranchNotes, setRanchNotes] = useState([])
  const [askPrompt, setAskPrompt] = useState('')

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
            setLivestockRecords([])
            setEquipmentRecords([])
            setIsUsingSupabase(false)
          }
          return
        }

        const [tasksResult, livestockResult, equipmentResult] = await Promise.all([
          supabase
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('livestock_records')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('equipment_records')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ])

        if (ignore) return

        if (!tasksResult.error && !livestockResult.error && !equipmentResult.error) {
          setTasks(Array.isArray(tasksResult.data) ? tasksResult.data.map(normalizeTask) : [])
          setLivestockRecords(Array.isArray(livestockResult.data) ? livestockResult.data : [])
          setEquipmentRecords(Array.isArray(equipmentResult.data) ? equipmentResult.data : [])
          setIsUsingSupabase(true)
          return
        }

        throw tasksResult.error || livestockResult.error || equipmentResult.error || new Error('Unable to load ranch data from Supabase')
      } catch (error) {
        if (ignore) return

        console.error('Unable to load tasks from Supabase.', error)
        setTasks([])
        setLivestockRecords([])
        setEquipmentRecords([])
        setIsUsingSupabase(false)
      }
    }

    loadTasks()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const now = new Date()
    const serviceDueCount = equipmentRecords.filter((record) => isEquipmentServiceDue(record, now)).length
    const animalsNeedingAttention = livestockRecords.filter((record) => {
      const status = String(record.status || '').toLowerCase()
      return status === 'medical' || status === 'quarantine'
    }).length
    const tasksDueTodayCount = tasks.filter((task) => {
      if (task.done) return false

      const dueDate = parseSafeDate(task.due_date)
      if (dueDate) {
        return isSameDay(dueDate, now)
      }

      const createdDate = parseSafeDate(task.created_at)
      return createdDate ? isSameDay(createdDate, now) : false
    }).length

    const upcomingMaintenance = equipmentRecords
      .map((record) => ({
        name: record.name || 'Unnamed equipment',
        next_service_date: record.next_service_date,
      }))
      .filter((record) => parseSafeDate(record.next_service_date))
      .sort((left, right) => new Date(left.next_service_date).getTime() - new Date(right.next_service_date).getTime())
      .slice(0, 3)

    const notes = []

    if (upcomingMaintenance.length > 0) {
      notes.push(`Upcoming maintenance: ${upcomingMaintenance.map((item) => item.name).join(', ')}`)
    }

    const flaggedAnimal = livestockRecords.find((record) => {
      const status = String(record.status || '').toLowerCase()
      return status === 'medical' || status === 'quarantine'
    })

    if (flaggedAnimal) {
      notes.push(`Animal attention: ${flaggedAnimal.name || flaggedAnimal.tag_number || 'Unlabeled record'} is marked ${flaggedAnimal.status}.`)
    }

    if (tasksDueTodayCount > 0) {
      notes.push(`You have ${tasksDueTodayCount} open task${tasksDueTodayCount === 1 ? '' : 's'} due today.`)
    }

    if (notes.length === 0) {
      notes.push('All ranch systems are stable. Keep logging inspections and service updates.')
    }

    setRanchNotes(notes)
    setRanchBriefing(
      `Daily briefing: ${animalsNeedingAttention} animal${animalsNeedingAttention === 1 ? '' : 's'} need attention, ${serviceDueCount} equipment item${serviceDueCount === 1 ? '' : 's'} need service, and ${tasksDueTodayCount} task${tasksDueTodayCount === 1 ? '' : 's'} are due today.`
    )
  }, [equipmentRecords, livestockRecords, tasks])

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
  const now = new Date()
  const animalsNeedingAttention = livestockRecords.filter((record) => {
    const status = String(record.status || '').toLowerCase()
    return status === 'medical' || status === 'quarantine'
  }).length
  const equipmentNeedingService = equipmentRecords.filter((record) => isEquipmentServiceDue(record, now)).length
  const tasksDueToday = tasks.filter((task) => {
    if (task.done) return false

    const dueDate = parseSafeDate(task.due_date)
    if (dueDate) return isSameDay(dueDate, now)

    const createdDate = parseSafeDate(task.created_at)
    return createdDate ? isSameDay(createdDate, now) : false
  }).length

  const upcomingMaintenance = equipmentRecords
    .filter((record) => parseSafeDate(record.next_service_date))
    .sort((left, right) => new Date(left.next_service_date).getTime() - new Date(right.next_service_date).getTime())
    .slice(0, 4)

  function handleAskRanchAi(event) {
    event.preventDefault()
    setAskPrompt('')
  }

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

      <section className="panel-card ranch-ai-manager">
        <div className="panel-card-header">
          <h3>AI Ranch Manager</h3>
          <span className="panel-pill">Daily Briefing</span>
        </div>
        <p className="ranch-ai-briefing">{ranchBriefing}</p>

        <div className="ranch-ai-cards">
          <article className="ranch-ai-card">
            <span>Animals needing attention</span>
            <strong>{animalsNeedingAttention}</strong>
          </article>
          <article className="ranch-ai-card">
            <span>Equipment needing service</span>
            <strong>{equipmentNeedingService}</strong>
          </article>
          <article className="ranch-ai-card">
            <span>Tasks due today</span>
            <strong>{tasksDueToday}</strong>
          </article>
          <article className="ranch-ai-card">
            <span>Weather</span>
            <strong>Weather API Placeholder</strong>
          </article>
          <article className="ranch-ai-card ranch-ai-card-notes">
            <span>Notes</span>
            <ul>
              {ranchNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </article>
        </div>

        <div className="ranch-ai-layout">
          <section className="ranch-ai-subpanel">
            <div className="panel-card-header">
              <h4>Upcoming Maintenance</h4>
              <span className="panel-pill">Schedule</span>
            </div>
            {upcomingMaintenance.length === 0 ? (
              <p className="muted-text">No upcoming maintenance dates found.</p>
            ) : (
              <ul className="panel-list">
                {upcomingMaintenance.map((record) => (
                  <li key={`${record.id}-${record.next_service_date}`}>
                    {record.name || 'Unnamed equipment'} - {new Date(record.next_service_date).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ranch-ai-subpanel">
            <div className="panel-card-header">
              <h4>Ask Ranch AI</h4>
              <span className="panel-pill">Future AI</span>
            </div>
            <form className="ranch-ai-ask-form" onSubmit={handleAskRanchAi}>
              <input
                type="text"
                placeholder="Ask about herd risk, maintenance priorities, or today's plan"
                value={askPrompt}
                onChange={(event) => setAskPrompt(event.target.value)}
              />
              <button type="submit" className="primary-action">Queue Prompt</button>
            </form>
            <div className="ranch-ai-response">
              <p>AI response panel is ready. Future responses will appear here after AI integration is enabled.</p>
            </div>
          </section>
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
