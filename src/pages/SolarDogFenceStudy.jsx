import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const SURVEY_URL = 'https://solar-dog-fence-study.fdgfgfdg.chatgpt.site/'

const choiceLabels = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  rarely: 'Rarely',
  collar: 'Collar',
  harness: 'Harness',
  either: 'Either collar or harness',
  tone: 'Tone only',
  'tone-vibration': 'Tone and vibration',
  'optional-static': 'Optional static correction',
  yes: 'Yes',
  maybe: 'Maybe',
  no: 'No',
}

function label(value) {
  return choiceLabels[value] || value || 'Not answered'
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = label(row[key])
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function Breakdown({ title, counts, total }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <article className="study-breakdown-card">
      <h2>{title}</h2>
      {entries.length === 0 ? <p className="study-empty">No answers yet.</p> : entries.map(([name, count]) => (
        <div className="study-bar-row" key={name}>
          <div><span>{name}</span><strong>{count}</strong></div>
          <div className="study-bar-track"><span style={{ width: `${Math.round((count / total) * 100)}%` }} /></div>
        </div>
      ))}
    </article>
  )
}

export default function SolarDogFenceStudy() {
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadResponses = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from('solar_dog_fence_responses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250)

    if (queryError) {
      setError('Genesis OS could not load the private survey responses.')
      setResponses([])
    } else {
      setResponses(data || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadResponses()
  }, [loadResponses])

  const summary = useMemo(() => {
    const total = responses.length
    const yes = responses.filter((row) => row.tester_interest === 'yes').length
    const maybe = responses.filter((row) => row.tester_interest === 'maybe').length
    const dailyCharging = responses.filter((row) => row.charging_problem === 'daily').length
    return { total, yes, maybe, dailyCharging }
  }, [responses])

  return (
    <div className="study-results-page">
      <header className="study-results-hero">
        <div>
          <p className="eyebrow">Private Genesis OS workspace</p>
          <h1>Solar GPS Dog Fence Study</h1>
          <p>Public survey answers arrive here. Only your authorized Genesis account can read this page or its contact information.</p>
        </div>
        <div className="study-hero-actions">
          <a href={SURVEY_URL} target="_blank" rel="noreferrer">Open public survey</a>
          <button type="button" onClick={loadResponses} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh responses'}</button>
        </div>
      </header>

      {error ? <div className="study-alert">{error}</div> : null}

      <section className="study-metric-grid" aria-label="Survey summary">
        <article><span>Total responses</span><strong>{loading ? '—' : summary.total}</strong></article>
        <article><span>Would field test</span><strong>{loading ? '—' : summary.yes}</strong><small>{summary.total ? Math.round((summary.yes / summary.total) * 100) : 0}% of responses</small></article>
        <article><span>Maybe testers</span><strong>{loading ? '—' : summary.maybe}</strong><small>{summary.total ? Math.round((summary.maybe / summary.total) * 100) : 0}% of responses</small></article>
        <article><span>Charge daily</span><strong>{loading ? '—' : summary.dailyCharging}</strong><small>{summary.total ? Math.round((summary.dailyCharging / summary.total) * 100) : 0}% of responses</small></article>
      </section>

      <section className="study-breakdown-grid">
        <Breakdown title="Preferred price" counts={countBy(responses, 'price')} total={summary.total || 1} />
        <Breakdown title="Preferred design" counts={countBy(responses, 'preferred_design')} total={summary.total || 1} />
        <Breakdown title="Warning method" counts={countBy(responses, 'warning_mode')} total={summary.total || 1} />
        <Breakdown title="Tester interest" counts={countBy(responses, 'tester_interest')} total={summary.total || 1} />
      </section>

      <section className="study-response-panel">
        <div className="study-response-heading">
          <div>
            <p className="eyebrow">Latest feedback</p>
            <h2>Individual responses</h2>
          </div>
          <span>Showing up to 250</span>
        </div>

        {!loading && responses.length === 0 && !error ? (
          <p className="study-empty">New survey responses will appear here automatically.</p>
        ) : (
          <div className="study-response-list">
            {responses.map((row) => (
              <article className="study-response-card" key={row.id}>
                <div className="study-response-title">
                  <strong>{row.dog_type}</strong>
                  <time>{new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
                </div>
                <dl>
                  <div><dt>Dog weight</dt><dd>{row.dog_weight}</dd></div>
                  <div><dt>Property</dt><dd>{row.acreage} · {row.terrain}</dd></div>
                  <div><dt>Charging</dt><dd>{label(row.charging_problem)}</dd></div>
                  <div><dt>Design</dt><dd>{label(row.preferred_design)}</dd></div>
                  <div><dt>Warning</dt><dd>{label(row.warning_mode)}</dd></div>
                  <div><dt>Price</dt><dd>{row.price}</dd></div>
                  <div><dt>Tester</dt><dd>{label(row.tester_interest)}</dd></div>
                </dl>
                {(row.contact || row.comments) ? (
                  <div className="study-response-notes">
                    {row.contact ? <p><strong>Contact:</strong> {row.contact}</p> : null}
                    {row.comments ? <p><strong>Notes:</strong> {row.comments}</p> : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
