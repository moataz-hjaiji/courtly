// Month-view maths, all in UTC so a day is the facility's day. Weeks start on Monday.

/** "2026-11-05" -> "2026-11" */
export const monthOf = (day: string) => day.slice(0, 7)

/** "2026-11" moved by n months. */
export function addMonths(month: string, n: number): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}

/** "2026-11" -> "November 2026" */
export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Cells for a month view: leading nulls up to the 1st's weekday, then every day as YYYY-MM-DD. */
export function monthCells(month: string): (string | null)[] {
  const first = new Date(`${month}-01T00:00:00Z`)
  const leading = (first.getUTCDay() + 6) % 7 // Monday = 0
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ]
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
