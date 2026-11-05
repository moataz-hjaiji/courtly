export type Role = 'user' | 'admin'
export interface User { id: number; name: string; email: string; role: Role }
export interface Court {
  id: number; name: string; sport: string; hourlyPriceCents: number
  openHour: number; closeHour: number; isActive: boolean
}
export type SlotStatus = 'available' | 'taken' | 'past'
export interface Slot { hour: number; startAt: string; status: SlotStatus }
export interface Booking {
  id: number; courtId: number; courtName: string; sport: string; userId: number
  startAt: string; endAt: string; priceCents: number; status: 'confirmed' | 'cancelled'
  userName?: string; userEmail?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const TOKEN_KEY = 'courtly.token'
export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY) },
  set(token: string) { localStorage.setItem(TOKEN_KEY, token) },
  clear() { localStorage.removeItem(TOKEN_KEY) },
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      auth.clear()
      window.location.reload()
    }
    throw new ApiError(res.status, data.error?.code ?? 'UNKNOWN', data.error?.message ?? res.statusText)
  }
  return data as T
}

export const money = (cents: number) => `€${(cents / 100).toFixed(2)}`
// The facility runs on UTC (see API), so times are shown in UTC, not the browser's zone.
export const hhmm = (iso: string) => iso.slice(11, 16)
export const ymd = (iso: string) => iso.slice(0, 10)
export const today = () => new Date().toISOString().slice(0, 10)
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
