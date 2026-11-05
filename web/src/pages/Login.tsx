import { useState, type FormEvent } from 'react'
import { api, auth } from '../api/client'
import type { User } from '../api/types'
import { errorText } from '../utils/format'
import { Alert, type Notice } from '../components/Alert'
import { Logo } from '../components/Logo'

const DEMO = [
  { email: 'alice@courtly.test', label: 'Alice (user)' },
  { email: 'bob@courtly.test', label: 'Bob (user)' },
  { email: 'admin@courtly.test', label: 'Admin' },
]

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState(DEMO[0]!.email)
  const [password, setPassword] = useState('password123')
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    setBusy(true)
    try {
      const res = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } })
      auth.set(res.token)
      onLogin(res.user)
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) })
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card stack">
        <Logo />
        <div>
          <h1>Welcome back</h1>
          <p className="muted">Book padel, tennis and squash courts in seconds.</p>
        </div>
        <label>Email <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <Alert notice={notice} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <div className="stack" style={{ gap: '0.5rem' }}>
          <p className="muted small">Demo accounts (password <code>password123</code>):</p>
          <div className="demo-accounts">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="btn btn-secondary btn-sm" aria-pressed={email === d.email}
                onClick={() => { setEmail(d.email); setPassword('password123') }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </main>
  )
}
