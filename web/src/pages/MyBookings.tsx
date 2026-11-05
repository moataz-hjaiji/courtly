import { useEffect, useState } from 'react'
import { api, errorText, hhmm, money, ymd, type Booking } from '../api'

export function MyBookings() {
  const [data, setData] = useState<{ upcoming: Booking[]; past: Booking[] } | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const load = () => api<{ upcoming: Booking[]; past: Booking[] }>('/bookings/mine').then(setData)
  useEffect(() => { load().catch((e) => setMessage({ kind: 'error', text: errorText(e) })) }, [])

  async function cancel(b: Booking) {
    setMessage(null)
    try {
      await api(`/bookings/${b.id}/cancel`, { method: 'POST' })
      setMessage({ kind: 'success', text: `Cancelled ${b.courtName} on ${ymd(b.startAt)} at ${hhmm(b.startAt)}.` })
      await load()
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  if (!data) return <p>Loading…</p>
  return (
    <section className="stack">
      <h2>My bookings</h2>
      {message && <p className={message.kind} role="alert">{message.text}</p>}
      <h3>Upcoming</h3>
      <BookingTable bookings={data.upcoming} onCancel={cancel} />
      <p className="muted small">You can cancel up to 2 hours before the start time.</p>
      <h3>Past</h3>
      <BookingTable bookings={data.past} />
    </section>
  )
}

function BookingTable({ bookings, onCancel }: { bookings: Booking[]; onCancel?: (b: Booking) => void }) {
  if (!bookings.length) return <p className="muted">None.</p>
  return (
    <table>
      <thead><tr><th>Date</th><th>Time (UTC)</th><th>Court</th><th>Price</th><th>Status</th>{onCancel && <th />}</tr></thead>
      <tbody>
        {bookings.map((b) => (
          <tr key={b.id} className={b.status}>
            <td>{ymd(b.startAt)}</td>
            <td>{hhmm(b.startAt)}–{hhmm(b.endAt)}</td>
            <td>{b.courtName} <span className="muted">({b.sport})</span></td>
            <td>{money(b.priceCents)}</td>
            <td>{b.status}</td>
            {onCancel && <td>{b.status === 'confirmed' && <button className="secondary" onClick={() => onCancel(b)}>Cancel</button>}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
