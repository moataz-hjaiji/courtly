import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { Court } from '../api/types'

export type CourtDraft = Omit<Court, 'id' | 'isActive'>

/** Create / edit form for a court. Prices are entered in euros and sent in cents. */
export function CourtForm({ initial, title, onSave, onCancel }: {
  initial: CourtDraft; title: string; onSave: (d: CourtDraft) => void; onCancel: () => void
}) {
  const [d, setD] = useState<CourtDraft>({
    name: initial.name, sport: initial.sport, hourlyPriceCents: initial.hourlyPriceCents,
    openHour: initial.openHour, closeHour: initial.closeHour,
  })
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(d) }
  const hour = (k: 'openHour' | 'closeHour') => (e: ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) })

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
        <label>Opens at (hour) <input type="number" min={0} max={23} value={d.openHour} onChange={hour('openHour')} required /></label>
        <label>Closes at (hour) <input type="number" min={1} max={24} value={d.closeHour} onChange={hour('closeHour')} required /></label>
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary">Save court</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
