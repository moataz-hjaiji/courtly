import { describe, expect, it } from 'vitest'
import { addDays, dayLabel, errorText, formatHour, hhmm, money, today } from './format'

describe('format', () => {
  it('shows cents as euros with two decimals', () => {
    expect(money(3000)).toBe('€30.00')
    expect(money(1)).toBe('€0.01')
    expect(money(0)).toBe('€0.00')
  })

  it('formats hours and ISO times in UTC', () => {
    expect(formatHour(9)).toBe('09:00')
    expect(formatHour(24)).toBe('24:00')
    expect(hhmm('2026-11-05T18:00:00.000Z')).toBe('18:00')
  })

  it("labels a day in UTC, whatever the browser's time zone", () => {
    expect(dayLabel('2026-11-05')).toBe('Thu, 5 Nov 2026')
    expect(dayLabel('2026-11-05T23:30:00.000Z')).toBe('Thu, 5 Nov 2026')
  })

  it('moves days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('uses the fixed test clock for today', () => {
    expect(today()).toBe('2026-11-05')
  })

  it('turns anything thrown into readable text', () => {
    expect(errorText(new Error('boom'))).toBe('boom')
    expect(errorText('plain')).toBe('plain')
  })
})
