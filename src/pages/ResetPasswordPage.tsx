import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import loginLogo from '../assets/login_page_logo.png'

export default function ResetPasswordPage() {
  const { user, loading: authLoading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setDone(true)
      setTimeout(() => navigate('/'), 2000)
    }
  }

  if (authLoading) return null

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-8">
            <img src={loginLogo} alt="Catavyn" className="w-72" />
          </div>
          <div className="bg-bg-card rounded-2xl border border-border p-8 shadow-sm">
            <h2 className="text-text-primary font-semibold text-lg mb-2">Link expired</h2>
            <p className="text-text-secondary text-sm">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
          </div>
          <p className="text-text-muted text-sm mt-6">
            <Link to="/forgot-password" className="text-accent-gold font-medium hover:underline">
              Request a new link
            </Link>
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-8">
            <img src={loginLogo} alt="Catavyn" className="w-72" />
          </div>
          <div className="bg-bg-card rounded-2xl border border-border p-8 shadow-sm">
            <h2 className="text-text-primary font-semibold text-lg mb-2">Password updated</h2>
            <p className="text-text-secondary text-sm">Taking you to Catavyn…</p>
          </div>
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
          <h2 className="text-text-primary font-semibold text-lg mb-6">Set a new password</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-text-secondary text-sm font-medium" htmlFor="password">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg-page px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-text-secondary text-sm font-medium" htmlFor="confirm">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg-page px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
