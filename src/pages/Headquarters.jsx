import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { callAiApi } from '../lib/aiApiClient'
import './Headquarters.css'

const FLOORS = ['Executive', 'Product', 'Creative', 'Engineering', 'Commerce', 'Growth', 'Operations']

export default function Headquarters() {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState('ai-boss')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [title, setTitle] = useState('')
  async function refresh() {
    try { setData(await callAiApi('/api/jobs?view=headquarters')); setError('') }
    catch (err) { setError(err.message) }
  }
  useEffect(() => { refresh() }, [])
  const agent = data?.team.find((item) => item.id === selected)
  const agentJobs = data?.jobs.filter((job) => job.assigned_employee === agent?.name) || []
  const nextJob = agentJobs.find((job) => ['assigned', 'queued'].includes(job.status))
  async function enroll() {
    setBusy(true); setNotice(''); setError('')
    try { await callAiApi('/api/jobs?view=headquarters', { method: 'POST', body: { action: 'enroll' } }); await refresh(); setNotice('All 13 roles are enrolled. No AI runs were started.') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function assign() {
    setBusy(true); setNotice(''); setError('')
    try {
      await callAiApi('/api/jobs', { method: 'POST', body: { title: `${agent.name}: first build assignment`, brief: agent.firstAssignment, assigned_employee: agent.name } })
      await refresh(); setNotice('Assignment saved. It will run only when you start it.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  async function run() {
    setBusy(true); setError(''); setNotice('The assigned employee is preparing a draft using the shared build history…')
    try {
      await callAiApi(`/api/jobs/${nextJob.id}`, { method: 'POST' })
      await refresh(); setNotice('The employee’s draft is saved in Deliverables and is available as recent context for the team.')
    } catch (err) { setNotice(''); setError(err.message) }
    finally { setBusy(false) }
  }
  async function saveNote(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await callAiApi('/api/jobs?view=headquarters', { method: 'POST', body: { action: 'note', title, body: note } })
      setTitle(''); setNote(''); await refresh(); setNotice('Build note saved for the team’s next assignments.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div className="hq">
    <header className="hq-header"><div><p className="hq-eyebrow">GENESIS OS / YOUR BUSINESS HEADQUARTERS</p><h1>One building. Your whole team.</h1><p>Build the first business together. Carry what works into the next.</p></div><Link className="hq-link" to="/app/team-lead">Assign work →</Link></header>
    {error && <div role="alert" className="hq-error">{error} <button onClick={refresh}>Retry loading</button></div>}
    {notice && <p role="status" className="hq-notice">{notice}</p>}
    {!data ? <p>Loading your headquarters…</p> : <>
      <div className="hq-stats">
        <div><strong>{data.team.filter((item) => item.enrolled).length} / 13</strong><span>Roles enrolled</span></div>
        <div><strong>{data.jobs.filter((job) => job.status === 'in_progress').length}</strong><span>Jobs in progress</span></div>
        <div><strong>{data.jobs.filter((job) => job.status === 'delivered').length}</strong><span>Delivered jobs</span></div>
        <div><strong>Setup pending</strong><span>Daily automation</span></div>
      </div>
      <section className="hq-mode"><strong>{data.runtime.providerConfigured ? 'AI provider configured · draft work available' : 'AI provider connection needed'}</strong><p>All roles share the build charter and recent notes, job states, and deliverables when they run. Store actions and daily background runs are not connected yet. A configured provider still requires valid credits and a successful run.</p>{data.team.some((item) => !item.enrolled) && <button disabled={busy} onClick={enroll}>Enroll all 13 roles — no AI run</button>}</section>
      <div className="hq-workspace">
        <section className="hq-building" aria-label="Department offices">
          {FLOORS.map((floor, index) => <div className="hq-floor" key={floor}><div className="hq-floor-label"><span>0{index + 1}</span><h2>{floor}</h2></div><div className="hq-offices">{data.team.filter((item) => item.department === floor).map((item) => <button className={`hq-office ${selected === item.id ? 'selected' : ''}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} key={item.id}><strong>{item.name}</strong><span>{item.enrolled ? 'Enrolled · drafts only' : 'Not enrolled'}</span></button>)}</div></div>)}
        </section>
        <aside className="hq-detail" aria-label="Selected agent">
          <p className="hq-eyebrow">{agent.department} OFFICE</p><h2>{agent.name}</h2><p>{agent.mission}</p>
          <h3>Works with</h3><p>{agent.handoff}</p><h3>First assignment</h3><p>{agent.firstAssignment}</p>
          {!nextJob ? <button disabled={busy || !agent.enrolled} onClick={assign}>Save first assignment</button> : <><p className="hq-job-state">Next: {nextJob.title} · {nextJob.status}</p><button disabled={busy || !data.runtime.providerConfigured || !agent.enrolled} onClick={run}>{busy ? 'Please wait…' : 'Run assignment · uses AI credits'}</button></>}
          <p className="hq-small">No purchases, messages, publishing, or store changes are performed by this draft runner.</p><Link to="/app/deliverables">Read finished work →</Link>
          <h3>Recent assignments</h3>{agentJobs.length ? <ul>{agentJobs.slice(0, 5).map((job) => <li key={job.id}>{job.title}<span className="hq-job-state">{job.status}</span></li>)}</ul> : <p>No assignments saved yet.</p>}
        </aside>
      </div>
      <div className="hq-bottom"><section className="hq-panel"><h2>Shared build journal</h2><p>Save decisions and context once. Every role receives recent entries on its next run.</p><form onSubmit={saveNote}><label>Note title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Decision or build update<textarea required maxLength={10000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></label><button disabled={busy || !title.trim() || !note.trim()}>Save for the team</button></form><div className="hq-journal">{data.journal.map((entry) => <article key={entry.id}><time>{new Date(entry.created_at).toLocaleString()}</time><h3>{entry.title}</h3><p>{entry.body}</p></article>)}</div></section>
      <section className="hq-panel"><h2>Owner’s desk</h2><p>Routine draft work can be assigned now. Before operations go live, these items need to be settled:</p><ul><li>AI usage budget and daily run limits.</li><li>Which business and first product to launch.</li><li>Store, channel, design, and fulfillment account connections.</li><li>Standing rules for publishing, refunds, and order charges.</li></ul><h3>Operating boundary</h3><p>New spending, contracts, account access, and exceptions come to you. External actions are unavailable in this build, so no approval here can trigger one.</p><h3>Build sequence</h3><ol><li>Team roster and shared history.</li><li>AI Boss planning and specialist drafts.</li><li>Connect and verify the first store and fulfillment path.</li><li>Enable budgeted daily work and exception approvals.</li><li>Repeat for the next business.</li></ol><Link to="/app/admin-ai-settings">Open AI settings →</Link></section></div>
    </>}
  </div>
}
