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
const researchBriefsStorageKey = 'genesis-os-research-briefs'
const financeTransactionsStorageKey = 'genesis-os-finance-transactions'
const financeReportStorageKey = 'genesis-os-finance-report'

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
  const [researchTopic, setResearchTopic] = useState('')
  const [briefs, setBriefs] = useState(() => {
    if (typeof window === 'undefined') {
      return []
    }

    try {
      const savedBriefs = window.localStorage.getItem(researchBriefsStorageKey)
      return savedBriefs ? JSON.parse(savedBriefs) : []
    } catch {
      return []
    }
  })
  const [selectedBriefId, setSelectedBriefId] = useState(null)
  const [financeForm, setFinanceForm] = useState({
    description: '',
    amount: '',
    category: 'Operations',
    date: new Date().toISOString().slice(0, 10),
    type: 'expense'
  })
  const [transactions, setTransactions] = useState(() => {
    if (typeof window === 'undefined') {
      return []
    }

    try {
      const savedTransactions = window.localStorage.getItem(financeTransactionsStorageKey)
      return savedTransactions ? JSON.parse(savedTransactions) : []
    } catch {
      return []
    }
  })
  const [financeFilter, setFinanceFilter] = useState('All')
  const [financeReport, setFinanceReport] = useState(() => {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      const savedReport = window.localStorage.getItem(financeReportStorageKey)
      return savedReport ? JSON.parse(savedReport) : null
    } catch {
      return null
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

  useEffect(() => {
    window.localStorage.setItem(researchBriefsStorageKey, JSON.stringify(briefs))
  }, [briefs])

  useEffect(() => {
    window.localStorage.setItem(financeTransactionsStorageKey, JSON.stringify(transactions))
  }, [transactions])

  useEffect(() => {
    if (financeReport) {
      window.localStorage.setItem(financeReportStorageKey, JSON.stringify(financeReport))
    }
  }, [financeReport])

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

  function createResearchBrief(event) {
    event.preventDefault()

    const cleanTopic = researchTopic.trim()

    if (!cleanTopic) {
      return
    }

    const newBrief = {
      id: Date.now(),
      title: cleanTopic,
      createdAt: new Date().toLocaleString(),
      content: {
        researchQuestion: `What opportunities, constraints, and growth levers matter most for ${cleanTopic}?`,
        keyPoints: [
          `The topic ${cleanTopic} is relevant to current operating priorities.`,
          'Focus on customer value, implementation feasibility, and business timing.',
          'Track market signals and internal capabilities before committing major resources.'
        ],
        opportunities: [
          'Potential for stronger positioning and faster execution.',
          'Opportunity to improve workflow, audience alignment, or product value.'
        ],
        risks: [
          'Execution may be slowed by unclear ownership or resource constraints.',
          'Market conditions or timing could reduce expected upside.'
        ],
        recommendedNextSteps: [
          'Validate assumptions with a small pilot or focused experiment.',
          'Document the owner, timeline, and success criteria.',
          'Review findings with leadership before scaling.'
        ],
        notes: 'Keep the research practical, measurable, and tied to immediate business value.'
      }
    }

    setBriefs((currentBriefs) => [newBrief, ...currentBriefs])
    setSelectedBriefId(newBrief.id)
    setResearchTopic('')
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.name === 'Research Assistant' ? { ...employee, status: 'Working' } : employee
      )
    )
  }

  function openBrief(id) {
    setSelectedBriefId(id)
  }

  function deleteBrief(id) {
    setBriefs((currentBriefs) => currentBriefs.filter((brief) => brief.id !== id))

    if (selectedBriefId === id) {
      setSelectedBriefId(null)
    }
  }

  function handleFinanceInputChange(event) {
    const { name, value } = event.target
    setFinanceForm((currentForm) => ({ ...currentForm, [name]: value }))
  }

  function addTransaction(event) {
    event.preventDefault()

    const description = financeForm.description.trim()
    const amount = Number.parseFloat(financeForm.amount)

    if (!description || Number.isNaN(amount) || amount <= 0) {
      return
    }

    const newTransaction = {
      id: Date.now(),
      description,
      amount: amount.toFixed(2),
      category: financeForm.category.trim() || 'General',
      date: financeForm.date,
      type: financeForm.type,
    }

    setTransactions((currentTransactions) => [newTransaction, ...currentTransactions])
    setFinanceForm({
      description: '',
      amount: '',
      category: financeForm.category,
      date: financeForm.date,
      type: financeForm.type,
    })
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.name === 'Finance Manager' ? { ...employee, status: 'Working' } : employee
      )
    )
  }

  function deleteTransaction(id) {
    setTransactions((currentTransactions) => currentTransactions.filter((transaction) => transaction.id !== id))
  }

  function generateFinanceReport() {
    const incomeTransactions = transactions.filter((transaction) => transaction.type === 'income')
    const expenseTransactions = transactions.filter((transaction) => transaction.type === 'expense')
    const totalIncome = incomeTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0)
    const totalExpenses = expenseTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0)
    const netProfit = totalIncome - totalExpenses
    const largestExpenses = [...expenseTransactions]
      .sort((left, right) => Number(right.amount) - Number(left.amount))
      .slice(0, 3)
      .map((transaction) => `${transaction.description} (${transaction.category}) - $${transaction.amount}`)
    const strongestIncomeSources = [...incomeTransactions]
      .sort((left, right) => Number(right.amount) - Number(left.amount))
      .slice(0, 3)
      .map((transaction) => `${transaction.description} (${transaction.category}) - $${transaction.amount}`)

    const report = {
      generatedAt: new Date().toLocaleString(),
      financialHealth: netProfit >= 0 ? 'Stable and growing' : 'Needs tighter cost controls',
      largestExpenses,
      strongestIncomeSources,
      risks: [
        totalExpenses > totalIncome ? 'Expenses are outpacing income.' : 'Operating costs still need close monitoring.',
        'A sudden dip in revenue could pressure cash flow.'
      ],
      recommendedNextActions: [
        'Review recurring expenses and reduce non-essential spending.',
        'Protect the strongest income sources with clear follow-up and timing.',
        'Keep a reserve for seasonal fluctuations and flexible growth.'
      ]
    }

    setFinanceReport(report)
    setEmployees((currentEmployees) =>
      currentEmployees.map((employee) =>
        employee.name === 'Finance Manager' ? { ...employee, status: 'Working' } : employee
      )
    )
  }

  const transactionCategories = ['All', ...new Set(transactions.map((transaction) => transaction.category))]
  const filteredTransactions = financeFilter === 'All'
    ? transactions
    : transactions.filter((transaction) => transaction.category === financeFilter)
  const totalIncome = transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const totalExpenses = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const netProfit = totalIncome - totalExpenses
  const currentMonthKey = new Date().toISOString().slice(0, 7)
  const monthlyTransactions = transactions.filter((transaction) => transaction.date.startsWith(currentMonthKey))
  const monthlyIncome = monthlyTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const monthlyExpenses = monthlyTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)

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

          if (employee.name === 'Finance Manager') {
            return (
              <div className="card employee-card finance-card" key={employee.name}>
                <div className="employee-heading">
                  <h2>{employee.icon} {employee.name}</h2>
                  <span className={`status-badge ${employee.status.toLowerCase()}`}>
                    {employee.status}
                  </span>
                </div>
                <p className="employee-role">{employee.role}</p>
                <p><b>Current task:</b> {employee.task}</p>
                <p>{employee.mission}</p>

                <div className="finance-workspace">
                  <form onSubmit={addTransaction} className="finance-form">
                    <div className="finance-form-grid">
                      <input
                        name="description"
                        type="text"
                        placeholder="Description"
                        value={financeForm.description}
                        onChange={handleFinanceInputChange}
                      />
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount"
                        value={financeForm.amount}
                        onChange={handleFinanceInputChange}
                      />
                      <input
                        name="category"
                        type="text"
                        placeholder="Category"
                        value={financeForm.category}
                        onChange={handleFinanceInputChange}
                      />
                      <input
                        name="date"
                        type="date"
                        value={financeForm.date}
                        onChange={handleFinanceInputChange}
                      />
                      <select name="type" value={financeForm.type} onChange={handleFinanceInputChange}>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                    </div>
                    <button type="submit" className="primary-action full-width">Add Transaction</button>
                  </form>

                  <div className="finance-stats-grid">
                    <div className="finance-stat-card">
                      <span>Total Income</span>
                      <strong>${totalIncome.toFixed(2)}</strong>
                    </div>
                    <div className="finance-stat-card">
                      <span>Total Expenses</span>
                      <strong>${totalExpenses.toFixed(2)}</strong>
                    </div>
                    <div className="finance-stat-card">
                      <span>Net Profit</span>
                      <strong>${netProfit.toFixed(2)}</strong>
                    </div>
                    <div className="finance-stat-card">
                      <span>Transactions</span>
                      <strong>{transactions.length}</strong>
                    </div>
                  </div>

                  <div className="finance-summary-card">
                    <h3>Monthly Summary</h3>
                    <p><b>{new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}</b></p>
                    <p>Income: ${monthlyIncome.toFixed(2)}</p>
                    <p>Expenses: ${monthlyExpenses.toFixed(2)}</p>
                    <p>Net: ${ (monthlyIncome - monthlyExpenses).toFixed(2) }</p>
                  </div>

                  <div className="finance-filter-row">
                    <label htmlFor="finance-filter">Category Filter</label>
                    <select id="finance-filter" value={financeFilter} onChange={(event) => setFinanceFilter(event.target.value)}>
                      {transactionCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>

                  <div className="finance-history">
                    <h3>Transaction History</h3>
                    {filteredTransactions.length === 0 ? (
                      <p className="muted-text">No transactions yet. Add one to start tracking cash flow.</p>
                    ) : (
                      <ul>
                        {filteredTransactions.map((transaction) => (
                          <li key={transaction.id}>
                            <div>
                              <strong>{transaction.description}</strong>
                              <p>{transaction.category} • {transaction.date}</p>
                            </div>
                            <div className="finance-transaction-meta">
                              <span className={transaction.type === 'income' ? 'income-pill' : 'expense-pill'}>
                                {transaction.type}
                              </span>
                              <span>${Number(transaction.amount).toFixed(2)}</span>
                              <button type="button" className="delete-task-btn" onClick={() => deleteTransaction(transaction.id)}>
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button type="button" className="primary-action full-width" onClick={generateFinanceReport}>
                    Generate Finance Report
                  </button>

                  {financeReport ? (
                    <div className="plan-box finance-report-box">
                      <h4>Latest Finance Report</h4>
                      <p className="muted-text">Generated: {financeReport.generatedAt}</p>
                      <div className="research-section">
                        <h5>Financial health</h5>
                        <p>{financeReport.financialHealth}</p>
                      </div>
                      <div className="research-section">
                        <h5>Largest expenses</h5>
                        <ul>
                          {financeReport.largestExpenses.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div className="research-section">
                        <h5>Strongest income sources</h5>
                        <ul>
                          {financeReport.strongestIncomeSources.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div className="research-section">
                        <h5>Risks</h5>
                        <ul>
                          {financeReport.risks.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div className="research-section">
                        <h5>Recommended next actions</h5>
                        <ul>
                          {financeReport.recommendedNextActions.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
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

          if (employee.name === 'Research Assistant') {
            const selectedBrief = briefs.find((brief) => brief.id === selectedBriefId) || null

            return (
              <div className="card employee-card research-card" key={employee.name}>
                <div className="employee-heading">
                  <h2>{employee.icon} {employee.name}</h2>
                  <span className={`status-badge ${employee.status.toLowerCase()}`}>
                    {employee.status}
                  </span>
                </div>
                <p className="employee-role">{employee.role}</p>
                <p><b>Current task:</b> {employee.task}</p>
                <p>{employee.mission}</p>

                <div className="research-workspace">
                  <form onSubmit={createResearchBrief} className="task-form">
                    <input
                      type="text"
                      placeholder="Enter a research topic"
                      value={researchTopic}
                      onChange={(event) => setResearchTopic(event.target.value)}
                    />
                    <button type="submit">Create Research Brief</button>
                  </form>

                  <div className="research-brief-list">
                    <h3>Saved Briefs</h3>
                    {briefs.length === 0 ? (
                      <p className="muted-text">No briefs yet. Create one to begin building your research library.</p>
                    ) : (
                      <ul>
                        {briefs.map((brief) => (
                          <li key={brief.id}>
                            <button type="button" className="brief-link" onClick={() => openBrief(brief.id)}>
                              {brief.title}
                            </button>
                            <button type="button" className="delete-task-btn" onClick={() => deleteBrief(brief.id)}>
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {selectedBrief ? (
                    <div className="plan-box research-preview">
                      <h4>{selectedBrief.title}</h4>
                      <p className="muted-text">Created: {selectedBrief.createdAt}</p>
                      <div className="research-section">
                        <h5>Research question</h5>
                        <p>{selectedBrief.content.researchQuestion}</p>
                      </div>
                      <div className="research-section">
                        <h5>Key points</h5>
                        <ul>
                          {selectedBrief.content.keyPoints.map((point) => <li key={point}>{point}</li>)}
                        </ul>
                      </div>
                      <div className="research-section">
                        <h5>Opportunities</h5>
                        <ul>
                          {selectedBrief.content.opportunities.map((point) => <li key={point}>{point}</li>)}
                        </ul>
                      </div>
                      <div className="research-section">
                        <h5>Risks</h5>
                        <ul>
                          {selectedBrief.content.risks.map((point) => <li key={point}>{point}</li>)}
                        </ul>
                      </div>
                      <div className="research-section">
                        <h5>Recommended next steps</h5>
                        <ul>
                          {selectedBrief.content.recommendedNextSteps.map((point) => <li key={point}>{point}</li>)}
                        </ul>
                      </div>
                      <div className="research-section">
                        <h5>Notes</h5>
                        <p>{selectedBrief.content.notes}</p>
                      </div>
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