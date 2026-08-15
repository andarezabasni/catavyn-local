import { useState, useRef, useEffect } from 'react'
import { X, Lock } from 'lucide-react'
import { hashPin, verifyPin, isLegacyPinHash } from '../../lib/pin'

// Local note-lock modal. Same UI/UX as the original Catavyn NotePinModal but
// without the Supabase "forgot PIN via account password" recovery branch —
// there is no cloud account in Local mode. The PIN remains a UI lock (content
// is not encrypted); real encryption arrives with the Vault in a later phase.

type View = 'unlock' | 'remove' | 'set'

interface LocalNotePinModalProps {
  noteTitle: string
  pinHash: string | null
  initialView: View
  onUnlocked: () => void
  onPinChanged: (newHash: string | null) => void
  onClose: () => void
}

export default function LocalNotePinModal({
  noteTitle,
  pinHash,
  initialView,
  onUnlocked,
  onPinChanged,
  onClose,
}: LocalNotePinModalProps) {
  const [view] = useState<View>(initialView)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => pinRef.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  async function handleUnlock() {
    if (!pinHash) return
    setLoading(true)
    const ok = await verifyPin(pin, pinHash)
    if (ok && isLegacyPinHash(pinHash)) {
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

  const headings: Record<View, string> = {
    unlock: 'Enter PIN',
    remove: 'Enter PIN to remove lock',
    set: pinHash ? 'Change PIN' : 'Set PIN',
  }

  const pinInputClass =
    'w-full text-center tracking-[0.5em] text-lg rounded-lg border border-border bg-bg-page px-3 py-2.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-gold placeholder:tracking-normal placeholder:text-base placeholder:text-text-muted'

  return (
    <>
      <div className="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={handleKeyDown}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-bg-card rounded-2xl border border-border shadow-xl w-full max-w-xs pointer-events-auto animate-fade-up">
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

          <div className="p-5 space-y-3">
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
                  onKeyDown={e => { if (e.key === 'Enter') void (view === 'unlock' ? handleUnlock() : handleRemove()) }}
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
              </>
            )}

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
                <p className="text-text-muted text-[10px] text-center">
                  Numeric only, 4–6 digits. This is a UI lock, not encryption. A forgotten PIN cannot be recovered.
                </p>
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
          </div>
        </div>
      </div>
    </>
  )
}
