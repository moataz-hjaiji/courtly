import type { ReactNode } from 'react'

export type Tone = 'success' | 'danger' | 'neutral' | 'warning' | 'info'

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** Colour for a booking or court status word. */
export const statusTone = (status: string): Tone =>
  status === 'confirmed' || status === 'active' ? 'success'
    : status === 'cancelled' || status === 'inactive' ? 'neutral'
      : 'info'
