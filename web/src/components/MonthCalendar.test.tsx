import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MonthCalendar } from './MonthCalendar'

// Test clock: today is Thu 5 Nov 2026.
describe('MonthCalendar', () => {
  it('shows the selected month, marks today, and picks a day', async () => {
    const onChange = vi.fn()
    render(<MonthCalendar value="2026-11-05" min="2026-11-05" onChange={onChange} />)

    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thu, 5 Nov 2026 (today)' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Mon, 9 Nov 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-11-09')
  })

  it("doesn't allow days before the minimum, or months before it", () => {
    render(<MonthCalendar value="2026-11-05" min="2026-11-05" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Wed, 4 Nov 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })

  it('browses to the next month and back', async () => {
    const onChange = vi.fn()
    render(<MonthCalendar value="2026-11-05" min="2026-11-05" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fri, 25 Dec 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-12-25')

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('November 2026')).toBeInTheDocument()
  })

  it('follows the selected day when it changes from outside', () => {
    const { rerender } = render(<MonthCalendar value="2026-11-05" onChange={() => {}} />)
    rerender(<MonthCalendar value="2027-01-10" onChange={() => {}} />)
    expect(screen.getByText('January 2027')).toBeInTheDocument()
  })
})
