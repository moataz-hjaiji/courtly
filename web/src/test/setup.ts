import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { FakeEventSource } from './fakes'

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource)
  // Fixed clock: "today" is Thu 5 Nov 2026 and it's 09:30 UTC, so 08:00 and 09:00 are in the past.
  // Only Date is faked, so promises and user-event timers keep working normally.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T09:30:00Z'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeEventSource.instances = []
  localStorage.clear()
})
