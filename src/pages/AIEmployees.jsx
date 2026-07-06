const employees = [
  {
    name: "CEO AI",
    icon: "🧠",
    status: "Online",
    mission: "Coordinates Genesis OS and recommends what to focus on next.",
    task: "Build the daily command center."
  },
  {
    name: "Marketing AI",
    icon: "📣",
    status: "Planned",
    mission: "Creates campaigns, product posts, and brand ideas.",
    task: "Prepare Holy Water Ranch launch ideas."
  },
  {
    name: "Finance AI",
    icon: "💰",
    status: "Planned",
    mission: "Tracks income, expenses, and financial goals.",
    task: "Set up starter revenue tracking."
  },
  {
    name: "Farm AI",
    icon: "🚜",
    status: "Planned",
    mission: "Tracks weather, equipment, crops, and farm priorities.",
    task: "Build farm operations checklist."
  },
  {
    name: "Writer AI",
    icon: "✍️",
    status: "Planned",
    mission: "Helps with stories, books, blogs, and Time Traveler content.",
    task: "Create daily writing workflow."
  },
  {
    name: "Research AI",
    icon: "🔎",
    status: "Planned",
    mission: "Finds opportunities, suppliers, tools, and business ideas.",
    task: "Research next profitable product idea."
  }
]

function AIEmployees() {
  return (
    <>
      <h1>AI Employees</h1>
      <p>Your digital team is being assembled.</p>

      <div className="card">
        <h2>🧠 CEO AI Workspace</h2>
        <strong>Online</strong>
        <p><b>Good morning, Anderson.</b></p>
        <p>Today’s recommendation: focus on building Genesis OS one working feature at a time.</p>

        <h3>Today’s Priorities</h3>
        <ul>
          <li>Build the CEO AI Workspace</li>
          <li>Create the first task system</li>
          <li>Keep Genesis OS clean and simple</li>
        </ul>
      </div>

      <div className="grid">
        {employees.map((employee) => (
          <div className="card" key={employee.name}>
            <h2>{employee.icon} {employee.name}</h2>
            <strong>{employee.status}</strong>
            <p>{employee.mission}</p>
            <p><b>Current task:</b> {employee.task}</p>
          </div>
        ))}
      </div>
    </>
  )
}

export default AIEmployees