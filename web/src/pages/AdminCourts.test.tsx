import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, court, mockApi } from '../test/fakes'
import { AdminCourts } from './AdminCourts'

const courts = [court(), court({ id: 4, name: 'Old Squash', sport: 'squash', isActive: false })]
const row = (name: string) => screen.getByText(name).closest('tr')!

describe('AdminCourts', () => {
  it('lists active and inactive courts', async () => {
    mockApi({ 'GET /courts': courts })
    render(<AdminCourts />)
    expect(await screen.findByText('Padel 1')).toBeInTheDocument()
    expect(within(row('Padel 1')).getByText('active')).toBeInTheDocument()
    expect(within(row('Old Squash')).getByRole('button', { name: 'Activate' })).toBeInTheDocument()
  })

  it('creates a court, sending the price in cents', async () => {
    const calls = mockApi({ 'GET /courts': courts, 'POST /courts': court({ id: 9, name: 'Padel 9' }) })
    render(<AdminCourts />)
    await userEvent.click(await screen.findByRole('button', { name: '+ New court' }))

    await userEvent.type(screen.getByLabelText(/Name/), 'Padel 9')
    const price = screen.getByLabelText(/Price per hour/)
    await userEvent.clear(price)
    await userEvent.type(price, '35.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save court' }))

    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      name: 'Padel 9', sport: 'padel', hourlyPriceCents: 3550, openHour: 8, closeHour: 23,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Saved Padel 9.')
  })

  it("keeps the form open and shows the API's validation error", async () => {
    mockApi({ 'GET /courts': courts, 'PATCH /courts/1': apiError(400, 'INVALID_OPENING_HOURS', 'Opening hour must be before closing hour (0–24)') })
    render(<AdminCourts />)
    await userEvent.click(within(await screen.findByText('Padel 1').then((el) => el.closest('tr')!)).getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save court' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Opening hour must be before closing hour')
    expect(screen.getByRole('heading', { name: 'Edit Padel 1' })).toBeInTheDocument()
  })

  it('deactivates a court', async () => {
    const calls = mockApi({ 'GET /courts': courts, 'PATCH /courts/1': court({ isActive: false }) })
    render(<AdminCourts />)
    await userEvent.click(within(await screen.findByText('Padel 1').then((el) => el.closest('tr')!)).getByRole('button', { name: 'Deactivate' }))

    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ isActive: false })
    expect(await screen.findByRole('status')).toHaveTextContent('Padel 1 is now inactive.')
  })
})
