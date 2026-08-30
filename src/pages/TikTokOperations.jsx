import { useEffect, useMemo, useState } from 'react'
import { callApi } from '../lib/apiClient'
import './TikTokOperations.css'

const defaultForm = {
  title: '6,000 Strangers — Daily Video',
  caption: '6,000 strangers. One question. Help choose the details of one honest proposal. #6000Strangers #OneQuestion #EngagementRing #ProposalPlanning #LoveStory',
  media_url: '',
  scheduled_for: '',
  privacy_level: 'SELF_ONLY',
  disable_comment: false,
  disable_duet: false,
  disable_stitch: false,
}

function formatDate(value) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

function statusLabel(value) {
  return String(value || 'draft').replaceAll('_', ' ')
}

export default function TikTokOperations() {
  const [connection, setConnection] = useState(null)
  const [posts, setPosts] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  const queued = useMemo(() => posts.filter((post) => !['published', 'private_only'].includes(post.status)), [posts])

  async function load() {
    setBusy('load')
    try {
      const [statusResult, postResult] = await Promise.all([
        callApi('/api/tiktok/status'),
        callApi('/api/tiktok/posts'),
      ])
      setConnection(statusResult)
      setPosts(postResult.posts || [])
      setNotice('TikTok operations loaded from verified records.')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy('')
    }
  }

  useEffect(() => { load() }, [])

  async function createDraft(event) {
    event.preventDefault()
    setBusy('create')
    try {
      const result = await callApi('/api/tiktok/posts', {
        method: 'POST',
        body: { ...form, scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null },
      })
      setPosts((current) => [result.post, ...current])
      setForm(defaultForm)
      setNotice('Draft queued. It cannot post until you explicitly approve it.')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy('')
    }
  }

  async function setApproval(post, approved) {
    setBusy(`approve-${post.id}`)
    try {
      const result = await callApi('/api/tiktok/posts', { method: 'PATCH', body: { id: post.id, owner_approved: approved } })
      setPosts((current) => current.map((item) => item.id === post.id ? result.post : item))
      setNotice(approved ? 'Owner approval recorded. Posting is still blocked until TikTok is connected.' : 'Approval removed.')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy('')
    }
  }

  async function publish(post) {
    setBusy(`publish-${post.id}`)
    try {
      const result = await callApi('/api/tiktok/publish', { method: 'POST', body: { id: post.id } })
      setPosts((current) => current.map((item) => item.id === post.id ? result.post : item))
      setNotice(`TikTok accepted the post for ${result.visibility} visibility. Refresh its status to verify completion.`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy('')
    }
  }

  async function refreshPost(post) {
    setBusy(`status-${post.id}`)
    try {
      const result = await callApi('/api/tiktok/publish-status', { method: 'POST', body: { id: post.id } })
      setPosts((current) => current.map((item) => item.id === post.id ? result.post : item))
      setNotice(`TikTok status: ${result.tiktokStatus}.`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="tiktok-page">
      <header className="tiktok-hero">
        <div>
          <p className="tiktok-kicker">Genesis OS · Direct campaign publishing</p>
          <h1>TikTok Operations</h1>
          <p>Prepare, approve, schedule, and verify one faceless campaign video at a time—without CTO usage.</p>
        </div>
        <div className={`tiktok-connection ${connection?.publicPostingUnlocked ? 'ready' : ''}`}>
          <span>Connection status</span>
          <strong>{connection?.connected ? 'ACCOUNT TOKEN PRESENT' : 'NOT CONNECTED'}</strong>
          <small>{connection?.auditApproved ? 'TikTok audit marked approved' : 'Private testing only until TikTok audit approval'}</small>
          <small>{connection?.missing?.length ? `Still needed: ${connection.missing.join(', ')}` : 'Required server settings are present.'}</small>
        </div>
      </header>

      <div className="tiktok-status-grid">
        <article><span>Queued</span><strong>{queued.length}</strong><small>Drafts and active posts</small></article>
        <article><span>Owner approved</span><strong>{posts.filter((post) => post.owner_approved).length}</strong><small>Approval is recorded per video</small></article>
        <article><span>Verified complete</span><strong>{posts.filter((post) => ['published', 'private_only'].includes(post.status)).length}</strong><small>Based on TikTok status only</small></article>
        <article><span>Posting mode</span><strong>{connection?.auditApproved ? 'PUBLIC ELIGIBLE' : 'PRIVATE TEST'}</strong><small>No public claim before audit</small></article>
      </div>

      <div className="tiktok-grid">
        <section className="tiktok-panel">
          <div className="tiktok-heading"><div><span>Daily video queue</span><h2>Add a finished MP4</h2></div><b>9:16 · faceless</b></div>
          <p className="tiktok-muted">The MP4 must be hosted under a URL or domain verified in your TikTok developer app. Saving creates a draft—it does not post.</p>
          <form className="tiktok-form" onSubmit={createDraft}>
            <label>Internal title<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
            <label>Caption + hashtags<textarea rows="6" value={form.caption} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} required /></label>
            <label>Verified HTTPS MP4 URL<input type="url" placeholder="https://your-verified-domain/video.mp4" value={form.media_url} onChange={(event) => setForm((current) => ({ ...current, media_url: event.target.value }))} required /></label>
            <div className="tiktok-form-row">
              <label>Scheduled time<input type="datetime-local" value={form.scheduled_for} onChange={(event) => setForm((current) => ({ ...current, scheduled_for: event.target.value }))} /></label>
              <label>Visibility<select value={form.privacy_level} onChange={(event) => setForm((current) => ({ ...current, privacy_level: event.target.value }))}><option value="SELF_ONLY">Private test</option><option value="PUBLIC_TO_EVERYONE">Public</option><option value="FOLLOWER_OF_CREATOR">Followers</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option></select></label>
            </div>
            <div className="tiktok-toggles">
              <label><input type="checkbox" checked={form.disable_comment} onChange={(event) => setForm((current) => ({ ...current, disable_comment: event.target.checked }))} /> Disable comments</label>
              <label><input type="checkbox" checked={form.disable_duet} onChange={(event) => setForm((current) => ({ ...current, disable_duet: event.target.checked }))} /> Disable duet</label>
              <label><input type="checkbox" checked={form.disable_stitch} onChange={(event) => setForm((current) => ({ ...current, disable_stitch: event.target.checked }))} /> Disable stitch</label>
            </div>
            <button className="tiktok-primary" disabled={busy === 'create'}>{busy === 'create' ? 'Saving…' : 'Save as unapproved draft'}</button>
          </form>
        </section>

        <section className="tiktok-panel">
          <div className="tiktok-heading"><div><span>Hard gates</span><h2>What must happen first</h2></div><b>No shortcuts</b></div>
          <ol className="tiktok-checklist">
            <li className={connection?.configured ? 'done' : ''}>Register the Genesis OS TikTok developer app.</li>
            <li className={connection?.connected ? 'done' : ''}>Authorize the campaign TikTok account with <code>video.publish</code>.</li>
            <li className={connection?.auditApproved ? 'done' : ''}>Pass TikTok’s audit to unlock public Direct Post.</li>
            <li>Verify the production domain or media URL prefix.</li>
            <li>Approve each final video, caption, privacy setting, and disclosures.</li>
          </ol>
          <p className="tiktok-warning">Until the audit is genuinely approved, Genesis OS only permits <strong>SELF_ONLY</strong> test posts. It will never label a test as public.</p>
          <button className="tiktok-secondary" type="button" onClick={load} disabled={busy === 'load'}>Refresh connection</button>
        </section>
      </div>

      <section className="tiktok-panel">
        <div className="tiktok-heading"><div><span>Verified post ledger</span><h2>Daily queue</h2></div><b>{posts.length} records</b></div>
        <div className="tiktok-post-list">
          {posts.map((post) => (
            <article key={post.id}>
              <div className="tiktok-post-copy">
                <div className="tiktok-post-top"><strong>{post.title}</strong><span className={`tiktok-badge ${post.status}`}>{statusLabel(post.status)}</span></div>
                <p>{post.caption}</p>
                <small>{formatDate(post.scheduled_for)} · {post.privacy_level} · {post.media_url}</small>
                {post.publish_id ? <small>Publish ID: {post.publish_id}</small> : null}
                {post.last_error ? <small className="tiktok-error">Error: {post.last_error}</small> : null}
              </div>
              <div className="tiktok-actions">
                {!post.owner_approved ? <button onClick={() => setApproval(post, true)} disabled={Boolean(busy)}>Approve final video</button> : <button onClick={() => setApproval(post, false)} disabled={Boolean(busy) || Boolean(post.publish_id)}>Remove approval</button>}
                <button className="publish" onClick={() => publish(post)} disabled={Boolean(busy) || !post.owner_approved || Boolean(post.publish_id)}>Direct Post</button>
                {post.publish_id ? <button onClick={() => refreshPost(post)} disabled={Boolean(busy)}>Refresh TikTok status</button> : null}
              </div>
            </article>
          ))}
          {!posts.length ? <p className="tiktok-muted">No TikTok records yet. Add the first finished MP4 above.</p> : null}
        </div>
      </section>

      {notice ? <p className="tiktok-notice" role="status">{notice}</p> : null}
    </section>
  )
}
