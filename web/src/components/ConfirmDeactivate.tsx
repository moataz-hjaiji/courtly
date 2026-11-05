import type { Court } from '../api/types'

/** Warning card shown before deactivating a court that still has future bookings. */
export function ConfirmDeactivate({ court, busy, onConfirm, onCancel }: {
  court: Court; busy: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const n = court.futureBookings ?? 0
  const bookings = `${n} future booking${n === 1 ? '' : 's'}`
  return (
    <div className="card stack confirm-danger" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-text">
      <h2 id="confirm-title">Deactivate {court.name}?</h2>
      <p id="confirm-text">
        {court.name} has <strong>{bookings}</strong>. Deactivating it cancels {n === 1 ? 'it' : 'them'}, and players will see
        "cancelled · court closed" in their bookings. Past bookings are kept.
      </p>
      <div className="row">
        <button className="btn btn-danger-solid" onClick={onConfirm} disabled={busy}>
          {busy ? 'Deactivating…' : `Deactivate and cancel ${bookings}`}
        </button>
        <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Keep it open</button>
      </div>
    </div>
  )
}
