import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp, signInWithGoogle } from '../hooks/useAuth'
import ErrorAlert from '../components/ErrorAlert'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418l3.0067-2.3318z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.9245 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'signup') {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.'
      setError(msg)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h1 className="auth-title">Note Insight</h1>
        <p className="auth-subtitle">
          {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
        </p>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Google Sign In Button */}
        <button
          type="button"
          className="btn-google"
          onClick={() => void handleGoogleSignIn()}
          disabled={loading || googleLoading}
        >
          <GoogleIcon />
          <span>{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
        </button>

        <div className="auth-divider">
          <span>or continue with email</span>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="Min. 6 characters"
              minLength={6}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading || googleLoading}
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In with Email' : 'Create Account with Email'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', fontSize: '0.875rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
