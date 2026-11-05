import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DayPicker } from './DayPicker'

describe('DayPicker', () => {
  it('moves one day back and forward', async () => {
    const onChange = vi.fn()
    render(<DayPicker value="2026-11-30" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(onChange.mock.calls).toEqual([['2026-12-01'], ['2026-11-29']])
  })

  it("can't go before the minimum day", () => {
    render(<DayPicker value="2026-11-05" min="2026-11-05" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled()
  })
})
