import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Booking } from '../api/types'
import { dayLabel, errorText, hhmm, money, today } from '../utils/format'
import { Alert, type Notice } from '../components/Alert'
import { Badge, statusTone } from '../components/Badge'
import { DayPicker } from '../components/DayPicker'
import { Empty } from '../components/Empty'
import { PageHeader } from '../components/PageHeader'

export function AdminDay() {
  const [date, setDate] = useState(today())
  const [data, setData] = useState<{ bookings: Booking[]; totalRevenueCents: number } | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  useEffect(() => {
    setNotice(null)
    api<{ bookings: Booking[]; totalRevenueCents: number }>(`/admin/bookings?date=${date}`)
      .then(setData)
      .catch((e) => setNotice({ kind: 'error', text: errorText(e) }))
  }, [date])

  const confirmed = data?.bookings.filter((b) => b.status === 'confirmed').length ?? 0
  const cancelled = (data?.bookings.length ?? 0) - confirmed

  return (
    <section className="stack-lg">
      <PageHeader title="Day overview" subtitle={`All bookings across all courts · ${dayLabel(date)}`}>
        <DayPicker value={date} onChange={setDate} />
      </PageHeader>
      <Alert notice={notice} />
      {data && (
        <>
          <div className="stats">
            <div className="card stat highlight"><div className="label">Expected revenue</div><div className="value">{money(data.totalRevenueCents)}</div></div>
            <div className="card stat"><div className="label">Confirmed</div><div className="value">{confirmed}</div></div>
            <div className="card stat"><div className="label">Cancelled</div><div className="value">{cancelled}</div></div>
          </div>
          <p className="muted small">Revenue counts confirmed bookings only, at the price paid when booked.</p>
          {data.bookings.length === 0 ? <Empty>No bookings on this day.</Empty> : (
            <div className="card card-flush table-wrap">
              <table>
                <thead><tr><th>Time (UTC)</th><th>Court</th><th>Player</th><th>Price</th><th>Status</th></tr></thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={b.id} className={b.status === 'cancelled' ? 'dimmed' : ''}>
                      <td className="num">{hhmm(b.startAt)}–{hhmm(b.endAt)}</td>
                      <td><strong>{b.courtName}</strong></td>
                      <td>{b.userName} <span className="muted small">{b.userEmail}</span></td>
                      <td className="num">{money(b.priceCents)}</td>
                      <td><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
