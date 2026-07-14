import { useEffect, useMemo, useState } from 'react'
import { callAiApi } from '../lib/aiApiClient'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

function AdminAISettings() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [notice, setNotice] = useState('')
  const [settings, setSettings] = useState({
    mode: 'local',
    provider: 'openai',
    model: 'gpt-4o-mini',
    preferred_mode: 'local',
    cloudConfigured: false,
    estimatedUsageTokens: 0,
    estimatedCostUsd: 0,
    monthlyUsageCapTokens: 200000,
    spendingLimitUsd: 15,
  })

  const [form, setForm] = useState({
    preferredMode: 'local',
    provider: 'openai',
    model: 'gpt-4o-mini',
    monthlyUsageCapTokens: '200000',
    spendingLimitUsd: '15',
  })

  useEffect(() => {
    let canceled = false

    async function load() {
      try {
        const payload = await callAiApi('/api/ai/settings')
        if (canceled) return

        setSettings(payload)
        setForm({
          preferredMode: payload.preferred_mode || 'local',
          provider: payload.provider || 'openai',
          model: payload.model || 'gpt-4o-mini',
          monthlyUsageCapTokens: String(payload.monthlyUsageCapTokens || 200000),
          spendingLimitUsd: String(payload.spendingLimitUsd || 15),
        })
      } catch (error) {
        if (canceled) return
        setNotice(error.message || 'Unable to load AI settings.')
      } finally {
        if (!canceled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      canceled = true
    }
  }, [])

  const modeBadge = useMemo(() => {
    if (settings.mode === 'cloud') return 'Cloud AI Mode'
    return 'Local Free Mode'
  }, [settings.mode])

  async function saveSettings(event) {
    event.preventDefault()

    setIsSaving(true)
    setNotice('')

    try {
      const payload = await callAiApi('/api/ai/settings', {
        method: 'PATCH',
        body: {
          preferredMode: form.preferredMode,
          provider: form.provider,
          model: form.model,
          monthlyUsageCapTokens: Number.parseInt(form.monthlyUsageCapTokens, 10),
          spendingLimitUsd: Number.parseFloat(form.spendingLimitUsd),
        },
      })

      setSettings(payload)
      setForm((current) => ({
        ...current,
        preferredMode: payload.preferred_mode,
        provider: payload.provider,
        model: payload.model,
      }))
      setNotice('AI settings saved.')
    } catch (error) {
      setNotice(error.message || 'Failed to save AI settings.')
    } finally {
      setIsSaving(false)
    }
  }

  async function testConnection() {
    setIsTesting(true)
    setNotice('')

    try {
      const payload = await callAiApi('/api/ai/test', { method: 'POST' })
      setNotice(payload.message || (payload.ok ? 'Connection healthy.' : 'Connection failed.'))
    } catch (error) {
      setNotice(error.message || 'Test failed.')
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <section className="holy-water-page">
      <div className="hero-panel holy-water-hero">
        <div>
          <p className="eyebrow">Genesis OS Admin</p>
          <h1>Admin AI Settings</h1>
          <p className="hero-copy">Control provider routing, usage limits, and cloud connection health without exposing API secrets in the browser.</p>
        </div>
        <div className="hero-side">
          <div className="clock-card">
            <span className="clock-label">Current Mode</span>
            <strong>{modeBadge}</strong>
            <span>{settings.cloudConfigured ? 'Cloud key detected on server' : 'No cloud key detected'}</span>
          </div>
        </div>
      </div>

      {notice ? <p className="holy-water-message">{notice}</p> : null}

      <div className="mission holy-water-grid ai-admin-grid">
        <div className="mission-column">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Runtime Status</h3>
              <span className={`panel-pill ${settings.mode === 'cloud' ? 'ai-pill-cloud' : 'ai-pill-local'}`}>
                {settings.mode === 'cloud' ? 'Cloud Active' : 'Local Active'}
              </span>
            </div>
            {isLoading ? (
              <p className="muted-text">Loading AI status...</p>
            ) : (
              <div className="status-grid ai-admin-status-grid">
                <div>
                  <span className="status-label">Current Mode</span>
                  <strong>{settings.mode}</strong>
                </div>
                <div>
                  <span className="status-label">Provider</span>
                  <strong>{settings.provider}</strong>
                </div>
                <div>
                  <span className="status-label">Model</span>
                  <strong>{settings.model}</strong>
                </div>
                <div>
                  <span className="status-label">Estimated Usage</span>
                  <strong>{formatNumber(settings.estimatedUsageTokens)} tokens</strong>
                </div>
                <div>
                  <span className="status-label">Estimated Spend</span>
                  <strong>{formatCurrency(settings.estimatedCostUsd)}</strong>
                </div>
                <div>
                  <span className="status-label">Spending Limit</span>
                  <strong>{formatCurrency(settings.spendingLimitUsd)}</strong>
                </div>
              </div>
            )}

            <div className="holy-water-actions">
              <button type="button" className="secondary-action" onClick={testConnection} disabled={isTesting || isLoading}>
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>
        </div>

        <div className="mission-column">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Configure Mode and Limits</h3>
              <span className="panel-pill">Server Enforced</span>
            </div>

            <form className="holy-water-form" onSubmit={saveSettings}>
              <div className="holy-water-form-grid ai-admin-form-grid">
                <label>
                  Preferred Mode
                  <select
                    value={form.preferredMode}
                    onChange={(event) => setForm((current) => ({ ...current, preferredMode: event.target.value }))}
                  >
                    <option value="local">Local Free Mode</option>
                    <option value="cloud">Cloud AI Mode</option>
                  </select>
                </label>

                <label>
                  Provider
                  <select
                    value={form.provider}
                    onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>

                <label>
                  Model
                  <input
                    type="text"
                    value={form.model}
                    onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                    placeholder="gpt-4o-mini"
                  />
                </label>

                <label>
                  Monthly Usage Cap (tokens)
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={form.monthlyUsageCapTokens}
                    onChange={(event) => setForm((current) => ({ ...current, monthlyUsageCapTokens: event.target.value }))}
                  />
                </label>

                <label>
                  Spending Limit (USD)
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.spendingLimitUsd}
                    onChange={(event) => setForm((current) => ({ ...current, spendingLimitUsd: event.target.value }))}
                  />
                </label>
              </div>

              <div className="holy-water-actions">
                <button type="submit" className="primary-action" disabled={isSaving || isLoading}>
                  {isSaving ? 'Saving...' : 'Save AI Settings'}
                </button>
              </div>
            </form>

            <p className="muted-text">If cloud provider connectivity fails, Genesis Companion automatically falls back to Local Free Mode.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AdminAISettings
