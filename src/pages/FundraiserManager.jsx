import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import './FundraiserManager.css'

const CAMPAIGN_KEY = '6000-strangers-one-question'
const LOCAL_STORAGE_KEY = 'genesis-os-fundraiser-manager-v2'
const GOAL = 6000
const WEEKLY_PLEDGE = 10
const FUNDRAISER_URL = 'https://gofund.me/123dbac74'
const MILESTONES = [100, 500, 1000, 2500, 4500, 6000]
const LEDGER_TYPES = ['Owner weekly contribution', 'Series earnings', 'Expense']
const SPONSOR_STATUSES = ['Researching', 'Draft ready — not sent', 'Owner-approved to contact', 'Contacted — verified', 'Offer received — document terms', 'Partnership disclosed']
const OPENING_BALANCE = {
  id: 'verified-opening-balance',
  type: 'Verified opening balance',
  amount: 0,
  note: 'Initial verified campaign balance. This is not an owner pledge payment.',
  occurredOn: '2026-08-30',
  verified: true,
  verifiedAt: '2026-08-30T00:00:00.000Z',
}

const ringOptions = ['Classic solitaire', 'Vintage inspired', 'Western engraved', 'Modern minimal']
const destinationOptions = ['Beach', 'Mountain overlook', 'Desert sunset', 'Courthouse + getaway']

const defaultCampaign = {
  goFundMe: {
    amount: 0,
    verifiedAt: null,
    verifiedByOwner: false,
    verificationNote: '',
  },
  ledger: [OPENING_BALANCE],
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
    hook: 'A private love story can still invite an honest question.',
    question: 'Round, oval, pear, or emerald-cut stone—which one feels timeless?',
  },
  {
    hook: 'Suppose the answer is yes. Where should two people disappear to and make it official?',
    question: 'Beach, mountains, desert sunset, or a quiet courthouse followed by a getaway?',
  },
  {
    hook: 'Calling ethical independent jewelers: could your craft become part of one honest love story?',
    question: 'Tag a custom jeweler whose work deserves to be seen. Any partnership will be disclosed clearly.',
  },
  {
    hook: 'This is not a raffle, contest, or promise of fame. It is one person building toward one honest question.',
    question: 'What detail makes an engagement ring feel personal instead of merely expensive?',
  },
  {
    hook: 'A dollar is small. An opinion is free. Both can help shape a proposal without buying influence.',
    question: 'Would you choose a secret proposal or one surrounded by the people you love?',
  },
  {
    hook: 'The person behind this story stays private. The record of money and partnerships will not.',
    question: 'What should tomorrow’s vote decide: stone shape, metal, engraving, or destination?',
  },
]

function makeId(prefix) {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${randomPart}`
}

function localDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatLedgerDate(value) {
  if (!value) return 'Date not recorded'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return parsed.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeCampaign(value) {
  const source = value && typeof value === 'object' ? value : {}
  const verifiedLedger = Array.isArray(source.ledger)
    ? source.ledger.filter((entry) => entry && entry.verified === true)
    : []
  const ledger = verifiedLedger.some((entry) => entry.id === OPENING_BALANCE.id)
    ? verifiedLedger
    : [...verifiedLedger, OPENING_BALANCE]

  // Deliberately do not migrate legacy fundraiserRaised or unverified ledger entries.
  // Older versions could save an amount or log a pledge without an owner confirmation.
  const goFundMe = source.goFundMe?.verifiedByOwner === true
    ? {
        amount: Math.max(0, Number(source.goFundMe.amount || 0)),
        verifiedAt: source.goFundMe.verifiedAt || null,
        verifiedByOwner: true,
        verificationNote: String(source.goFundMe.verificationNote || ''),
      }
    : defaultCampaign.goFundMe

  return {
    ...defaultCampaign,
    ...source,
    goFundMe,
    ledger,
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
  if (!entries.length || entries.every(([, count]) => Number(count) === 0)) return 'No votes recorded'
  return entries.sort((left, right) => Number(right[1]) - Number(left[1]))[0][0]
}

function createDailyPost(campaign) {
  const dayIndex = Math.floor(Date.now() / 86400000) % postPrompts.length
  const prompt = postPrompts[dayIndex]
  const raised = formatCurrency(campaign.goFundMe.amount)
  const remaining = formatCurrency(Math.max(0, GOAL - Number(campaign.goFundMe.amount || 0)))

  return `${prompt.hook}\n\nToday’s question: ${prompt.question}\n\nLatest owner-verified GoFundMe total, recorded manually: ${raised} of ${formatCurrency(GOAL)}. ${remaining} remains to the goal. I have pledged ${formatCurrency(WEEKLY_PLEDGE)} per week; a pledge is recorded only after it is actually paid. All verified series earnings are committed to the campaign.\n\nHer name, face, and location stay private.\n\nComment your answer. If you choose to help, the fundraiser is linked in the bio. No prize, purchase, donor benefit, tax deduction, investment return, or extra voting power is offered.\n\n#6000Strangers #OneQuestion #EngagementRing #LoveStory #ProposalPlanning`
}

function FundraiserManager() {
  const [campaign, setCampaign] = useState(readLocalCampaign)
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState('Loading private campaign records…')
  const [totalForm, setTotalForm] = useState({ amount: '0', verificationNote: '', confirmed: false })
  const [ledgerForm, setLedgerForm] = useState({ type: 'Owner weekly contribution', amount: '10', note: '', occurredOn: localDate(), confirmed: false })
  const [sponsorForm, setSponsorForm] = useState({ name: '', category: 'Jeweler', status: 'Researching', contact: '', notes: '', disclosure: '', confirmed: false })
  const [generatedPost, setGeneratedPost] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadCampaign() {
      const localCampaign = readLocalCampaign()

      if (!isSupabaseConfigured() || !supabase) {
        if (!ignore) {
          setCampaign(localCampaign)
          setTotalForm({ amount: String(localCampaign.goFundMe.amount), verificationNote: localCampaign.goFundMe.verificationNote, confirmed: false })
          setSyncStatus('Private device save active')
          setLoaded(true)
        }
        return
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        const user = userData?.user
        if (!user) throw new Error('Sign in to access private campaign records.')

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
        setTotalForm({ amount: String(next.goFundMe.amount), verificationNote: next.goFundMe.verificationNote, confirmed: false })
        setSyncStatus(data ? `Private cloud record saved ${formatDate(data.updated_at)}` : 'Ready for first private cloud save')
        setLoaded(true)
      } catch (error) {
        if (ignore) return
        setCampaign(localCampaign)
        setTotalForm({ amount: String(localCampaign.goFundMe.amount), verificationNote: localCampaign.goFundMe.verificationNote, confirmed: false })
        setSyncStatus(`Private device save active — ${error?.message || 'cloud sync unavailable'}`)
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
        setSyncStatus(`Private cloud record saved ${formatDate(new Date().toISOString())}`)
      } catch (error) {
        setSyncStatus(`Private device save active — ${error?.message || 'cloud sync unavailable'}`)
      }
    }, 700)

    return () => window.clearTimeout(timer)
  }, [campaign, loaded])

  const verifiedTotal = Number(campaign.goFundMe.amount || 0)
  const progress = Math.min(100, Math.max(0, (verifiedTotal / GOAL) * 100))
  const remaining = Math.max(0, GOAL - verifiedTotal)
  const ownerContributions = useMemo(() => campaign.ledger
    .filter((entry) => entry.type === 'Owner weekly contribution' && entry.verified)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0), [campaign.ledger])
  const seriesEarnings = useMemo(() => campaign.ledger
    .filter((entry) => entry.type === 'Series earnings' && entry.verified)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0), [campaign.ledger])
  const expenses = useMemo(() => campaign.ledger
    .filter((entry) => entry.type === 'Expense' && entry.verified)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0), [campaign.ledger])

  function saveVerifiedTotal(event) {
    event.preventDefault()
    const amount = Number(totalForm.amount || 0)
    if (!Number.isFinite(amount) || amount < 0) {
      setNotice('Enter a valid non-negative total.')
      return
    }
    if (!totalForm.confirmed) {
      setNotice('The total was not saved. Confirm that you personally verified it before recording it.')
      return
    }

    setCampaign((current) => ({
      ...current,
      goFundMe: {
        amount,
        verifiedAt: new Date().toISOString(),
        verifiedByOwner: true,
        verificationNote: totalForm.verificationNote.trim() || 'Owner-confirmed manual entry',
      },
    }))
    setTotalForm((current) => ({ ...current, confirmed: false }))
    setNotice('Owner-verified GoFundMe total saved. No public API was used.')
  }

  function prepareWeeklyPledge() {
    setLedgerForm({ type: 'Owner weekly contribution', amount: String(WEEKLY_PLEDGE), note: '', occurredOn: localDate(), confirmed: false })
    setNotice('Prepared a $10 weekly entry. It will not be recorded until you confirm it was actually paid and add a note or reference.')
  }

  function addLedgerEntry(event) {
    event.preventDefault()
    const amount = Number(ledgerForm.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('Enter a valid amount greater than $0.')
      return
    }
    if (!ledgerForm.note.trim()) {
      setNotice('Add a receipt, payment, or verification reference before saving a financial record.')
      return
    }
    if (!ledgerForm.confirmed) {
      setNotice('This record was not saved. Confirm the payment, earnings, or documented expense first.')
      return
    }

    const entry = {
      id: makeId('ledger'),
      type: ledgerForm.type,
      amount,
      note: ledgerForm.note.trim(),
      occurredOn: ledgerForm.occurredOn || localDate(),
      verified: true,
      verifiedAt: new Date().toISOString(),
    }
    setCampaign((current) => ({ ...current, ledger: [entry, ...current.ledger] }))
    setLedgerForm({ type: 'Owner weekly contribution', amount: String(WEEKLY_PLEDGE), note: '', occurredOn: localDate(), confirmed: false })
    setNotice('Verified financial record saved.')
  }

  function addSponsor(event) {
    event.preventDefault()
    if (!sponsorForm.name.trim() || !sponsorForm.contact.trim()) {
      setNotice('Add the business name and a public contact method for a sponsor or vendor record.')
      return
    }
    if (!sponsorForm.confirmed) {
      setNotice('Confirm that this is a real, sourced business or vendor record before saving it.')
      return
    }
    if (sponsorForm.status === 'Partnership disclosed' && !sponsorForm.disclosure.trim()) {
      setNotice('Add the public disclosure wording before recording a disclosed partnership.')
      return
    }

    const sponsor = {
      id: makeId('sponsor'),
      ...sponsorForm,
      name: sponsorForm.name.trim(),
      contact: sponsorForm.contact.trim(),
      notes: sponsorForm.notes.trim(),
      disclosure: sponsorForm.disclosure.trim(),
      confirmed: true,
      createdAt: new Date().toISOString(),
    }
    setCampaign((current) => ({ ...current, sponsors: [sponsor, ...current.sponsors] }))
    setSponsorForm({ name: '', category: 'Jeweler', status: 'Researching', contact: '', notes: '', disclosure: '', confirmed: false })
    setNotice('Private vendor record saved. No outreach or partnership was sent or accepted.')
  }

  function updateSponsorStatus(id, status) {
    const sponsor = campaign.sponsors.find((item) => item.id === id)
    if (status === 'Partnership disclosed' && !sponsor?.disclosure) {
      setNotice('Status unchanged. Add the public disclosure wording before recording a disclosed partnership.')
      return
    }
    setCampaign((current) => ({
      ...current,
      sponsors: current.sponsors.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item),
    }))
    setNotice('Status updated. Record only real, owner-approved external activity; disclose any partnership, gift, or discount publicly.')
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
    setNotice('Draft generated. Review it before any external use; this control surface never publishes it.')
  }

  function savePost() {
    if (!generatedPost.trim()) return
    const post = { id: makeId('post'), content: generatedPost, createdAt: new Date().toISOString(), status: 'Draft — not published' }
    setCampaign((current) => ({ ...current, savedPosts: [post, ...current.savedPosts] }))
    setNotice('Draft saved to private post history.')
  }

  async function copyPost() {
    if (!generatedPost.trim() || !navigator.clipboard) return
    await navigator.clipboard.writeText(generatedPost)
    setNotice('Draft copied. Copying does not publish it.')
  }

  function markPostPublished(id) {
    setCampaign((current) => ({
      ...current,
      savedPosts: current.savedPosts.map((post) => post.id === id ? { ...post, status: 'Published — owner-recorded', publishedAt: new Date().toISOString() } : post),
    }))
    setNotice('Publication history updated as an owner record; no post was published by Genesis OS.')
  }

  return (
    <section className="fundraiser-page">
      <header className="fundraiser-hero">
        <div>
          <p className="fundraiser-kicker">Genesis OS · Private campaign control surface</p>
          <h1>6,000 Strangers. One Question.</h1>
          <p>Track a $6,000 engagement-ring goal while keeping the woman’s identity, face, and location private.</p>
          <div className="fundraiser-hero-actions">
            <a className="primary-action" href={FUNDRAISER_URL} target="_blank" rel="noreferrer">Open public fundraiser</a>
            <button type="button" className="secondary-action" onClick={generatePost}>Generate a draft post</button>
          </div>
        </div>
        <div className="fundraiser-sync-card">
          <span>Private record status</span>
          <strong>OWNER AREA</strong>
          <small>{syncStatus}</small>
          <small>Public organizer: 6,000 Strangers.</small>
          <small>Public location displayed: Malad City, Idaho.</small>
        </div>
      </header>

      <div className="fundraiser-progress-card">
        <div className="fundraiser-progress-top">
          <div><span>Latest verified GoFundMe total</span><strong>{formatCurrency(verifiedTotal)}</strong></div>
          <div><span>Goal</span><strong>{formatCurrency(GOAL)}</strong></div>
          <div><span>Still needed</span><strong>{formatCurrency(remaining)}</strong></div>
          <div><span>Progress</span><strong>{progress.toFixed(1)}%</strong></div>
        </div>
        <div className="fundraiser-progress-track" aria-label={`${progress.toFixed(1)} percent funded`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <form className="fundraiser-stack-form total-verification-form" onSubmit={saveVerifiedTotal}>
          <div className="fundraiser-panel-heading compact-heading"><div><span>Manual verification required</span><h3>Record a verified public total</h3></div><b>No GoFundMe API</b></div>
          <p className="fundraiser-muted">The initial verified baseline is $0.00. Genesis OS does not auto-read or invent campaign totals—enter a newer figure only after you personally verify it on the public fundraiser.</p>
          <div className="fundraiser-form-row">
            <label>Verified total (USD)<input type="number" min="0" step="0.01" value={totalForm.amount} onChange={(event) => setTotalForm((current) => ({ ...current, amount: event.target.value }))} /></label>
            <label>Verification note / page check<input type="text" placeholder="Example: Checked public page manually" value={totalForm.verificationNote} onChange={(event) => setTotalForm((current) => ({ ...current, verificationNote: event.target.value }))} /></label>
          </div>
          <label className="fundraiser-check"><input type="checkbox" checked={totalForm.confirmed} onChange={(event) => setTotalForm((current) => ({ ...current, confirmed: event.target.checked }))} /> I personally verified this figure and authorize it as the latest total.</label>
          <div className="fundraiser-actions"><button className="primary-action" type="submit">Save verified total</button><small>Current record: {campaign.goFundMe.verifiedByOwner ? `owner-verified ${formatDate(campaign.goFundMe.verifiedAt)}` : 'verified $0 baseline; no newer owner-confirmed figure'}</small></div>
        </form>
      </div>

      <div className="fundraiser-stat-grid">
        <article><span>Owner contributions paid</span><strong>{formatCurrency(ownerContributions)}</strong><small>$10/week pledge is excluded until owner-confirmed paid.</small></article>
        <article><span>Verified series earnings</span><strong>{formatCurrency(seriesEarnings)}</strong><small>Only actual, verified earnings are recorded.</small></article>
        <article><span>Documented expenses</span><strong>{formatCurrency(expenses)}</strong><small>Ring, taxes/fees, proposal or elopement only.</small></article>
        <article><span>Vendor / sponsor pipeline</span><strong>{campaign.sponsors.length}</strong><small>{campaign.sponsors.filter((item) => item.status === 'Partnership disclosed').length} disclosed partnership records</small></article>
      </div>

      <div className="fundraiser-main-grid">
        <section className="fundraiser-panel fundraiser-post-studio">
          <div className="fundraiser-panel-heading"><div><span>Draft-only content</span><h2>Post Studio</h2></div><b>Faceless + private</b></div>
          <p className="fundraiser-muted">Each draft includes privacy language, a manually verified total, a comment question, and no claim that she is famous. Genesis OS never auto-publishes.</p>
          <div className="fundraiser-actions">
            <button className="primary-action" type="button" onClick={generatePost}>Generate draft</button>
            <button className="secondary-action" type="button" onClick={copyPost} disabled={!generatedPost}>Copy draft</button>
            <button className="secondary-action" type="button" onClick={savePost} disabled={!generatedPost}>Save draft</button>
          </div>
          <textarea value={generatedPost} onChange={(event) => setGeneratedPost(event.target.value)} placeholder="Generate a post, then edit it here before any owner-approved publication." rows="14" />
        </section>

        <section className="fundraiser-panel">
          <div className="fundraiser-panel-heading"><div><span>Verified money trail</span><h2>Campaign Ledger</h2></div><b>Private + owner-recorded</b></div>
          <p className="fundraiser-muted">Nothing enters this ledger until it is actually paid, earned, or documented. The $10 weekly pledge is a commitment—not money received.</p>
          <button type="button" className="weekly-pledge-button" onClick={prepareWeeklyPledge}>Prepare this week’s $10 entry (not paid)</button>
          <form className="fundraiser-stack-form" onSubmit={addLedgerEntry}>
            <div className="fundraiser-form-row">
              <label>Record type<select value={ledgerForm.type} onChange={(event) => setLedgerForm((current) => ({ ...current, type: event.target.value, amount: event.target.value === 'Owner weekly contribution' ? String(WEEKLY_PLEDGE) : current.amount }))}>{LEDGER_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>Amount (USD)<input type="number" min="0.01" step="0.01" value={ledgerForm.amount} onChange={(event) => setLedgerForm((current) => ({ ...current, amount: event.target.value }))} /></label>
            </div>
            <div className="fundraiser-form-row"><label>Date paid / earned / spent<input type="date" value={ledgerForm.occurredOn} onChange={(event) => setLedgerForm((current) => ({ ...current, occurredOn: event.target.value }))} /></label><label>Receipt, payment, or verification reference<input type="text" placeholder="Required: receipt, platform, or owner confirmation" value={ledgerForm.note} onChange={(event) => setLedgerForm((current) => ({ ...current, note: event.target.value }))} /></label></div>
            <label className="fundraiser-check"><input type="checkbox" checked={ledgerForm.confirmed} onChange={(event) => setLedgerForm((current) => ({ ...current, confirmed: event.target.checked }))} /> I confirm this is an actual paid, earned, or documented expense—not a pledge or estimate.</label>
            <button className="secondary-action" type="submit">Add verified record</button>
          </form>
          <div className="fundraiser-record-list">
            {campaign.ledger.slice(0, 8).map((entry) => <article key={entry.id}><div><strong>{entry.type} · verified</strong><small>{formatLedgerDate(entry.occurredOn)} · {entry.note}</small></div><b>{formatCurrency(entry.amount)}</b></article>)}
            {!campaign.ledger.length ? <p className="fundraiser-empty">No verified financial records yet. The initial ledger total is $0.00.</p> : null}
          </div>
        </section>
      </div>

      <div className="fundraiser-main-grid">
        <section className="fundraiser-panel">
          <div className="fundraiser-panel-heading"><div><span>Manual comment tallies</span><h2>Comment Vote Counter</h2></div><b>Ring leader: {winningOption(campaign.votes.ring)}</b></div>
          <p className="fundraiser-muted">Count real comments manually. Donations never provide extra voting power.</p>
          <h3>Ring style</h3>
          <div className="vote-grid">{ringOptions.map((option) => <button type="button" key={option} onClick={() => addVote('ring', option)}><span>{option}</span><strong>{campaign.votes.ring[option]}</strong><small>Record +1 comment vote</small></button>)}</div>
          <h3>Possible elopement setting</h3>
          <div className="vote-grid">{destinationOptions.map((option) => <button type="button" key={option} onClick={() => addVote('destination', option)}><span>{option}</span><strong>{campaign.votes.destination[option]}</strong><small>Record +1 comment vote</small></button>)}</div>
        </section>

        <section className="fundraiser-panel">
          <div className="fundraiser-panel-heading"><div><span>Partnership pipeline</span><h2>Sponsors & Vendors</h2></div><b>Disclosure required</b></div>
          <p className="fundraiser-muted">Store sourced leads only. No outreach, acceptance, gift, discount, or vendor partnership is created here; obtain owner approval first and disclose every arrangement publicly.</p>
          <form className="fundraiser-stack-form" onSubmit={addSponsor}>
            <input required placeholder="Business or contact name" value={sponsorForm.name} onChange={(event) => setSponsorForm((current) => ({ ...current, name: event.target.value }))} />
            <div className="fundraiser-form-row"><select value={sponsorForm.category} onChange={(event) => setSponsorForm((current) => ({ ...current, category: event.target.value }))}><option>Jeweler</option><option>Photographer</option><option>Venue</option><option>Florist</option><option>Lodging</option><option>Officiant</option><option>Travel</option><option>Other</option></select><select value={sponsorForm.status} onChange={(event) => setSponsorForm((current) => ({ ...current, status: event.target.value }))}>{SPONSOR_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div>
            <input required placeholder="Public contact method" value={sponsorForm.contact} onChange={(event) => setSponsorForm((current) => ({ ...current, contact: event.target.value }))} />
            <input placeholder="Fit, proposed partnership, or owner-approved follow-up" value={sponsorForm.notes} onChange={(event) => setSponsorForm((current) => ({ ...current, notes: event.target.value }))} />
            <input placeholder="Required if a partnership exists: public disclosure wording" value={sponsorForm.disclosure} onChange={(event) => setSponsorForm((current) => ({ ...current, disclosure: event.target.value }))} />
            <label className="fundraiser-check"><input type="checkbox" checked={sponsorForm.confirmed} onChange={(event) => setSponsorForm((current) => ({ ...current, confirmed: event.target.checked }))} /> I confirm this is a real, sourced vendor record; no contact or partnership is being implied unless documented.</label>
            <button className="primary-action" type="submit">Save private vendor record</button>
          </form>
          <div className="fundraiser-record-list sponsor-list">
            {campaign.sponsors.map((sponsor) => <article key={sponsor.id}><div><strong>{sponsor.name}</strong><small>{sponsor.category} · {sponsor.contact}{sponsor.notes ? ` · ${sponsor.notes}` : ''}{sponsor.disclosure ? ` · Disclosure: ${sponsor.disclosure}` : ''}</small></div><select value={sponsor.status} onChange={(event) => updateSponsorStatus(sponsor.id, event.target.value)}>{SPONSOR_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></article>)}
            {!campaign.sponsors.length ? <p className="fundraiser-empty">No vendor records yet. Start with a real, sourced business and a public contact method.</p> : null}
          </div>
        </section>
      </div>

      <section className="fundraiser-panel">
        <div className="fundraiser-panel-heading"><div><span>Momentum map</span><h2>Milestones & Post History</h2></div><b>{campaign.savedPosts.length} drafts recorded</b></div>
        <div className="milestone-row">{MILESTONES.map((amount) => <article className={verifiedTotal >= amount ? 'reached' : ''} key={amount}><span>{verifiedTotal >= amount ? 'Reached by verified total' : 'Next verified milestone'}</span><strong>{formatCurrency(amount)}</strong></article>)}</div>
        <div className="fundraiser-record-list post-history">
          {campaign.savedPosts.slice(0, 10).map((post) => <article key={post.id}><div><strong>{post.status} · {formatDate(post.createdAt)}</strong><small>{post.content.slice(0, 180)}{post.content.length > 180 ? '…' : ''}</small></div>{post.status === 'Draft — not published' ? <button type="button" className="secondary-action" onClick={() => markPostPublished(post.id)}>Record owner-published</button> : <b>Owner-recorded</b>}</article>)}
          {!campaign.savedPosts.length ? <p className="fundraiser-empty">Saved post drafts and owner-recorded publication history will appear here.</p> : null}
        </div>
      </section>

      {notice ? <p className="fundraiser-notice" role="status">{notice}</p> : null}
      <footer className="fundraiser-guardrails">
        <strong>Campaign guardrails</strong>
        <span>Manual verified totals only</span><span>Paid records only</span><span>No false fame claims</span><span>No raffle, prize, purchase, or donor benefit</span><span>No extra voting power</span><span>Disclose every sponsorship, gift, discount, and vendor partnership</span><span>Private identity stays private</span>
      </footer>
    </section>
  )
}

export default FundraiserManager
