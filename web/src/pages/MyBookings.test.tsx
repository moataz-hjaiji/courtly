import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, booking, entry, mockApi } from '../test/fakes'
import { MyBookings } from './MyBookings'

const mine = {
  upcoming: [booking({ id: 1 }), booking({ id: 2, startAt: '2026-11-06T18:00:00.000Z', endAt: '2026-11-06T19:00:00.000Z', status: 'cancelled' })],
  past: [booking({ id: 3, startAt: '2026-10-31T12:00:00.000Z', endAt: '2026-10-31T14:00:00.000Z' })],
}
const section = (name: string) => screen.getByRole('heading', { name: new RegExp(`^${name}`) }).parentElement!

describe('MyBookings', () => {
  it('splits upcoming, waitlist and past, and only offers Cancel on confirmed upcoming bookings', async () => {
    mockApi({ 'GET /bookings/mine': mine, 'GET /waitlist/mine': [entry({ position: 2, startAt: '2026-11-07T10:00:00.000Z', endAt: '2026-11-07T11:00:00.000Z' })] })
    render(<MyBookings />)

    const upcoming = await screen.findByRole('heading', { name: /^Upcoming/ })
    expect(upcoming).toHaveTextContent('(1)') // one confirmed
    expect(within(section('Upcoming')).getAllByRole('button', { name: 'Cancel' })).toHaveLength(1)
    expect(within(section('Waitlist')).getByText('#2 in line')).toBeInTheDocument()
    expect(within(section('Past')).getByText('Sat, 31 Oct 2026')).toBeInTheDocument()
    expect(within(section('Past')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides past and left waitlist entries', async () => {
    mockApi({
      'GET /bookings/mine': { upcoming: [], past: [] },
      'GET /waitlist/mine': [entry({ status: 'left' }), entry({ id: 2, startAt: '2026-11-01T10:00:00.000Z', endAt: '2026-11-01T11:00:00.000Z' })],
    })
    render(<MyBookings />)
    expect(await screen.findByText(/not waiting for any slot/)).toBeInTheDocument()
  })

  it('cancels a booking and reloads the lists', async () => {
    const calls = mockApi({ 'GET /bookings/mine': mine, 'GET /waitlist/mine': [], 'POST /bookings/1/cancel': booking({ status: 'cancelled' }) })
    render(<MyBookings />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cancelled Padel 1 on Thu, 5 Nov 2026 at 10:00.')
    expect(calls.filter((c) => c.path === '/bookings/mine')).toHaveLength(2)
  })

  it("shows the API's reason when it's too late to cancel", async () => {
    mockApi({
      'GET /bookings/mine': mine, 'GET /waitlist/mine': [],
      'POST /bookings/1/cancel': apiError(422, 'CANCELLATION_WINDOW_CLOSED', 'Bookings can only be cancelled up to 2 hours before they start'),
    })
    render(<MyBookings />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 2 hours before they start')
  })

  it('leaves the waitlist', async () => {
    const calls = mockApi({
      'GET /bookings/mine': { upcoming: [], past: [] },
      'GET /waitlist/mine': [entry({ id: 5, startAt: '2026-11-07T10:00:00.000Z', endAt: '2026-11-07T11:00:00.000Z' })],
      'POST /waitlist/5/leave': entry({ status: 'left' }),
    })
    render(<MyBookings />)
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(calls.some((c) => c.method === 'POST' && c.path === '/waitlist/5/leave')).toBe(true)
    expect(await screen.findByRole('status')).toHaveTextContent('Left the waitlist')
  })

  it('shows promoted entries as booked for you', async () => {
    mockApi({
      'GET /bookings/mine': { upcoming: [], past: [] },
      'GET /waitlist/mine': [entry({ status: 'promoted', bookingId: 9, position: null, startAt: '2026-11-07T10:00:00.000Z', endAt: '2026-11-07T11:00:00.000Z' })],
    })
    render(<MyBookings />)
    expect(await screen.findByText('promoted · booked for you')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument()
  })

  it('tells players when a booking was cancelled because the court closed', async () => {
    mockApi({
      'GET /bookings/mine': { upcoming: [booking({ status: 'cancelled', cancelReason: 'court_deactivated' }), booking({ id: 2, status: 'cancelled' })], past: [] },
      'GET /waitlist/mine': [],
    })
    render(<MyBookings />)
    expect(await screen.findByText('cancelled · court closed')).toBeInTheDocument()
    expect(screen.getByText('cancelled')).toBeInTheDocument() // the one the player cancelled themselves
  })
})
