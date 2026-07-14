import { useEffect, useMemo, useState } from 'react'
import { callAiApi } from '../lib/aiApiClient'

const employeeStatusStorageKey = 'genesis-os-employee-statuses'

function parseDate(value) {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value) {
  const parsed = parseDate(value)
  if (!parsed) return 'Unknown'

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function readAiEmployeeActivity() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(employeeStatusStorageKey)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => ({
        name: String(item?.name || '').trim(),
        role: String(item?.role || '').trim(),
        status: String(item?.status || '').trim() || 'Idle',
      }))
      .filter((item) => item.name)
  } catch {
    return []
  }
}

function DailyBriefing() {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [notice, setNotice] = useState('')
  const [briefings, setBriefings] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  const selectedBriefing = useMemo(() => {
    if (briefings.length === 0) return null

    if (!selectedId) {
      return briefings[0]
    }

    return briefings.find((item) => item.id === selectedId) || briefings[0]
  }, [briefings, selectedId])

  async function loadBriefings() {
    try {
      const payload = await callAiApi('/api/ai/daily-briefing')
      const rows = Array.isArray(payload.briefings) ? payload.briefings : []
      setBriefings(rows)
      if (rows.length > 0) {
        setSelectedId(rows[0].id)
      }
      setNotice('')
    } catch (error) {
      setNotice(error.message || 'Unable to load previous briefings.')
    }
  }

  useEffect(() => {
    let ignore = false

    async function load() {
      await loadBriefings()
      if (!ignore) setIsLoading(false)
    }

    load()

    return () => {
      ignore = true
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  function stopSpeech() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  function speakBriefing(briefing) {
    if (!briefing || typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel()

    const utterance = new window.SpeechSynthesisUtterance(briefing.spoken_text || briefing.summary_text || '')
    utterance.lang = 'en-US'
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }

  async function refreshBriefing() {
    if (isRefreshing) return

    setIsRefreshing(true)
    setNotice('Generating your morning briefing...')

    try {
      const payload = await callAiApi('/api/ai/daily-briefing', {
        method: 'POST',
        body: {
          aiEmployeeActivity: readAiEmployeeActivity(),
        },
      })

      const saved = payload?.briefing || null
      if (!saved) {
        throw new Error('Briefing response was empty.')
      }

      setBriefings((current) => {
        const next = [saved, ...current.filter((item) => item.id !== saved.id)]
        return next.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      })
      setSelectedId(saved.id)
      setNotice(payload.reason || (payload.cloudActive ? 'Cloud AI generated your briefing.' : 'Local briefing generated.'))
    } catch (error) {
      setNotice(error.message || 'Unable to generate a new briefing right now.')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <section className="holy-water-page briefing-page">
      <div className="hero-panel holy-water-hero">
        <div>
          <p className="eyebrow">Genesis OS Core</p>
          <h1>Genesis Daily Briefing</h1>
          <p className="hero-copy">A concise morning command brief from your live mission, finance, ranch, AI employee, and memory data.</p>
        </div>
        <div className="hero-side">
          <div className="clock-card">
            <span className="clock-label">Briefings Stored</span>
            <strong>{briefings.length}</strong>
            <span>{selectedBriefing?.cloud_active ? 'Cloud AI Summary' : 'Local Summary'}</span>
          </div>
        </div>
      </div>

      {notice ? <p className="holy-water-message">{notice}</p> : null}

      <div className="mission holy-water-grid briefing-grid">
        <div className="mission-column">
          <div className="panel-card briefing-primary-card">
            <div className="panel-card-header">
              <h3>Current Briefing</h3>
              <span className="panel-pill">{selectedBriefing ? formatDate(selectedBriefing.created_at) : 'Not generated yet'}</span>
            </div>

            <div className="holy-water-actions">
              <button type="button" className="primary-action" onClick={refreshBriefing} disabled={isRefreshing}>
                {isRefreshing ? 'Refreshing...' : 'Refresh Briefing'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => speakBriefing(selectedBriefing)}
                disabled={!selectedBriefing}
              >
                Read My Briefing
              </button>
              <button type="button" className="secondary-action" onClick={stopSpeech} disabled={!isSpeaking}>
                Stop Voice
              </button>
            </div>

            {isLoading ? (
              <p className="muted-text">Loading your saved briefings...</p>
            ) : !selectedBriefing ? (
              <p className="muted-text">No briefing has been generated yet. Use Refresh Briefing to create one now.</p>
            ) : (
              <div className="briefing-sections">
                <article className="briefing-section">
                  <h4>Top 3 Priorities</h4>
                  <ol>
                    {(selectedBriefing.top_priorities || []).map((item, index) => (
                      <li key={`${selectedBriefing.id}-priority-${index}`}>{item}</li>
                    ))}
                  </ol>
                </article>

                <article className="briefing-section">
                  <h4>Important Alerts</h4>
                  <ul>
                    {(selectedBriefing.important_alerts || []).map((item, index) => (
                      <li key={`${selectedBriefing.id}-alert-${index}`}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="briefing-section">
                  <h4>Financial Snapshot</h4>
                  <p>{selectedBriefing.financial_snapshot || '-'}</p>
                </article>

                <article className="briefing-section">
                  <h4>Ranch Status</h4>
                  <p>{selectedBriefing.ranch_status || '-'}</p>
                </article>

                <article className="briefing-section">
                  <h4>AI Employee Status</h4>
                  <p>{selectedBriefing.ai_employee_status || '-'}</p>
                </article>

                <article className="briefing-section">
                  <h4>Recommended Next Action</h4>
                  <p>{selectedBriefing.recommended_next_action || '-'}</p>
                </article>
              </div>
            )}
          </div>
        </div>

        <div className="mission-column secondary-stack">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Previous Briefings</h3>
              <span className="panel-pill">History</span>
            </div>

            {briefings.length === 0 ? (
              <p className="muted-text">No prior briefings.</p>
            ) : (
              <div className="briefing-history-list">
                {briefings.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`briefing-history-item ${selectedBriefing?.id === item.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <strong>{formatDate(item.created_at)}</strong>
                    <span>{item.cloud_active ? 'Cloud AI' : 'Local'}</span>
                    <small>{(item.summary_text || '').slice(0, 110) || 'Open briefing'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default DailyBriefing
