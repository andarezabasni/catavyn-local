import { useState } from 'react'
import { Link } from 'react-router'
import { Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import loginLogo from '../assets/login_page_logo.png'

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await resetPasswordForEmail(email)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-8">
            <img src={loginLogo} alt="Catavyn" className="w-72" />
          </div>
          <div className="bg-bg-card rounded-2xl border border-border p-8 shadow-sm">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-accent-gold/15 flex items-center justify-center">
                <Mail size={24} className="text-accent-gold" />
              </div>
            </div>
            <h2 className="text-text-primary font-semibold text-lg mb-2">Check your email</h2>
            <p className="text-text-secondary text-sm">
              If an account exists for <span className="font-medium text-text-primary">{email}</span>, we sent a link to reset your password.
            </p>
          </div>
          <p className="text-text-muted text-sm mt-6">
            <Link to="/login" className="text-accent-gold font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src={loginLogo} alt="Catavyn" className="w-72" />
        </div>

        <div className="bg-bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h2 className="text-text-primary font-semibold text-lg mb-2">Reset password</h2>
          <p className="text-text-secondary text-sm mb-6">
            Enter your email and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-text-secondary text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="rounded-lg border border-border bg-bg-page px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-sm mt-6">
          Remembered your password?{' '}
          <Link to="/login" className="text-accent-gold font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
