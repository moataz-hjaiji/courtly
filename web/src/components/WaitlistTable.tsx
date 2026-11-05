import type { WaitlistEntry } from '../api/types'
import { dayLabel, hhmm } from '../utils/format'
import { Badge } from './Badge'
import { Empty } from './Empty'

export function WaitlistTable({ entries, onLeave }: { entries: WaitlistEntry[]; onLeave: (w: WaitlistEntry) => void }) {
  if (!entries.length) return <Empty>You're not waiting for any slot. Click a booked slot to join its waitlist.</Empty>
  return (
    <div className="card card-flush table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Time (UTC)</th><th>Court</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {entries.map((w) => (
            <tr key={w.id}>
              <td>{dayLabel(w.startAt)}</td>
              <td className="num">{hhmm(w.startAt)}–{hhmm(w.endAt)}</td>
              <td><strong>{w.courtName}</strong> <span className="muted small">{w.sport}</span></td>
              <td>{w.status === 'waiting'
                ? <Badge tone="warning">#{w.position} in line</Badge>
                : <Badge tone="success">promoted · booked for you</Badge>}</td>
              <td className="actions">
                {w.status === 'waiting' && <button className="btn btn-secondary btn-sm" onClick={() => onLeave(w)}>Leave</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
