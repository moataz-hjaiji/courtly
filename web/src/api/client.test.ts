import { describe, expect, it, vi } from 'vitest'
import { apiError, mockApi } from '../test/fakes'
import { api, ApiError, auth } from './client'

describe('api client', () => {
  it('sends JSON with the saved token', async () => {
    auth.set('tok')
    const calls = mockApi({ 'POST /bookings': { id: 7 } })
    await expect(api('/bookings', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ id: 7 })
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/bookings', body: { a: 1 } })
    const init = vi.mocked(fetch).mock.calls[0]![1]!
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  it("turns the API's error body into an ApiError with code and message", async () => {
    mockApi({ 'POST /bookings': apiError(409, 'SLOT_TAKEN', 'This slot was just booked by someone else') })
    const err = await api('/bookings', { method: 'POST' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'SLOT_TAKEN', message: 'This slot was just booked by someone else' })
  })

  it('logs out on 401, except on the login call itself', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    auth.set('expired')
    mockApi({ 'GET /courts': apiError(401, 'UNAUTHENTICATED', 'Login required'), 'POST /auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Wrong') })

    await api('/auth/login', { method: 'POST' }).catch(() => {})
    expect(auth.token).toBe('expired')
    expect(reload).not.toHaveBeenCalled()

    await api('/courts').catch(() => {})
    expect(auth.token).toBeNull()
    expect(reload).toHaveBeenCalledOnce()
  })
})
