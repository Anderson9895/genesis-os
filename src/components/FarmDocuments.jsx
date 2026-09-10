import { useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const toggleStyle = {
  background: 'transparent',
  border: '1px solid #475569',
  color: '#cbd5e1',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 13,
  cursor: 'pointer',
}
const panelStyle = {
  background: '#0b1120',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 12,
  marginTop: 8,
  display: 'grid',
  gap: 8,
}
const rowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  color: '#e2e8f0',
  fontSize: 13,
  background: '#020617',
  borderRadius: 8,
  padding: '8px 10px',
}
const inputStyle = {
  color: '#fff',
  background: '#020617',
  border: '1px solid #475569',
  borderRadius: 8,
  padding: 8,
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 13,
}
const smallActionStyle = {
  background: 'transparent',
  border: '1px solid #475569',
  color: '#93c5fd',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Private per-record attachment panel. Files are stored in the private
// 'farm-documents' bucket under {userId}/{recordType}/{recordId}/... and are
// only ever opened through short-lived signed URLs. No public URL is created.
function FarmDocuments({ recordType, recordId }) {
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [message, setMessage] = useState('')
  const [messageColor, setMessageColor] = useState('#facc15')
  const fileRef = useRef(null)

  const recordKey = String(recordId)

  async function loadDocs() {
    if (!isSupabaseConfigured() || !supabase) {
      setMessage('Storage is not configured.')
      return
    }
    setLoading(true)
    setMessage('')
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) {
      setMessage('Please sign in again.')
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('farm_documents')
      .select('*')
      .eq('user_id', uid)
      .eq('record_type', recordType)
      .eq('record_id', recordKey)
      .order('created_at', { ascending: false })
    if (error) setMessage(error.message)
    else setDocs(data || [])
    setLoading(false)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && docs.length === 0 && !loading) loadDocs()
  }

  async function uploadDoc(event) {
    event.preventDefault()
    if (!isSupabaseConfigured() || !supabase) {
      setMessage('Storage is not configured.')
      setMessageColor('#facc15')
      return
    }
    if (!file) {
      setMessage('Choose a file to attach first.')
      setMessageColor('#facc15')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('You must be signed in to attach files.')

      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${uid}/${recordType}/${recordKey}/${Date.now()}-${sanitizedName}`

      const { error: uploadError } = await supabase.storage
        .from('farm-documents')
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        })
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase.from('farm_documents').insert({
        user_id: uid,
        record_type: recordType,
        record_id: recordKey,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        size_bytes: file.size || null,
        caption: caption.trim() || null,
      })
      if (insertError) throw insertError

      setFile(null)
      setCaption('')
      if (fileRef.current) fileRef.current.value = ''
      setMessage('Attachment uploaded and saved privately.')
      setMessageColor('#86efac')
      await loadDocs()
    } catch (error) {
      console.error('Failed to upload farm document.', error)
      setMessage(error?.message || 'Unable to upload attachment.')
      setMessageColor('#facc15')
    } finally {
      setBusy(false)
    }
  }

  async function openDoc(doc) {
    if (!isSupabaseConfigured() || !supabase) return
    const { data, error } = await supabase.storage
      .from('farm-documents')
      .createSignedUrl(doc.file_path, 60 * 60)
    if (error || !data?.signedUrl) {
      setMessage(error?.message || 'Could not create a signed link right now.')
      setMessageColor('#facc15')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadDoc(doc) {
    if (!isSupabaseConfigured() || !supabase) return
    const { data, error } = await supabase.storage
      .from('farm-documents')
      .createSignedUrl(doc.file_path, 60 * 60)
    if (error || !data?.signedUrl) {
      setMessage(error?.message || 'Could not create a signed link right now.')
      setMessageColor('#facc15')
      return
    }
    const link = document.createElement('a')
    link.href = data.signedUrl
    link.download = doc.file_name
    link.target = '_blank'
    link.rel = 'noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function deleteDoc(doc) {
    if (!isSupabaseConfigured() || !supabase) return
    if (!window.confirm(`Delete attachment "${doc.file_name}"? This also removes the stored file.`)) return
    setBusy(true)
    setMessage('')
    try {
      const { error: removeError } = await supabase.storage
        .from('farm-documents')
        .remove([doc.file_path])
      if (removeError) throw removeError

      const { error: deleteError } = await supabase
        .from('farm_documents')
        .delete()
        .eq('id', doc.id)
      if (deleteError) throw deleteError

      setDocs(current => current.filter(item => item.id !== doc.id))
      setMessage('Attachment deleted.')
      setMessageColor('#86efac')
    } catch (error) {
      console.error('Failed to delete farm document.', error)
      setMessage(error?.message || 'Unable to delete attachment.')
      setMessageColor('#facc15')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button type="button" style={toggleStyle} onClick={toggle}>
        {open ? 'Hide attachments' : `Attachments${docs.length ? ` (${docs.length})` : ''}`}
      </button>
      {open && (
        <div style={panelStyle}>
          {loading && <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Loading attachments…</p>}
          {!loading && docs.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>No attachments for this record yet.</p>}
          {docs.map(doc => (
            <div key={doc.id} style={rowStyle}>
              <span style={{ fontWeight: 600 }}>{doc.file_name}</span>
              {doc.caption && <span style={{ color: '#94a3b8' }}>— {doc.caption}</span>}
              <span style={{ color: '#64748b' }}>{formatSize(doc.size_bytes)}{doc.mime_type ? ` · ${doc.mime_type}` : ''}</span>
              <span>
                <button type="button" style={smallActionStyle} onClick={() => openDoc(doc)}>View</button>{' '}
                <button type="button" style={smallActionStyle} onClick={() => downloadDoc(doc)}>Download</button>{' '}
                <button type="button" style={{ ...smallActionStyle, color: '#fca5a5' }} onClick={() => deleteDoc(doc)}>Delete</button>
              </span>
            </div>
          ))}
          <form onSubmit={uploadDoc} style={{ display: 'grid', gap: 8, marginTop: 4 }}>
            <input
              ref={fileRef}
              type="file"
              style={{ color: '#cbd5e1', fontSize: 13 }}
              onChange={event => setFile(event.target.files?.[0] || null)}
            />
            <input
              type="text"
              style={inputStyle}
              value={caption}
              onChange={event => setCaption(event.target.value)}
              placeholder="Caption / note (optional)"
            />
            <button type="submit" disabled={busy} className="primary-action" style={{ justifySelf: 'start' }}>
              {busy ? 'Uploading…' : 'Upload attachment'}
            </button>
          </form>
          {message && <p style={{ color: messageColor, fontSize: 13, margin: 0 }}>{message}</p>}
          <small style={{ color: '#64748b' }}>
            Files are private to your account. Views use temporary signed links (valid ~60 minutes) — no public link is created.
          </small>
        </div>
      )}
    </div>
  )
}

export default FarmDocuments