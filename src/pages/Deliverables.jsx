import { useEffect, useState } from 'react'
import { callAiApi } from '../lib/aiApiClient'

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

function Deliverables() {
  const [deliverables, setDeliverables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const payload = await callAiApi('/api/deliverables')
      setDeliverables(Array.isArray(payload?.deliverables) ? payload.deliverables : [])
    } catch (err) {
      setError(err.message || 'Could not load your deliverables.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const bodyOf = (deliverable) => {
    const content = deliverable?.content
    if (typeof content === 'string') return content
    if (content && typeof content === 'object') {
      return String(content.body ?? content.content ?? '').trim()
    }
    return ''
  }

  return (
    <>
      <h1>📦 Deliverables</h1>
      <p>
        Finished work your Genesis OS employees have produced and handed back for
        your review. Everything here came from the real workforce — nothing is
        staged.
      </p>

      <div className="card">
        <h2>Your deliverables</h2>
        {error ? <p className="error-text">{error}</p> : null}
        {loading ? (
          <p className="muted-text">Loading your deliverables…</p>
        ) : deliverables.length === 0 ? (
          <p className="muted-text">
            No deliverables yet. Submit a job on the Team Lead page and run an
            employee to see finished work here.
          </p>
        ) : (
          <ul className="job-list">
            {deliverables.map((deliverable) => (
              <li className="job-item" key={deliverable.id}>
                <div className="job-item-header">
                  <strong>{deliverable.title || 'Deliverable'}</strong>
                  {deliverable.format ? (
                    <span className="deliverable-format">{deliverable.format}</span>
                  ) : null}
                </div>
                {deliverable.job_title ? (
                  <p className="job-assigned muted-text">
                    From job: {deliverable.job_title}
                  </p>
                ) : null}
                <div className="deliverable-body" style={{ marginTop: '8px' }}>
                  {bodyOf(deliverable)}
                </div>
                <p className="muted-text job-date">{formatDate(deliverable.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default Deliverables
