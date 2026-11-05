import type { Court } from '../api/types'
import type { Mode } from '../utils/grid'
import { dayLabel, formatHour, money } from '../utils/format'

interface Props {
  court: Court
  date: string
  start: number
  mode: Exclude<Mode, null>
  duration: 1 | 2
  canTwoHours: boolean
  busy: boolean
  onDuration: (hours: 1 | 2) => void
  onClear: () => void
  onSubmit: () => void
}

/** Card under the grid: the selected time, duration, price, and Book / Join waitlist. */
export function BookingSummary({ court, date, start, mode, duration, canTwoHours, busy, onDuration, onClear, onSubmit }: Props) {
  const waitlist = mode === 'waitlist'
  return (
    <div className={`card summary ${waitlist ? 'summary-waitlist' : ''}`} aria-live="polite">
      <div className="stack" style={{ gap: '0.125rem' }}>
        <strong>{waitlist ? `${court.name} is booked at this time` : court.name}</strong>
        <span className="muted small">{dayLabel(date)} · {formatHour(start)}–{formatHour(start + duration)}</span>
        {waitlist && <span className="muted small">Join the waitlist — if it's cancelled, it's booked for you automatically.</span>}
      </div>
      <label>Duration
        <select value={duration} onChange={(e) => onDuration(Number(e.target.value) as 1 | 2)}>
          <option value={1}>1 hour</option>
          <option value={2} disabled={!canTwoHours}>2 hours{canTwoHours ? '' : ' (next hour not available)'}</option>
        </select>
      </label>
      <span className="spacer" />
      <span className="price">{money(court.hourlyPriceCents * duration)}</span>
      <button className="btn btn-secondary" onClick={onClear}>Clear</button>
      {waitlist
        ? <button className="btn btn-warning" onClick={onSubmit} disabled={busy}>{busy ? 'Joining…' : 'Join waitlist'}</button>
        : <button className="btn btn-primary" onClick={onSubmit} disabled={busy}>{busy ? 'Booking…' : 'Confirm booking'}</button>}
    </div>
  )
}
