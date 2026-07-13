import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const emptyForm = {
  name: '',
  acres: '',
  gps_location: '',
  grass_type: '',
  water_source: '',
  fence_condition: '',
  carrying_capacity: '',
  current_herd: '',
  last_grazed: '',
  rest_until_date: '',
  notes: '',
  photos_text: '',
}

const fenceConditionOptions = ['Excellent', 'Good', 'Fair', 'Needs Repair']
const filterOptions = ['All', 'Active', 'Resting', 'Overstocked']
const sortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'acres', label: 'Acres' },
  { value: 'last_grazed', label: 'Last Grazed' },
  { value: 'rest_until_date', label: 'Rest Until Date' },
]

function parseDate(value) {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isRestingPasture(record, today) {
  const restUntilDate = parseDate(record.rest_until_date)
  if (!restUntilDate) return false

  return restUntilDate >= today
}

function isOverstockedPasture(record) {
  const carryingCapacity = Number(record.carrying_capacity)
  const currentHerd = Number(record.current_herd)

  if (Number.isNaN(carryingCapacity) || Number.isNaN(currentHerd)) {
    return false
  }

  return carryingCapacity > 0 && currentHerd > carryingCapacity
}

function formatDateForDisplay(value) {
  const dateValue = parseDate(value)

  if (!dateValue) return '-'

  return dateValue.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function parsePhotoUrls(text) {
  return text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function photoUrlsToText(photoUrls) {
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
    return ''
  }

  return photoUrls.join('\n')
}

function FieldsPastures() {
  const [records, setRecords] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBy, setFilterBy] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUsingSupabase, setIsUsingSupabase] = useState(isSupabaseConfigured())
  const [message, setMessage] = useState('')
  const [editingRecordId, setEditingRecordId] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadRecords() {
      if (!isSupabaseConfigured() || !supabase) {
        if (!ignore) {
          setIsUsingSupabase(false)
          setMessage('Supabase is not configured. Add your environment keys to load pasture records.')
          setIsLoading(false)
        }
        return
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()

        if (userError) throw userError

        const user = userData?.user

        if (!user) {
          if (!ignore) {
            setRecords([])
            setMessage('Please sign in to view your pasture records.')
            setIsLoading(false)
          }
          return
        }

        const { data, error } = await supabase
          .from('pasture_records')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error

        if (!ignore) {
          setRecords(Array.isArray(data) ? data : [])
          setIsUsingSupabase(true)
          setMessage('')
          setIsLoading(false)
        }
      } catch (error) {
        if (ignore) return

        console.error('Failed to load pasture records.', error)
        setRecords([])
        setIsUsingSupabase(false)
        setMessage(error?.message || 'Unable to load pasture records right now.')
        setIsLoading(false)
      }
    }

    loadRecords()

    return () => {
      ignore = true
    }
  }, [])

  const today = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }, [])

  const enrichedRecords = useMemo(() => {
    return records.map((record) => ({
      ...record,
      isResting: isRestingPasture(record, today),
      isOverstocked: isOverstockedPasture(record),
    }))
  }, [records, today])

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    let nextRecords = [...enrichedRecords]

    if (filterBy === 'Active') {
      nextRecords = nextRecords.filter((record) => !record.isResting)
    }

    if (filterBy === 'Resting') {
      nextRecords = nextRecords.filter((record) => record.isResting)
    }

    if (filterBy === 'Overstocked') {
      nextRecords = nextRecords.filter((record) => record.isOverstocked)
    }

    if (query) {
      nextRecords = nextRecords.filter((record) => {
        const fields = [
          record.name,
          record.gps_location,
          record.grass_type,
          record.water_source,
          record.fence_condition,
          record.notes,
        ]

        return fields.some((field) => String(field || '').toLowerCase().includes(query))
      })
    }

    nextRecords.sort((left, right) => {
      if (sortBy === 'acres') {
        return Number(right.acres || 0) - Number(left.acres || 0)
      }

      if (sortBy === 'last_grazed' || sortBy === 'rest_until_date') {
        const leftDate = parseDate(left[sortBy])
        const rightDate = parseDate(right[sortBy])
        const leftValue = leftDate ? leftDate.getTime() : Number.POSITIVE_INFINITY
        const rightValue = rightDate ? rightDate.getTime() : Number.POSITIVE_INFINITY

        return leftValue - rightValue
      }

      const leftValue = String(left[sortBy] || '').toLowerCase()
      const rightValue = String(right[sortBy] || '').toLowerCase()

      return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
    })

    return nextRecords
  }, [enrichedRecords, filterBy, searchTerm, sortBy])

  const totalAcres = enrichedRecords.reduce((sum, record) => sum + Number(record.acres || 0), 0)
  const activePastures = enrichedRecords.filter((record) => !record.isResting).length
  const restingPastures = enrichedRecords.filter((record) => record.isResting).length
  const overstockedFields = enrichedRecords.filter((record) => record.isOverstocked).length

  function handleInputChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingRecordId(null)
  }

  function startEdit(record) {
    setEditingRecordId(record.id)
    setForm({
      name: record.name || '',
      acres: record.acres != null ? String(record.acres) : '',
      gps_location: record.gps_location || '',
      grass_type: record.grass_type || '',
      water_source: record.water_source || '',
      fence_condition: record.fence_condition || '',
      carrying_capacity: record.carrying_capacity != null ? String(record.carrying_capacity) : '',
      current_herd: record.current_herd != null ? String(record.current_herd) : '',
      last_grazed: record.last_grazed || '',
      rest_until_date: record.rest_until_date || '',
      notes: record.notes || '',
      photos_text: photoUrlsToText(record.photo_urls),
    })
    setMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!isSupabaseConfigured() || !supabase) {
      setMessage('Supabase is not configured. Unable to save records.')
      return
    }

    const name = form.name.trim()

    if (!name) {
      setMessage('Pasture Name is required.')
      return
    }

    setIsSaving(true)
    setMessage('')

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      const user = userData?.user
      if (!user) throw new Error('You must be signed in to save pasture records.')

      const acres = form.acres === '' ? null : Number.parseFloat(form.acres)
      const carryingCapacity = form.carrying_capacity === '' ? null : Number.parseInt(form.carrying_capacity, 10)
      const currentHerd = form.current_herd === '' ? null : Number.parseInt(form.current_herd, 10)
      const photoUrls = parsePhotoUrls(form.photos_text)

      if (acres != null && Number.isNaN(acres)) {
        throw new Error('Acres must be a valid number.')
      }

      if (carryingCapacity != null && Number.isNaN(carryingCapacity)) {
        throw new Error('Carrying Capacity must be a valid number.')
      }

      if (currentHerd != null && Number.isNaN(currentHerd)) {
        throw new Error('Current Herd must be a valid number.')
      }

      const payload = {
        user_id: user.id,
        name,
        acres,
        gps_location: form.gps_location.trim() || null,
        grass_type: form.grass_type.trim() || null,
        water_source: form.water_source.trim() || null,
        fence_condition: form.fence_condition || null,
        carrying_capacity: carryingCapacity,
        current_herd: currentHerd,
        last_grazed: form.last_grazed || null,
        rest_until_date: form.rest_until_date || null,
        notes: form.notes.trim() || null,
        photo_urls: photoUrls.length > 0 ? photoUrls : null,
      }

      if (editingRecordId) {
        const { data, error } = await supabase
          .from('pasture_records')
          .update(payload)
          .eq('id', editingRecordId)
          .eq('user_id', user.id)
          .select()
          .single()

        if (error) throw error

        setRecords((current) => current.map((record) => (record.id === editingRecordId ? data : record)))
        setMessage('Pasture record updated.')
      } else {
        const { data, error } = await supabase
          .from('pasture_records')
          .insert(payload)
          .select()
          .single()

        if (error) throw error

        setRecords((current) => [data, ...current])
        setMessage('Pasture record added.')
      }

      resetForm()
    } catch (error) {
      console.error('Failed to save pasture record.', error)
      setMessage(error?.message || 'Unable to save pasture record.')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRecord(id) {
    if (!isSupabaseConfigured() || !supabase) {
      setMessage('Supabase is not configured. Unable to delete records.')
      return
    }

    const shouldDelete = window.confirm('Delete this pasture record?')
    if (!shouldDelete) return

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      const user = userData?.user
      if (!user) throw new Error('You must be signed in to delete pasture records.')

      const { error } = await supabase
        .from('pasture_records')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) throw error

      setRecords((current) => current.filter((record) => record.id !== id))
      setMessage('Pasture record deleted.')

      if (editingRecordId === id) {
        resetForm()
      }
    } catch (error) {
      console.error('Failed to delete pasture record.', error)
      setMessage(error?.message || 'Unable to delete pasture record.')
    }
  }

  return (
    <section className="holy-water-page">
      <div className="hero-panel holy-water-hero">
        <div>
          <p className="eyebrow">Farm Operations</p>
          <h1>Fields &amp; Pastures</h1>
          <p className="hero-copy">
            Monitor grazing zones, rest cycles, and carrying capacity in one secure operations board.
          </p>
        </div>
        <div className="hero-side">
          <div className="clock-card">
            <span className="clock-label">Data Mode</span>
            <strong>{isUsingSupabase ? 'Supabase' : 'Unavailable'}</strong>
            <span>{enrichedRecords.length} pasture records</span>
          </div>
        </div>
      </div>

      <div className="mission holy-water-grid">
        <div className="mission-column">
          <div className="mission-header">
            <h2>{editingRecordId ? 'Edit Pasture' : 'Add Pasture'}</h2>
            <span className={`status-badge ${isUsingSupabase ? 'working' : 'offline'}`}>
              {isUsingSupabase ? 'Cloud Sync' : 'Config Needed'}
            </span>
          </div>

          <form className="holy-water-form" onSubmit={handleSubmit}>
            <div className="holy-water-form-grid fields-pastures-grid">
              <label>
                Name
                <input type="text" name="name" value={form.name} onChange={handleInputChange} required />
              </label>

              <label>
                Acres
                <input type="number" min="0" step="0.1" name="acres" value={form.acres} onChange={handleInputChange} />
              </label>

              <label>
                GPS Location (placeholder)
                <input type="text" name="gps_location" value={form.gps_location} onChange={handleInputChange} placeholder="e.g. 31.9686,-99.9018" />
              </label>

              <label>
                Grass Type
                <input type="text" name="grass_type" value={form.grass_type} onChange={handleInputChange} />
              </label>

              <label>
                Water Source
                <input type="text" name="water_source" value={form.water_source} onChange={handleInputChange} />
              </label>

              <label>
                Fence Condition
                <select name="fence_condition" value={form.fence_condition} onChange={handleInputChange}>
                  <option value="">Select condition</option>
                  {fenceConditionOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label>
                Carrying Capacity
                <input type="number" min="0" step="1" name="carrying_capacity" value={form.carrying_capacity} onChange={handleInputChange} />
              </label>

              <label>
                Current Herd
                <input type="number" min="0" step="1" name="current_herd" value={form.current_herd} onChange={handleInputChange} />
              </label>

              <label>
                Last Grazed
                <input type="date" name="last_grazed" value={form.last_grazed} onChange={handleInputChange} />
              </label>

              <label>
                Rest Until Date
                <input type="date" name="rest_until_date" value={form.rest_until_date} onChange={handleInputChange} />
              </label>

              <label className="holy-water-notes-field">
                Notes
                <textarea rows="3" name="notes" value={form.notes} onChange={handleInputChange} />
              </label>

              <label className="holy-water-notes-field">
                Photos (one URL per line)
                <textarea rows="3" name="photos_text" value={form.photos_text} onChange={handleInputChange} />
              </label>
            </div>

            <div className="holy-water-actions">
              <button type="submit" className="primary-action" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingRecordId ? 'Update Pasture' : 'Add Pasture'}
              </button>
              {editingRecordId ? (
                <button type="button" className="secondary-action" onClick={resetForm}>Cancel Edit</button>
              ) : null}
            </div>
          </form>

          {message ? <p className="holy-water-message">{message}</p> : null}
        </div>

        <div className="mission-column secondary-stack">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Search, Filter, Sort</h3>
              <span className="panel-pill">Live Filter</span>
            </div>
            <input
              className="holy-water-search"
              type="text"
              placeholder="Search name, grass, water source, fence, notes"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <div className="holy-water-controls">
              <label>
                Filter
                <select value={filterBy} onChange={(event) => setFilterBy(event.target.value)}>
                  {filterOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Sort By
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Pasture Dashboard</h3>
              <span className="panel-pill">Analytics</span>
            </div>
            <div className="holy-water-stats">
              <div>
                <span>Total Acres</span>
                <strong>{totalAcres.toFixed(1)}</strong>
              </div>
              <div>
                <span>Active Pastures</span>
                <strong>{activePastures}</strong>
              </div>
              <div>
                <span>Resting Pastures</span>
                <strong>{restingPastures}</strong>
              </div>
              <div>
                <span>Overstocked Fields</span>
                <strong>{overstockedFields}</strong>
              </div>
              <div>
                <span>Showing</span>
                <strong>{filteredRecords.length}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="panel-card holy-water-table-wrap">
        <div className="panel-card-header">
          <h3>Pasture Records</h3>
          <span className="panel-pill">Secure by User</span>
        </div>

        {isLoading ? (
          <p className="muted-text">Loading records...</p>
        ) : filteredRecords.length === 0 ? (
          <p className="muted-text">No records found. Add your first field or pasture above.</p>
        ) : (
          <div className="holy-water-table-scroll">
            <table className="holy-water-table fields-pastures-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Acres</th>
                  <th>GPS</th>
                  <th>Grass Type</th>
                  <th>Water Source</th>
                  <th>Fence</th>
                  <th>Capacity</th>
                  <th>Current Herd</th>
                  <th>Last Grazed</th>
                  <th>Rest Until</th>
                  <th>Status</th>
                  <th>Photos</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className={record.isOverstocked ? 'fields-pastures-overstocked' : ''}>
                    <td>{record.name}</td>
                    <td>{record.acres != null ? record.acres : '-'}</td>
                    <td>{record.gps_location || '-'}</td>
                    <td>{record.grass_type || '-'}</td>
                    <td>{record.water_source || '-'}</td>
                    <td>{record.fence_condition || '-'}</td>
                    <td>{record.carrying_capacity != null ? record.carrying_capacity : '-'}</td>
                    <td>{record.current_herd != null ? record.current_herd : '-'}</td>
                    <td>{formatDateForDisplay(record.last_grazed)}</td>
                    <td>{formatDateForDisplay(record.rest_until_date)}</td>
                    <td>{record.isResting ? 'Resting' : 'Active'}</td>
                    <td>
                      {Array.isArray(record.photo_urls) && record.photo_urls.length > 0 ? (
                        <div className="fields-pastures-photo-stack">
                          {record.photo_urls.slice(0, 2).map((photoUrl) => (
                            <img key={photoUrl} className="fields-pastures-photo" src={photoUrl} alt={`${record.name} pasture`} />
                          ))}
                        </div>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                    <td className="holy-water-notes-cell">{record.notes || '-'}</td>
                    <td>
                      <div className="holy-water-row-actions">
                        <button type="button" className="secondary-action" onClick={() => startEdit(record)}>
                          Edit
                        </button>
                        <button type="button" className="delete-task-btn" onClick={() => deleteRecord(record.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

export default FieldsPastures
