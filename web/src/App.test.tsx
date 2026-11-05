import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { auth } from './api/client'
import { court, DAY, mockApi, slots } from './test/fakes'
import App from './App'

const commonRoutes = {
  'GET /courts': [court()],
  [`GET /courts/1/availability?date=${DAY}`]: { slots: slots() },
  'GET /waitlist/mine': [],
}

describe('App', () => {
  it('shows the login form when there is no token', () => {
    mockApi({})
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('gives users only the booking tabs', async () => {
    auth.set('tok')
    mockApi({ ...commonRoutes, 'GET /auth/me': { id: 2, name: 'Alice', email: 'a@t', role: 'user' } })
    render(<App />)
    expect(await screen.findByRole('button', { name: 'My bookings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Courts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Day overview' })).not.toBeInTheDocument()
  })

  it('gives admins the admin tabs too', async () => {
    auth.set('tok')
    mockApi({ ...commonRoutes, 'GET /auth/me': { id: 1, name: 'Ada', email: 'ad@t', role: 'admin' } })
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Courts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Day overview' })).toBeInTheDocument()
  })

  it('drops a token the API no longer accepts and shows the login form', async () => {
    auth.set('stale')
    mockApi({ 'GET /auth/me': { __reply: true, status: 500, body: {} } })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(auth.token).toBeNull()
  })
})
