import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { useAuth } from './hooks/useAuth'
import NavBar from './components/NavBar'
import LoginPage from './pages/LoginPage'
import NewNotePage from './pages/NewNotePage'
import NoteDetailPage from './pages/NoteDetailPage'
import HistoryPage from './pages/HistoryPage'
import Spinner from './components/Spinner'

function ProtectedRoute({ user, children }: { user: User | null; children: ReactNode }) {
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AuthLayout({ user, children }: { user: User; children: ReactNode }) {
  return (
    <div className="layout">
      <NavBar user={user} />
      <main className="main-content">{children}</main>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner label="Initialising…" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute user={user}>
              <AuthLayout user={user!}>
                <HistoryPage />
              </AuthLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes/new"
          element={
            <ProtectedRoute user={user}>
              <AuthLayout user={user!}>
                <NewNotePage />
              </AuthLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes/:noteId"
          element={
            <ProtectedRoute user={user}>
              <AuthLayout user={user!}>
                <NoteDetailPage />
              </AuthLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
