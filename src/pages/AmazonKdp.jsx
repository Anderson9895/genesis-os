import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { callAiApi } from '../lib/aiApiClient'
import './AmazonKdp.css'

const STORAGE_KEY = 'genesis-os-amazon-kdp-books'

const starterBooks = [{
  id: 'through-the-doorway-of-time',
  title: 'Through the Doorway of Time',
  author: 'The Time Traveler',
  formats: ['Kindle eBook', 'Paperback'],
  stage: 'Cover & listing setup',
  updatedAt: '2026-09-13',
  checklist: [
    { id: 'interior', label: 'Interior PDF prepared', status: 'ready' },
    { id: 'cover', label: 'Front, spine, and back cover approved', status: 'needs-confirmation' },
    { id: 'metadata', label: 'Title, subtitle, description, and author confirmed', status: 'in-progress' },
    { id: 'keywords', label: 'Seven KDP keyword fields researched', status: 'not-started' },
    { id: 'categories', label: 'KDP categories selected', status: 'not-started' },
    { id: 'rights', label: 'Publishing rights and territories confirmed', status: 'not-started' },
    { id: 'pricing', label: 'Kindle and paperback pricing approved', status: 'not-started' },
    { id: 'preview', label: 'KDP previewer checked page by page', status: 'not-started' },
    { id: 'published', label: 'Amazon review accepted and listing live', status: 'not-started' },
  ],
}]

const statusLabels = {
  ready: 'Ready',
  'in-progress': 'In progress',
  'needs-confirmation': 'Confirm',
  'not-started': 'Not started',
}

export default function AmazonKdp() {
  const [books, setBooks] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || starterBooks }
    catch { return starterBooks }
  })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const book = books[0]

  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(books)) }, [books])

  const progress = useMemo(() => {
    const weights = { ready: 1, 'in-progress': .5, 'needs-confirmation': .25, 'not-started': 0 }
    return Math.round(book.checklist.reduce((sum, item) => sum + weights[item.status], 0) / book.checklist.length * 100)
  }, [book])

  function cycleStatus(id) {
    const order = ['not-started', 'in-progress', 'needs-confirmation', 'ready']
    setBooks((current) => current.map((item) => item.id !== book.id ? item : {
      ...item,
      updatedAt: new Date().toISOString().slice(0, 10),
      checklist: item.checklist.map((step) => step.id === id ? { ...step, status: order[(order.indexOf(step.status) + 1) % order.length] } : step),
    }))
  }

  async function fireAgent() {
    setBusy(true); setNotice(''); setError('')
    try {
      const headquarters = await callAiApi('/api/jobs?view=headquarters')
      const agent = headquarters.team.find((item) => item.id === 'amazon-kdp-manager')
      if (!agent?.enrolled) {
        await callAiApi('/api/jobs?view=headquarters', { method: 'POST', body: { action: 'enroll' } })
      }
      const created = await callAiApi('/api/jobs', {
        method: 'POST',
        body: {
          title: 'KDP launch audit — Through the Doorway of Time',
          brief: `Audit the Amazon KDP launch for Through the Doorway of Time. Current tracker: ${JSON.stringify(book.checklist)}. Prepare metadata, keyword and category research requirements, pricing decision points, asset gaps, and a precise owner action list. Do not claim the book is published or any Amazon action occurred without verified evidence.`,
          assigned_employee: 'Amazon KDP Publishing Manager',
        },
      })
      if (!headquarters.runtime.providerConfigured) {
        setNotice('KDP agent enrolled and its first assignment saved. Connect an AI provider in Admin AI Settings to run the assignment.')
      } else {
        await callAiApi(`/api/jobs/${created.job?.id || created.id}`, { method: 'POST' })
        setNotice('KDP agent is working. Its launch audit will appear in Deliverables when complete.')
      }
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return <div className="kdp-page">
    <header className="kdp-hero">
      <div><p className="kdp-eyebrow">GENESIS OS / PUBLISHING HOUSE</p><h1>Amazon KDP Command Center</h1><p>One honest view of every manuscript, cover, listing, price, launch task, and royalty decision.</p></div>
      <button disabled={busy} onClick={fireAgent}>{busy ? 'Starting agent…' : 'Fire KDP agent'}</button>
    </header>
    {notice && <p className="kdp-notice" role="status">{notice}</p>}
    {error && <p className="kdp-error" role="alert">{error}</p>}

    <section className="kdp-summary">
      <article><span>Active books</span><strong>{books.length}</strong></article>
      <article><span>Current stage</span><strong>{book.stage}</strong></article>
      <article><span>Launch readiness</span><strong>{progress}%</strong></article>
      <article><span>Agent</span><strong>Ready to assign</strong></article>
    </section>

    <div className="kdp-layout">
      <section className="kdp-panel kdp-book">
        <div className="kdp-book-heading"><div><p className="kdp-eyebrow">CURRENT TITLE</p><h2>{book.title}</h2><p>{book.author} · {book.formats.join(' + ')}</p></div><span>{book.stage}</span></div>
        <div className="kdp-progress"><span style={{ width: `${progress}%` }} /></div>
        <p className="kdp-help">Click a task to move its verified status forward. “Ready” should mean you have seen or confirmed the finished item.</p>
        <div className="kdp-checklist">{book.checklist.map((item) => <button key={item.id} onClick={() => cycleStatus(item.id)}><i className={item.status}>{item.status === 'ready' ? '✓' : '•'}</i><span>{item.label}</span><b>{statusLabels[item.status]}</b></button>)}</div>
      </section>

      <aside className="kdp-panel kdp-agent-card">
        <p className="kdp-eyebrow">NEW AI EMPLOYEE</p><h2>Amazon KDP Publishing Manager</h2><p>Coordinates the Story Writer, Design Director, Marketing Manager, Finance Manager, and Legal Research & Review.</p>
        <h3>First assignment</h3><p>Audit the book package and produce the exact remaining steps for Kindle and paperback publication.</p>
        <h3>What it manages</h3><ul><li>Manuscript and cover readiness</li><li>KDP descriptions, keywords, and categories</li><li>Format, territory, pricing, and royalty decisions</li><li>Preview, launch, updates, and performance tracking</li></ul>
        <p className="kdp-boundary">It prepares and tracks the work. Amazon publishing and any paid action still require your approval and a confirmed KDP result.</p>
        <Link to="/app/headquarters">Open Team Headquarters →</Link><Link to="/app/deliverables">Open Deliverables →</Link>
      </aside>
    </div>
  </div>
}
