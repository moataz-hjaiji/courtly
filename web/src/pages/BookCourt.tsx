import { useCallback, useEffect, useState } from 'react'
import { api, dayLabel, errorText, money, today, type Booking, type Court, type Slot } from '../api'
import { Alert, DayPicker, Empty, PageHeader, type Notice } from '../ui'

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`

export function BookCourt() {
  const [courts, setCourts] = useState<Court[]>([])
  const [courtId, setCourtId] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [slots, setSlots] = useState<Slot[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [hours, setHours] = useState<1 | 2>(1)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Court[]>('/courts').then((cs) => {
      const active = cs.filter((c) => c.isActive)
      setCourts(active)
      setCourtId((id) => id ?? active[0]?.id ?? null)
    }).catch((e) => setNotice({ kind: 'error', text: errorText(e) }))
  }, [])

  const loadSlots = useCallback(async () => {
    if (!courtId) return
    try {
      const res = await api<{ slots: Slot[] }>(`/courts/${courtId}/availability?date=${date}`)
      setSlots(res.slots)
    } catch (e) {
      setSlots([])
      setNotice({ kind: 'error', text: errorText(e) })
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
  const freeCount = slots.filter((s) => s.status === 'available').length

  async function book() {
    if (!court || !selectedFree) return
    setNotice(null)
    setBusy(true)
    try {
      const b = await api<Booking>('/bookings', { method: 'POST', body: { courtId: court.id, date, startHour: selected, hours: duration } })
      setNotice({ kind: 'success', text: `Booked ${b.courtName} on ${dayLabel(date)}, ${pad(selected)}–${pad(selected + duration)} · ${money(b.priceCents)}` })
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
    setBusy(false)
    setSelected(null)
    loadSlots()
  }

  return (
    <section className="stack-lg">
      <PageHeader title="Book a court" subtitle="Pick a court and a day, then choose a free slot. All times are UTC." />

      <div className="card field-grid">
        <label>Court
          <select value={courtId ?? ''} onChange={(e) => setCourtId(Number(e.target.value))}>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.sport} · {money(c.hourlyPriceCents)}/h</option>)}
          </select>
        </label>
        <label>Day <DayPicker value={date} min={today()} onChange={setDate} /></label>
      </div>

      <div className="stack">
        <div className="row">
          <h2>{dayLabel(date)}</h2>
          {court && <span className="muted small">Open {pad(court.openHour)}–{pad(court.closeHour)} · {freeCount} free</span>}
          <span className="spacer" />
          <div className="legend" aria-hidden="true">
            <span><i className="dot available" />Free</span>
            <span><i className="dot selected" />Selected</span>
            <span><i className="dot taken" />Booked</span>
            <span><i className="dot past" />Past</span>
          </div>
        </div>

        {slots.length === 0 ? <Empty>No slots for this court.</Empty> : (
          <div className="slots">
            {slots.map((s) => {
              const isSelected = selectedFree && (s.hour === selected || (duration === 2 && s.hour === selected + 1))
              return (
                <button
                  key={s.hour}
                  className={`slot ${isSelected ? 'selected' : s.status}`}
                  disabled={s.status !== 'available'}
                  onClick={() => { setSelected(s.hour); setHours(1); setNotice(null) }}
                  aria-pressed={isSelected}
                  aria-label={`${pad(s.hour)} ${s.status}`}
                >
                  <strong>{pad(s.hour)}</strong>
                  <small>{s.status === 'available' ? (court ? money(court.hourlyPriceCents) : 'Free') : s.status === 'taken' ? 'Booked' : 'Past'}</small>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedFree && court && (
        <div className="card summary" aria-live="polite">
          <div className="stack" style={{ gap: '0.125rem' }}>
            <strong>{court.name}</strong>
            <span className="muted small">{dayLabel(date)} · {pad(selected)}–{pad(selected + duration)}</span>
          </div>
          <label>Duration
            <select value={duration} onChange={(e) => setHours(Number(e.target.value) as 1 | 2)}>
              <option value={1}>1 hour</option>
              <option value={2} disabled={!canTwoHours}>2 hours{canTwoHours ? '' : ' (next hour taken)'}</option>
            </select>
          </label>
          <span className="spacer" />
          <span className="price">{money(court.hourlyPriceCents * duration)}</span>
          <button className="btn btn-secondary" onClick={() => setSelected(null)}>Clear</button>
          <button className="btn btn-primary" onClick={book} disabled={busy}>{busy ? 'Booking…' : 'Confirm booking'}</button>
        </div>
      )}
      <Alert notice={notice} />
    </section>
  )
}
