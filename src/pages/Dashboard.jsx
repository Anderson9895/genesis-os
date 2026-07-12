import { useEffect, useState } from 'react'
import DashboardCard from '../components/DashboardCard'
import { dashboardCards } from '../data/dashboardData'

const starterTasks = [
  { id: 1, text: 'Build Genesis OS one feature at a time', done: false },
  { id: 2, text: 'Review Holy Water Ranch ideas', done: false },
  { id: 3, text: 'Plan the next Time Traveler story', done: false },
]

function Dashboard() {
  const [tasks, setTasks] = useState(() => {
    if (typeof window === 'undefined') {
      return starterTasks
    }

    try {
      const savedTasks = window.localStorage.getItem('genesis-os-tasks')
      if (!savedTasks) return starterTasks

      const parsedTasks = JSON.parse(savedTasks)
      return Array.isArray(parsedTasks) ? parsedTasks : starterTasks
    } catch {
      return starterTasks
    }
  })
  const [newTask, setNewTask] = useState('')

  useEffect(() => {
    window.localStorage.setItem('genesis-os-tasks', JSON.stringify(tasks))
  }, [tasks])

  function toggleTask(id) {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    )
  }

  function deleteTask(id) {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== id))
  }

  function addTask(event) {
    event.preventDefault()

    const cleanTask = newTask.trim()

    if (!cleanTask) return

    setTasks((currentTasks) => [
      ...currentTasks,
      {
        id: Date.now(),
        text: cleanTask,
        done: false,
      },
    ])

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
          <span className="task-counter">{completedCount}/{tasks.length} completed</span>
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
