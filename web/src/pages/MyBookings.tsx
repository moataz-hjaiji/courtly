import { useEffect, useState } from 'react'
import { api, dayLabel, errorText, hhmm, money, type Booking, type WaitlistEntry } from '../api'
import { Alert, Badge, Empty, PageHeader, statusTone, type Notice } from '../ui'

export function MyBookings() {
  const [data, setData] = useState<{ upcoming: Booking[]; past: Booking[] } | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const load = () => Promise.all([
    api<{ upcoming: Booking[]; past: Booking[] }>('/bookings/mine').then(setData),
    // upcoming entries only; "left" ones are history nobody needs to see
    api<WaitlistEntry[]>('/waitlist/mine').then((ws) => setWaitlist(ws.filter((w) => w.status !== 'left' && new Date(w.startAt).getTime() > Date.now()))),
  ])
  useEffect(() => { load().catch((e) => setNotice({ kind: 'error', text: errorText(e) })) }, [])

  async function cancel(b: Booking) {
    setNotice(null)
    try {
      await api(`/bookings/${b.id}/cancel`, { method: 'POST' })
      setNotice({ kind: 'success', text: `Cancelled ${b.courtName} on ${dayLabel(b.startAt)} at ${hhmm(b.startAt)}.` })
      await load()
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
  }

  async function leave(w: WaitlistEntry) {
    setNotice(null)
    try {
      await api(`/waitlist/${w.id}/leave`, { method: 'POST' })
      setNotice({ kind: 'success', text: `Left the waitlist for ${w.courtName} on ${dayLabel(w.startAt)} at ${hhmm(w.startAt)}.` })
      await load()
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
  }

  if (!data) return <p className="muted">Loading…</p>
  return (
    <section className="stack-lg">
      <PageHeader title="My bookings" subtitle="You can cancel a booking up to 2 hours before it starts." />
      <Alert notice={notice} />
      <div className="stack">
        <h2>Upcoming <span className="muted">({data.upcoming.filter((b) => b.status === 'confirmed').length})</span></h2>
        <BookingTable bookings={data.upcoming} onCancel={cancel} empty="No upcoming bookings. Book a court to get started." />
      </div>
      <div className="stack">
        <h2>Waitlist</h2>
        {waitlist.length === 0 ? <Empty>You're not waiting for any slot. Click a booked slot to join its waitlist.</Empty> : (
          <div className="card card-flush table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Time (UTC)</th><th>Court</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {waitlist.map((w) => (
                  <tr key={w.id}>
                    <td>{dayLabel(w.startAt)}</td>
                    <td className="num">{hhmm(w.startAt)}–{hhmm(w.endAt)}</td>
                    <td><strong>{w.courtName}</strong> <span className="muted small">{w.sport}</span></td>
                    <td>{w.status === 'waiting'
                      ? <Badge tone="warning">#{w.position} in line</Badge>
                      : <Badge tone="success">promoted · booked for you</Badge>}</td>
                    <td className="actions">
                      {w.status === 'waiting' && <button className="btn btn-secondary btn-sm" onClick={() => leave(w)}>Leave</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="stack">
        <h2>Past</h2>
        <BookingTable bookings={data.past} empty="No past bookings yet." />
      </div>
    </section>
  )
}

function BookingTable({ bookings, onCancel, empty }: { bookings: Booking[]; onCancel?: (b: Booking) => void; empty: string }) {
  if (!bookings.length) return <Empty>{empty}</Empty>
  return (
    <div className="card card-flush table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Time (UTC)</th><th>Court</th><th>Price</th><th>Status</th>{onCancel && <th><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className={b.status === 'cancelled' ? 'dimmed' : ''}>
              <td>{dayLabel(b.startAt)}</td>
              <td className="num">{hhmm(b.startAt)}–{hhmm(b.endAt)}</td>
              <td><strong>{b.courtName}</strong> <span className="muted small">{b.sport}</span></td>
              <td className="num">{money(b.priceCents)}</td>
              <td><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
              {onCancel && (
                <td className="actions">
                  {b.status === 'confirmed' && <button className="btn btn-danger btn-sm" onClick={() => onCancel(b)}>Cancel</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
