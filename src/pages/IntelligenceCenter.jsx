import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const employeeStorageKey = 'genesis-os-employee-statuses'

function parseDate(value) {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function formatDate(value) {
  const parsed = parseDate(value)
  if (!parsed) return 'Unknown date'

  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getEmployeeStatuses() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(employeeStorageKey)
    const parsed = raw ? JSON.parse(raw) : []

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function IntelligenceCenter() {
  const [tasks, setTasks] = useState([])
  const [finance, setFinance] = useState([])
  const [livestock, setLivestock] = useState([])
  const [equipment, setEquipment] = useState([])
  const [pastures, setPastures] = useState([])
  const [employees, setEmployees] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUsingSupabase, setIsUsingSupabase] = useState(isSupabaseConfigured())
  const [message, setMessage] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadCenterData() {
      if (!isSupabaseConfigured() || !supabase) {
        if (!ignore) {
          setIsUsingSupabase(false)
          setMessage('Supabase is not configured. Intelligence data is unavailable.')
          setIsLoading(false)
          setEmployees(getEmployeeStatuses())
        }
        return
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError

        const user = userData?.user

        if (!user) {
          if (!ignore) {
            setTasks([])
            setFinance([])
            setLivestock([])
            setEquipment([])
            setPastures([])
            setEmployees(getEmployeeStatuses())
            setIsUsingSupabase(false)
            setMessage('Please sign in to load intelligence data.')
            setIsLoading(false)
          }
          return
        }

        const [tasksResult, financeResult, livestockResult, equipmentResult, pastureResult] = await Promise.all([
          supabase
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('finance_transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false }),
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
          supabase
            .from('pasture_records')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ])

        const anyError = tasksResult.error
          || financeResult.error
          || livestockResult.error
          || equipmentResult.error
          || pastureResult.error

        if (anyError) {
          throw anyError
        }

        if (!ignore) {
          setTasks(Array.isArray(tasksResult.data) ? tasksResult.data : [])
          setFinance(Array.isArray(financeResult.data) ? financeResult.data : [])
          setLivestock(Array.isArray(livestockResult.data) ? livestockResult.data : [])
          setEquipment(Array.isArray(equipmentResult.data) ? equipmentResult.data : [])
          setPastures(Array.isArray(pastureResult.data) ? pastureResult.data : [])
          setEmployees(getEmployeeStatuses())
          setIsUsingSupabase(true)
          setMessage('')
          setIsLoading(false)
        }
      } catch (error) {
        if (ignore) return

        console.error('Failed to load intelligence center data.', error)
        setTasks([])
        setFinance([])
        setLivestock([])
        setEquipment([])
        setPastures([])
        setEmployees(getEmployeeStatuses())
        setIsUsingSupabase(false)
        setMessage(error?.message || 'Unable to load intelligence data right now.')
        setIsLoading(false)
      }
    }

    loadCenterData()

    return () => {
      ignore = true
    }
  }, [])

  const insights = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`

    const openTasks = tasks.filter((task) => !task.done)
    const overdueTasks = openTasks.filter((task) => {
      const dueDate = parseDate(task.due_date)

      if (dueDate) {
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < now
      }

      const created = parseDate(task.created_at)
      if (!created) return false

      return created.getTime() < now.getTime() - (4 * 24 * 60 * 60 * 1000)
    })

    const equipmentMaintenanceDue = equipment.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      if (status === 'maintenance due' || status === 'out of service' || status === 'in repair') {
        return true
      }

      const nextService = parseDate(item.next_service_date)
      if (!nextService) return false

      nextService.setHours(0, 0, 0, 0)
      return nextService <= now
    })

    const livestockAlerts = livestock.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      return status === 'medical' || status === 'quarantine'
    })

    const currentMonthTransactions = finance.filter((item) => String(item.date || '').startsWith(monthKey))
    const previousMonthTransactions = finance.filter((item) => String(item.date || '').startsWith(prevMonthKey))

    const monthlyIncome = currentMonthTransactions
      .filter((item) => item.transaction_type === 'income')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const monthlyExpenses = currentMonthTransactions
      .filter((item) => item.transaction_type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const previousMonthExpenses = previousMonthTransactions
      .filter((item) => item.transaction_type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const cashBalance = finance.reduce((sum, item) => {
      const amount = Number(item.amount || 0)
      return item.transaction_type === 'income' ? sum + amount : sum - amount
    }, 0)

    const activeAiEmployees = employees.filter((employee) => String(employee.status || '').toLowerCase() === 'working')

    const completedTasksThisMonth = tasks.filter((task) => {
      if (!task.done) return false
      return String(task.created_at || '').startsWith(monthKey)
    }).length

    const weeklyWindow = now.getTime() - (7 * 24 * 60 * 60 * 1000)
    const inspectionsThisWeek = livestock.filter((item) => {
      const created = parseDate(item.created_at)
      if (!created) return false
      return created.getTime() >= weeklyWindow
    }).length

    const overstockedPastures = pastures.filter((item) => {
      const cap = Number(item.carrying_capacity)
      const herd = Number(item.current_herd)

      if (Number.isNaN(cap) || Number.isNaN(herd) || cap <= 0) {
        return false
      }

      return herd > cap
    })

    const recommendations = []

    if (equipmentMaintenanceDue.length > 0) {
      recommendations.push(`${equipmentMaintenanceDue.length} equipment service${equipmentMaintenanceDue.length === 1 ? '' : 's'} are overdue.`)
    }

    if (previousMonthExpenses > 0) {
      const delta = ((monthlyExpenses - previousMonthExpenses) / previousMonthExpenses) * 100
      if (delta > 5) {
        recommendations.push(`Monthly expenses increased ${Math.round(delta)}%.`)
      }
    }

    if (inspectionsThisWeek === 0 && livestock.length > 0) {
      recommendations.push('No livestock inspections have been logged this week.')
    }

    if (completedTasksThisMonth > 0) {
      recommendations.push(`You completed ${completedTasksThisMonth} tasks this month.`)
    }

    if (overstockedPastures.length > 0) {
      recommendations.push(`${overstockedPastures.length} pasture${overstockedPastures.length === 1 ? '' : 's'} are over carrying capacity.`)
    }
    if (recommendations.length === 0) {
      recommendations.push('Operations are stable. Continue logging field and maintenance updates for stronger forecasting.')
    }

    const businessHealthScore = clampScore(
      75
      + (monthlyIncome > monthlyExpenses ? 10 : -10)
      - (equipmentMaintenanceDue.length * 3)
      - (overdueTasks.length * 2)
      - (livestockAlerts.length * 4)
    )

    const productivityScore = clampScore(
      55
      + Math.min(completedTasksThisMonth * 2, 25)
      + Math.min(activeAiEmployees.length * 4, 20)
      - Math.min(overdueTasks.length * 3, 25)
    )

    const ranchHealthScore = clampScore(
      82
      - (livestockAlerts.length * 8)
      - (equipmentMaintenanceDue.length * 4)
      - (overstockedPastures.length * 5)
    )

    const priorities = []

    if (overdueTasks.length > 0) {
      priorities.push(`Resolve ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}.`)
    }
    if (equipmentMaintenanceDue.length > 0) {
      priorities.push(`Schedule maintenance for ${equipmentMaintenanceDue.length} equipment item${equipmentMaintenanceDue.length === 1 ? '' : 's'}.`)
    }
    if (livestockAlerts.length > 0) {
      priorities.push(`Review ${livestockAlerts.length} livestock alert${livestockAlerts.length === 1 ? '' : 's'} immediately.`)
    }
    if (monthlyExpenses > monthlyIncome) {
      priorities.push('Monthly expenses currently exceed income. Review cost controls.')
    }
    if (priorities.length === 0) {
      priorities.push('No urgent blockers detected. Focus on weekly optimization and planning.')
    }

    const activityTimeline = [
      ...tasks.slice(0, 4).map((item) => ({
        id: `task-${item.id}`,
        timestamp: item.created_at,
        label: `Task logged: ${item.text || 'Untitled task'}`,
      })),
      ...finance.slice(0, 4).map((item) => ({
        id: `finance-${item.id}`,
        timestamp: item.date,
        label: `${item.transaction_type === 'income' ? 'Income' : 'Expense'} entry: ${item.description || 'Transaction'} (${toCurrency(item.amount)})`,
      })),
      ...equipment.slice(0, 3).map((item) => ({
        id: `equipment-${item.id}`,
        timestamp: item.created_at,
        label: `Equipment updated: ${item.name || 'Unnamed equipment'}`,
      })),
      ...livestock.slice(0, 3).map((item) => ({
        id: `livestock-${item.id}`,
        timestamp: item.created_at,
        label: `Livestock record updated: ${item.name || item.tag_number || 'Unnamed animal'}`,
      })),
      ...pastures.slice(0, 3).map((item) => ({
        id: `pasture-${item.id}`,
        timestamp: item.created_at,
        label: `Pasture record updated: ${item.name || 'Unnamed pasture'}`,
      })),
    ]
      .filter((item) => item.timestamp)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 12)

    const systemHealth = overdueTasks.length + equipmentMaintenanceDue.length + livestockAlerts.length === 0
      ? 'Stable'
      : 'Attention Needed'

    const cloudSyncStatus = isUsingSupabase ? 'Connected' : 'Offline / Config Needed'

    const executiveSummary = `Genesis is tracking ${tasks.length} tasks, ${finance.length} transactions, ${livestock.length} livestock records, ${equipment.length} equipment records, and ${pastures.length} pasture records. Immediate focus: ${priorities[0]}`

    return {
      openTasks,
      overdueTasks,
      equipmentMaintenanceDue,
      livestockAlerts,
      monthlyIncome,
      monthlyExpenses,
      cashBalance,
      activeAiEmployees,
      recommendations,
      businessHealthScore,
      productivityScore,
      ranchHealthScore,
      priorities,
      activityTimeline,
      systemHealth,
      cloudSyncStatus,
      executiveSummary,
    }
  }, [tasks, finance, livestock, equipment, pastures, employees, isUsingSupabase])

  return (
    <section className="holy-water-page intelligence-center-page">
      <div className="hero-panel holy-water-hero">
        <div>
          <p className="eyebrow">Genesis OS Core</p>
          <h1>Intelligence Center</h1>
          <p className="hero-copy">Unified command intelligence across ranch, finance, operations, and AI teams.</p>
          <p className="intelligence-summary">{insights.executiveSummary}</p>
        </div>
        <div className="hero-side">
          <div className="clock-card">
            <span className="clock-label">Cloud Sync Status</span>
            <strong>{insights.cloudSyncStatus}</strong>
            <span>System Health: {insights.systemHealth}</span>
          </div>
        </div>
      </div>

      {message ? <p className="holy-water-message">{message}</p> : null}

      {isLoading ? (
        <section className="panel-card">
          <p className="muted-text">Loading intelligence data...</p>
        </section>
      ) : (
        <>
          <div className="metrics-grid">
            <article className="metric-card">
              <span>Business Health Score</span>
              <strong>{insights.businessHealthScore}</strong>
            </article>
            <article className="metric-card">
              <span>Productivity Score</span>
              <strong>{insights.productivityScore}</strong>
            </article>
            <article className="metric-card">
              <span>Ranch Health Score</span>
              <strong>{insights.ranchHealthScore}</strong>
            </article>
            <article className="metric-card">
              <span>Financial Snapshot</span>
              <strong>{toCurrency(insights.cashBalance)}</strong>
              <small>{toCurrency(insights.monthlyIncome)} income / {toCurrency(insights.monthlyExpenses)} expense</small>
            </article>
          </div>

          <section className="mission mission-grid">
            <div className="mission-column secondary-stack">
              <div className="panel-card">
                <div className="panel-card-header">
                  <h3>Executive Summary</h3>
                  <span className="panel-pill">Overview</span>
                </div>
                <p className="mission-copy">{insights.executiveSummary}</p>
              </div>

              <div className="panel-card">
                <div className="panel-card-header">
                  <h3>Today's Priorities</h3>
                  <span className="panel-pill">Action</span>
                </div>
                <ul className="panel-list">
                  {insights.priorities.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>

              <div className="panel-card">
                <div className="panel-card-header">
                  <h3>AI Recommendations</h3>
                  <span className="panel-pill">Generated</span>
                </div>
                <ul className="panel-list">
                  {insights.recommendations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>

            <div className="mission-column secondary-stack">
              <div className="panel-card">
                <div className="panel-card-header">
                  <h3>Overdue Tasks</h3>
                  <span className="panel-pill">{insights.overdueTasks.length}</span>
                </div>
                {insights.overdueTasks.length === 0 ? (
                  <p className="muted-text">No overdue tasks detected.</p>
                ) : (
                  <ul className="panel-list">
                    {insights.overdueTasks.slice(0, 6).map((task) => (
                      <li key={task.id}>{task.text || 'Untitled task'}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="panel-card">
                <div className="panel-card-header">
                  <h3>Equipment Maintenance Due</h3>
                  <span className="panel-pill">{insights.equipmentMaintenanceDue.length}</span>
                </div>
                {insights.equipmentMaintenanceDue.length === 0 ? (
                  <p className="muted-text">All equipment service windows are healthy.</p>
                ) : (
                  <ul className="panel-list">
                    {insights.equipmentMaintenanceDue.slice(0, 6).map((item) => (
                      <li key={item.id}>{item.name || 'Unnamed equipment'} • Due {formatDate(item.next_service_date)}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="panel-card">
                <div className="panel-card-header">
                  <h3>Livestock Alerts</h3>
                  <span className="panel-pill">{insights.livestockAlerts.length}</span>
                </div>
                {insights.livestockAlerts.length === 0 ? (
                  <p className="muted-text">No critical livestock alerts.</p>
                ) : (
                  <ul className="panel-list">
                    {insights.livestockAlerts.slice(0, 6).map((item) => (
                      <li key={item.id}>{item.name || item.tag_number || 'Unnamed'} • {item.status}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="panel-card">
                <div className="panel-card-header">
                  <h3>Active AI Employees</h3>
                  <span className="panel-pill">{insights.activeAiEmployees.length}</span>
                </div>
                {insights.activeAiEmployees.length === 0 ? (
                  <p className="muted-text">No AI employees currently marked as working.</p>
                ) : (
                  <ul className="panel-list">
                    {insights.activeAiEmployees.map((item) => (
                      <li key={item.name || item.id}>{item.name || 'Unnamed AI'} • {item.role || 'AI Employee'}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="panel-card intelligence-timeline">
            <div className="panel-card-header">
              <h3>Recent Activity Timeline</h3>
              <span className="panel-pill">Live Feed</span>
            </div>
            {insights.activityTimeline.length === 0 ? (
              <p className="muted-text">No activity logged yet.</p>
            ) : (
              <ul className="panel-list intelligence-timeline-list">
                {insights.activityTimeline.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <small>{formatDate(item.timestamp)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}

export default IntelligenceCenter
