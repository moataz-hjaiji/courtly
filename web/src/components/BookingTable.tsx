import type { Booking } from '../api/types'
import { dayLabel, hhmm, money } from '../utils/format'
import { Badge, statusTone } from './Badge'
import { Empty } from './Empty'

interface Props {
  bookings: Booking[]
  empty: string
  /** Shows a Cancel button on confirmed rows when given. */
  onCancel?: (b: Booking) => void
}

export function BookingTable({ bookings, empty, onCancel }: Props) {
  if (!bookings.length) return <Empty>{empty}</Empty>
  return (
    <div className="card card-flush table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Time (UTC)</th><th>Court</th><th>Price</th><th>Status</th>
            {onCancel && <th><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
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
