import type { Slot, WaitlistEntry } from '../api/types'

/** What the user can do with a selected hour. */
export type Mode = 'book' | 'waitlist' | null

export interface GridInput {
  slots: Slot[]
  /** The user's own entries with status "waiting". */
  waitlist: WaitlistEntry[]
  courtId: number | null
  date: string // YYYY-MM-DD
  now: number // Date.now(), passed in so tests can fix the clock
}

/**
 * Pure rules for the booking grid: which hours can be booked or waited for, and what each one shows.
 * No React here, so every rule can be unit-tested.
 */
export function makeGrid({ slots, waitlist, courtId, date, now }: GridInput) {
  const slotAt = (h: number) => slots.find((s) => s.hour === h)
  const isFree = (h: number) => slotAt(h)?.status === 'available'
  const isFuture = (h: number) => {
    const s = slotAt(h)
    return !!s && new Date(s.startAt).getTime() > now
  }
  /** The user's waitlist entry covering this hour on the court/day on screen, if any. */
  const waitingAt = (h: number) => waitlist.find((w) => {
    const t = new Date(`${date}T${String(h).padStart(2, '0')}:00:00Z`).getTime()
    return w.courtId === courtId && new Date(w.startAt).getTime() <= t && t < new Date(w.endAt).getTime()
  })
  /** Booked by someone else, still ahead, and the user isn't already waiting for it. */
  const canWaitlist = (h: number) => {
    const s = slotAt(h)
    return s?.status === 'taken' && !s.mine && isFuture(h) && !waitingAt(h)
  }

  /** Mode and effective duration for a selected hour. 2 hours also needs the next hour to fit. */
  function selection(selected: number | null, requestedHours: 1 | 2) {
    const mode: Mode = selected === null ? null : isFree(selected) ? 'book' : canWaitlist(selected) ? 'waitlist' : null
    const nextHourUsable = selected !== null && (mode === 'book'
      ? isFree(selected + 1)
      : mode === 'waitlist' && isFuture(selected + 1) && !slotAt(selected + 1)?.mine)
    const duration: 1 | 2 = nextHourUsable ? requestedHours : 1
    return { mode, nextHourUsable, duration }
  }

  /** Small text under the time in a slot. */
  function label(s: Slot, priceCents: number | undefined, format: (cents: number) => string): string {
    const entry = waitingAt(s.hour)
    if (s.mine) return 'Your booking'
    if (entry) return `Waitlist #${entry.position}`
    if (s.status === 'available') return priceCents === undefined ? 'Free' : format(priceCents)
    if (s.status === 'taken') return isFuture(s.hour) ? 'Join waitlist' : 'Booked'
    return 'Past'
  }

  /** CSS modifier for a slot button. */
  function className(s: Slot, isSelected: boolean): string {
    if (isSelected) return 'selected'
    if (s.mine) return 'mine'
    if (waitingAt(s.hour)) return 'waiting'
    return s.status
  }

  const clickable = (s: Slot) => s.status === 'available' || canWaitlist(s.hour)
  const freeCount = slots.filter((s) => s.status === 'available').length

  return { selection, label, className, clickable, freeCount }
}
