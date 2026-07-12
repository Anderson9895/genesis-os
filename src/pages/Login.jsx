import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const result = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })

      if (result.error) {
        throw result.error
      }

      if (result.data.session) {
        navigate('/', { replace: true })
        return
      }

      setMessage(
        isSignUp
          ? 'Account created. Please check your inbox to confirm your email before signing in.'
          : 'Please check your email and password and try again.'
      )
    } catch (error) {
      setMessage(error.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-mark">⚙️</div>
          <div>
            <h1>Genesis OS</h1>
            <p>Secure command center</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />

          <label className="login-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />

          <button type="submit" className="primary-action full-width" disabled={loading}>
            {loading ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button type="button" className="secondary-action full-width" onClick={() => setIsSignUp((value) => !value)}>
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Create one'}
        </button>

        {message ? <p className="login-message">{message}</p> : null}
      </div>
    </div>
  )
}

export default LoginPage
