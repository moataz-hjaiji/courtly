import { addDays } from '../utils/format'

/** Date input with previous/next-day buttons. Value is YYYY-MM-DD (UTC). */
export function DayPicker({ value, onChange, min }: { value: string; onChange: (day: string) => void; min?: string }) {
  return (
    <div className="daypicker">
      <button type="button" className="btn btn-ghost icon" onClick={() => onChange(addDays(value, -1))}
        disabled={!!min && value <= min} aria-label="Previous day">‹</button>
      <input type="date" aria-label="Date" value={value} min={min} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button type="button" className="btn btn-ghost icon" onClick={() => onChange(addDays(value, 1))} aria-label="Next day">›</button>
    </div>
  )
}
