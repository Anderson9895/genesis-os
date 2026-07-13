import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const emptyForm = {
	tag_number: '',
	name: '',
	breed: '',
	birth_date: '',
	sex: 'Female',
	weight: '',
	status: 'Active',
	notes: '',
	photo_url: '',
}

const statusOptions = ['Active', 'Calf', 'Sold', 'Quarantine', 'Medical', 'Retired']
const sortOptions = [
	{ value: 'tag_number', label: 'Tag Number' },
	{ value: 'name', label: 'Name' },
]

function formatDateForDisplay(value) {
	if (!value) return 'Unknown'

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

function isCalf(record) {
	const statusText = String(record.status || '').toLowerCase()

	if (statusText.includes('calf')) {
		return true
	}

	if (!record.birth_date) {
		return false
	}

	const birthDate = new Date(record.birth_date)

	if (Number.isNaN(birthDate.getTime())) {
		return false
	}

	const ageInMs = Date.now() - birthDate.getTime()
	const ageInDays = ageInMs / (1000 * 60 * 60 * 24)

	return ageInDays <= 365
}

function HolyWater() {
	const [records, setRecords] = useState([])
	const [form, setForm] = useState(emptyForm)
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState('All')
	const [sortBy, setSortBy] = useState('tag_number')
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
					setMessage('Supabase is not configured. Add your environment keys to load livestock records.')
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
						setMessage('Please sign in to view your livestock records.')
						setIsLoading(false)
					}
					return
				}

				const { data, error } = await supabase
					.from('livestock_records')
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

				console.error('Failed to load livestock records.', error)
				setIsUsingSupabase(false)
				setMessage(error?.message || 'Unable to load livestock records right now.')
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

		let nextRecords = [...records]

		if (statusFilter !== 'All') {
			nextRecords = nextRecords.filter((record) => String(record.status || '').toLowerCase() === statusQuery)
		}

		if (query) {
			nextRecords = nextRecords.filter((record) => {
				const fields = [
					record.tag_number,
					record.name,
					record.breed,
					record.sex,
					record.status,
					record.notes,
				]

				return fields.some((field) => String(field || '').toLowerCase().includes(query))
			})
		}

		nextRecords.sort((left, right) => {
			const leftValue = String(left[sortBy] || '').toLowerCase()
			const rightValue = String(right[sortBy] || '').toLowerCase()

			return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
		})

		return nextRecords
	}, [records, searchTerm, sortBy, statusFilter])

	const totalCattle = records.length
	const bulls = records.filter((record) => String(record.sex || '').toLowerCase() === 'male').length
	const cows = records.filter((record) => String(record.sex || '').toLowerCase() === 'female').length
	const calves = records.filter(isCalf).length

	function resetForm() {
		setForm(emptyForm)
		setEditingRecordId(null)
	}

	function handleInputChange(event) {
		const { name, value } = event.target
		setForm((current) => ({ ...current, [name]: value }))
	}

	function startEdit(record) {
		setEditingRecordId(record.id)
		setForm({
			tag_number: record.tag_number || '',
			name: record.name || '',
			breed: record.breed || '',
			birth_date: record.birth_date || '',
			sex: record.sex || 'Female',
			weight: record.weight != null ? String(record.weight) : '',
			status: record.status || 'Active',
			notes: record.notes || '',
			photo_url: record.photo_url || '',
		})
		setMessage('')
	}

	async function handleSubmit(event) {
		event.preventDefault()

		if (!isSupabaseConfigured() || !supabase) {
			setMessage('Supabase is not configured. Unable to save records.')
			return
		}

		const tagNumber = form.tag_number.trim()
		const name = form.name.trim()

		if (!tagNumber || !name) {
			setMessage('Tag Number and Name are required.')
			return
		}

		setIsSaving(true)
		setMessage('')

		try {
			const { data: userData, error: userError } = await supabase.auth.getUser()
			if (userError) throw userError

			const user = userData?.user
			if (!user) throw new Error('You must be signed in to save livestock records.')

			const payload = {
				user_id: user.id,
				tag_number: tagNumber,
				name,
				breed: form.breed.trim() || null,
				birth_date: form.birth_date || null,
				sex: form.sex,
				weight: form.weight === '' ? null : Number.parseFloat(form.weight),
				status: form.status,
				notes: form.notes.trim() || null,
				photo_url: form.photo_url.trim() || null,
			}

			if (payload.weight != null && Number.isNaN(payload.weight)) {
				throw new Error('Weight must be a valid number.')
			}

			if (editingRecordId) {
				const { data, error } = await supabase
					.from('livestock_records')
					.update(payload)
					.eq('id', editingRecordId)
					.eq('user_id', user.id)
					.select()
					.single()

				if (error) throw error

				setRecords((current) => current.map((record) => (record.id === editingRecordId ? data : record)))
				setMessage('Livestock record updated.')
			} else {
				const { data, error } = await supabase
					.from('livestock_records')
					.insert(payload)
					.select()
					.single()

				if (error) throw error

				setRecords((current) => [data, ...current])
				setMessage('Livestock record added.')
			}

			resetForm()
		} catch (error) {
			console.error('Failed to save livestock record.', error)
			setMessage(error?.message || 'Unable to save livestock record.')
		} finally {
			setIsSaving(false)
		}
	}

	async function deleteRecord(id) {
		if (!isSupabaseConfigured() || !supabase) {
			setMessage('Supabase is not configured. Unable to delete records.')
			return
		}

		const shouldDelete = window.confirm('Delete this livestock record?')
		if (!shouldDelete) return

		try {
			const { data: userData, error: userError } = await supabase.auth.getUser()
			if (userError) throw userError

			const user = userData?.user
			if (!user) throw new Error('You must be signed in to delete livestock records.')

			const { error } = await supabase
				.from('livestock_records')
				.delete()
				.eq('id', id)
				.eq('user_id', user.id)

			if (error) throw error

			setRecords((current) => current.filter((record) => record.id !== id))
			setMessage('Livestock record deleted.')

			if (editingRecordId === id) {
				resetForm()
			}
		} catch (error) {
			console.error('Failed to delete livestock record.', error)
			setMessage(error?.message || 'Unable to delete livestock record.')
		}
	}

	return (
		<section className="holy-water-page">
			<div className="hero-panel holy-water-hero">
				<div>
					<p className="eyebrow">Holy Water Ranch Co.</p>
					<h1>Livestock Dashboard</h1>
					<p className="hero-copy">
						Manage cattle records with secure user-level ownership and cloud sync.
					</p>
					<div className="holy-water-module-links">
						<span className="panel-pill">Livestock</span>
						<Link className="secondary-action" to="/holy-water/equipment">Open Equipment</Link>
					</div>
				</div>
				<div className="hero-side">
					<div className="clock-card">
						<span className="clock-label">Data Mode</span>
						<strong>{isUsingSupabase ? 'Supabase' : 'Unavailable'}</strong>
						<span>{totalCattle} cattle records</span>
					</div>
				</div>
			</div>

			<div className="mission holy-water-grid">
				<div className="mission-column">
					<div className="mission-header">
						<h2>{editingRecordId ? 'Edit Cattle Record' : 'Add Cattle Record'}</h2>
						<span className={`status-badge ${isUsingSupabase ? 'working' : 'offline'}`}>
							{isUsingSupabase ? 'Cloud Sync' : 'Config Needed'}
						</span>
					</div>

					<form className="holy-water-form" onSubmit={handleSubmit}>
						<div className="holy-water-form-grid">
							<label>
								Tag Number
								<input
									type="text"
									name="tag_number"
									value={form.tag_number}
									onChange={handleInputChange}
									required
								/>
							</label>

							<label>
								Name
								<input
									type="text"
									name="name"
									value={form.name}
									onChange={handleInputChange}
									required
								/>
							</label>

							<label>
								Breed
								<input
									type="text"
									name="breed"
									value={form.breed}
									onChange={handleInputChange}
								/>
							</label>

							<label>
								Birth Date
								<input
									type="date"
									name="birth_date"
									value={form.birth_date}
									onChange={handleInputChange}
								/>
							</label>

							<label>
								Sex
								<select name="sex" value={form.sex} onChange={handleInputChange}>
									<option value="Female">Female</option>
									<option value="Male">Male</option>
								</select>
							</label>

							<label>
								Weight (lbs)
								<input
									type="number"
									min="0"
									step="0.1"
									name="weight"
									value={form.weight}
									onChange={handleInputChange}
								/>
							</label>

							<label>
								Status
								<select name="status" value={form.status} onChange={handleInputChange}>
									{statusOptions.map((statusOption) => (
										<option key={statusOption} value={statusOption}>
											{statusOption}
										</option>
									))}
								</select>
							</label>

							<label>
								Photo URL
								<input
									type="url"
									name="photo_url"
									value={form.photo_url}
									onChange={handleInputChange}
									placeholder="https://..."
								/>
							</label>

							<label className="holy-water-notes-field">
								Notes
								<textarea
									rows="3"
									name="notes"
									value={form.notes}
									onChange={handleInputChange}
								/>
							</label>
						</div>

						<div className="holy-water-actions">
							<button type="submit" className="primary-action" disabled={isSaving}>
								{isSaving ? 'Saving...' : editingRecordId ? 'Update Record' : 'Add Record'}
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
							placeholder="Search tag, name, breed, status, notes"
							value={searchTerm}
							onChange={(event) => setSearchTerm(event.target.value)}
						/>
						<div className="holy-water-controls">
							<label>
								Status
								<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
									<option value="All">All</option>
									{statusOptions.map((statusOption) => (
										<option key={statusOption} value={statusOption}>
											{statusOption}
										</option>
									))}
								</select>
							</label>
							<label>
								Sort By
								<select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
									{sortOptions.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</label>
						</div>
					</div>

					<div className="panel-card">
						<div className="panel-card-header">
							<h3>Herd Breakdown</h3>
							<span className="panel-pill">Ranch</span>
						</div>
						<div className="holy-water-stats">
							<div>
								<span>Total</span>
								<strong>{totalCattle}</strong>
							</div>
							<div>
								<span>Bulls</span>
								<strong>{bulls}</strong>
							</div>
							<div>
								<span>Cows</span>
								<strong>{cows}</strong>
							</div>
							<div>
								<span>Calves</span>
								<strong>{calves}</strong>
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
					<h3>Cattle Records</h3>
					<span className="panel-pill">Secure by User</span>
				</div>

				{isLoading ? (
					<p className="muted-text">Loading records...</p>
				) : filteredRecords.length === 0 ? (
					<p className="muted-text">No records found. Add your first cattle record above.</p>
				) : (
					<div className="holy-water-table-scroll">
						<table className="holy-water-table">
							<thead>
								<tr>
									<th>Photo</th>
									<th>Tag Number</th>
									<th>Name</th>
									<th>Breed</th>
									<th>Birth Date</th>
									<th>Sex</th>
									<th>Weight</th>
									<th>Status</th>
									<th>Notes</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{filteredRecords.map((record) => (
									<tr key={record.id}>
										<td>
											{record.photo_url ? (
												<img
													className="holy-water-photo"
													src={record.photo_url}
													alt={`Photo of ${record.name || 'cattle'}`}
												/>
											) : (
												<div className="holy-water-photo-placeholder">No photo</div>
											)}
										</td>
										<td>{record.tag_number}</td>
										<td>{record.name}</td>
										<td>{record.breed || '-'}</td>
										<td>{formatDateForDisplay(record.birth_date)}</td>
										<td>{record.sex || '-'}</td>
										<td>{record.weight != null ? `${record.weight} lbs` : '-'}</td>
										<td>{record.status || '-'}</td>
										<td className="holy-water-notes-cell">{record.notes || '-'}</td>
										<td>
											<div className="holy-water-row-actions">
												<button
													type="button"
													className="secondary-action"
													onClick={() => startEdit(record)}
												>
													Edit
												</button>
												<button
													type="button"
													className="delete-task-btn"
													onClick={() => deleteRecord(record.id)}
												>
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

export default HolyWater
