import { useEffect, useState } from 'react'
import DashboardCard from '../components/DashboardCard'
import { dashboardCards } from '../data/dashboardData'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const starterTasks = [
  { id: 1, text: 'Build Genesis OS one feature at a time', done: false },
  { id: 2, text: 'Review Holy Water Ranch ideas', done: false },
  { id: 3, text: 'Plan the next Time Traveler story', done: false },
]
const TASKS_STORAGE_KEY = 'genesis-os-tasks'

function normalizeTask(task) {
  return {
    id: task.id,
    text: task.text,
    done: Boolean(task.done),
  }
}

function readStoredTasks() {
  if (typeof window === 'undefined') {
    return starterTasks
  }

  try {
    const savedTasks = window.localStorage.getItem(TASKS_STORAGE_KEY)
    if (!savedTasks) return starterTasks

    const parsedTasks = JSON.parse(savedTasks)
    return Array.isArray(parsedTasks) ? parsedTasks.map(normalizeTask) : starterTasks
  } catch {
    return starterTasks
  }
}

function writeStoredTasks(tasks) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks.map(normalizeTask)))
  } catch {
    // Ignore storage errors and rely on in-memory state.
  }
}

function Dashboard() {
  const [tasks, setTasks] = useState(readStoredTasks)
  const [newTask, setNewTask] = useState('')
  const [isUsingSupabase, setIsUsingSupabase] = useState(isSupabaseConfigured())

  useEffect(() => {
    let ignore = false

    async function loadTasks() {
      if (!isSupabaseConfigured() || !supabase) {
        const fallbackTasks = readStoredTasks()
        setTasks(fallbackTasks)
        writeStoredTasks(fallbackTasks)
        setIsUsingSupabase(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: true })

        if (ignore) return

        if (!error && data) {
          const nextTasks = data.map(normalizeTask)
          setTasks(nextTasks)
          writeStoredTasks(nextTasks)
          setIsUsingSupabase(true)
          return
        }

        throw error ?? new Error('Unable to load tasks from Supabase')
      } catch (error) {
        if (ignore) return

        console.warn('Falling back to local storage for Today\'s Mission tasks.', error)
        const fallbackTasks = readStoredTasks()
        setTasks(fallbackTasks)
        writeStoredTasks(fallbackTasks)
        setIsUsingSupabase(false)
      }
    }

    loadTasks()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    writeStoredTasks(tasks)
  }, [tasks])

  function replaceTasks(nextTasks) {
    setTasks(nextTasks)
    writeStoredTasks(nextTasks)
  }

  async function toggleTask(id) {
    const currentTask = tasks.find((task) => task.id === id)

    if (!currentTask) return

    const nextDone = !currentTask.done

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('tasks').update({ done: nextDone }).eq('id', id)

        if (!error) {
          replaceTasks(tasks.map((task) => (task.id === id ? { ...task, done: nextDone } : task)))
          return
        }

        throw error
      } catch (error) {
        console.warn('Supabase task update failed; using local storage instead.', error)
      }
    }

    replaceTasks(tasks.map((task) => (task.id === id ? { ...task, done: nextDone } : task)))
  }

  async function deleteTask(id) {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('tasks').delete().eq('id', id)

        if (!error) {
          replaceTasks(tasks.filter((task) => task.id !== id))
          return
        }

        throw error
      } catch (error) {
        console.warn('Supabase task deletion failed; using local storage instead.', error)
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
        const { data, error } = await supabase
          .from('tasks')
          .insert({ text: cleanTask, done: false })
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
        console.warn('Supabase task creation failed; using local storage instead.', error)
      }
    }

    const fallbackTask = {
      id: Date.now(),
      text: cleanTask,
      done: false,
    }

    replaceTasks([...tasks, fallbackTask])
    setNewTask('')
  }

  const completedCount = tasks.filter((task) => task.done).length

  return (
    <>
      <h1>Welcome, Anderson.</h1>
      <p>Your AI business command center is alive and growing.</p>

      <section className="mission">
        <div className="mission-header">
          <h2>Today&apos;s Mission</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`status-badge ${isUsingSupabase ? 'working' : 'offline'}`}>
              {isUsingSupabase ? 'Cloud Connected' : 'Local Fallback'}
            </span>
            <span className="task-counter">
              {completedCount}/{tasks.length} completed{isUsingSupabase ? ' • Supabase' : ' • Local'}
            </span>
          </div>
        </div>
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
      </section>

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
    </>
  )
}

export default Dashboard
