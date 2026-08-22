import { Link, useNavigate } from 'react-router-dom'
import { signOut } from '../hooks/useAuth'
import type { User } from 'firebase/auth'

interface Props {
  user: User
}

export default function NavBar({ user }: Props) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">Note Insight</Link>
      <div className="nav-links">
        <Link to="/" className="btn btn-ghost btn-sm">History</Link>
        <Link to="/notes/new" className="btn btn-primary btn-sm">+ New Note</Link>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {user.email}
        </span>
        <button onClick={() => void handleSignOut()} className="btn btn-ghost btn-sm">
          Sign out
        </button>
      </div>
    </nav>
  )
}
