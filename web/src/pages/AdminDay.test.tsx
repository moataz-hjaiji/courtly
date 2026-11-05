import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { booking, DAY, mockApi } from '../test/fakes'
import { AdminDay } from './AdminDay'

describe('AdminDay', () => {
  it("shows the day's revenue, counts and bookings", async () => {
    mockApi({
      [`GET /admin/bookings?date=${DAY}`]: {
        date: DAY,
        totalRevenueCents: 9000,
        bookings: [
          booking({ id: 1, userName: 'Alice', userEmail: 'alice@courtly.test', priceCents: 6000 }),
          booking({ id: 2, userName: 'Bob', userEmail: 'bob@courtly.test', priceCents: 3000, courtName: 'Padel 2' }),
          booking({ id: 3, userName: 'Bob', userEmail: 'bob@courtly.test', status: 'cancelled' }),
        ],
      },
    })
    render(<AdminDay />)

    expect(await screen.findByText('€90.00')).toBeInTheDocument()
    expect(screen.getByText('Confirmed').nextElementSibling).toHaveTextContent('2')
    expect(screen.getByText('Cancelled').nextElementSibling).toHaveTextContent('1')
    expect(screen.getAllByRole('row')).toHaveLength(4) // header + 3
    expect(screen.getByText('alice@courtly.test')).toBeInTheDocument()
  })

  it('loads another day from the day picker', async () => {
    const calls = mockApi({
      [`GET /admin/bookings?date=${DAY}`]: { date: DAY, totalRevenueCents: 0, bookings: [] },
      'GET /admin/bookings?date=2026-11-04': { date: '2026-11-04', totalRevenueCents: 0, bookings: [] },
    })
    render(<AdminDay />)
    expect(await screen.findByText('No bookings on this day.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }))

    expect(await screen.findByText(/Wed, 4 Nov 2026/)).toBeInTheDocument()
    expect(calls.map((c) => c.query)).toContain('?date=2026-11-04')
  })
})
