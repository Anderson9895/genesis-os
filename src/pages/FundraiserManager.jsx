import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import './FundraiserManager.css'

const CAMPAIGN_KEY = '6000-strangers-one-question'
const LOCAL_STORAGE_KEY = 'genesis-os-fundraiser-manager-v1'
const GOAL = 6000
const WEEKLY_PLEDGE = 10
const FUNDRAISER_URL = 'https://gofund.me/123dbac74'

const ringOptions = ['Classic solitaire', 'Vintage inspired', 'Western engraved', 'Modern minimal']
const destinationOptions = ['Beach', 'Mountain overlook', 'Desert sunset', 'Courthouse + getaway']

const defaultCampaign = {
  fundraiserRaised: 0,
  lastSyncedAt: null,
  ledger: [],
  sponsors: [],
  savedPosts: [],
  votes: {
    ring: Object.fromEntries(ringOptions.map((option) => [option, 0])),
    destination: Object.fromEntries(destinationOptions.map((option) => [option, 0])),
  },
}

const postPrompts = [
  {
    hook: '6,000 strangers. One question: which ring would you choose for the person you love most?',
    question: 'Classic solitaire, vintage inspired, western engraved, or modern minimal?',
  },
  {
    hook: 'She has no idea 6,000 strangers are helping shape one very important question.',
    question: 'Round, oval, pear, or emerald-cut stone—which one feels timeless?',
  },
  {
    hook: 'Suppose the answer is yes. Where should two people disappear to and make it official?',
    question: 'Beach, mountains, desert sunset, or a quiet courthouse followed by an unforgettable getaway?',
  },
  {
    hook: 'Calling ethical independent jewelers: could your craft become part of one honest love story?',
    question: 'Tag a custom jeweler whose work deserves to be seen. Any partnership will be disclosed clearly.',
  },
  {
    hook: 'This is not a raffle, a contest, or a promise of fame. It is one man building toward one honest question.',
    question: 'What detail makes an engagement ring feel personal instead of merely expensive?',
  },
  {
    hook: 'A dollar is small. An opinion is free. Together, both can help shape a proposal she will never forget.',
    question: 'Would you choose a secret proposal or one surrounded by the people you love?',
  },
  {
    hook: 'The woman behind this story stays private—but the progress will never be hidden.',
    question: 'What should tomorrow’s vote decide: stone shape, metal, engraving, or destination?',
  },
]

function makeId(prefix) {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${randomPart}`
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function formatDate(value) {
  if (!value) return 'Not synced yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function normalizeCampaign(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    ...defaultCampaign,
    ...source,
    ledger: Array.isArray(source.ledger) ? source.ledger : [],
    sponsors: Array.isArray(source.sponsors) ? source.sponsors : [],
    savedPosts: Array.isArray(source.savedPosts) ? source.savedPosts : [],
    votes: {
      ring: { ...defaultCampaign.votes.ring, ...(source.votes?.ring || {}) },
      destination: { ...defaultCampaign.votes.destination, ...(source.votes?.destination || {}) },
    },
  }
}

function readLocalCampaign() {
  if (typeof window === 'undefined') return defaultCampaign
  try {
    return normalizeCampaign(JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY) || '{}'))
  } catch {
    return defaultCampaign
  }
}

function winningOption(votes) {
  const entries = Object.entries(votes || {})
  if (!entries.length || entries.every(([, count]) => Number(count) === 0)) return 'No votes yet'
  return entries.sort((left, right) => Number(right[1]) - Number(left[1]))[0][0]
}

function createDailyPost(campaign) {
  const dayIndex = Math.floor(Date.now() / 86400000) % postPrompts.length
  const prompt = postPrompts[dayIndex]
  const raised = formatCurrency(campaign.fundraiserRaised)
  const remaining = formatCurrency(Math.max(0, GOAL - Number(campaign.fundraiserRaised || 0)))

  return `${prompt.hook}\n\nToday’s question: ${prompt.question}\n\nProgress: ${raised} of ${formatCurrency(GOAL)} raised, with ${remaining} to go. I contribute ${formatCurrency(WEEKLY_PLEDGE)} every week, and all earnings from this series go toward the ring fund.\n\nHer name, face, and location stay private. If she says yes and freely agrees, supporters may meet her after the proposal.\n\nComment your answer. If you choose to help, the fundraiser is linked in the bio. No prize, purchase, or extra voting power is offered.\n\n#6000Strangers #OneQuestion #EngagementRing #LoveStory #ProposalPlanning`
}

function FundraiserManager() {
  const [campaign, setCampaign] = useState(readLocalCampaign)
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState('Loading campaign records…')
  const [raisedInput, setRaisedInput] = useState('0')
  const [ledgerForm, setLedgerForm] = useState({ type: 'Personal contribution', amount: '10', note: '' })
  const [sponsorForm, setSponsorForm] = useState({ name: '', category: 'Jeweler', status: 'Lead', contact: '', notes: '' })
  const [generatedPost, setGeneratedPost] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadCampaign() {
      const localCampaign = readLocalCampaign()

      if (!isSupabaseConfigured() || !supabase) {
        if (!ignore) {
          setCampaign(localCampaign)
          setRaisedInput(String(localCampaign.fundraiserRaised || 0))
          setSyncStatus('Saved on this device')
          setLoaded(true)
        }
        return
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        const user = userData?.user
        if (!user) throw new Error('Sign in to sync campaign records.')

        const { data, error } = await supabase
          .from('fundraiser_campaigns')
          .select('campaign_data, updated_at')
          .eq('user_id', user.id)
          .eq('campaign_key', CAMPAIGN_KEY)
          .maybeSingle()

        if (error) throw error
        if (ignore) return

        const next = data?.campaign_data ? normalizeCampaign(data.campaign_data) : localCampaign
        setCampaign(next)
        setRaisedInput(String(next.fundraiserRaised || 0))
        setSyncStatus(data ? `Cloud synced ${formatDate(data.updated_at)}` : 'Ready for first cloud save')
        setLoaded(true)
      } catch (error) {
        if (ignore) return
        setCampaign(localCampaign)
        setRaisedInput(String(localCampaign.fundraiserRaised || 0))
        setSyncStatus(`Device save active — ${error?.message || 'cloud sync unavailable'}`)
        setLoaded(true)
      }
    }

    loadCampaign()
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    if (!loaded || typeof window === 'undefined') return undefined

    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(campaign))
    const timer = window.setTimeout(async () => {
      if (!isSupabaseConfigured() || !supabase) return

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        const user = userData?.user
        if (!user) return

        const { error } = await supabase
          .from('fundraiser_campaigns')
          .upsert({
            user_id: user.id,
            campaign_key: CAMPAIGN_KEY,
            campaign_data: campaign,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,campaign_key' })

        if (error) throw error
        setSyncStatus(`Cloud synced ${formatDate(new Date().toISOString())}`)
      } catch (error) {
        setSyncStatus(`Saved on device — ${error?.message || 'cloud sync unavailable'}`)
      }
    }, 700)

    return () => window.clearTimeout(timer)
  }, [campaign, loaded])

  const progress = Math.min(100, Math.max(0, (Number(campaign.fundraiserRaised || 0) / GOAL) * 100))
  const remaining = Math.max(0, GOAL - Number(campaign.fundraiserRaised || 0))
  const personalTotal = useMemo(() => campaign.ledger
    .filter((entry) => entry.type === 'Personal contribution')
    .reduce((total, entry) => total + Number(entry.amount || 0), 0), [campaign.ledger])
  const seriesEarnings = useMemo(() => campaign.ledger
    .filter((entry) => entry.type === 'Series earnings')
    .reduce((total, entry) => total + Number(entry.amount || 0), 0), [campaign.ledger])
  const expenses = useMemo(() => campaign.ledger
    .filter((entry) => entry.type === 'Expense')
    .reduce((total, entry) => total + Number(entry.amount || 0), 0), [campaign.ledger])

  function syncRaised(event) {
    event.preventDefault()
    const amount = Math.max(0, Number(raisedInput || 0))
    setCampaign((current) => ({ ...current, fundraiserRaised: amount, lastSyncedAt: new Date().toISOString() }))
  }

  function addLedgerEntry(event) {
    event.preventDefault()
    const amount = Number(ledgerForm.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) return

    const entry = {
      id: makeId('ledger'),
      type: ledgerForm.type,
      amount,
      note: ledgerForm.note.trim(),
      date: new Date().toISOString(),
    }
    setCampaign((current) => ({ ...current, ledger: [entry, ...current.ledger] }))
    setLedgerForm((current) => ({ ...current, amount: current.type === 'Personal contribution' ? '10' : '', note: '' }))
  }

  function logWeeklyPledge() {
    const entry = {
      id: makeId('ledger'),
      type: 'Personal contribution',
      amount: WEEKLY_PLEDGE,
      note: 'Weekly campaign pledge logged',
      date: new Date().toISOString(),
    }
    setCampaign((current) => ({ ...current, ledger: [entry, ...current.ledger] }))
  }

  function addSponsor(event) {
    event.preventDefault()
    if (!sponsorForm.name.trim()) return
    const sponsor = { id: makeId('sponsor'), ...sponsorForm, name: sponsorForm.name.trim(), createdAt: new Date().toISOString() }
    setCampaign((current) => ({ ...current, sponsors: [sponsor, ...current.sponsors] }))
    setSponsorForm({ name: '', category: 'Jeweler', status: 'Lead', contact: '', notes: '' })
  }

  function updateSponsorStatus(id, status) {
    setCampaign((current) => ({
      ...current,
      sponsors: current.sponsors.map((sponsor) => sponsor.id === id ? { ...sponsor, status } : sponsor),
    }))
  }

  function addVote(group, option) {
    setCampaign((current) => ({
      ...current,
      votes: {
        ...current.votes,
        [group]: { ...current.votes[group], [option]: Number(current.votes[group]?.[option] || 0) + 1 },
      },
    }))
  }

  function generatePost() {
    setGeneratedPost(createDailyPost(campaign))
    setCopyStatus('')
  }

  function savePost() {
    if (!generatedPost.trim()) return
    const post = { id: makeId('post'), content: generatedPost, createdAt: new Date().toISOString(), status: 'Draft' }
    setCampaign((current) => ({ ...current, savedPosts: [post, ...current.savedPosts] }))
    setCopyStatus('Saved to campaign history')
  }

  async function copyPost() {
    if (!generatedPost.trim() || !navigator.clipboard) return
    await navigator.clipboard.writeText(generatedPost)
    setCopyStatus('Copied—ready to paste into TikTok')
  }

  function markPostPublished(id) {
    setCampaign((current) => ({
      ...current,
      savedPosts: current.savedPosts.map((post) => post.id === id ? { ...post, status: 'Published', publishedAt: new Date().toISOString() } : post),
    }))
  }

  const milestones = [100, 500, 1000, 2500, 4500, 6000]

  return (
    <section className="fundraiser-page">
      <header className="fundraiser-hero">
        <div>
          <p className="fundraiser-kicker">Genesis OS · Fundraiser Manager</p>
          <h1>6,000 Strangers. One Question.</h1>
          <p>Manage the campaign, protect the mystery, and keep every dollar and partnership transparent.</p>
          <div className="fundraiser-hero-actions">
            <a className="primary-action" href={FUNDRAISER_URL} target="_blank" rel="noreferrer">Open GoFundMe</a>
            <button type="button" className="secondary-action" onClick={generatePost}>Generate Today’s Post</button>
          </div>
        </div>
        <div className="fundraiser-sync-card">
          <span>Campaign status</span>
          <strong>LIVE</strong>
          <small>{syncStatus}</small>
          <small>Public organizer: 6,000 Strangers</small>
          <small>Public location: Malad City, ID</small>
        </div>
      </header>

      <div className="fundraiser-progress-card">
        <div className="fundraiser-progress-top">
          <div><span>GoFundMe total</span><strong>{formatCurrency(campaign.fundraiserRaised)}</strong></div>
          <div><span>Goal</span><strong>{formatCurrency(GOAL)}</strong></div>
          <div><span>Still needed</span><strong>{formatCurrency(remaining)}</strong></div>
          <div><span>Progress</span><strong>{progress.toFixed(1)}%</strong></div>
        </div>
        <div className="fundraiser-progress-track" aria-label={`${progress.toFixed(1)} percent funded`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <form className="fundraiser-inline-form" onSubmit={syncRaised}>
          <label>Update the public GoFundMe total
            <input type="number" min="0" step="0.01" value={raisedInput} onChange={(event) => setRaisedInput(event.target.value)} />
          </label>
          <button className="primary-action" type="submit">Save Total</button>
          <small>Last manual check: {formatDate(campaign.lastSyncedAt)}</small>
        </form>
      </div>

      <div className="fundraiser-stat-grid">
        <article><span>Your logged contributions</span><strong>{formatCurrency(personalTotal)}</strong><small>{formatCurrency(WEEKLY_PLEDGE)} weekly rule</small></article>
        <article><span>Series earnings logged</span><strong>{formatCurrency(seriesEarnings)}</strong><small>All committed to the campaign</small></article>
        <article><span>Expenses logged</span><strong>{formatCurrency(expenses)}</strong><small>Ring, tax, fees, proposal or elopement</small></article>
        <article><span>Sponsor pipeline</span><strong>{campaign.sponsors.length}</strong><small>{campaign.sponsors.filter((item) => item.status === 'Committed').length} committed</small></article>
      </div>

      <div className="fundraiser-main-grid">
        <section className="fundraiser-panel fundraiser-post-studio">
          <div className="fundraiser-panel-heading"><div><span>Daily attention engine</span><h2>Post Studio</h2></div><b>Faceless + anonymous</b></div>
          <p className="fundraiser-muted">Every draft includes honest privacy language, the current total, a question that invites comments, and no suggestion that she is famous.</p>
          <div className="fundraiser-actions">
            <button className="primary-action" type="button" onClick={generatePost}>Generate Today’s Post</button>
            <button className="secondary-action" type="button" onClick={copyPost} disabled={!generatedPost}>Copy</button>
            <button className="secondary-action" type="button" onClick={savePost} disabled={!generatedPost}>Save Draft</button>
          </div>
          <textarea value={generatedPost} onChange={(event) => setGeneratedPost(event.target.value)} placeholder="Generate a post, then edit it here before publishing." rows="14" />
          {copyStatus ? <p className="fundraiser-notice">{copyStatus}</p> : null}
        </section>

        <section className="fundraiser-panel">
          <div className="fundraiser-panel-heading"><div><span>Money trail</span><h2>Campaign Ledger</h2></div><b>Private</b></div>
          <button type="button" className="weekly-pledge-button" onClick={logWeeklyPledge}>+ Log this week’s {formatCurrency(WEEKLY_PLEDGE)}</button>
          <form className="fundraiser-stack-form" onSubmit={addLedgerEntry}>
            <select value={ledgerForm.type} onChange={(event) => setLedgerForm((current) => ({ ...current, type: event.target.value }))}>
              <option>Personal contribution</option><option>Series earnings</option><option>Sponsor value</option><option>Expense</option>
            </select>
            <input type="number" min="0.01" step="0.01" placeholder="Amount" value={ledgerForm.amount} onChange={(event) => setLedgerForm((current) => ({ ...current, amount: event.target.value }))} />
            <input type="text" placeholder="Note or receipt reference" value={ledgerForm.note} onChange={(event) => setLedgerForm((current) => ({ ...current, note: event.target.value }))} />
            <button className="secondary-action" type="submit">Add Record</button>
          </form>
          <div className="fundraiser-record-list">
            {campaign.ledger.slice(0, 8).map((entry) => <article key={entry.id}><div><strong>{entry.type}</strong><small>{formatDate(entry.date)}{entry.note ? ` · ${entry.note}` : ''}</small></div><b>{formatCurrency(entry.amount)}</b></article>)}
            {!campaign.ledger.length ? <p className="fundraiser-empty">No records yet. Log the first weekly contribution when it is paid.</p> : null}
          </div>
        </section>
      </div>

      <div className="fundraiser-main-grid">
        <section className="fundraiser-panel">
          <div className="fundraiser-panel-heading"><div><span>Audience decisions</span><h2>Comment Vote Counter</h2></div><b>Ring leader: {winningOption(campaign.votes.ring)}</b></div>
          <h3>Ring style</h3>
          <div className="vote-grid">{ringOptions.map((option) => <button type="button" key={option} onClick={() => addVote('ring', option)}><span>{option}</span><strong>{campaign.votes.ring[option]}</strong><small>+1 vote</small></button>)}</div>
          <h3>Possible elopement setting</h3>
          <div className="vote-grid">{destinationOptions.map((option) => <button type="button" key={option} onClick={() => addVote('destination', option)}><span>{option}</span><strong>{campaign.votes.destination[option]}</strong><small>+1 vote</small></button>)}</div>
        </section>

        <section className="fundraiser-panel">
          <div className="fundraiser-panel-heading"><div><span>Partnership pipeline</span><h2>Sponsors & Vendors</h2></div><b>Disclosure required</b></div>
          <form className="fundraiser-stack-form" onSubmit={addSponsor}>
            <input required placeholder="Business or contact name" value={sponsorForm.name} onChange={(event) => setSponsorForm((current) => ({ ...current, name: event.target.value }))} />
            <div className="fundraiser-form-row">
              <select value={sponsorForm.category} onChange={(event) => setSponsorForm((current) => ({ ...current, category: event.target.value }))}><option>Jeweler</option><option>Photographer</option><option>Venue</option><option>Florist</option><option>Lodging</option><option>Officiant</option><option>Travel</option><option>Other</option></select>
              <select value={sponsorForm.status} onChange={(event) => setSponsorForm((current) => ({ ...current, status: event.target.value }))}><option>Lead</option><option>Contacted</option><option>Interested</option><option>Committed</option><option>Declined</option></select>
            </div>
            <input placeholder="Public contact handle or email" value={sponsorForm.contact} onChange={(event) => setSponsorForm((current) => ({ ...current, contact: event.target.value }))} />
            <input placeholder="Offer, follow-up date, or notes" value={sponsorForm.notes} onChange={(event) => setSponsorForm((current) => ({ ...current, notes: event.target.value }))} />
            <button className="primary-action" type="submit">Add Sponsor Lead</button>
          </form>
          <div className="fundraiser-record-list sponsor-list">
            {campaign.sponsors.map((sponsor) => <article key={sponsor.id}><div><strong>{sponsor.name}</strong><small>{sponsor.category}{sponsor.contact ? ` · ${sponsor.contact}` : ''}{sponsor.notes ? ` · ${sponsor.notes}` : ''}</small></div><select value={sponsor.status} onChange={(event) => updateSponsorStatus(sponsor.id, event.target.value)}><option>Lead</option><option>Contacted</option><option>Interested</option><option>Committed</option><option>Declined</option></select></article>)}
            {!campaign.sponsors.length ? <p className="fundraiser-empty">No sponsor leads yet. Begin with independent jewelers whose style fits the campaign.</p> : null}
          </div>
        </section>
      </div>

      <section className="fundraiser-panel">
        <div className="fundraiser-panel-heading"><div><span>Momentum map</span><h2>Milestones & Post History</h2></div><b>{campaign.savedPosts.length} drafts saved</b></div>
        <div className="milestone-row">{milestones.map((amount) => <article className={campaign.fundraiserRaised >= amount ? 'reached' : ''} key={amount}><span>{campaign.fundraiserRaised >= amount ? '✓ Reached' : 'Next'}</span><strong>{formatCurrency(amount)}</strong></article>)}</div>
        <div className="fundraiser-record-list post-history">
          {campaign.savedPosts.slice(0, 10).map((post) => <article key={post.id}><div><strong>{post.status} · {formatDate(post.createdAt)}</strong><small>{post.content.slice(0, 180)}…</small></div>{post.status !== 'Published' ? <button type="button" className="secondary-action" onClick={() => markPostPublished(post.id)}>Mark Published</button> : <b>Published</b>}</article>)}
          {!campaign.savedPosts.length ? <p className="fundraiser-empty">Saved daily posts will appear here.</p> : null}
        </div>
      </section>

      <footer className="fundraiser-guardrails">
        <strong>Campaign guardrails</strong>
        <span>No false fame claims</span><span>No raffles or prizes</span><span>No extra voting power for donors</span><span>Disclose every sponsorship</span><span>Reveal only after a successful proposal and her consent</span><span>Banking and withdrawals stay under your control</span>
      </footer>
    </section>
  )
}

export default FundraiserManager
