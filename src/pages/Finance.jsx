import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const businessOptions = ['Holy Water Ranch', 'Time Traveler', 'Genesis OS', 'Other']
const paymentMethodOptions = ['Cash', 'Card', 'Bank Transfer', 'Check', 'Digital Wallet', 'Other']
const categoryOptions = [
	'Sales',
	'Services',
	'Feed',
	'Payroll',
	'Maintenance',
	'Fuel',
	'Utilities',
	'Marketing',
	'Software',
	'Taxes',
	'Other',
]

const emptyForm = {
	date: new Date().toISOString().slice(0, 10),
	transaction_type: 'income',
	category: 'Other',
	description: '',
	amount: '',
	business: 'Genesis OS',
	payment_method: 'Card',
	notes: '',
}

function parseSafeDate(value) {
	if (!value) return null

	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

function currency(value) {
	return Number(value || 0).toLocaleString(undefined, {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2,
	})
}

function currentMonthKey() {
	return new Date().toISOString().slice(0, 7)
}

function Finance() {
	const [records, setRecords] = useState([])
	const [form, setForm] = useState(emptyForm)
	const [receiptFile, setReceiptFile] = useState(null)
	const [searchTerm, setSearchTerm] = useState('')
	const [dateFrom, setDateFrom] = useState('')
	const [dateTo, setDateTo] = useState('')
	const [businessFilter, setBusinessFilter] = useState('All')
	const [categoryFilter, setCategoryFilter] = useState('All')
	const [isLoading, setIsLoading] = useState(true)
	const [isSaving, setIsSaving] = useState(false)
	const [isUsingSupabase, setIsUsingSupabase] = useState(isSupabaseConfigured())
	const [message, setMessage] = useState('')
	const [editingId, setEditingId] = useState(null)

	useEffect(() => {
		let ignore = false

		async function loadFinance() {
			if (!isSupabaseConfigured() || !supabase) {
				if (!ignore) {
					setRecords([])
					setIsUsingSupabase(false)
					setMessage('Supabase is not configured. Add environment keys to load finance data.')
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
						setIsUsingSupabase(false)
						setMessage('Please sign in to view finance records.')
						setIsLoading(false)
					}
					return
				}

				const { data, error } = await supabase
					.from('finance_transactions')
					.select('*')
					.eq('user_id', user.id)
					.order('date', { ascending: false })
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

				console.error('Unable to load finance transactions.', error)
				setRecords([])
				setIsUsingSupabase(false)
				setMessage(error?.message || 'Unable to load finance records right now.')
				setIsLoading(false)
			}
		}

		loadFinance()

		return () => {
			ignore = true
		}
	}, [])

	const businesses = useMemo(() => {
		return ['All', ...new Set(records.map((record) => record.business).filter(Boolean))]
	}, [records])

	const categories = useMemo(() => {
		return ['All', ...new Set(records.map((record) => record.category).filter(Boolean))]
	}, [records])

	const filteredRecords = useMemo(() => {
		const query = searchTerm.trim().toLowerCase()

		return records.filter((record) => {
			const recordDate = parseSafeDate(record.date)

			if (dateFrom) {
				const fromDate = parseSafeDate(dateFrom)
				if (fromDate && recordDate && recordDate < fromDate) {
					return false
				}
			}

			if (dateTo) {
				const toDate = parseSafeDate(dateTo)
				if (toDate && recordDate && recordDate > toDate) {
					return false
				}
			}

			if (businessFilter !== 'All' && record.business !== businessFilter) {
				return false
			}

			if (categoryFilter !== 'All' && record.category !== categoryFilter) {
				return false
			}

			if (!query) return true

			const fields = [
				record.description,
				record.category,
				record.business,
				record.payment_method,
				record.notes,
				record.transaction_type,
			]

			return fields.some((field) => String(field || '').toLowerCase().includes(query))
		})
	}, [records, searchTerm, dateFrom, dateTo, businessFilter, categoryFilter])

	const stats = useMemo(() => {
		const month = currentMonthKey()
		const year = new Date().getFullYear()

		let totalIncome = 0
		let totalExpenses = 0
		let monthlyIncome = 0
		let monthlyExpenses = 0
		let ytdIncome = 0
		let ytdExpenses = 0

		for (const record of records) {
			const amount = Number(record.amount || 0)
			const type = record.transaction_type
			const date = String(record.date || '')

			if (type === 'income') {
				totalIncome += amount
			} else {
				totalExpenses += amount
			}

			if (date.startsWith(month)) {
				if (type === 'income') {
					monthlyIncome += amount
				} else {
					monthlyExpenses += amount
				}
			}

			if (date.startsWith(String(year))) {
				if (type === 'income') {
					ytdIncome += amount
				} else {
					ytdExpenses += amount
				}
			}
		}

		return {
			cashBalance: totalIncome - totalExpenses,
			monthlyIncome,
			monthlyExpenses,
			netProfit: monthlyIncome - monthlyExpenses,
			ytdProfit: ytdIncome - ytdExpenses,
		}
	}, [records])

	const expensesByCategory = useMemo(() => {
		const totals = new Map()

		for (const record of records) {
			if (record.transaction_type !== 'expense') continue

			const key = record.category || 'Uncategorized'
			totals.set(key, (totals.get(key) || 0) + Number(record.amount || 0))
		}

		return [...totals.entries()]
			.map(([category, amount]) => ({ category, amount }))
			.sort((left, right) => right.amount - left.amount)
			.slice(0, 8)
	}, [records])

	const monthlyProfitSeries = useMemo(() => {
		const now = new Date()
		const series = []

		for (let offset = 5; offset >= 0; offset -= 1) {
			const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
			const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
			const label = date.toLocaleDateString([], { month: 'short' })

			let income = 0
			let expenses = 0

			for (const record of records) {
				if (!String(record.date || '').startsWith(key)) continue

				const amount = Number(record.amount || 0)

				if (record.transaction_type === 'income') {
					income += amount
				} else {
					expenses += amount
				}
			}

			series.push({
				key,
				label,
				income,
				expenses,
				profit: income - expenses,
			})
		}

		return series
	}, [records])

	function resetForm() {
		setForm(emptyForm)
		setReceiptFile(null)
		setEditingId(null)
	}

	function handleInputChange(event) {
		const { name, value } = event.target
		setForm((current) => ({ ...current, [name]: value }))
	}

	function startEdit(record) {
		setEditingId(record.id)
		setForm({
			date: record.date || new Date().toISOString().slice(0, 10),
			transaction_type: record.transaction_type || 'income',
			category: record.category || 'Other',
			description: record.description || '',
			amount: record.amount != null ? String(record.amount) : '',
			business: record.business || 'Genesis OS',
			payment_method: record.payment_method || 'Card',
			notes: record.notes || '',
		})
		setReceiptFile(null)
		setMessage('')
	}

	async function uploadReceipt(userId) {
		if (!receiptFile || !supabase) {
			return null
		}

		const sanitizedName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
		const filePath = `${userId}/${Date.now()}-${sanitizedName}`

		const { error: uploadError } = await supabase.storage
			.from('finance-receipts')
			.upload(filePath, receiptFile, {
				upsert: true,
				contentType: receiptFile.type || 'application/octet-stream',
			})

		if (uploadError) {
			throw uploadError
		}

		const { data: publicData } = supabase.storage
			.from('finance-receipts')
			.getPublicUrl(filePath)

		return publicData?.publicUrl || null
	}

	async function handleSubmit(event) {
		event.preventDefault()

		if (!isSupabaseConfigured() || !supabase) {
			setMessage('Supabase is not configured. Unable to save transactions.')
			return
		}

		const description = form.description.trim()
		const amount = Number.parseFloat(form.amount)

		if (!description) {
			setMessage('Description is required.')
			return
		}

		if (Number.isNaN(amount) || amount <= 0) {
			setMessage('Amount must be a positive number.')
			return
		}

		setIsSaving(true)
		setMessage('')

		try {
			const { data: userData, error: userError } = await supabase.auth.getUser()
			if (userError) throw userError

			const user = userData?.user
			if (!user) throw new Error('You must be signed in to save transactions.')

			const uploadedReceiptUrl = await uploadReceipt(user.id)
			const currentRecord = editingId ? records.find((record) => record.id === editingId) : null

			const payload = {
				user_id: user.id,
				date: form.date,
				transaction_type: form.transaction_type,
				category: form.category.trim() || 'Other',
				description,
				amount,
				business: form.business,
				payment_method: form.payment_method,
				notes: form.notes.trim() || null,
				receipt_url: uploadedReceiptUrl || currentRecord?.receipt_url || null,
			}

			if (editingId) {
				const { data, error } = await supabase
					.from('finance_transactions')
					.update(payload)
					.eq('id', editingId)
					.eq('user_id', user.id)
					.select()
					.single()

				if (error) throw error

				setRecords((current) => current.map((record) => (record.id === editingId ? data : record)))
				setMessage('Transaction updated.')
			} else {
				const { data, error } = await supabase
					.from('finance_transactions')
					.insert(payload)
					.select()
					.single()

				if (error) throw error

				setRecords((current) => [data, ...current])
				setMessage('Transaction added.')
			}

			resetForm()
		} catch (error) {
			console.error('Failed to save transaction.', error)
			setMessage(error?.message || 'Unable to save transaction.')
		} finally {
			setIsSaving(false)
		}
	}

	async function deleteRecord(id) {
		if (!isSupabaseConfigured() || !supabase) {
			setMessage('Supabase is not configured. Unable to delete transactions.')
			return
		}

		const shouldDelete = window.confirm('Delete this transaction?')
		if (!shouldDelete) return

		try {
			const { data: userData, error: userError } = await supabase.auth.getUser()
			if (userError) throw userError

			const user = userData?.user
			if (!user) throw new Error('You must be signed in to delete transactions.')

			const { error } = await supabase
				.from('finance_transactions')
				.delete()
				.eq('id', id)
				.eq('user_id', user.id)

			if (error) throw error

			setRecords((current) => current.filter((record) => record.id !== id))
			setMessage('Transaction deleted.')

			if (editingId === id) {
				resetForm()
			}
		} catch (error) {
			console.error('Failed to delete transaction.', error)
			setMessage(error?.message || 'Unable to delete transaction.')
		}
	}

	const chartIncome = Math.max(stats.monthlyIncome, 1)
	const chartExpenses = Math.max(stats.monthlyExpenses, 1)
	const chartIncomeExpenseMax = Math.max(chartIncome, chartExpenses)
	const categoryMax = Math.max(...expensesByCategory.map((item) => item.amount), 1)
	const monthlyProfitMax = Math.max(...monthlyProfitSeries.map((item) => Math.abs(item.profit)), 1)

	return (
		<section className="holy-water-page">
			<div className="hero-panel holy-water-hero">
				<div>
					<p className="eyebrow">Genesis OS</p>
					<h1>Finance Center</h1>
					<p className="hero-copy">
						Track income and expenses across all business units with secure cloud records and live analytics.
					</p>
				</div>
				<div className="hero-side">
					<div className="clock-card">
						<span className="clock-label">Data Mode</span>
						<strong>{isUsingSupabase ? 'Supabase' : 'Unavailable'}</strong>
						<span>{records.length} transactions</span>
					</div>
				</div>
			</div>

			<div className="metrics-grid finance-center-metrics">
				<article className="metric-card">
					<span>Cash Balance</span>
					<strong>{currency(stats.cashBalance)}</strong>
				</article>
				<article className="metric-card">
					<span>Monthly Income</span>
					<strong>{currency(stats.monthlyIncome)}</strong>
				</article>
				<article className="metric-card">
					<span>Monthly Expenses</span>
					<strong>{currency(stats.monthlyExpenses)}</strong>
				</article>
				<article className="metric-card">
					<span>Net Profit</span>
					<strong>{currency(stats.netProfit)}</strong>
				</article>
				<article className="metric-card">
					<span>Year-to-Date Profit</span>
					<strong>{currency(stats.ytdProfit)}</strong>
				</article>
			</div>

			<div className="mission holy-water-grid finance-center-grid">
				<div className="mission-column">
					<div className="mission-header">
						<h2>{editingId ? 'Edit Transaction' : 'Add Transaction'}</h2>
						<span className={`status-badge ${isUsingSupabase ? 'working' : 'offline'}`}>
							{isUsingSupabase ? 'Cloud Sync' : 'Config Needed'}
						</span>
					</div>

					<form className="holy-water-form" onSubmit={handleSubmit}>
						<div className="holy-water-form-grid finance-center-form-grid">
							<label>
								Date
								<input type="date" name="date" value={form.date} onChange={handleInputChange} required />
							</label>

							<label>
								Income or Expense
								<select name="transaction_type" value={form.transaction_type} onChange={handleInputChange}>
									<option value="income">Income</option>
									<option value="expense">Expense</option>
								</select>
							</label>

							<label>
								Category
								<select name="category" value={form.category} onChange={handleInputChange}>
									{categoryOptions.map((option) => (
										<option key={option} value={option}>{option}</option>
									))}
								</select>
							</label>

							<label>
								Description
								<input type="text" name="description" value={form.description} onChange={handleInputChange} required />
							</label>

							<label>
								Amount
								<input type="number" min="0" step="0.01" name="amount" value={form.amount} onChange={handleInputChange} required />
							</label>

							<label>
								Business
								<select name="business" value={form.business} onChange={handleInputChange}>
									{businessOptions.map((option) => (
										<option key={option} value={option}>{option}</option>
									))}
								</select>
							</label>

							<label>
								Payment Method
								<select name="payment_method" value={form.payment_method} onChange={handleInputChange}>
									{paymentMethodOptions.map((option) => (
										<option key={option} value={option}>{option}</option>
									))}
								</select>
							</label>

							<label>
								Receipt Upload
								<input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} />
							</label>

							<label className="holy-water-notes-field">
								Notes
								<textarea rows="3" name="notes" value={form.notes} onChange={handleInputChange} />
							</label>
						</div>

						<div className="holy-water-actions">
							<button type="submit" className="primary-action" disabled={isSaving}>
								{isSaving ? 'Saving...' : editingId ? 'Update Transaction' : 'Add Transaction'}
							</button>
							{editingId ? (
								<button type="button" className="secondary-action" onClick={resetForm}>Cancel Edit</button>
							) : null}
						</div>
					</form>

					{message ? <p className="holy-water-message">{message}</p> : null}
				</div>

				<div className="mission-column secondary-stack">
					<div className="panel-card">
						<div className="panel-card-header">
							<h3>Search & Filters</h3>
							<span className="panel-pill">Live</span>
						</div>
						<input
							className="holy-water-search"
							type="text"
							placeholder="Search description, category, business, notes"
							value={searchTerm}
							onChange={(event) => setSearchTerm(event.target.value)}
						/>
						<div className="holy-water-controls finance-center-filters">
							<label>
								From Date
								<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
							</label>
							<label>
								To Date
								<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
							</label>
							<label>
								Business
								<select value={businessFilter} onChange={(event) => setBusinessFilter(event.target.value)}>
									{businesses.map((option) => (
										<option key={option} value={option}>{option}</option>
									))}
								</select>
							</label>
							<label>
								Category
								<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
									{categories.map((option) => (
										<option key={option} value={option}>{option}</option>
									))}
								</select>
							</label>
						</div>
					</div>

					<div className="panel-card">
						<div className="panel-card-header">
							<h3>Income vs Expenses</h3>
							<span className="panel-pill">Chart</span>
						</div>
						<div className="finance-chart-bars">
							<div className="finance-chart-row">
								<span>Income</span>
								<div className="finance-bar-track">
									<div className="finance-bar income" style={{ width: `${(stats.monthlyIncome / chartIncomeExpenseMax) * 100}%` }} />
								</div>
								<strong>{currency(stats.monthlyIncome)}</strong>
							</div>
							<div className="finance-chart-row">
								<span>Expenses</span>
								<div className="finance-bar-track">
									<div className="finance-bar expense" style={{ width: `${(stats.monthlyExpenses / chartIncomeExpenseMax) * 100}%` }} />
								</div>
								<strong>{currency(stats.monthlyExpenses)}</strong>
							</div>
						</div>
					</div>

					<div className="panel-card">
						<div className="panel-card-header">
							<h3>Expenses by Category</h3>
							<span className="panel-pill">Chart</span>
						</div>
						{expensesByCategory.length === 0 ? (
							<p className="muted-text">No expense data yet.</p>
						) : (
							<div className="finance-chart-bars">
								{expensesByCategory.map((item) => (
									<div className="finance-chart-row" key={item.category}>
										<span>{item.category}</span>
										<div className="finance-bar-track">
											<div className="finance-bar expense" style={{ width: `${(item.amount / categoryMax) * 100}%` }} />
										</div>
										<strong>{currency(item.amount)}</strong>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="panel-card">
						<div className="panel-card-header">
							<h3>Monthly Profit</h3>
							<span className="panel-pill">Chart</span>
						</div>
						<div className="finance-monthly-grid">
							{monthlyProfitSeries.map((item) => {
								const positive = item.profit >= 0
								const barHeight = `${Math.max((Math.abs(item.profit) / monthlyProfitMax) * 100, 6)}%`

								return (
									<div className="finance-monthly-item" key={item.key}>
										<span>{item.label}</span>
										<div className="finance-monthly-track">
											<div className={`finance-monthly-bar ${positive ? 'income' : 'expense'}`} style={{ height: barHeight }} />
										</div>
										<small>{currency(item.profit)}</small>
									</div>
								)
							})}
						</div>
					</div>
				</div>
			</div>

			<section className="panel-card holy-water-table-wrap">
				<div className="panel-card-header">
					<h3>Transactions</h3>
					<span className="panel-pill">Secure by User</span>
				</div>

				{isLoading ? (
					<p className="muted-text">Loading transactions...</p>
				) : filteredRecords.length === 0 ? (
					<p className="muted-text">No transactions found. Add your first finance entry above.</p>
				) : (
					<div className="holy-water-table-scroll">
						<table className="holy-water-table finance-center-table">
							<thead>
								<tr>
									<th>Date</th>
									<th>Type</th>
									<th>Category</th>
									<th>Description</th>
									<th>Amount</th>
									<th>Business</th>
									<th>Payment Method</th>
									<th>Notes</th>
									<th>Receipt</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{filteredRecords.map((record) => (
									<tr key={record.id}>
										<td>{record.date || '-'}</td>
										<td>
											<span className={record.transaction_type === 'income' ? 'income-pill' : 'expense-pill'}>
												{record.transaction_type}
											</span>
										</td>
										<td>{record.category || '-'}</td>
										<td>{record.description}</td>
										<td>{currency(record.amount)}</td>
										<td>{record.business || '-'}</td>
										<td>{record.payment_method || '-'}</td>
										<td className="holy-water-notes-cell">{record.notes || '-'}</td>
										<td>
											{record.receipt_url ? (
												<a className="brief-link" href={record.receipt_url} target="_blank" rel="noreferrer">
													View
												</a>
											) : '-'}
										</td>
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

export default Finance
