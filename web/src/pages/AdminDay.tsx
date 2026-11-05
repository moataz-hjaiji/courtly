import { useEffect, useState } from 'react'
import { api, errorText, hhmm, money, today, type Booking } from '../api'

export function AdminDay() {
  const [date, setDate] = useState(today())
  const [data, setData] = useState<{ bookings: Booking[]; totalRevenueCents: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    api<{ bookings: Booking[]; totalRevenueCents: number }>(`/admin/bookings?date=${date}`)
      .then(setData)
      .catch((e) => setError(errorText(e)))
  }, [date])

  return (
    <section className="stack">
      <h2>Day overview</h2>
      <label>Date <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {data && (
        <>
          <p className="card"><strong>Expected revenue: {money(data.totalRevenueCents)}</strong>{' '}
            <span className="muted">({data.bookings.filter((b) => b.status === 'confirmed').length} confirmed bookings; cancelled ones excluded)</span></p>
          {data.bookings.length === 0 ? <p className="muted">No bookings this day.</p> : (
            <table>
              <thead><tr><th>Time (UTC)</th><th>Court</th><th>User</th><th>Price</th><th>Status</th></tr></thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={b.id} className={b.status}>
                    <td>{hhmm(b.startAt)}–{hhmm(b.endAt)}</td>
                    <td>{b.courtName}</td>
                    <td>{b.userName} <span className="muted small">{b.userEmail}</span></td>
                    <td>{money(b.priceCents)}</td>
                    <td>{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
