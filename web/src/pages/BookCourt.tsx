import { useCallback, useEffect, useState } from 'react'
import { api, errorText, money, today, type Booking, type Court, type Slot } from '../api'

export function BookCourt() {
  const [courts, setCourts] = useState<Court[]>([])
  const [courtId, setCourtId] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [slots, setSlots] = useState<Slot[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [hours, setHours] = useState<1 | 2>(1)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    api<Court[]>('/courts').then((cs) => {
      const active = cs.filter((c) => c.isActive)
      setCourts(active)
      setCourtId((id) => id ?? active[0]?.id ?? null)
    }).catch((e) => setMessage({ kind: 'error', text: errorText(e) }))
  }, [])

  const loadSlots = useCallback(async () => {
    if (!courtId) return
    try {
      const res = await api<{ slots: Slot[] }>(`/courts/${courtId}/availability?date=${date}`)
      setSlots(res.slots)
    } catch (e) {
      setSlots([])
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }, [courtId, date])

  useEffect(() => { setSelected(null); loadSlots() }, [loadSlots])

  // Live updates: the stream only says "court X on day Y changed"; we refetch through the authed API.
  useEffect(() => {
    const source = new EventSource('/api/events')
    source.addEventListener('availability', (e) => {
      const change = JSON.parse((e as MessageEvent<string>).data) as { courtId: number; date: string }
      if (change.courtId === courtId && change.date === date) loadSlots()
    })
    return () => source.close()
  }, [courtId, date, loadSlots])

  const court = courts.find((c) => c.id === courtId)
  const isFree = (h: number) => slots.find((s) => s.hour === h)?.status === 'available'
  // Derived, so a live update that takes the selected slot (or the hour after it) hides/limits the choice.
  const selectedFree = selected !== null && isFree(selected)
  const canTwoHours = selectedFree && isFree(selected + 1)
  const duration: 1 | 2 = canTwoHours ? hours : 1

  async function book() {
    if (!court || !selectedFree) return
    setMessage(null)
    try {
      const b = await api<Booking>('/bookings', { method: 'POST', body: { courtId: court.id, date, startHour: selected, hours: duration } })
      setMessage({ kind: 'success', text: `Booked ${b.courtName} at ${selected}:00 for ${duration}h (${money(b.priceCents)}).` })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
    setSelected(null)
    loadSlots()
  }

  return (
    <section className="stack">
      <h2>Book a court</h2>
      <div className="row">
        <label>Court{' '}
          <select value={courtId ?? ''} onChange={(e) => setCourtId(Number(e.target.value))}>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.sport} · {money(c.hourlyPriceCents)}/h</option>)}
          </select>
        </label>
        <label>Date <input type="date" value={date} min={today()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      </div>
      {court && <p className="muted">Open {court.openHour}:00–{court.closeHour}:00 (UTC). Pick a free slot.</p>}

      <div className="slots">
        {slots.map((s) => (
          <button
            key={s.hour}
            className={`slot ${s.status} ${selected === s.hour ? 'selected' : ''}`}
            disabled={s.status !== 'available'}
            onClick={() => { setSelected(s.hour); setHours(1) }}
            aria-pressed={selected === s.hour}
          >
            {String(s.hour).padStart(2, '0')}:00
            <small>{s.status}</small>
          </button>
        ))}
      </div>

      {selectedFree && court && (
        <div className="card row">
          <span>{court.name}, {date} at {selected}:00 for</span>
          <select value={duration} onChange={(e) => setHours(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1 hour</option>
            <option value={2} disabled={!canTwoHours}>2 hours{canTwoHours ? '' : ' (next slot not free)'}</option>
          </select>
          <strong>{money(court.hourlyPriceCents * duration)}</strong>
          <button onClick={book}>Confirm booking</button>
          <button className="secondary" onClick={() => setSelected(null)}>Cancel</button>
        </div>
      )}
      {message && <p className={message.kind} role="alert">{message.text}</p>}
    </section>
  )
}
