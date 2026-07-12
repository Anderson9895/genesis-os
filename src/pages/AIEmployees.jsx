import { useEffect, useState } from 'react'

const employeeSeedData = [
  {
    id: 1,
    name: 'CEO AI',
    role: 'Vision & Operations',
    icon: '🧠',
    status: 'Idle',
    mission: 'Coordinates Genesis OS and recommends what to focus on next.',
    task: 'Build the daily command center.'
  },
  {
    id: 2,
    name: 'Ranch Manager',
    role: 'Operations Lead',
    icon: '🐄',
    status: 'Idle',
    mission: 'Coordinates daily ranch workflows and resource planning.',
    task: 'Review livestock and supply priorities.'
  },
  {
    id: 3,
    name: 'Farm Manager',
    role: 'Field Operations',
    icon: '🚜',
    status: 'Idle',
    mission: 'Tracks weather, equipment, crops, and field priorities.',
    task: 'Build the farm operations checklist.'
  },
  {
    id: 4,
    name: 'Finance Manager',
    role: 'Revenue & Planning',
    icon: '💰',
    status: 'Idle',
    mission: 'Tracks income, expenses, and financial goals.',
    task: 'Set up starter revenue tracking.'
  },
  {
    id: 5,
    name: 'Marketing Manager',
    role: 'Brand & Campaigns',
    icon: '📣',
    status: 'Idle',
    mission: 'Creates campaigns, product posts, and brand ideas.',
    task: 'Prepare Holy Water Ranch launch ideas.'
  },
  {
    id: 6,
    name: 'Story Writer',
    role: 'Content Creation',
    icon: '✍️',
    status: 'Idle',
    mission: 'Helps with stories, books, blogs, and Time Traveler content.',
    task: 'Create daily writing workflow.'
  },
  {
    id: 7,
    name: 'Research Assistant',
    role: 'Discovery & Insights',
    icon: '🔎',
    status: 'Idle',
    mission: 'Finds opportunities, suppliers, tools, and business ideas.',
    task: 'Research next profitable product idea.'
  }
]

const storageKey = 'genesis-os-employee-statuses'
const CEOPlanStorageKey = 'genesis-os-ceo-plan'

function AIEmployees() {
  const [employees, setEmployees] = useState(() => {
    if (typeof window === 'undefined') {
      return employeeSeedData
    }

    try {
      const savedEmployees = window.localStorage.getItem(storageKey)

      if (!savedEmployees) {
        return employeeSeedData
      }

      const parsedEmployees = JSON.parse(savedEmployees)

      if (Array.isArray(parsedEmployees) && parsedEmployees.length === employeeSeedData.length) {
        return parsedEmployees.map((employee, index) => ({
          ...employeeSeedData[index],
          ...employee,
        }))
      }
    } catch {
      // Fall back to the default employee list if localStorage is unavailable or malformed.
    }

    return employeeSeedData
  })
  const [ceoPlan, setCeoPlan] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    try {
      return window.localStorage.getItem(CEOPlanStorageKey) || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(employees))
  }, [employees])

  useEffect(() => {
    if (ceoPlan) {
      window.localStorage.setItem(CEOPlanStorageKey, ceoPlan)
    }
  }, [ceoPlan])

  function startWork(employeeName) {
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.name === employeeName ? { ...employee, status: 'Working' } : employee
      )
    )
  }

  function stopWork(employeeName) {
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.name === employeeName ? { ...employee, status: 'Idle' } : employee
      )
    )
  }

  function generateDailyPlan() {
    const plan = [
      '06:00 — Review ranch and Genesis OS priorities with the leadership team.',
      '08:00 — Confirm livestock, farm, and operations needs for the day.',
      '10:00 — Review revenue, expenses, and funding goals with Finance Manager.',
      '12:00 — Align growth messaging and launch updates with Marketing Manager.',
      '14:00 — Prioritize product and platform improvements for Genesis OS.',
      '16:00 — Check progress on current projects and resolve blockers.',
      '18:00 — Record wins, next steps, and tomorrow’s goals for the team.'
    ].join('\n')

    setCeoPlan(plan)
  }

  return (
    <>
      <h1>AI Employees</h1>
      <p>Manage your autonomous operators and keep their work flowing.</p>

      <div className="employee-grid">
        {employees.map((employee) => {
          if (employee.name === 'CEO AI') {
            return (
              <div className="card employee-card executive-card" key={employee.name}>
                <div className="employee-heading">
                  <h2>{employee.icon} {employee.name}</h2>
                  <span className={`status-badge ${employee.status.toLowerCase()}`}>
                    {employee.status}
                  </span>
                </div>
                <p className="employee-role">{employee.role}</p>
                <p><b>Current task:</b> {employee.task}</p>
                <p>{employee.mission}</p>

                <div className="executive-dashboard">
                  <h3>Executive Dashboard</h3>
                  <ul>
                    <li><b>Company Mission:</b> Build a resilient, profitable, and inspiring future for Holy Water Ranch Co. and Genesis OS.</li>
                    <li><b>Current Objectives:</b> Expand operations, grow the platform, and strengthen the brand.</li>
                    <li><b>Today&apos;s Priorities:</b> Review revenue, team progress, and product milestones.</li>
                    <li><b>Active Projects:</b> Ranch operations, Genesis OS platform, marketing launch, and community storytelling.</li>
                    <li><b>Business Health:</b> Strong momentum with steady focus on execution and sustainable growth.</li>
                    <li><b>Revenue Goal:</b> Reach the next milestone with disciplined, measurable progress.</li>
                    <li><b>Weekly Progress:</b> On track with the current operating cadence and project pace.</li>
                  </ul>

                  <button type="button" className="primary-action full-width" onClick={generateDailyPlan}>
                    Generate Daily Plan
                  </button>

                  {ceoPlan ? (
                    <div className="plan-box">
                      <h4>Daily Plan</h4>
                      <pre>{ceoPlan}</pre>
                    </div>
                  ) : null}
                </div>

                <div className="employee-actions">
                  <button type="button" className="primary-action" onClick={() => startWork(employee.name)}>
                    Start Work
                  </button>
                  <button type="button" className="secondary-action" onClick={() => stopWork(employee.name)}>
                    Stop Work
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div className="card employee-card" key={employee.name}>
              <div className="employee-heading">
                <h2>{employee.icon} {employee.name}</h2>
                <span className={`status-badge ${employee.status.toLowerCase()}`}>
                  {employee.status}
                </span>
              </div>
              <p className="employee-role">{employee.role}</p>
              <p><b>Current task:</b> {employee.task}</p>
              <p>{employee.mission}</p>

              <div className="employee-actions">
                <button type="button" className="primary-action" onClick={() => startWork(employee.name)}>
                  Start Work
                </button>
                <button type="button" className="secondary-action" onClick={() => stopWork(employee.name)}>
                  Stop Work
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default AIEmployees