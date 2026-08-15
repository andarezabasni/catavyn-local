import { useState, useRef, useEffect } from 'react'
import { X, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { hashPin, verifyPin, isLegacyPinHash } from '../../lib/pin'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

type View = 'unlock' | 'remove' | 'set' | 'forgot' | 'verified'

interface NotePinModalProps {
  noteTitle: string
  pinHash: string | null
  initialView: 'unlock' | 'remove' | 'set'
  onUnlocked: () => void
  onPinChanged: (newHash: string | null) => void
  onClose: () => void
}

export default function NotePinModal({
  noteTitle,
  pinHash,
  initialView,
  onUnlocked,
  onPinChanged,
  onClose,
}: NotePinModalProps) {
  const { user } = useAuth()
  const [view, setView] = useState<View>(initialView)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const pinRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPin('')
    setConfirmPin('')
    setError(null)
    const target = view === 'forgot' ? passwordRef : pinRef
    const id = setTimeout(() => target.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [view])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  async function handleUnlock() {
    if (!pinHash) return
    setLoading(true)
    const ok = await verifyPin(pin, pinHash)
    if (ok && isLegacyPinHash(pinHash)) {
      // Transparently upgrade old unsalted hashes to salted PBKDF2
      onPinChanged(await hashPin(pin))
    }
    setLoading(false)
    if (ok) {
      onUnlocked()
    } else {
      setError('Incorrect PIN')
      setPin('')
      pinRef.current?.focus()
    }
  }

  async function handleRemove() {
    if (!pinHash) return
    setLoading(true)
    const ok = await verifyPin(pin, pinHash)
    setLoading(false)
    if (ok) {
      onPinChanged(null)
    } else {
      setError('Incorrect PIN')
      setPin('')
      pinRef.current?.focus()
    }
  }

  async function handleSetPin() {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return }
    if (!/^\d+$/.test(pin)) { setError('PIN must contain only numbers'); return }
    if (pin !== confirmPin) { setError('PINs do not match'); setConfirmPin(''); return }
    setLoading(true)
    const hash = await hashPin(pin)
    setLoading(false)
    onPinChanged(hash)
  }

  async function handleVerifyPassword() {
    if (!user?.email) return
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })
    setLoading(false)
    if (authError) {
      setError('Incorrect password')
      setPassword('')
    } else {
      setView('verified')
    }
  }

  const headings: Record<View, string> = {
    unlock: 'Enter PIN',
    remove: 'Enter PIN to remove lock',
    set: pinHash ? 'Change PIN' : 'Set PIN',
    forgot: 'Verify your identity',
    verified: 'Identity verified',
  }

  const pinInputClass =
    'w-full text-center tracking-[0.5em] text-lg rounded-lg border border-border bg-bg-page px-3 py-2.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-gold placeholder:tracking-normal placeholder:text-base placeholder:text-text-muted'

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={handleKeyDown}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-bg-card rounded-2xl border border-border shadow-xl w-full max-w-xs pointer-events-auto animate-fade-up">

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-text-muted shrink-0" />
              <div className="min-w-0">
                <h2 className="text-text-primary font-semibold text-sm">{headings[view]}</h2>
                <p className="text-text-muted text-[10px] truncate">{noteTitle || 'Untitled'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-page transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-3">

            {/* UNLOCK / REMOVE */}
            {(view === 'unlock' || view === 'remove') && (
              <>
                <input
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void (view === 'unlock' ? handleUnlock() : handleRemove())
                  }}
                  className={pinInputClass}
                />
                {error && <p className="text-xs text-red-500 text-center">{error}</p>}
                <button
                  type="button"
                  onClick={() => void (view === 'unlock' ? handleUnlock() : handleRemove())}
                  disabled={loading || pin.length < 4}
                  className="w-full rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? 'Verifying…' : view === 'unlock' ? 'Unlock' : 'Remove lock'}
                </button>
                <button
                  type="button"
                  onClick={() => { setView('forgot'); setError(null) }}
                  className="w-full text-center text-xs text-text-muted hover:text-accent-gold transition-colors pt-1"
                >
                  Forgot PIN?
                </button>
              </>
            )}

            {/* SET */}
            {view === 'set' && (
              <>
                <input
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="New PIN (4–6 digits)"
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null) }}
                  className={pinInputClass}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Confirm PIN"
                  value={confirmPin}
                  onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSetPin() }}
                  className={pinInputClass}
                />
                {error && <p className="text-xs text-red-500 text-center">{error}</p>}
                <p className="text-text-muted text-[10px] text-center">Numeric only, 4–6 digits. This is a UI lock, not encryption.</p>
                <button
                  type="button"
                  onClick={() => void handleSetPin()}
                  disabled={loading || pin.length < 4 || confirmPin.length < 4}
                  className="w-full rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? 'Saving…' : 'Set PIN'}
                </button>
              </>
            )}

            {/* FORGOT — verify password */}
            {view === 'forgot' && (
              <>
                <p className="text-text-secondary text-xs leading-relaxed">
                  Enter your account password to verify it's you. Then you can set a new PIN or remove the lock.
                </p>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Account password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') void handleVerifyPassword() }}
                    className="w-full rounded-lg border border-border bg-bg-page px-3 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button
                  type="button"
                  onClick={() => void handleVerifyPassword()}
                  disabled={loading || !password}
                  className="w-full rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => { setView(initialView); setError(null) }}
                  className="w-full text-center text-xs text-text-muted hover:text-text-secondary transition-colors pt-1"
                >
                  Back
                </button>
              </>
            )}

            {/* VERIFIED — choose action */}
            {view === 'verified' && (
              <>
                <div className="flex justify-center py-2">
                  <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                    <ShieldCheck size={20} className="text-green-500" />
                  </div>
                </div>
                <p className="text-text-secondary text-xs text-center">What would you like to do?</p>
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setPin(''); setConfirmPin(''); setView('set') }}
                    className="w-full rounded-lg border border-border bg-bg-page px-4 py-2.5 text-sm font-medium text-text-primary hover:border-accent-gold/50 hover:bg-accent-gold/5 transition-colors"
                  >
                    Set new PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => onPinChanged(null)}
                    className="w-full rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:opacity-80 transition-opacity"
                  >
                    Remove lock
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
