// Display helpers. The facility runs on UTC (see the API), so times are shown in UTC, not the browser's zone.

export const money = (cents: number) => `€${(cents / 100).toFixed(2)}`

/** 9 -> "09:00" */
export const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** ISO timestamp -> "18:00" */
export const hhmm = (iso: string) => iso.slice(11, 16)

/** Today as YYYY-MM-DD (UTC). */
export const today = () => new Date().toISOString().slice(0, 10)

/** "2026-11-05" (or a full ISO timestamp) -> "Thu, 5 Nov 2026" */
export const dayLabel = (day: string) =>
  new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })

/** YYYY-MM-DD moved by n days (works across months and years). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
