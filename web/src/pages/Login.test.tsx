import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { auth } from '../api/client'
import { apiError, mockApi } from '../test/fakes'
import { Login } from './Login'

const user = { id: 2, name: 'Alice', email: 'alice@courtly.test', role: 'user' as const }

describe('Login', () => {
  it('logs in, saves the token and hands the user to the app', async () => {
    const calls = mockApi({ 'POST /auth/login': { token: 'tok', user } })
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(calls[0]!.body).toEqual({ email: 'alice@courtly.test', password: 'password123' })
    expect(auth.token).toBe('tok')
    expect(onLogin).toHaveBeenCalledWith(user)
  })

  it('fills the form from a demo account button', async () => {
    const calls = mockApi({ 'POST /auth/login': { token: 'tok', user } })
    render(<Login onLogin={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Admin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(calls[0]!.body).toMatchObject({ email: 'admin@courtly.test' })
  })

  it('shows the error and stays on the form when the password is wrong', async () => {
    mockApi({ 'POST /auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password') })
    const onLogin = vi.fn()
    render(<Login onLogin={onLogin} />)

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password')
    expect(onLogin).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled()
  })
})
