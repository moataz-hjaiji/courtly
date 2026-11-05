import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Slot, WaitlistEntry } from '../api/types'
import { errorText } from '../utils/format'

/**
 * Slots for one court and day plus the user's waiting entries, kept fresh by the live event stream.
 * The stream only says "court X on day Y changed"; the data itself is refetched through the authed API.
 */
export function useAvailability(courtId: number | null, date: string) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!courtId) return
    try {
      const [res, mine] = await Promise.all([
        api<{ slots: Slot[] }>(`/courts/${courtId}/availability?date=${date}`),
        api<WaitlistEntry[]>('/waitlist/mine'),
      ])
      setSlots(res.slots)
      setWaitlist(mine.filter((w) => w.status === 'waiting'))
      setError(null)
    } catch (e) {
      setSlots([])
      setError(errorText(e))
    }
  }, [courtId, date])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const source = new EventSource('/api/events')
    source.addEventListener('availability', (e) => {
      const change = JSON.parse((e as MessageEvent<string>).data) as { courtId: number; date: string }
      if (change.courtId === courtId && change.date === date) reload()
    })
    return () => source.close()
  }, [courtId, date, reload])

  return { slots, waitlist, error, reload }
}
