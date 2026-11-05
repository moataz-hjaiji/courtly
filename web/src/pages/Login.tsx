import { useState, type FormEvent } from 'react'
import { api, auth, errorText, type User } from '../api'

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('alice@courtly.test')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const res = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } })
      auth.set(res.token)
      onLogin(res.user)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <main className="container narrow">
      <h1>🎾 Courtly</h1>
      <form onSubmit={submit} className="card stack">
        <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit">Log in</button>
        <p className="muted small">Demo: alice@courtly.test, bob@courtly.test, admin@courtly.test — password <code>password123</code></p>
      </form>
    </main>
  )
}
