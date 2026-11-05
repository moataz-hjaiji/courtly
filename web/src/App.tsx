import { useEffect, useState } from 'react'
import { api, auth, type User } from './api'
import { Login } from './pages/Login'
import { BookCourt } from './pages/BookCourt'
import { MyBookings } from './pages/MyBookings'
import { AdminCourts } from './pages/AdminCourts'
import { AdminDay } from './pages/AdminDay'

type Tab = 'book' | 'mine' | 'courts' | 'day'
const TABS: { id: Tab; label: string; admin?: boolean }[] = [
  { id: 'book', label: 'Book a court' },
  { id: 'mine', label: 'My bookings' },
  { id: 'courts', label: 'Manage courts', admin: true },
  { id: 'day', label: 'Day overview', admin: true },
]

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!auth.token)
  const [tab, setTab] = useState<Tab>('book')

  useEffect(() => {
    if (!auth.token) return
    api<User>('/auth/me').then(setUser).catch(() => auth.clear()).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="container">Loading…</p>
  if (!user) return <Login onLogin={setUser} />

  const logout = () => { auth.clear(); setUser(null); setTab('book') }

  return (
    <>
      <header>
        <strong>🎾 Courtly</strong>
        <nav>
          {TABS.filter((t) => !t.admin || user.role === 'admin').map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <span className="muted">{user.name} ({user.role}) <button className="link" onClick={logout}>Log out</button></span>
      </header>
      <main className="container">
        {tab === 'book' && <BookCourt />}
        {tab === 'mine' && <MyBookings />}
        {tab === 'courts' && <AdminCourts />}
        {tab === 'day' && <AdminDay />}
      </main>
    </>
  )
}
