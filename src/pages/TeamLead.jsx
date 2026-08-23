import { useEffect, useState } from 'react'
import { callAiApi } from '../lib/aiApiClient'

const EMPLOYEES = [
  { id: '', name: 'Auto — let the Team Lead choose' },
  { id: 'Business Research & Sales', name: '🔎 Business Research & Sales' },
  { id: 'Content & Social Media', name: '📣 Content & Social Media' },
  { id: 'Software Engineer', name: '💻 Software Engineer' },
]

const STATUS_LABELS = {
  queued: 'Queued',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function TeamLead() {
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [assignedEmployee, setAssignedEmployee] = useState('')
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  // jobId -> 'idle' | 'running' | 'done'
  const [runState, setRunState] = useState({})
  // jobId -> [deliverable, ...] for read-only display
  const [deliverablesByJob, setDeliverablesByJob] = useState({})

  // Load one job's deliverables so delivered jobs render readably on reload.
  async function loadDeliverablesForJob(jobId) {
    try {
      const payload = await callAiApi(`/api/jobs/${jobId}`)
      const rows = Array.isArray(payload?.deliverables) ? payload.deliverables : []
      setDeliverablesByJob((current) => ({ ...current, [jobId]: rows }))
    } catch {
      // Non-fatal: leave whatever is already shown for this job.
    }
  }

  async function loadJobs() {
    setLoadingJobs(true)
    setError(null)
    try {
      const payload = await callAiApi('/api/jobs')
      const rows = Array.isArray(payload?.jobs) ? payload.jobs : []
      setJobs(rows)
      // Fetch deliverables for already-delivered jobs so they persist across reloads.
      rows.forEach((job) => {
        if (job.status === 'delivered') loadDeliverablesForJob(job.id)
      })
    } catch (err) {
      setError(err.message || 'Could not load your jobs.')
    } finally {
      setLoadingJobs(false)
    }
  }

  useEffect(() => {
    loadJobs()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage(null)
    setError(null)

    const cleanTitle = title.trim()
    const cleanBrief = brief.trim()

    if (!cleanTitle || !cleanBrief) {
      setError('Please provide both a title and a brief for your job.')
      return
    }

    setSubmitting(true)
    try {
      const payload = await callAiApi('/api/jobs', {
        method: 'POST',
        body: {
          title: cleanTitle,
          brief: cleanBrief,
          assigned_employee: assignedEmployee || undefined,
        },
      })

      setMessage(
        payload?.job
          ? 'Your job has been submitted to the Genesis Team Lead and is moving into the workforce.'
          : 'Your job has been submitted.'
      )
      if (payload?.job) {
        setJobs((current) => [payload.job, ...current])
      }
      setTitle('')
      setBrief('')
      setAssignedEmployee('')
    } catch (err) {
      setError(err.message || 'Could not submit your job. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Run the assigned employee on a job and surface the real deliverable it returns.
  async function handleRun(job) {
    setMessage(null)
    setError(null)
    setRunState((current) => ({ ...current, [job.id]: 'running' }))

    try {
      const payload = await callAiApi(`/api/jobs/${job.id}`, { method: 'POST' })

      if (payload?.job) {
        setJobs((current) => current.map((j) => (j.id === job.id ? payload.job : j)))
      }
      if (payload?.deliverable) {
        setDeliverablesByJob((current) => ({
          ...current,
          [job.id]: [payload.deliverable],
        }))
        setMessage('Deliverable produced and saved. Review it below.')
      }
      setRunState((current) => ({ ...current, [job.id]: 'done' }))
    } catch (err) {
      setError(err.message || 'Could not run this job right now.')
      setRunState((current) => ({ ...current, [job.id]: 'idle' }))
    }
  }

  const canRun = (job) =>
    (job.status === 'assigned' || job.status === 'queued') && Boolean(job.assigned_employee)

  const deliverableBody = (deliverable) => {
    const content = deliverable?.content
    if (typeof content === 'string') return content
    if (content && typeof content === 'object') {
      return String(content.body ?? content.content ?? '').trim()
    }
    return ''
  }

  return (
    <>
      <h1>🤖 Genesis Team Lead</h1>
      <p>
        Give your work to the Genesis Team Lead in plain language. The Team Lead
        reviews it, routes it to the right specialized employee, and returns
        finished work for your approval.
      </p>

      <div className="card">
        <h2>Submit a new job</h2>
        <form className="teamlead-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Title — e.g. Research our competitor pricing"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            placeholder="Describe what you need in plain language — e.g. 'Research the top 3 competitors in our area and summarize their pricing and what they promise customers.'"
            value={brief}
            maxLength={10000}
            rows={5}
            onChange={(event) => setBrief(event.target.value)}
          />
          <div className="teamlead-row">
            <select
              value={assignedEmployee}
              onChange={(event) => setAssignedEmployee(event.target.value)}
            >
              {EMPLOYEES.map((employee) => (
                <option key={employee.id || 'auto'} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="primary-action"
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit to Team Lead'}
            </button>
          </div>
        </form>

        {message ? <p className="success-text">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="card">
        <h2>Your Jobs</h2>
        <p className="muted-text">
          Submit a job, then press “Run employee” to have the assigned AI employee
          produce a real deliverable for you to review. No completion is faked —
          if the workforce is not ready, the job stays as-is.
        </p>

        {loadingJobs ? (
          <p className="muted-text">Loading your jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="muted-text">No jobs yet. Submit one above to get started.</p>
        ) : (
          <ul className="job-list">
            {jobs.map((job) => {
              const running = runState[job.id] === 'running'
              const deliverables = deliverablesByJob[job.id] || []
              return (
                <li className="job-item" key={job.id}>
                  <div className="job-item-header">
                    <strong>{job.title || 'Untitled job'}</strong>
                    <span className={`status-badge ${(job.status || 'queued').toLowerCase()}`}>
                      {STATUS_LABELS[job.status] || job.status}
                    </span>
                  </div>
                  {job.assigned_employee ? (
                    <p className="job-assigned">
                      Assigned to: {job.assigned_employee}
                    </p>
                  ) : (
                    <p className="job-assigned muted-text">Not yet assigned</p>
                  )}
                  <p className="job-brief">{job.brief}</p>
                  <p className="muted-text job-date">
                    {formatDate(job.created_at)}
                  </p>

                  {canRun(job) && !running ? (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => handleRun(job)}
                    >
                      ▶ Run employee — produce deliverable
                    </button>
                  ) : null}
                  {running ? (
                    <p className="muted-text job-date">⏳ The employee is working on this…</p>
                  ) : null}

                  {deliverables.length > 0 ? (
                    <div className="deliverable-block">
                      <div className="deliverable-label">Deliverable</div>
                      {deliverables.map((deliverable) => (
                        <div className="deliverable" key={deliverable.id}>
                          <div className="deliverable-header">
                            <strong>{deliverable.title || 'Deliverable'}</strong>
                            {deliverable.format ? (
                              <span className="deliverable-format">{deliverable.format}</span>
                            ) : null}
                          </div>
                          <div className="deliverable-body">
                            {deliverableBody(deliverable)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

export default TeamLead
