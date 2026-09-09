import { useEffect, useState } from 'react'
import { callAiApi } from '../lib/aiApiClient'

const STATUS_OPTIONS = [
  ['pending', 'Pending'],
  ['sent', 'Sent'],
  ['responded', 'Responded'],
  ['followed_up', 'Followed up'],
  ['closed', 'Closed'],
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS)

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function makeDraft(lead) {
  return {
    status: lead?.status || 'pending',
    sent_at: toDateTimeLocal(lead?.sent_at),
    response_text: lead?.response_text || '',
    follow_up_notes: lead?.follow_up_notes || '',
  }
}

function Outreach() {
  const [leads, setLeads] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [draft, setDraft] = useState(makeDraft(null))
  const [loading, setLoading] = useState(true)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function loadLeads() {
    setLoading(true)
    setError(null)
    try {
      const payload = await callAiApi('/api/outreach')
      setLeads(Array.isArray(payload?.leads) ? payload.leads : [])
    } catch (err) {
      setError(err.message || 'Could not load outreach leads.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [])

  async function selectLead(id) {
    setError(null)
    setMessage(null)
    setLoadingRecord(true)
    try {
      const payload = await callAiApi(`/api/outreach/${id}`)
      const lead = payload?.lead
      if (!lead) throw new Error('Could not load this outreach lead.')
      setSelectedLead(lead)
      setDraft(makeDraft(lead))
    } catch (err) {
      setError(err.message || 'Could not load this outreach lead.')
    } finally {
      setLoadingRecord(false)
    }
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function saveLead(event) {
    event.preventDefault()
    if (!selectedLead) return

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = await callAiApi(`/api/outreach/${selectedLead.id}`, {
        method: 'PATCH',
        body: {
          status: draft.status,
          sent_at: draft.sent_at ? new Date(draft.sent_at).toISOString() : null,
          response_text: draft.response_text,
          follow_up_notes: draft.follow_up_notes,
        },
      })
      const updated = payload?.lead
      if (!updated) throw new Error('The outreach lead was not returned after saving.')

      setSelectedLead(updated)
      setDraft(makeDraft(updated))
      setLeads((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)))
      setMessage('Lead record saved. No message was sent by Genesis OS.')
    } catch (err) {
      setError(err.message || 'Could not save this outreach lead.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="outreach-page">
      <h1>📣 Outreach & Leads</h1>
      <p className="outreach-intro">
        A private record of approved prospects and their draft messages. Genesis OS does not send outreach from this page; record only facts after the owner sends manually.
      </p>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      <div className="outreach-layout">
        <div className="card outreach-list-card">
          <div className="outreach-list-heading">
            <div>
              <h2>Approved prospects</h2>
              <p className="muted-text">{loading ? 'Loading records…' : `${leads.length} tracked lead${leads.length === 1 ? '' : 's'}`}</p>
            </div>
            <button type="button" className="secondary-action outreach-refresh" onClick={loadLeads} disabled={loading}>
              Refresh
            </button>
          </div>

          {!loading && leads.length === 0 ? (
            <p className="muted-text">No outreach leads are available for this account yet.</p>
          ) : null}

          <div className="outreach-lead-list">
            {leads.map((lead) => (
              <button
                type="button"
                className={`outreach-lead-row ${selectedLead?.id === lead.id ? 'active' : ''}`}
                key={lead.id}
                onClick={() => selectLead(lead.id)}
                disabled={loadingRecord && selectedLead?.id !== lead.id}
              >
                <span>
                  <strong>{lead.name}</strong>
                  <small>{lead.company}</small>
                </span>
                <span className={`status-badge outreach-status ${lead.status || 'pending'}`}>
                  {STATUS_LABELS[lead.status] || lead.status}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card outreach-detail-card">
          {loadingRecord ? <p className="muted-text">Loading lead record…</p> : null}
          {!loadingRecord && !selectedLead ? (
            <div className="outreach-empty-state">
              <h2>Select a prospect</h2>
              <p className="muted-text">Choose a lead to review the complete draft and record a manual outreach outcome.</p>
            </div>
          ) : null}
          {!loadingRecord && selectedLead ? (
            <>
              <div className="outreach-detail-heading">
                <div>
                  <h2>{selectedLead.name}</h2>
                  <p className="muted-text">{selectedLead.role}</p>
                </div>
                <span className={`status-badge outreach-status ${selectedLead.status || 'pending'}`}>
                  {STATUS_LABELS[selectedLead.status] || selectedLead.status}
                </span>
              </div>

              <dl className="outreach-metadata">
                <div><dt>Company</dt><dd>{selectedLead.company}</dd></div>
                <div><dt>Manual channel</dt><dd>{selectedLead.channel}</dd></div>
                <div><dt>Source</dt><dd><a href={selectedLead.source_link} target="_blank" rel="noreferrer">Open public source ↗</a></dd></div>
                <div><dt>Sender</dt><dd>N/A — owner sends manually</dd></div>
              </dl>

              <div className="outreach-message-box">
                <span className="outreach-field-label">Personalized draft message</span>
                <p>{selectedLead.message_text}</p>
              </div>

              <form className="outreach-form" onSubmit={saveLead}>
                <div className="outreach-form-grid">
                  <label>
                    Status
                    <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
                      {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    Sent at (manual record only)
                    <input type="datetime-local" value={draft.sent_at} onChange={(event) => updateDraft('sent_at', event.target.value)} />
                  </label>
                </div>
                <label>
                  Response text
                  <textarea value={draft.response_text} maxLength={10000} rows={4} onChange={(event) => updateDraft('response_text', event.target.value)} placeholder="Record an actual response here, if one arrives." />
                </label>
                <label>
                  Follow-up notes
                  <textarea value={draft.follow_up_notes} maxLength={10000} rows={4} onChange={(event) => updateDraft('follow_up_notes', event.target.value)} placeholder="Record factual next steps or a manual follow-up note." />
                </label>
                <div className="outreach-save-row">
                  <small>Last updated: {formatDate(selectedLead.updated_at)}</small>
                  <button className="primary-action" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save tracking record'}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default Outreach
