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

  async function loadJobs() {
    setLoadingJobs(true)
    setError(null)
    try {
      const payload = await callAiApi('/api/jobs')
      setJobs(Array.isArray(payload?.jobs) ? payload.jobs : [])
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
          Jobs you submit are created and tracked here. The real AI production
          loop — where an employee works the job and returns deliverables — is
          being built next; it will run inside this area.
        </p>

        {loadingJobs ? (
          <p className="muted-text">Loading your jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="muted-text">No jobs yet. Submit one above to get started.</p>
        ) : (
          <ul className="job-list">
            {jobs.map((job) => (
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default TeamLead
