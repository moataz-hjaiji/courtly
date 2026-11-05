import { useEffect, useState, type FormEvent } from 'react'
import { api, errorText, money, type Court } from '../api'
import { Alert, Badge, PageHeader, statusTone, type Notice } from '../ui'

type Draft = Omit<Court, 'id' | 'isActive'>
const EMPTY: Draft = { name: '', sport: 'padel', hourlyPriceCents: 3000, openHour: 8, closeHour: 23 }
const pad = (h: number) => `${String(h).padStart(2, '0')}:00`

export function AdminCourts() {
  const [courts, setCourts] = useState<Court[]>([])
  const [editing, setEditing] = useState<Court | 'new' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const load = () => api<Court[]>('/courts').then(setCourts)
  useEffect(() => { load().catch((e) => setNotice({ kind: 'error', text: errorText(e) })) }, [])

  async function save(draft: Draft) {
    setNotice(null)
    try {
      if (editing === 'new') await api('/courts', { method: 'POST', body: draft })
      else if (editing) await api(`/courts/${editing.id}`, { method: 'PATCH', body: draft })
      setNotice({ kind: 'success', text: `Saved ${draft.name}.` })
      setEditing(null)
      await load()
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
  }

  async function toggle(c: Court) {
    setNotice(null)
    try {
      await api(`/courts/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } })
      setNotice({ kind: 'success', text: `${c.name} is now ${c.isActive ? 'inactive' : 'active'}.` })
      await load()
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
  }

  return (
    <section className="stack-lg">
      <PageHeader title="Courts" subtitle="Deactivated courts can't be booked; their booking history is kept.">
        {editing === null && <button className="btn btn-primary" onClick={() => { setNotice(null); setEditing('new') }}>+ New court</button>}
      </PageHeader>
      <Alert notice={notice} />
      {editing !== null && (
        <CourtForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? EMPTY : editing}
          title={editing === 'new' ? 'New court' : `Edit ${editing.name}`} onSave={save} onCancel={() => setEditing(null)} />
      )}
      <div className="card card-flush table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Sport</th><th>Price / hour</th><th>Opening hours (UTC)</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {courts.map((c) => (
              <tr key={c.id} className={c.isActive ? '' : 'dimmed'}>
                <td><strong>{c.name}</strong></td>
                <td>{c.sport}</td>
                <td className="num">{money(c.hourlyPriceCents)}</td>
                <td className="num">{pad(c.openHour)}–{pad(c.closeHour)}</td>
                <td><Badge tone={statusTone(c.isActive ? 'active' : 'inactive')}>{c.isActive ? 'active' : 'inactive'}</Badge></td>
                <td className="actions">
                  <div className="row">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setNotice(null); setEditing(c) }}>Edit</button>
                    <button className={`btn btn-sm ${c.isActive ? 'btn-danger' : 'btn-secondary'}`} onClick={() => toggle(c)}>
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CourtForm({ initial, title, onSave, onCancel }: { initial: Draft; title: string; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>({
    name: initial.name, sport: initial.sport, hourlyPriceCents: initial.hourlyPriceCents,
    openHour: initial.openHour, closeHour: initial.closeHour,
  })
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(d) }
  const num = (k: 'openHour' | 'closeHour') => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) })
  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{title}</h2>
      <div className="field-grid">
        <label>Name <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required /></label>
        <label>Sport <input value={d.sport} onChange={(e) => setD({ ...d, sport: e.target.value })} required /></label>
        <label>Price per hour (€)
          <input type="number" min="0.01" step="0.01" value={d.hourlyPriceCents / 100}
            onChange={(e) => setD({ ...d, hourlyPriceCents: Math.round(Number(e.target.value) * 100) })} required />
        </label>
        <label>Opens at (hour) <input type="number" min={0} max={23} value={d.openHour} onChange={num('openHour')} required /></label>
        <label>Closes at (hour) <input type="number" min={1} max={24} value={d.closeHour} onChange={num('closeHour')} required /></label>
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary">Save court</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
