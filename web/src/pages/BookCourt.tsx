import { useCallback, useEffect, useState } from 'react'
import { api, dayLabel, errorText, money, today, type Booking, type Court, type Slot, type WaitlistEntry } from '../api'
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
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])

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
      const [res, mine] = await Promise.all([
        api<{ slots: Slot[] }>(`/courts/${courtId}/availability?date=${date}`),
        api<WaitlistEntry[]>('/waitlist/mine'),
      ])
      setSlots(res.slots)
      setWaitlist(mine.filter((w) => w.status === 'waiting'))
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
  const slotAt = (h: number) => slots.find((s) => s.hour === h)
  const isFree = (h: number) => slotAt(h)?.status === 'available'
  const isFuture = (h: number) => { const s = slotAt(h); return !!s && new Date(s.startAt).getTime() > Date.now() }
  // My waitlist entry covering this hour on the court/day on screen, if any.
  const waitingAt = (h: number) => waitlist.find((w) => {
    if (w.courtId !== courtId) return false
    const t = new Date(`${date}T${String(h).padStart(2, '0')}:00:00Z`).getTime()
    return new Date(w.startAt).getTime() <= t && t < new Date(w.endAt).getTime()
  })
  const canWaitlist = (h: number) => slotAt(h)?.status === 'taken' && !slotAt(h)?.mine && isFuture(h) && !waitingAt(h)

  // Derived, so a live update that changes the selected slot (or the hour after it) hides/limits the choice.
  const mode: 'book' | 'waitlist' | null = selected === null ? null : isFree(selected) ? 'book' : canWaitlist(selected) ? 'waitlist' : null
  const canTwoHours = selected !== null && (mode === 'book' ? isFree(selected + 1) : mode === 'waitlist' && isFuture(selected + 1) && slotAt(selected + 1)?.status !== 'past')
  const duration: 1 | 2 = canTwoHours ? hours : 1
  const freeCount = slots.filter((s) => s.status === 'available').length

  async function joinWaitlist() {
    if (!court || mode !== 'waitlist' || selected === null) return
    setNotice(null)
    setBusy(true)
    try {
      const w = await api<WaitlistEntry>('/waitlist', { method: 'POST', body: { courtId: court.id, date, startHour: selected, hours: duration } })
      setNotice({ kind: 'success', text: `You're #${w.position} on the waitlist for ${court.name}, ${pad(selected)}–${pad(selected + duration)}. If it frees up, it's booked for you automatically.` })
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
    setBusy(false)
    setSelected(null)
    loadSlots()
  }

  async function book() {
    if (!court || mode !== 'book' || selected === null) return
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
            <span><i className="dot mine" />Yours</span>
            <span><i className="dot waiting" />On your waitlist</span>
            <span><i className="dot past" />Past</span>
          </div>
        </div>

        {slots.length === 0 ? <Empty>No slots for this court.</Empty> : (
          <div className="slots">
            {slots.map((s) => {
              const isSelected = mode !== null && (s.hour === selected || (duration === 2 && s.hour === selected! + 1))
              const mine = waitingAt(s.hour)
              const clickable = s.status === 'available' || canWaitlist(s.hour)
              const label = s.mine ? 'Your booking' : mine ? `Waitlist #${mine.position}`
                : s.status === 'available' ? (court ? money(court.hourlyPriceCents) : 'Free')
                : s.status === 'taken' ? (isFuture(s.hour) ? 'Join waitlist' : 'Booked') : 'Past'
              return (
                <button
                  key={s.hour}
                  className={`slot ${isSelected ? 'selected' : s.mine ? 'mine' : mine ? 'waiting' : s.status}`}
                  disabled={!clickable}
                  onClick={() => { setSelected(s.hour); setHours(1); setNotice(null) }}
                  aria-pressed={isSelected}
                  aria-label={`${pad(s.hour)} ${label}`}
                >
                  <strong>{pad(s.hour)}</strong>
                  <small>{label}</small>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {mode && court && selected !== null && (
        <div className={`card summary ${mode === 'waitlist' ? 'summary-waitlist' : ''}`} aria-live="polite">
          <div className="stack" style={{ gap: '0.125rem' }}>
            <strong>{mode === 'book' ? court.name : `${court.name} is booked at this time`}</strong>
            <span className="muted small">
              {dayLabel(date)} · {pad(selected)}–{pad(selected + duration)}
            </span>
            {mode === 'waitlist' && <span className="muted small">Join the waitlist — if it's cancelled, it's booked for you automatically.</span>}
          </div>
          <label>Duration
            <select value={duration} onChange={(e) => setHours(Number(e.target.value) as 1 | 2)}>
              <option value={1}>1 hour</option>
              <option value={2} disabled={!canTwoHours}>2 hours{canTwoHours ? '' : ' (not possible)'}</option>
            </select>
          </label>
          <span className="spacer" />
          <span className="price">{money(court.hourlyPriceCents * duration)}</span>
          <button className="btn btn-secondary" onClick={() => setSelected(null)}>Clear</button>
          {mode === 'book'
            ? <button className="btn btn-primary" onClick={book} disabled={busy}>{busy ? 'Booking…' : 'Confirm booking'}</button>
            : <button className="btn btn-warning" onClick={joinWaitlist} disabled={busy}>{busy ? 'Joining…' : 'Join waitlist'}</button>}
        </div>
      )}
      <Alert notice={notice} />
    </section>
  )
}
