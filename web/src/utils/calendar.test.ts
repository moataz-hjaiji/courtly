import { describe, expect, it } from 'vitest'
import { addMonths, monthCells, monthLabel, monthOf } from './calendar'

describe('calendar', () => {
  it('starts weeks on Monday', () => {
    // 1 Nov 2026 is a Sunday: six blanks (Mon–Sat) come first.
    const cells = monthCells('2026-11')
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(cells.filter(Boolean)).toHaveLength(30)
    // 1 Jun 2026 is a Monday: no blanks.
    expect(monthCells('2026-06')[0]).toBe('2026-06-01')
  })

  it('knows month lengths, including leap years', () => {
    expect(monthCells('2026-02').filter(Boolean)).toHaveLength(28)
    expect(monthCells('2028-02').filter(Boolean).at(-1)).toBe('2028-02-29')
  })

  it('moves between months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthOf('2026-11-05')).toBe('2026-11')
    expect(monthLabel('2026-11')).toBe('November 2026')
  })
})
