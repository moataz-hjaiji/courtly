import { vi } from 'vitest'
import type { Booking, Court, Slot, SlotStatus, WaitlistEntry } from '../api/types'

// ---- Fake API ---------------------------------------------------------------------------------

type Reply = { __reply: true; status: number; body: unknown }
/** An error (or any non-200) answer for a mocked route. */
export const reply = (status: number, body: unknown): Reply => ({ __reply: true, status, body })
export const apiError = (status: number, code: string, message: string) => reply(status, { error: { code, message } })

type Handler = unknown | ((body: never) => unknown)
export interface Call { method: string; path: string; query: string; body: unknown }

/**
 * Replaces fetch with a tiny router. Keys are "METHOD /path" (optionally with "?query").
 * A value is the JSON to answer with, a reply(...) for errors, or a function of the request body.
 * Returns the list of calls, so tests can check what the UI sent.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost')
    const method = init.method ?? 'GET'
    const path = url.pathname.replace(/^\/api/, '')
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, path, query: url.search, body })
    const key = [`${method} ${path}${url.search}`, `${method} ${path}`].find((k) => k in routes)
    if (!key) return json(404, { error: { code: 'NOT_MOCKED', message: `No mock for ${method} ${path}${url.search}` } })
    const handler = routes[key]
    const out = typeof handler === 'function' ? handler(body) : handler
    return isReply(out) ? json(out.status, out.body) : json(200, out)
  }))
  return calls
}
const isReply = (x: unknown): x is Reply => typeof x === 'object' && x !== null && '__reply' in x
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// ---- Fake EventSource (jsdom has none) --------------------------------------------------------

export class FakeEventSource {
  static instances: FakeEventSource[] = []
  closed = false
  private listeners: Record<string, ((e: { data: string }) => void)[]> = {}
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, fn: (e: { data: string }) => void) { (this.listeners[type] ??= []).push(fn) }
  close() { this.closed = true }
  /** Pushes a server event to every open stream. */
  static emit(type: string, data: unknown) {
    for (const s of FakeEventSource.instances) if (!s.closed) s.listeners[type]?.forEach((fn) => fn({ data: JSON.stringify(data) }))
  }
}

// ---- Test data --------------------------------------------------------------------------------

export const DAY = '2026-11-05'

export const court = (over: Partial<Court> = {}): Court => ({
  id: 1, name: 'Padel 1', sport: 'padel', hourlyPriceCents: 3000, openHour: 8, closeHour: 12, isActive: true, ...over,
})

/** Slots 08:00–11:00 on DAY. Pass statuses by hour, e.g. { 10: 'taken' }. Hours before 09:30 are past. */
export function slots(over: Partial<Record<number, SlotStatus | 'mine'>> = {}, day = DAY, open = 8, close = 12): Slot[] {
  const now = Date.now()
  return Array.from({ length: close - open }, (_, i) => {
    const hour = open + i
    const startAt = `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`
    const o = over[hour]
    const status: SlotStatus = o === 'mine' ? 'taken' : o ?? (new Date(startAt).getTime() <= now ? 'past' : 'available')
    return { hour, startAt, status, mine: o === 'mine' }
  })
}

export const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 1, courtId: 1, courtName: 'Padel 1', sport: 'padel', userId: 2,
  startAt: `${DAY}T10:00:00.000Z`, endAt: `${DAY}T11:00:00.000Z`, priceCents: 3000, status: 'confirmed', ...over,
})

export const entry = (over: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
  id: 1, courtId: 1, courtName: 'Padel 1', sport: 'padel',
  startAt: `${DAY}T10:00:00.000Z`, endAt: `${DAY}T11:00:00.000Z`, status: 'waiting', bookingId: null, position: 1, ...over,
})
