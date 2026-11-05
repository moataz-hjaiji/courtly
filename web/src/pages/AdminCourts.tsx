import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Court } from '../api/types'
import { errorText, formatHour, money } from '../utils/format'
import { Alert, type Notice } from '../components/Alert'
import { Badge, statusTone } from '../components/Badge'
import { CourtForm, type CourtDraft } from '../components/CourtForm'
import { PageHeader } from '../components/PageHeader'

const EMPTY: CourtDraft = { name: '', sport: 'padel', hourlyPriceCents: 3000, openHour: 8, closeHour: 23 }

export function AdminCourts() {
  const [courts, setCourts] = useState<Court[]>([])
  const [editing, setEditing] = useState<Court | 'new' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const load = () => api<Court[]>('/courts').then(setCourts)
  useEffect(() => { load().catch((e) => setNotice({ kind: 'error', text: errorText(e) })) }, [])

  async function save(draft: CourtDraft) {
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
                <td className="num">{formatHour(c.openHour)}–{formatHour(c.closeHour)}</td>
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
