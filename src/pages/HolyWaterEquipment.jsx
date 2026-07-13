import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const emptyEquipmentForm = {
  name: '',
  type: '',
  make: '',
  model: '',
  year: '',
  serial_number: '',
  status: 'Active',
  purchase_date: '',
  purchase_price: '',
  current_usage: '',
  last_service_date: '',
  next_service_date: '',
  notes: '',
}

const equipmentStatusOptions = [
  'Active',
  'Maintenance Due',
  'Out of Service',
  'In Repair',
  'Retired',
]

const equipmentSortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'next_service_date', label: 'Next Service Date' },
]

function formatDateForDisplay(value) {
  if (!value) return '-'

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPrice(value) {
  if (value == null || value === '') return '-'

  const numericValue = Number(value)

  if (Number.isNaN(numericValue)) {
    return String(value)
  }

  return numericValue.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function isOverdueService(record) {
  if (!record.next_service_date) {
    return false
  }

  const dueDate = new Date(record.next_service_date)

  if (Number.isNaN(dueDate.getTime())) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return dueDate < today
}

function HolyWaterEquipment() {
  const [records, setRecords] = useState([])
  const [form, setForm] = useState(emptyEquipmentForm)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
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
          setMessage('Supabase is not configured. Add your environment keys to load equipment records.')
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
            setMessage('Please sign in to view your equipment records.')
            setIsLoading(false)
          }
          return
        }

        const { data, error } = await supabase
          .from('equipment_records')
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

        console.error('Failed to load equipment records.', error)
        setIsUsingSupabase(false)
        setMessage(error?.message || 'Unable to load equipment records right now.')
        setIsLoading(false)
      }
    }

    loadRecords()

    return () => {
      ignore = true
    }
  }, [])

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const statusQuery = statusFilter.toLowerCase()
    const nextRecords = [...records]

    const statusFiltered = statusFilter === 'All'
      ? nextRecords
      : nextRecords.filter((record) => String(record.status || '').toLowerCase() === statusQuery)

    const searched = query
      ? statusFiltered.filter((record) => {
          const fields = [
            record.name,
            record.type,
            record.make,
            record.model,
            record.serial_number,
            record.status,
            record.notes,
          ]

          return fields.some((field) => String(field || '').toLowerCase().includes(query))
        })
      : statusFiltered

    searched.sort((left, right) => {
      if (sortBy === 'next_service_date') {
        const leftTimestamp = left.next_service_date ? new Date(left.next_service_date).getTime() : Number.POSITIVE_INFINITY
        const rightTimestamp = right.next_service_date ? new Date(right.next_service_date).getTime() : Number.POSITIVE_INFINITY

        return leftTimestamp - rightTimestamp
      }

      const leftValue = String(left[sortBy] || '').toLowerCase()
      const rightValue = String(right[sortBy] || '').toLowerCase()

      return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
    })

    return searched
  }, [records, searchTerm, sortBy, statusFilter])

  const overdueRecords = useMemo(() => records.filter(isOverdueService), [records])
  const totalEquipment = records.length
  const activeCount = records.filter((record) => String(record.status || '').toLowerCase() === 'active').length
  const maintenanceDueCount = records.filter((record) => {
    const statusText = String(record.status || '').toLowerCase()
    return statusText === 'maintenance due' || isOverdueService(record)
  }).length
  const outOfServiceCount = records.filter((record) => String(record.status || '').toLowerCase() === 'out of service').length

  function resetForm() {
    setForm(emptyEquipmentForm)
    setEditingRecordId(null)
  }

  function handleInputChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function startEdit(record) {
    setEditingRecordId(record.id)
    setForm({
      name: record.name || '',
      type: record.type || '',
      make: record.make || '',
      model: record.model || '',
      year: record.year != null ? String(record.year) : '',
      serial_number: record.serial_number || '',
      status: record.status || 'Active',
      purchase_date: record.purchase_date || '',
      purchase_price: record.purchase_price != null ? String(record.purchase_price) : '',
      current_usage: record.current_usage || '',
      last_service_date: record.last_service_date || '',
      next_service_date: record.next_service_date || '',
      notes: record.notes || '',
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
      setMessage('Name is required.')
      return
    }

    setIsSaving(true)
    setMessage('')

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      const user = userData?.user
      if (!user) throw new Error('You must be signed in to save equipment records.')

      const parsedYear = form.year === '' ? null : Number.parseInt(form.year, 10)
      const parsedPrice = form.purchase_price === '' ? null : Number.parseFloat(form.purchase_price)

      if (parsedYear != null && Number.isNaN(parsedYear)) {
        throw new Error('Year must be a valid number.')
      }

      if (parsedPrice != null && Number.isNaN(parsedPrice)) {
        throw new Error('Purchase Price must be a valid number.')
      }

      const payload = {
        user_id: user.id,
        name,
        type: form.type.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        year: parsedYear,
        serial_number: form.serial_number.trim() || null,
        status: form.status,
        purchase_date: form.purchase_date || null,
        purchase_price: parsedPrice,
        current_usage: form.current_usage.trim() || null,
        last_service_date: form.last_service_date || null,
        next_service_date: form.next_service_date || null,
        notes: form.notes.trim() || null,
      }

      if (editingRecordId) {
        const { data, error } = await supabase
          .from('equipment_records')
          .update(payload)
          .eq('id', editingRecordId)
          .eq('user_id', user.id)
          .select()
          .single()

        if (error) throw error

        setRecords((current) => current.map((record) => (record.id === editingRecordId ? data : record)))
        setMessage('Equipment record updated.')
      } else {
        const { data, error } = await supabase
          .from('equipment_records')
          .insert(payload)
          .select()
          .single()

        if (error) throw error

        setRecords((current) => [data, ...current])
        setMessage('Equipment record added.')
      }

      resetForm()
    } catch (error) {
      console.error('Failed to save equipment record.', error)
      setMessage(error?.message || 'Unable to save equipment record.')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRecord(id) {
    if (!isSupabaseConfigured() || !supabase) {
      setMessage('Supabase is not configured. Unable to delete records.')
      return
    }

    const shouldDelete = window.confirm('Delete this equipment record?')
    if (!shouldDelete) return

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      const user = userData?.user
      if (!user) throw new Error('You must be signed in to delete equipment records.')

      const { error } = await supabase
        .from('equipment_records')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) throw error

      setRecords((current) => current.filter((record) => record.id !== id))
      setMessage('Equipment record deleted.')

      if (editingRecordId === id) {
        resetForm()
      }
    } catch (error) {
      console.error('Failed to delete equipment record.', error)
      setMessage(error?.message || 'Unable to delete equipment record.')
    }
  }

  return (
    <section className="holy-water-page">
      <div className="hero-panel holy-water-hero">
        <div>
          <p className="eyebrow">Holy Water Ranch Co.</p>
          <h1>Equipment Management</h1>
          <p className="hero-copy">
            Track ranch machinery, service schedules, and maintenance readiness with secure user-owned records.
          </p>
          <div className="holy-water-module-links">
            <Link className="secondary-action" to="/holy-water">Open Livestock</Link>
            <span className="panel-pill">Equipment</span>
          </div>
        </div>
        <div className="hero-side">
          <div className="clock-card">
            <span className="clock-label">Data Mode</span>
            <strong>{isUsingSupabase ? 'Supabase' : 'Unavailable'}</strong>
            <span>{totalEquipment} equipment records</span>
          </div>
        </div>
      </div>

      {overdueRecords.length > 0 ? (
        <section className="panel-card holy-water-alert-card">
          <div className="panel-card-header">
            <h3>Service Alerts</h3>
            <span className="status-badge offline">Overdue</span>
          </div>
          <ul className="panel-list">
            {overdueRecords.map((record) => (
              <li key={record.id}>
                {record.name || 'Unnamed equipment'} service overdue since {formatDateForDisplay(record.next_service_date)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mission holy-water-grid">
        <div className="mission-column">
          <div className="mission-header">
            <h2>{editingRecordId ? 'Edit Equipment' : 'Add Equipment'}</h2>
            <span className={`status-badge ${isUsingSupabase ? 'working' : 'offline'}`}>
              {isUsingSupabase ? 'Cloud Sync' : 'Config Needed'}
            </span>
          </div>

          <form className="holy-water-form" onSubmit={handleSubmit}>
            <div className="holy-water-form-grid holy-water-equipment-grid">
              <label>
                Name
                <input type="text" name="name" value={form.name} onChange={handleInputChange} required />
              </label>

              <label>
                Type
                <input type="text" name="type" value={form.type} onChange={handleInputChange} />
              </label>

              <label>
                Make
                <input type="text" name="make" value={form.make} onChange={handleInputChange} />
              </label>

              <label>
                Model
                <input type="text" name="model" value={form.model} onChange={handleInputChange} />
              </label>

              <label>
                Year
                <input type="number" min="1900" step="1" name="year" value={form.year} onChange={handleInputChange} />
              </label>

              <label>
                Serial Number
                <input type="text" name="serial_number" value={form.serial_number} onChange={handleInputChange} />
              </label>

              <label>
                Status
                <select name="status" value={form.status} onChange={handleInputChange}>
                  {equipmentStatusOptions.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>{statusOption}</option>
                  ))}
                </select>
              </label>

              <label>
                Purchase Date
                <input type="date" name="purchase_date" value={form.purchase_date} onChange={handleInputChange} />
              </label>

              <label>
                Purchase Price
                <input type="number" min="0" step="0.01" name="purchase_price" value={form.purchase_price} onChange={handleInputChange} />
              </label>

              <label>
                Current Hours or Mileage
                <input type="text" name="current_usage" value={form.current_usage} onChange={handleInputChange} placeholder="e.g. 4,100 hrs or 65,000 mi" />
              </label>

              <label>
                Last Service Date
                <input type="date" name="last_service_date" value={form.last_service_date} onChange={handleInputChange} />
              </label>

              <label>
                Next Service Date
                <input type="date" name="next_service_date" value={form.next_service_date} onChange={handleInputChange} />
              </label>

              <label className="holy-water-notes-field">
                Notes
                <textarea rows="3" name="notes" value={form.notes} onChange={handleInputChange} />
              </label>
            </div>

            <div className="holy-water-actions">
              <button type="submit" className="primary-action" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingRecordId ? 'Update Equipment' : 'Add Equipment'}
              </button>
              {editingRecordId ? (
                <button type="button" className="secondary-action" onClick={resetForm}>
                  Cancel Edit
                </button>
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
              placeholder="Search name, type, make, model, serial, status"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <div className="holy-water-controls">
              <label>
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="All">All</option>
                  {equipmentStatusOptions.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>{statusOption}</option>
                  ))}
                </select>
              </label>
              <label>
                Sort By
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  {equipmentSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-card-header">
              <h3>Equipment Summary</h3>
              <span className="panel-pill">Ranch</span>
            </div>
            <div className="holy-water-stats">
              <div>
                <span>Total Equipment</span>
                <strong>{totalEquipment}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>{activeCount}</strong>
              </div>
              <div>
                <span>Maintenance Due</span>
                <strong>{maintenanceDueCount}</strong>
              </div>
              <div>
                <span>Out of Service</span>
                <strong>{outOfServiceCount}</strong>
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
          <h3>Equipment Records</h3>
          <span className="panel-pill">Secure by User</span>
        </div>

        {isLoading ? (
          <p className="muted-text">Loading records...</p>
        ) : filteredRecords.length === 0 ? (
          <p className="muted-text">No equipment found. Add your first equipment record above.</p>
        ) : (
          <div className="holy-water-table-scroll">
            <table className="holy-water-table holy-water-equipment-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Make / Model</th>
                  <th>Year</th>
                  <th>Serial Number</th>
                  <th>Status</th>
                  <th>Purchase Date</th>
                  <th>Purchase Price</th>
                  <th>Current Hours or Mileage</th>
                  <th>Last Service</th>
                  <th>Next Service</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const overdue = isOverdueService(record)

                  return (
                    <tr key={record.id} className={overdue ? 'holy-water-row-overdue' : ''}>
                      <td>{record.name}</td>
                      <td>{record.type || '-'}</td>
                      <td>{[record.make, record.model].filter(Boolean).join(' ') || '-'}</td>
                      <td>{record.year || '-'}</td>
                      <td>{record.serial_number || '-'}</td>
                      <td>{record.status || '-'}</td>
                      <td>{formatDateForDisplay(record.purchase_date)}</td>
                      <td>{formatPrice(record.purchase_price)}</td>
                      <td>{record.current_usage || '-'}</td>
                      <td>{formatDateForDisplay(record.last_service_date)}</td>
                      <td>{formatDateForDisplay(record.next_service_date)}</td>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

export default HolyWaterEquipment
