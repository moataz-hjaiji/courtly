import { useEffect, useState } from 'react'
import { api, auth, type User } from './api'
import { Logo } from './ui'
import { Login } from './pages/Login'
import { BookCourt } from './pages/BookCourt'
import { MyBookings } from './pages/MyBookings'
import { AdminCourts } from './pages/AdminCourts'
import { AdminDay } from './pages/AdminDay'

type Tab = 'book' | 'mine' | 'courts' | 'day'
const TABS: { id: Tab; label: string; admin?: boolean }[] = [
  { id: 'book', label: 'Book a court' },
  { id: 'mine', label: 'My bookings' },
  { id: 'courts', label: 'Courts', admin: true },
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

  if (loading) return <p className="container muted">Loading…</p>
  if (!user) return <Login onLogin={setUser} />

  const logout = () => { auth.clear(); setUser(null); setTab('book') }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <nav className="tabs" aria-label="Main">
            {TABS.filter((t) => !t.admin || user.role === 'admin').map((t) => (
              <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="user">
            <span className="avatar" aria-hidden="true">{user.name[0]}</span>
            <span className="name">{user.name}{user.role === 'admin' && <span className="muted"> · admin</span>}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
          </div>
        </div>
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
