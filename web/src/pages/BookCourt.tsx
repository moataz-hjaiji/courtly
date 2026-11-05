import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Booking, Court, WaitlistEntry } from '../api/types'
import { dayLabel, errorText, formatHour, money, today } from '../utils/format'
import { makeGrid } from '../utils/grid'
import { useAvailability } from '../hooks/useAvailability'
import { Alert, type Notice } from '../components/Alert'
import { BookingSummary } from '../components/BookingSummary'
import { DayPicker } from '../components/DayPicker'
import { PageHeader } from '../components/PageHeader'
import { SlotGrid } from '../components/SlotGrid'

export function BookCourt() {
  const [courts, setCourts] = useState<Court[]>([])
  const [courtId, setCourtId] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [selected, setSelected] = useState<number | null>(null)
  const [hours, setHours] = useState<1 | 2>(1)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const { slots, waitlist, error, reload } = useAvailability(courtId, date)

  useEffect(() => {
    api<Court[]>('/courts').then((cs) => {
      const active = cs.filter((c) => c.isActive)
      setCourts(active)
      setCourtId((id) => id ?? active[0]?.id ?? null)
    }).catch((e) => setNotice({ kind: 'error', text: errorText(e) }))
  }, [])

  // Picking another court or day clears the selection.
  const choose = (change: () => void) => { change(); setSelected(null); setNotice(null) }

  const court = courts.find((c) => c.id === courtId)
  // Derived on every render, so a live update that takes the selected hour hides or limits the choice.
  const grid = makeGrid({ slots, waitlist, courtId, date, now: Date.now() })
  const { mode, nextHourUsable, duration } = grid.selection(selected, hours)

  /** Books the selection, or joins its waitlist, then refreshes the grid either way. */
  async function submit() {
    if (!court || !mode || selected === null) return
    const body = { courtId: court.id, date, startHour: selected, hours: duration }
    const when = `${court.name}, ${dayLabel(date)} ${formatHour(selected)}–${formatHour(selected + duration)}`
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'book') {
        const b = await api<Booking>('/bookings', { method: 'POST', body })
        setNotice({ kind: 'success', text: `Booked ${when} · ${money(b.priceCents)}` })
      } else {
        const w = await api<WaitlistEntry>('/waitlist', { method: 'POST', body })
        setNotice({ kind: 'success', text: `You're #${w.position} on the waitlist for ${when}. If it frees up, it's booked for you automatically.` })
      }
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
    setBusy(false)
    setSelected(null)
    reload()
  }

  return (
    <section className="stack-lg">
      <PageHeader title="Book a court" subtitle="Pick a court and a day, then choose a free slot. All times are UTC." />

      <div className="card field-grid">
        <label>Court
          <select value={courtId ?? ''} onChange={(e) => choose(() => setCourtId(Number(e.target.value)))}>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.sport} · {money(c.hourlyPriceCents)}/h</option>)}
          </select>
        </label>
        <label>Day <DayPicker value={date} min={today()} onChange={(d) => choose(() => setDate(d))} /></label>
      </div>

      <div className="stack">
        <div className="row">
          <h2>{dayLabel(date)}</h2>
          {court && <span className="muted small">Open {formatHour(court.openHour)}–{formatHour(court.closeHour)} · {grid.freeCount} free</span>}
        </div>
        <SlotGrid slots={slots} grid={grid} selected={selected} duration={duration} priceCents={court?.hourlyPriceCents}
          onSelect={(h) => { setSelected(h); setHours(1); setNotice(null) }} />
      </div>

      {mode && court && selected !== null && (
        <BookingSummary court={court} date={date} start={selected} mode={mode} duration={duration}
          canTwoHours={nextHourUsable} busy={busy} onDuration={setHours} onClear={() => setSelected(null)} onSubmit={submit} />
      )}
      <Alert notice={notice ?? (error ? { kind: 'error', text: error } : null)} />
    </section>
  )
}
