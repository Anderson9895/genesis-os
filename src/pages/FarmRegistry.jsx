import { useEffect, useMemo, useState } from 'react'
import { callAiApi } from '../lib/aiApiClient'

const blankField = {
  farm_id: '', name: '', field_number: '', ownership_type: 'owned',
  stated_acres: '', rent_per_acre: '', production_program: 'conventional',
  certifier_name: '', latitude: '', longitude: '', notes: '',
}

function FarmRegistry() {
  const [data, setData] = useState({ farms: [], fields: [], seasons: [] })
  const [farmName, setFarmName] = useState('')
  const [field, setField] = useState(blankField)
  const [season, setSeason] = useState({
    field_id: '', crop_year: new Date().getFullYear(), crop_name: '',
    variety: '', intended_use: 'commercial', planted_acres: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const payload = await callAiApi('/api/farm-registry')
      setData({
        farms: payload.farms || [],
        fields: payload.fields || [],
        seasons: payload.seasons || [],
      })
      if (!field.farm_id && payload.farms?.[0]) {
        setField((current) => ({ ...current, farm_id: payload.farms[0].id }))
      }
    } catch (err) {
      setError(err.message || 'Could not load the Farm Registry.')
    }
  }

  useEffect(() => { load() }, [])

  async function submit(action, body) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await callAiApi('/api/farm-registry', { method: 'POST', body: { action, ...body } })
      setMessage('Saved permanently.')
      await load()
      return true
    } catch (err) {
      setError(err.message || 'Could not save this record.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addFarm(event) {
    event.preventDefault()
    if (await submit('create_farm', { name: farmName })) setFarmName('')
  }

  async function addField(event) {
    event.preventDefault()
    if (await submit('create_field', field)) {
      setField((current) => ({ ...blankField, farm_id: current.farm_id }))
    }
  }

  async function addSeason(event) {
    event.preventDefault()
    if (await submit('create_season', season)) {
      setSeason((current) => ({
        ...current, crop_name: '', variety: '', planted_acres: '', notes: '',
      }))
    }
  }

  function captureGps() {
    setError('')
    if (!navigator.geolocation) {
      setError('This device does not provide GPS location.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setField((current) => ({
        ...current,
        latitude: coords.latitude.toFixed(7),
        longitude: coords.longitude.toFixed(7),
      })),
      (err) => setError(err.message || 'GPS location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const farmNames = useMemo(
    () => Object.fromEntries(data.farms.map((farm) => [farm.id, farm.name])),
    [data.farms]
  )
  const fieldsByFarm = useMemo(() => data.fields.reduce((groups, row) => {
    const key = row.farm_id
    groups[key] = [...(groups[key] || []), row]
    return groups
  }, {}), [data.fields])

  return (
    <>
      <h1>🌾 Farm Registry</h1>
      <p>
        Permanent identity and year-to-year memory for every farm, field and crop season.
        This is the foundation for GPS operations, spraying, costs, harvest and analysis.
      </p>

      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="card">
        <h2>1. Add a farm</h2>
        <form className="teamlead-form" onSubmit={addFarm}>
          <input value={farmName} onChange={(e) => setFarmName(e.target.value)}
            placeholder="Farm name — e.g. Home Place" required />
          <button className="primary-action" disabled={busy}>Save farm</button>
        </form>
      </div>

      <div className="card">
        <h2>2. Add and identify a field</h2>
        <form className="teamlead-form" onSubmit={addField}>
          <select value={field.farm_id} onChange={(e) => setField({ ...field, farm_id: e.target.value })} required>
            <option value="">Choose farm</option>
            {data.farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
          <input value={field.name} onChange={(e) => setField({ ...field, name: e.target.value })}
            placeholder="Field name — e.g. North 80" required />
          <div className="teamlead-row">
            <input value={field.field_number} onChange={(e) => setField({ ...field, field_number: e.target.value })}
              placeholder="Field number (optional)" />
            <input type="number" step="0.001" min="0" value={field.stated_acres}
              onChange={(e) => setField({ ...field, stated_acres: e.target.value })} placeholder="Acres" />
          </div>
          <div className="teamlead-row">
            <select value={field.ownership_type} onChange={(e) => setField({ ...field, ownership_type: e.target.value })}>
              <option value="owned">Owned</option><option value="cash_rent">Cash rented</option>
              <option value="crop_share">Crop share</option><option value="flex_lease">Flexible lease</option>
              <option value="custom_farmed">Custom farmed</option><option value="grazing_lease">Grazing lease</option>
              <option value="other">Other</option>
            </select>
            <input type="number" step="0.01" min="0" value={field.rent_per_acre}
              onChange={(e) => setField({ ...field, rent_per_acre: e.target.value })} placeholder="Rent per acre" />
          </div>
          <select value={field.production_program} onChange={(e) => setField({ ...field, production_program: e.target.value })}>
            <option value="conventional">Conventional</option>
            <option value="certified_organic">Certified organic</option>
            <option value="transitional_organic">Transitional organic</option>
            <option value="organic_practices">Organic practices—not certified</option>
            <option value="regenerative">Regenerative</option>
            <option value="non_gmo">Non-GMO</option>
            <option value="identity_preserved">Identity preserved</option>
            <option value="other">Other program</option>
          </select>
          {(field.production_program === 'certified_organic' || field.production_program === 'transitional_organic') ? (
            <input value={field.certifier_name} onChange={(e) => setField({ ...field, certifier_name: e.target.value })}
              placeholder="Organic certifier" />
          ) : null}
          <div className="teamlead-row">
            <input value={field.latitude} onChange={(e) => setField({ ...field, latitude: e.target.value })} placeholder="GPS latitude" />
            <input value={field.longitude} onChange={(e) => setField({ ...field, longitude: e.target.value })} placeholder="GPS longitude" />
            <button type="button" className="secondary-action" onClick={captureGps}>Use my GPS</button>
          </div>
          <textarea rows="3" value={field.notes} onChange={(e) => setField({ ...field, notes: e.target.value })}
            placeholder="Field notes, legal description, landlord or other details" />
          <button className="primary-action" disabled={busy || data.farms.length === 0}>Save field</button>
        </form>
      </div>

      <div className="card">
        <h2>3. Start a crop season</h2>
        <form className="teamlead-form" onSubmit={addSeason}>
          <select value={season.field_id} onChange={(e) => setSeason({ ...season, field_id: e.target.value })} required>
            <option value="">Choose field</option>
            {data.fields.map((row) => <option key={row.id} value={row.id}>{farmNames[row.farm_id]} — {row.name}</option>)}
          </select>
          <div className="teamlead-row">
            <input type="number" value={season.crop_year} onChange={(e) => setSeason({ ...season, crop_year: e.target.value })} required />
            <input value={season.crop_name} onChange={(e) => setSeason({ ...season, crop_name: e.target.value })} placeholder="Crop" />
            <input value={season.variety} onChange={(e) => setSeason({ ...season, variety: e.target.value })} placeholder="Variety" />
          </div>
          <div className="teamlead-row">
            <select value={season.intended_use} onChange={(e) => setSeason({ ...season, intended_use: e.target.value })}>
              <option value="commercial">Commercial</option><option value="seed">Seed</option>
              <option value="feed">Feed</option><option value="forage">Forage</option>
              <option value="grazing">Grazing</option><option value="cover_crop">Cover crop</option>
              <option value="test_plot">Test plot</option><option value="personal">Personal use</option>
            </select>
            <input type="number" step="0.001" min="0" value={season.planted_acres}
              onChange={(e) => setSeason({ ...season, planted_acres: e.target.value })} placeholder="Planned/planted acres" />
          </div>
          <textarea rows="3" value={season.notes} onChange={(e) => setSeason({ ...season, notes: e.target.value })} placeholder="Season notes" />
          <button className="primary-action" disabled={busy || data.fields.length === 0}>Save crop season</button>
        </form>
      </div>

      <div className="card">
        <h2>Registered land</h2>
        {data.farms.length === 0 ? <p className="muted-text">No farms registered yet.</p> : data.farms.map((farm) => (
          <section key={farm.id} style={{ marginBottom: 24 }}>
            <h3>{farm.name}</h3>
            {(fieldsByFarm[farm.id] || []).length === 0 ? <p className="muted-text">No fields yet.</p> : (
              <ul className="job-list">
                {(fieldsByFarm[farm.id] || []).map((row) => (
                  <li className="job-item" key={row.id}>
                    <div className="job-item-header"><strong>{row.name}</strong><span className="status-badge assigned">{row.production_program.replaceAll('_', ' ')}</span></div>
                    <p>{row.stated_acres || '—'} acres • {row.ownership_type.replaceAll('_', ' ')}</p>
                    {row.rent_per_acre ? <p>Rent: ${row.rent_per_acre}/acre</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  )
}

export default FarmRegistry
