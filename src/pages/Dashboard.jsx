import { useState } from 'react'
import DashboardCard from '../components/DashboardCard'
import { dashboardCards } from '../data/dashboardData'
const [newTask, setNewTask] = useState('')
function Dashboard() {
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Build Genesis OS one feature at a time', done: false },
    { id: 2, text: 'Review Holy Water Ranch ideas', done: false },
    { id: 3, text: 'Plan the next Time Traveler story', done: false },
  ])

  function toggleTask(id) {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    )
  }
function addTask(event) {
  event.preventDefault()

  const cleanTask = newTask.trim()

  if (!cleanTask) return

  setTasks([
    ...tasks,
    {
      id: Date.now(),
      text: cleanTask,
      done: false,
    },
  ])

  setNewTask('')
}setNewTask
  return (
    <>
      <h1>Welcome, Anderson.</h1>
      <p>Your AI business command center is alive and growing.</p>

      <section className="mission">
        <h2>Today&apos;s Mission</h2>
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
          <label className="task" key={task.id}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
            />
            <span className={task.done ? 'task-done' : ''}>
              {task.text}
            </span>
          </label>
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
