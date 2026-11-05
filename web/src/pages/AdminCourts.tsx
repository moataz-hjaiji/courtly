import { useEffect, useState, type FormEvent } from 'react'
import { api, errorText, money, type Court } from '../api'

type Draft = Omit<Court, 'id' | 'isActive'>
const EMPTY: Draft = { name: '', sport: 'padel', hourlyPriceCents: 3000, openHour: 8, closeHour: 23 }

export function AdminCourts() {
  const [courts, setCourts] = useState<Court[]>([])
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState('')

  const load = () => api<Court[]>('/courts').then(setCourts)
  useEffect(() => { load().catch((e) => setError(errorText(e))) }, [])

  async function save(draft: Draft) {
    setError('')
    try {
      if (editing === 'new') await api('/courts', { method: 'POST', body: draft })
      else await api(`/courts/${editing}`, { method: 'PATCH', body: draft })
      setEditing(null)
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function toggle(c: Court) {
    setError('')
    try {
      await api(`/courts/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } })
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <section className="stack">
      <h2>Manage courts</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th>Name</th><th>Sport</th><th>Price/h</th><th>Hours (UTC)</th><th>Status</th><th /></tr></thead>
        <tbody>
          {courts.map((c) => editing === c.id
            ? <CourtForm key={c.id} initial={c} onSave={save} onCancel={() => setEditing(null)} />
            : (
              <tr key={c.id} className={c.isActive ? '' : 'cancelled'}>
                <td>{c.name}</td><td>{c.sport}</td><td>{money(c.hourlyPriceCents)}</td>
                <td>{c.openHour}:00–{c.closeHour}:00</td>
                <td>{c.isActive ? 'active' : 'inactive'}</td>
                <td className="row">
                  <button className="secondary" onClick={() => setEditing(c.id)}>Edit</button>
                  <button className="secondary" onClick={() => toggle(c)}>{c.isActive ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          {editing === 'new' && <CourtForm initial={EMPTY} onSave={save} onCancel={() => setEditing(null)} />}
        </tbody>
      </table>
      {editing === null && <button onClick={() => setEditing('new')}>+ New court</button>}
      <p className="muted small">Deactivated courts can't be booked; their booking history is kept.</p>
    </section>
  )
}

function CourtForm({ initial, onSave, onCancel }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>({
    name: initial.name, sport: initial.sport, hourlyPriceCents: initial.hourlyPriceCents,
    openHour: initial.openHour, closeHour: initial.closeHour,
  })
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(d) }
  const num = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) })
  return (
    <tr>
      <td colSpan={6}>
        <form className="row" onSubmit={submit}>
          <input aria-label="Name" placeholder="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
          <input aria-label="Sport" placeholder="Sport" value={d.sport} onChange={(e) => setD({ ...d, sport: e.target.value })} required />
          <label>€/h <input type="number" min="0.01" step="0.01" value={d.hourlyPriceCents / 100}
            onChange={(e) => setD({ ...d, hourlyPriceCents: Math.round(Number(e.target.value) * 100) })} required /></label>
          <label>Opens <input type="number" min={0} max={23} value={d.openHour} onChange={num('openHour')} required /></label>
          <label>Closes <input type="number" min={1} max={24} value={d.closeHour} onChange={num('closeHour')} required /></label>
          <button type="submit">Save</button>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        </form>
      </td>
    </tr>
  )
}
