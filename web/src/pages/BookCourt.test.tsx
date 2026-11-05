import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Slot } from '../api/types'
import { apiError, booking, court, DAY, entry, FakeEventSource, mockApi, slots } from '../test/fakes'
import { BookCourt } from './BookCourt'

// Clock: 09:30 on DAY. Court 1 is open 08–12, so 10:00 and 11:00 are the bookable hours.
const availability = (s: Slot[]) => ({ slots: s })

function setup(daySlots: Slot[], extra: Record<string, unknown> = {}) {
  const calls = mockApi({
    'GET /courts': [court(), court({ id: 2, name: 'Tennis', sport: 'tennis' }), court({ id: 3, name: 'Closed', isActive: false })],
    [`GET /courts/1/availability?date=${DAY}`]: availability(daySlots),
    'GET /waitlist/mine': [],
    ...extra,
  })
  render(<BookCourt />)
  return calls
}
const slot = (time: string) => screen.getByRole('button', { name: new RegExp(`^${time} `) })
const availabilityCalls = (calls: { path: string }[]) => calls.filter((c) => c.path.endsWith('/availability')).length

describe('BookCourt', () => {
  it('lists only active courts and shows each hour with its status', async () => {
    setup(slots({ 11: 'mine' }))
    expect(await screen.findByRole('button', { name: '10:00 €30.00' })).toBeEnabled()
    expect(slot('08:00')).toHaveAccessibleName('08:00 Past')
    expect(slot('08:00')).toBeDisabled()
    expect(slot('11:00')).toHaveAccessibleName('11:00 Your booking')
    const options = within(screen.getByRole('combobox', { name: /Court/ })).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Padel 1 · padel · €30.00/h', 'Tennis · tennis · €30.00/h'])
  })

  it('books a free hour for 2 hours and refreshes the grid', async () => {
    const calls = setup(slots(), { 'POST /bookings': booking({ priceCents: 6000 }) })
    await userEvent.click(await screen.findByRole('button', { name: '10:00 €30.00' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Duration' }), '2')
    expect(screen.getByText('€60.00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ courtId: 1, date: DAY, startHour: 10, hours: 2 })
    expect(await screen.findByRole('status')).toHaveTextContent('Booked Padel 1, Thu, 5 Nov 2026 10:00–12:00 · €60.00')
    expect(availabilityCalls(calls)).toBe(2) // initial load + refresh after booking
  })

  it("doesn't offer 2 hours when the next hour is taken", async () => {
    setup(slots({ 11: 'taken' }))
    await userEvent.click(await screen.findByRole('button', { name: '10:00 €30.00' }))
    expect(screen.getByRole('option', { name: /2 hours/ })).toBeDisabled()
  })

  it('shows the reason when someone else got the slot first', async () => {
    setup(slots(), { 'POST /bookings': apiError(409, 'SLOT_TAKEN', 'This slot was just booked by someone else') })
    await userEvent.click(await screen.findByRole('button', { name: '10:00 €30.00' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This slot was just booked by someone else')
  })

  it("joins the waitlist for someone else's booking", async () => {
    const calls = setup(slots({ 10: 'taken' }), { 'POST /waitlist': entry({ position: 2 }) })
    await userEvent.click(await screen.findByRole('button', { name: '10:00 Join waitlist' }))
    expect(screen.getByText('Padel 1 is booked at this time')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Join waitlist' }))

    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/waitlist', body: { startHour: 10, hours: 1 } })
    expect(await screen.findByRole('status')).toHaveTextContent("You're #2 on the waitlist")
  })

  it('shows my place in line on hours I already wait for', async () => {
    setup(slots({ 10: 'taken' }), { 'GET /waitlist/mine': [entry({ position: 3 })] })
    expect(await screen.findByRole('button', { name: '10:00 Waitlist #3' })).toBeDisabled()
  })

  it('refreshes when a live event arrives for this court and day, and ignores others', async () => {
    const calls = setup(slots())
    await screen.findByRole('button', { name: '10:00 €30.00' })
    expect(availabilityCalls(calls)).toBe(1)

    act(() => FakeEventSource.emit('availability', { courtId: 2, date: DAY }))
    act(() => FakeEventSource.emit('availability', { courtId: 1, date: '2026-11-06' }))
    expect(availabilityCalls(calls)).toBe(1)

    act(() => FakeEventSource.emit('availability', { courtId: 1, date: DAY }))
    await screen.findByRole('button', { name: '10:00 €30.00' })
    expect(availabilityCalls(calls)).toBe(2)
  })

  it('loads the next day and clears the selection', async () => {
    const calls = setup(slots(), { 'GET /courts/1/availability?date=2026-11-06': availability(slots({}, '2026-11-06')) })
    await userEvent.click(await screen.findByRole('button', { name: '10:00 €30.00' }))
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next day' }))

    expect(await screen.findByText('Fri, 6 Nov 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm booking' })).not.toBeInTheDocument()
    expect(calls.some((c) => c.query === '?date=2026-11-06')).toBe(true)
  })
})
