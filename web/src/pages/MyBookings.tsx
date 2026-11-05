import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Booking, WaitlistEntry } from '../api/types'
import { dayLabel, errorText, hhmm } from '../utils/format'
import { Alert, type Notice } from '../components/Alert'
import { BookingTable } from '../components/BookingTable'
import { PageHeader } from '../components/PageHeader'
import { WaitlistTable } from '../components/WaitlistTable'

type Mine = { upcoming: Booking[]; past: Booking[] }

export function MyBookings() {
  const [data, setData] = useState<Mine | null>(null)
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [notice, setNotice] = useState<Notice>(null)

  const load = () => Promise.all([
    api<Mine>('/bookings/mine').then(setData),
    // upcoming entries only; "left" ones are history nobody needs to see
    api<WaitlistEntry[]>('/waitlist/mine').then((ws) =>
      setWaitlist(ws.filter((w) => w.status !== 'left' && new Date(w.startAt).getTime() > Date.now()))),
  ])
  useEffect(() => { load().catch((e) => setNotice({ kind: 'error', text: errorText(e) })) }, [])

  /** Runs an action, shows its success text or the API's error, then reloads. */
  async function act(run: () => Promise<unknown>, success: string) {
    setNotice(null)
    try {
      await run()
      setNotice({ kind: 'success', text: success })
      await load()
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) })
    }
  }
  const at = (x: { courtName: string; startAt: string }) => `${x.courtName} on ${dayLabel(x.startAt)} at ${hhmm(x.startAt)}`

  if (!data) return <><Alert notice={notice} /><p className="muted">Loading…</p></>
  return (
    <section className="stack-lg">
      <PageHeader title="My bookings" subtitle="You can cancel a booking up to 2 hours before it starts." />
      <Alert notice={notice} />
      <div className="stack">
        <h2>Upcoming <span className="muted">({data.upcoming.filter((b) => b.status === 'confirmed').length})</span></h2>
        <BookingTable bookings={data.upcoming} empty="No upcoming bookings. Book a court to get started."
          onCancel={(b) => act(() => api(`/bookings/${b.id}/cancel`, { method: 'POST' }), `Cancelled ${at(b)}.`)} />
      </div>
      <div className="stack">
        <h2>Waitlist</h2>
        <WaitlistTable entries={waitlist}
          onLeave={(w) => act(() => api(`/waitlist/${w.id}/leave`, { method: 'POST' }), `Left the waitlist for ${at(w)}.`)} />
      </div>
      <div className="stack">
        <h2>Past</h2>
        <BookingTable bookings={data.past} empty="No past bookings yet." />
      </div>
    </section>
  )
}
