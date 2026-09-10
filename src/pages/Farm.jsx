import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import FarmDocuments from '../components/FarmDocuments'

const today = new Date().toISOString().slice(0, 10)
const year = new Date().getFullYear()
const inputStyle = { color: '#fff', background: '#020617', border: '1px solid #475569', borderRadius: 8, padding: 10, width: '100%', boxSizing: 'border-box' }
const panelStyle = { background: '#111827', border: '1px solid #334155', borderRadius: 16, padding: 18 }
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }

const sections = [
  {
    table: 'farm_fields',
    title: 'Fields & pastures — owned or rented',
    defaults: { name: '', land_type: 'Field', tenure: 'Owned', acres: '', landlord: '', crop_name: '', production_type: 'Conventional', crop_year: year, notes: '' },
    fields: [
      ['name','Name','text',true], ['land_type','Type','select',true,['Field','Pasture']], ['tenure','Tenure','select',true,['Owned','Rented']],
      ['acres','Acres','number',true], ['landlord','Landlord (if rented)','text'], ['crop_name','Crop / use','text'],
      ['production_type','Production type','select',true,['Conventional','Organic','Transitioning','Pasture']], ['crop_year','Crop year','number',true], ['notes','Notes','text']
    ]
  },
  {
    table: 'farm_applications',
    title: 'Crop inputs & applications',
    warning: 'Use only the current product label or a qualified adviser for rates and restrictions. Genesis does not invent application rates.',
    needsField: true,
    defaults: { field_id: '', applied_on: today, category: 'Fertilizer', product_name: '', rate: '', rate_unit: '', method: '', weather: '', total_cost: '', label_source: '', notes: '' },
    fields: [
      ['field_id','Field','field',true], ['applied_on','Date','date',true], ['category','Category','select',true,['Fertilizer','Herbicide','Pesticide','Fungicide','Organic input','Other']],
      ['product_name','Product','text',true], ['rate','Rate','number'], ['rate_unit','Rate unit','text'], ['method','Method','text'],
      ['weather','Weather','text'], ['total_cost','Total cost','number'], ['label_source','Label / source reference','text'], ['notes','Notes','text']
    ]
  },
  {
    table: 'farm_harvests',
    title: 'Harvest & yield',
    needsField: true,
    defaults: { field_id: '', harvested_on: today, crop_year: year, total_weight_lbs: '', total_bushels: '', harvested_acres: '', revenue: '', quality_grade: '', notes: '' },
    fields: [
      ['field_id','Field','field',true], ['harvested_on','Harvest date','date',true], ['crop_year','Crop year','number',true],
      ['total_weight_lbs','Pounds','number'], ['total_bushels','Bushels','number'], ['harvested_acres','Harvested acres','number'],
      ['revenue','Revenue','number'], ['quality_grade','Quality / grade','text'], ['notes','Notes','text']
    ]
  },
  {
    table: 'farm_costs',
    title: 'Field costs',
    defaults: { field_id: '', incurred_on: today, category: 'Seed', description: '', amount: '', notes: '' },
    fields: [
      ['field_id','Field (optional)','field'], ['incurred_on','Date','date',true], ['category','Category','select',true,['Seed','Fuel','Labor','Rent','Repairs','Insurance','Other']],
      ['description','Description','text',true], ['amount','Amount','number',true], ['notes','Notes','text']
    ]
  },
  {
    table: 'livestock_events',
    title: 'Livestock feed, treatments, breeding & movements',
    warning: 'Follow the veterinarian’s direction and current product label. Record withdrawal dates; Genesis does not diagnose or prescribe.',
    defaults: { livestock_id: '', event_date: today, event_type: 'Feed', description: '', quantity: '', unit: '', cost: '', withdrawal_until: '', from_location: '', to_location: '', notes: '' },
    fields: [
      ['livestock_id','Animal (optional)','animal'], ['event_date','Date','date',true], ['event_type','Event type','select',true,['Feed','Treatment','Breeding','Movement']],
      ['description','Description / product','text',true], ['quantity','Quantity','number'], ['unit','Unit','text'], ['cost','Cost','number'],
      ['withdrawal_until','Withdrawal until','date'], ['from_location','From location','text'], ['to_location','To location','text'], ['notes','Notes','text']
    ]
  }
]

function Field({ label, children }) {
  return <label style={{ color: '#cbd5e1', display: 'grid', gap: 5, fontSize: 13 }}>{label}{children}</label>
}

export default function Farm() {
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState({ operation_name: '', operation_type: 'Farm & Ranch', county_state: '', production_focus: '', certification_status: '', notes: '' })
  const [records, setRecords] = useState({ farm_fields: [], farm_applications: [], farm_harvests: [], farm_costs: [], livestock_events: [] })
  const [livestock, setLivestock] = useState([])
  const [forms, setForms] = useState(Object.fromEntries(sections.map(s => [s.table, s.defaults])))
  const [status, setStatus] = useState('Loading your operation…')
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  async function load() {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return setStatus('Please sign in again.')
    setUserId(uid)
    const queries = [
      supabase.from('farm_profiles').select('*').eq('user_id', uid).maybeSingle(),
      ...sections.map(s => supabase.from(s.table).select('*').eq('user_id', uid).order(s.table === 'farm_fields' ? 'name' : s.fields.find(f => f[2] === 'date')?.[0] || 'created_at', { ascending: false })),
      supabase.from('livestock_records').select('id,tag_number,name').eq('user_id', uid).order('tag_number')
    ]
    const results = await Promise.all(queries)
    const failure = results.find(result => result.error)
    if (failure) return setStatus(failure.error.message)
    if (results[0].data) setProfile(results[0].data)
    const next = {}
    sections.forEach((s, index) => { next[s.table] = results[index + 1].data || [] })
    setRecords(next)
    setLivestock(results[results.length - 1].data || [])
    setStatus('')
  }

  useEffect(() => { load() }, [])

  async function saveProfile(event) {
    event.preventDefault()
    setBusy(true)
    const payload = { ...profile, user_id: userId }
    if (!payload.id) delete payload.id
    const { error } = await supabase.from('farm_profiles').upsert(payload, { onConflict: 'user_id' })
    setStatus(error ? error.message : 'Operation profile saved.')
    if (!error) await load()
    setBusy(false)
  }

  async function saveRecord(event, section) {
    event.preventDefault()
    setBusy(true)
    const values = forms[section.table]
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]))
    const { error } = await supabase.from(section.table).insert({ ...payload, user_id: userId })
    setStatus(error ? error.message : 'Record saved.')
    if (!error) {
      setForms(current => ({ ...current, [section.table]: section.defaults }))
      await load()
    }
    setBusy(false)
  }

  const fieldName = id => records.farm_fields.find(item => String(item.id) === String(id))?.name || 'Unassigned'
  const animalName = id => {
    const animal = livestock.find(item => String(item.id) === String(id))
    return animal ? (animal.name || animal.tag_number) : 'Group / unassigned'
  }

  const canAttach = table => ['farm_fields', 'farm_applications', 'farm_harvests', 'farm_costs'].includes(table)

  const recordSummary = (table, item) => {
    switch (table) {
      case 'farm_fields':
        return `${item.name} — ${item.tenure} · ${item.acres} ac · ${item.crop_year}`
      case 'farm_applications':
        return `${item.applied_on} · ${item.product_name} · ${fieldName(item.field_id)} · ${Number(item.total_cost || 0).toFixed(2)}`
      case 'farm_harvests':
        return `${item.harvested_on} · ${item.crop_year} · ${Number(item.total_weight_lbs || 0).toFixed(0)} lb · ${Number(item.revenue || 0).toFixed(2)}`
      case 'farm_costs':
        return `${item.incurred_on} · ${item.category} · ${item.description} · ${Number(item.amount || 0).toFixed(2)}`
      default:
        return item.name || item.description || String(item.id)
    }
  }

  const totals = useMemo(() => {
    const acres = records.farm_fields.reduce((sum, item) => sum + Number(item.acres || 0), 0)
    const cropCosts = records.farm_costs.reduce((sum, item) => sum + Number(item.amount || 0), 0) + records.farm_applications.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
    const livestockCosts = records.livestock_events.reduce((sum, item) => sum + Number(item.cost || 0), 0)
    const revenue = records.farm_harvests.reduce((sum, item) => sum + Number(item.revenue || 0), 0)
    const pounds = records.farm_harvests.reduce((sum, item) => sum + Number(item.total_weight_lbs || 0), 0)
    const harvestedAcres = records.farm_harvests.reduce((sum, item) => sum + Number(item.harvested_acres || 0), 0)
    return { acres, cropCosts, livestockCosts, revenue, pounds, harvestedAcres, headCount: livestock.length }
  }, [records, livestock.length])

  const yearly = useMemo(() => {
    const summary = {}
    records.farm_harvests.forEach(item => {
      const key = item.crop_year
      summary[key] ||= { year: key, revenue: 0, pounds: 0, acres: 0 }
      summary[key].revenue += Number(item.revenue || 0)
      summary[key].pounds += Number(item.total_weight_lbs || 0)
      summary[key].acres += Number(item.harvested_acres || 0)
    })
    return Object.values(summary).sort((a, b) => b.year - a.year)
  }, [records.farm_harvests])

  function answerQuestion(event) {
    event.preventDefault()
    const text = question.toLowerCase()
    const costPerAcre = totals.acres ? totals.cropCosts / totals.acres : 0
    const costPerHead = totals.headCount ? totals.livestockCosts / totals.headCount : 0
    if (text.includes('acre') && text.includes('cost')) setAnswer('Recorded crop cost per acre is $' + costPerAcre.toFixed(2) + ' across ' + totals.acres.toFixed(2) + ' acres.')
    else if ((text.includes('head') || text.includes('animal')) && text.includes('cost')) setAnswer('Recorded livestock event cost per head is $' + costPerHead.toFixed(2) + ' across ' + totals.headCount + ' animals.')
    else if (text.includes('yield') || text.includes('harvest')) setAnswer('Recorded harvest totals are ' + totals.pounds.toFixed(0) + ' lb from ' + totals.harvestedAcres.toFixed(2) + ' harvested acres, or ' + (totals.harvestedAcres ? totals.pounds / totals.harvestedAcres : 0).toFixed(1) + ' lb per acre.')
    else if (text.includes('revenue') || text.includes('income')) setAnswer('Recorded harvest revenue is $' + totals.revenue.toFixed(2) + '.')
    else if (text.includes('field') || text.includes('pasture')) setAnswer('You have ' + records.farm_fields.length + ' fields or pastures totaling ' + totals.acres.toFixed(2) + ' acres.')
    else setAnswer('I can answer typed questions about acres, crop cost per acre, livestock cost per head, fields, harvest yield, and recorded revenue. For chemical rates or treatments, use the current label or a licensed professional.')
  }

  function exportCsv() {
    const rows = [['record_type','date_or_year','description','field_or_animal','amount_or_quantity','notes']]
    records.farm_fields.forEach(item => rows.push(['field', item.crop_year, item.name, item.tenure, item.acres, item.notes || '']))
    records.farm_applications.forEach(item => rows.push(['application', item.applied_on, item.product_name, fieldName(item.field_id), item.total_cost, item.notes || '']))
    records.farm_harvests.forEach(item => rows.push(['harvest', item.harvested_on, item.crop_year, fieldName(item.field_id), item.total_weight_lbs, item.notes || '']))
    records.farm_costs.forEach(item => rows.push(['cost', item.incurred_on, item.description, fieldName(item.field_id), item.amount, item.notes || '']))
    records.livestock_events.forEach(item => rows.push(['livestock_event', item.event_date, item.description, animalName(item.livestock_id), item.cost, item.notes || '']))
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'genesis-farm-ranch-records.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function renderInput(section, field) {
    const [name, label, type, required, options] = field
    const value = forms[section.table][name] ?? ''
    const change = event => setForms(current => ({ ...current, [section.table]: { ...current[section.table], [name]: event.target.value } }))
    if (type === 'select') return <Field key={name} label={label}><select style={inputStyle} required={required} value={value} onChange={change}>{options.map(option => <option key={option}>{option}</option>)}</select></Field>
    if (type === 'field') return <Field key={name} label={label}><select style={inputStyle} required={required} value={value} onChange={change}><option value="">Choose field or pasture</option>{records.farm_fields.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    if (type === 'animal') return <Field key={name} label={label}><select style={inputStyle} value={value} onChange={change}><option value="">Group / unassigned</option>{livestock.map(item => <option key={item.id} value={item.id}>{item.tag_number} {item.name ? '— ' + item.name : ''}</option>)}</select></Field>
    return <Field key={name} label={label}><input style={inputStyle} type={type} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={change} /></Field>
  }

  return (
    <div style={{ maxWidth: 1400 }}>
      <p className="eyebrow">Genesis Farm & Ranch</p>
      <h1 style={{ marginBottom: 8 }}>Founding Farmer Command Center</h1>
      <p style={{ color: '#cbd5e1', maxWidth: 900 }}>Private field, livestock, cost, harvest, and year-over-year records in one place.</p>
      {status && <p style={{ margin: '16px 0', color: status.includes('saved') || status.includes('Saved') ? '#86efac' : '#facc15' }}>{status}</p>}

      <div style={{ ...gridStyle, margin: '22px 0' }}>
        {[
          ['Total acres', totals.acres.toFixed(2)],
          ['Crop costs', '$' + totals.cropCosts.toFixed(2)],
          ['Cost per acre', '$' + (totals.acres ? totals.cropCosts / totals.acres : 0).toFixed(2)],
          ['Livestock event costs', '$' + totals.livestockCosts.toFixed(2)],
          ['Cost per head', '$' + (totals.headCount ? totals.livestockCosts / totals.headCount : 0).toFixed(2)],
          ['Harvest revenue', '$' + totals.revenue.toFixed(2)],
          ['Yield / harvested acre', (totals.harvestedAcres ? totals.pounds / totals.harvestedAcres : 0).toFixed(1) + ' lb']
        ].map(([label, value]) => <article key={label} style={panelStyle}><small style={{ color: '#94a3b8' }}>{label}</small><strong style={{ color: '#facc15', display: 'block', fontSize: 26, marginTop: 7 }}>{value}</strong></article>)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <button className="primary-action" onClick={() => window.print()}>Print report</button>
        <button className="secondary-action" style={{ borderRadius: 8, padding: '10px 12px' }} onClick={exportCsv}>Export CSV</button>
        <Link className="secondary-action" style={{ borderRadius: 8, padding: '10px 12px', textDecoration: 'none' }} to="/app/finance">Invoices & receipts</Link>
        <Link className="secondary-action" style={{ borderRadius: 8, padding: '10px 12px', textDecoration: 'none' }} to="/app/genesis-companion">Ask Genesis</Link>
        <Link className="secondary-action" style={{ borderRadius: 8, padding: '10px 12px', textDecoration: 'none' }} to="/app/fields-pastures">Detailed pastures</Link>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <section style={panelStyle}>
          <h2 style={{ color: '#facc15' }}>Operation profile</h2>
          <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
            <div style={gridStyle}>
              {[['operation_name','Operation name'],['county_state','County / state'],['production_focus','Production focus'],['certification_status','Certification status']].map(([name,label]) => <Field key={name} label={label}><input style={inputStyle} required={name === 'operation_name'} value={profile[name] || ''} onChange={e => setProfile({ ...profile, [name]: e.target.value })} /></Field>)}
              <Field label="Operation type"><select style={inputStyle} value={profile.operation_type || 'Farm & Ranch'} onChange={e => setProfile({ ...profile, operation_type: e.target.value })}><option>Farm</option><option>Ranch</option><option>Farm & Ranch</option></select></Field>
            </div>
            <Field label="Notes"><textarea style={inputStyle} value={profile.notes || ''} onChange={e => setProfile({ ...profile, notes: e.target.value })} /></Field>
            <button disabled={busy} className="primary-action">Save profile</button>
          </form>
        </section>

        {sections.map(section => (
          <section key={section.table} style={panelStyle}>
            <h2 style={{ color: '#facc15' }}>{section.title}</h2>
            {section.warning && <p style={{ color: '#fbbf24', marginBottom: 12 }}>Safety: {section.warning}</p>}
            <form onSubmit={event => saveRecord(event, section)} style={{ display: 'grid', gap: 10 }}>
              <div style={gridStyle}>{section.fields.map(field => renderInput(section, field))}</div>
              <button disabled={busy || (section.needsField && !records.farm_fields.length)} className="primary-action">Save record</button>
            </form>
            {records[section.table].length > 0 && <p style={{ color: '#94a3b8', marginTop: 12 }}>{records[section.table].length} saved record{records[section.table].length === 1 ? '' : 's'}.</p>}
            {canAttach(section.table) && records[section.table].length > 0 && (
              <div style={{ marginTop: 8 }}>
                {records[section.table].map(item => (
                  <div key={item.id} style={{ background: '#020617', borderRadius: 10, padding: '8px 12px', marginTop: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: '#e2e8f0', fontSize: 13 }}>{recordSummary(section.table, item)}</span>
                      <FarmDocuments recordType={section.table} recordId={item.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        <section style={panelStyle}>
          <h2 style={{ color: '#facc15' }}>Ask about your records</h2>
          <form onSubmit={answerQuestion} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <input style={{ ...inputStyle, flex: '1 1 320px' }} value={question} onChange={event => setQuestion(event.target.value)} placeholder="What is my cost per acre?" />
            <button className="primary-action">Ask</button>
          </form>
          {answer && <p style={{ color: '#e2e8f0', marginTop: 14 }}>{answer}</p>}
        </section>

        <section style={panelStyle}>
          <h2 style={{ color: '#facc15' }}>Yearly comparison</h2>
          {yearly.length ? <div style={gridStyle}>{yearly.map(item => <article key={item.year} style={{ background: '#020617', borderRadius: 10, padding: 12 }}><strong style={{ color: '#facc15' }}>{item.year}</strong><p>{item.pounds.toFixed(0)} lb · {'$' + item.revenue.toFixed(2)}</p><small>{(item.acres ? item.pounds / item.acres : 0).toFixed(1)} lb/acre</small></article>)}</div> : <p style={{ color: '#94a3b8' }}>Add a harvest to begin year-over-year comparison.</p>}
        </section>
      </div>

      <p style={{ color: '#94a3b8', marginTop: 18 }}>Genesis organizes owner-entered records. Verify labels, veterinary directions, regulatory filings, taxes, and certification requirements with the appropriate current source or licensed professional.</p>
    </div>
  )
}
