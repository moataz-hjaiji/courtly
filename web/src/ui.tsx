import type { ReactNode } from 'react'

export function Logo() {
  return (
    <span className="brand">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="5" width="28" height="22" rx="4" fill="var(--primary)" />
        <path d="M16 5v22M2 16h28M8 5v22M24 5v22" stroke="#fff" strokeWidth="1.6" opacity=".9" />
      </svg>
      Courtly
    </span>
  )
}

export type Tone = 'success' | 'danger' | 'neutral' | 'warning' | 'info'

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export const statusTone = (status: string): Tone =>
  status === 'confirmed' || status === 'active' ? 'success' : status === 'cancelled' || status === 'inactive' ? 'neutral' : 'info'

export type Notice = { kind: 'error' | 'success'; text: string } | null

export function Alert({ notice }: { notice: Notice }) {
  if (!notice) return null
  return <p className={`alert alert-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

/** Date input with previous/next-day buttons. Value is YYYY-MM-DD (UTC). */
export function DayPicker({ value, onChange, min }: { value: string; onChange: (d: string) => void; min?: string }) {
  const shift = (days: number) => {
    const d = new Date(`${value}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    onChange(d.toISOString().slice(0, 10))
  }
  return (
    <div className="daypicker">
      <button type="button" className="btn btn-ghost icon" onClick={() => shift(-1)} disabled={!!min && value <= min} aria-label="Previous day">‹</button>
      <input type="date" aria-label="Date" value={value} min={min} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button type="button" className="btn btn-ghost icon" onClick={() => shift(1)} aria-label="Next day">›</button>
    </div>
  )
}
