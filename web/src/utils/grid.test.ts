import { describe, expect, it } from 'vitest'
import type { Slot, WaitlistEntry } from '../api/types'
import { DAY, entry, slots } from '../test/fakes'
import { makeGrid } from './grid'
import { money } from './format'

// The test clock is 09:30 on DAY, so 08:00 and 09:00 are past; 10:00 and 11:00 are ahead.
const grid = (s: Slot[], waitlist: WaitlistEntry[] = []) => makeGrid({ slots: s, waitlist, courtId: 1, date: DAY, now: Date.now() })

describe('selection mode', () => {
  it('books a free hour', () => {
    expect(grid(slots()).selection(10, 1).mode).toBe('book')
  })

  it("offers the waitlist for someone else's booking ahead", () => {
    expect(grid(slots({ 10: 'taken' })).selection(10, 1).mode).toBe('waitlist')
  })

  it.each([
    ['a past hour', slots(), 8],
    ['my own booking', slots({ 10: 'mine' }), 10],
    ['a booked hour that has started', slots({ 9: 'taken' }), 9],
    ['nothing selected', slots(), null],
  ])('offers nothing for %s', (_label, s, hour) => {
    expect(grid(s).selection(hour, 1).mode).toBeNull()
  })

  it("doesn't offer the waitlist again when I'm already on it", () => {
    expect(grid(slots({ 10: 'taken' }), [entry()]).selection(10, 1).mode).toBeNull()
  })

  it('ignores waitlist entries for other courts', () => {
    expect(grid(slots({ 10: 'taken' }), [entry({ courtId: 2 })]).selection(10, 1).mode).toBe('waitlist')
  })
})

describe('two-hour option', () => {
  it('allows 2h when the next hour is free', () => {
    expect(grid(slots()).selection(10, 2)).toMatchObject({ nextHourUsable: true, duration: 2 })
  })

  it('falls back to 1h when the next hour is taken', () => {
    expect(grid(slots({ 11: 'taken' })).selection(10, 2)).toMatchObject({ nextHourUsable: false, duration: 1 })
  })

  it('falls back to 1h at the last hour of the day', () => {
    expect(grid(slots()).selection(11, 2)).toMatchObject({ nextHourUsable: false, duration: 1 })
  })

  it('lets a waitlist entry span a free or taken next hour, but not my own booking', () => {
    expect(grid(slots({ 10: 'taken' })).selection(10, 2).duration).toBe(2)
    expect(grid(slots({ 10: 'taken', 11: 'taken' })).selection(10, 2).duration).toBe(2)
    expect(grid(slots({ 10: 'taken', 11: 'mine' })).selection(10, 2).duration).toBe(1)
  })
})

describe('slot labels and styles', () => {
  // Built per test (not at load time) so they use the fixed clock set in beforeEach.
  const day = () => slots({ 9: 'taken', 10: 'taken', 11: 'mine' })
  const at = (h: number) => day().find((s) => s.hour === h)!
  const g = { label: (s: Slot) => grid(day()).label(s, 3000, money), clickable: (s: Slot) => grid(day()).clickable(s) }

  it('says what each hour is', () => {
    expect(g.label(at(8))).toBe('Past')
    expect(g.label(at(9))).toBe('Booked')
    expect(g.label(at(10))).toBe('Join waitlist')
    expect(g.label(at(11))).toBe('Your booking')
    expect(grid(slots()).label(slots()[2]!, 3000, money)).toBe('€30.00')
  })

  it('shows my place in line on hours I wait for', () => {
    const waiting = grid(slots({ 10: 'taken' }), [entry({ position: 3 })])
    expect(waiting.label(slots({ 10: 'taken' })[2]!, 3000, money)).toBe('Waitlist #3')
    expect(waiting.className(slots({ 10: 'taken' })[2]!, false)).toBe('waiting')
  })

  it('only lets free hours and waitable hours be clicked', () => {
    expect([8, 9, 10, 11].map((h) => g.clickable(at(h)))).toEqual([false, false, true, false])
  })

  it('counts free hours', () => {
    expect(grid(slots({ 10: 'taken' })).freeCount).toBe(1)
  })
})
