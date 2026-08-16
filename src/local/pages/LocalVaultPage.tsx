import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Lock, LockOpen, Plus, Copy, Eye, EyeOff, Trash2, KeyRound, ShieldCheck,
  FileKey, ListChecks, StickyNote, Settings as SettingsIcon,
} from 'lucide-react'
import { localdb, type VaultItemSummary, type VaultItem, type GeneratedTotp } from '../../lib/localdb'
import { toast } from '../../lib/toast'
import { useVault } from '../hooks/useVault'
import SearchBar from '../../components/ui/SearchBar'

// Vault auto-lock choices (label + seconds).
const AUTO_LOCK_OPTIONS = [
  { label: '1 min', secs: 60 },
  { label: '5 min', secs: 300 },
  { label: '15 min', secs: 900 },
  { label: '30 min', secs: 1800 },
] as const

// Vault section. Reuses the existing Catavyn design language (cards, gold
// accents, modals). Secrets are hidden by default and only revealed / copied on
// explicit request. Keys never reach this component.

const ITEM_TYPES = [
  { type: 'account', label: 'Accounts', icon: KeyRound },
  { type: 'totp', label: '2FA', icon: ShieldCheck },
  { type: 'recovery', label: 'Recovery Codes', icon: ListChecks },
  { type: 'apikey', label: 'API Keys', icon: FileKey },
  { type: 'note', label: 'Secure Notes', icon: StickyNote },
] as const

type ItemType = (typeof ITEM_TYPES)[number]['type']

function CredentialGate({
  mode,
  onSubmit,
}: {
  mode: 'create' | 'unlock'
  onSubmit: (credential: string) => Promise<void>
}) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (mode === 'create') {
      if (pin.length < 12) { setError('Master PIN must be at least 12 digits'); return }
      if (pin !== confirm) { setError('PINs do not match'); return }
    }
    setBusy(true)
    try {
      await onSubmit(pin)
      setPin(''); setConfirm('')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-sm w-full bg-bg-card border border-border rounded-2xl p-8 text-center animate-fade-up">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-accent-gold/15 flex items-center justify-center">
            <Lock size={26} className="text-accent-gold" />
          </div>
        </div>
        <h1 className="text-text-primary font-semibold text-lg mb-1">
          {mode === 'create' ? 'Create your Vault' : 'Vault Locked'}
        </h1>
        <p className="text-text-muted text-xs mb-5 leading-relaxed">
          {mode === 'create'
            ? 'Choose a master PIN (minimum 12 digits). A longer alphanumeric passphrase is stronger. There is no way to recover the Vault if you forget it.'
            : 'Enter your master credential to unlock.'}
        </p>

        <input
          type="password"
          inputMode={mode === 'create' ? 'numeric' : undefined}
          autoFocus
          value={pin}
          onChange={e => { setPin(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter' && mode === 'unlock') void submit() }}
          placeholder={mode === 'create' ? 'Master PIN (min 12 digits)' : 'Master credential'}
          className="w-full rounded-lg border border-border bg-bg-page px-3 py-2.5 text-sm text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-accent-gold mb-2"
        />
        {mode === 'create' && (
          <input
            type="password"
            inputMode="numeric"
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setError(null) }}
            onKeyDown={e => { if (e.key === 'Enter') void submit() }}
            placeholder="Confirm PIN"
            className="w-full rounded-lg border border-border bg-bg-page px-3 py-2.5 text-sm text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-accent-gold mb-2"
          />
        )}
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !pin}
          className="w-full rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? 'Working…' : mode === 'create' ? 'Create Vault' : 'Unlock'}
        </button>
        </div>
      </div>
    </div>
  )
}

export default function LocalVaultPage() {
  const { status, items, create, unlock, lock, createItem, updateItem, deleteItem } =
    useVault()
  const [activeType, setActiveType] = useState<ItemType>('account')
  const [editorOpen, setEditorOpen] = useState(false)
  const [openItem, setOpenItem] = useState<VaultItem | null>(null)
  const [search, setSearch] = useState('')
  const [autoLock, setAutoLock] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (status?.unlocked) void localdb.vaultGetAutoLock().then(setAutoLock)
  }, [status?.unlocked])

  if (status === null) return <div className="min-h-screen bg-bg-page" />
  if (!status.exists) return <CredentialGate mode="create" onSubmit={create} />
  if (!status.unlocked) return <CredentialGate mode="unlock" onSubmit={unlock} />

  const q = search.trim().toLowerCase()
  const shown = items
    .filter(i => i.item_type === activeType)
    .filter(i => !q || i.label.toLowerCase().includes(q))

  async function changeAutoLock(secs: number) {
    await localdb.vaultSetAutoLock(secs)
    setAutoLock(secs)
    setSettingsOpen(false)
    toast.success('Auto-lock updated')
  }

  async function openDetail(summary: VaultItemSummary) {
    const item = await localdb.vaultGetItem(summary.item_id)
    if (item) { setOpenItem(item); setEditorOpen(true) }
  }

  function openNew() {
    setOpenItem(null)
    setEditorOpen(true)
  }

  return (
    <div className="animate-fade-up p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent-gold" />
          <h1 className="text-text-primary font-semibold text-xl">Vault</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-accent-gold px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={15} />
            New item
          </button>
          <div className="relative">
            <button
              onClick={() => setSettingsOpen(v => !v)}
              aria-label="Vault settings"
              className="flex items-center rounded-lg border border-border px-2 py-1.5 text-sm text-text-secondary hover:border-accent-gold/50 transition-colors"
            >
              <SettingsIcon size={15} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-bg-card border border-border rounded-xl shadow-lg p-3">
                <p className="text-text-secondary text-xs font-medium mb-2">Auto-lock after inactivity</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {AUTO_LOCK_OPTIONS.map(o => (
                    <button
                      key={o.secs}
                      onClick={() => void changeAutoLock(o.secs)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        autoLock === o.secs
                          ? 'bg-accent-gold text-white'
                          : 'bg-bg-page border border-border text-text-secondary hover:border-accent-gold/50'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => void lock()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent-gold/50 transition-colors"
          >
            <LockOpen size={14} />
            Lock Vault
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {ITEM_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeType === type
                ? 'bg-accent-gold text-white'
                : 'bg-bg-card border border-border text-text-secondary hover:border-accent-gold/50'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Search within the active category by label (non-secret). */}
      <div className="mb-6">
        <SearchBar placeholder="Search by name…" onSearch={setSearch} />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Lock size={22} className="text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-text-muted text-sm">{q ? 'No items match your search.' : 'No items here yet.'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map(item => (
            <button
              key={item.item_id}
              onClick={() => void openDetail(item)}
              className="text-left bg-bg-card rounded-xl border border-border px-4 py-3 hover:shadow-sm transition-shadow flex items-center gap-3"
            >
              <Lock size={13} className="text-text-muted shrink-0" />
              <span className="text-text-primary text-sm font-medium flex-1 min-w-0 truncate">
                {item.label || 'Untitled item'}
              </span>
              <span className="text-text-muted text-xs shrink-0">
                {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {editorOpen && (
        <VaultItemEditor
          type={activeType}
          existing={openItem}
          onClose={() => { setEditorOpen(false); setOpenItem(null) }}
          onCreate={async (payload) => { await createItem(activeType, payload); setEditorOpen(false) }}
          onUpdate={async (id, payload) => { await updateItem(id, payload); setEditorOpen(false); setOpenItem(null) }}
          onDelete={async (id) => { await deleteItem(id); setEditorOpen(false); setOpenItem(null) }}
        />
      )}
    </div>
  )
}

// Field definitions per item type. Sensitive fields are rendered hidden.
const FIELDS: Record<ItemType, { key: string; label: string; secret?: boolean; textarea?: boolean }[]> = {
  account: [
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username / Email' },
    { key: 'password', label: 'Password', secret: true },
    { key: 'website', label: 'Website' },
    { key: 'notes', label: 'Notes', textarea: true },
  ],
  totp: [
    { key: 'issuer', label: 'Issuer' },
    { key: 'account', label: 'Account' },
    { key: 'secret', label: 'Secret (base32)', secret: true },
    { key: 'algorithm', label: 'Algorithm (SHA1/256/512)' },
    { key: 'digits', label: 'Digits' },
    { key: 'period', label: 'Period (s)' },
  ],
  recovery: [
    { key: 'name', label: 'Name' },
    { key: 'codes_text', label: 'Recovery codes (one per line)', secret: true, textarea: true },
  ],
  apikey: [
    { key: 'name', label: 'Name' },
    { key: 'key', label: 'API key', secret: true },
    { key: 'endpoint', label: 'Endpoint' },
    { key: 'notes', label: 'Notes', textarea: true },
  ],
  note: [
    { key: 'title', label: 'Title' },
    { key: 'content', label: 'Content', secret: true, textarea: true },
  ],
}

async function copySecret(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
    // Best-effort clear after 30s; do not clobber if the user copied something
    // else in the meantime.
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText()
        if (current === value) await navigator.clipboard.writeText('')
      } catch { /* clipboard read may be denied; skip */ }
    }, 30_000)
  } catch {
    toast.error('Clipboard unavailable')
  }
}

function VaultItemEditor({
  type,
  existing,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  type: ItemType
  existing: VaultItem | null
  onClose: () => void
  onCreate: (payload: Record<string, unknown>) => Promise<void>
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const fields = FIELDS[type]
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) {
      const v = existing?.payload?.[f.key]
      if (type === 'recovery' && f.key === 'codes_text' && Array.isArray(existing?.payload?.codes)) {
        init[f.key] = (existing!.payload!.codes as string[]).join('\n')
      } else {
        init[f.key] = v == null ? '' : String(v)
      }
    }
    return init
  })
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [totp, setTotp] = useState<GeneratedTotp | null>(null)
  const isEdit = !!existing

  useEffect(() => {
    // For TOTP items, generate the current code (secret decrypted in Rust).
    if (type === 'totp' && existing) {
      let alive = true
      const tick = async () => {
        try {
          const g = await localdb.vaultGenerateTotp(existing.item_id)
          if (alive) setTotp(g)
        } catch { /* ignore */ }
      }
      void tick()
      const id = setInterval(tick, 1000)
      return () => { alive = false; clearInterval(id) }
    }
  }, [type, existing])

  function buildPayload(): Record<string, unknown> {
    if (type === 'recovery') {
      const codes = (values.codes_text ?? '').split('\n').map(s => s.trim()).filter(Boolean)
      return { name: values.name ?? '', codes }
    }
    const p: Record<string, unknown> = {}
    for (const f of fields) {
      if (f.key === 'digits' || f.key === 'period') {
        const n = parseInt(values[f.key] || '', 10)
        if (!Number.isNaN(n)) p[f.key] = n
      } else {
        p[f.key] = values[f.key] ?? ''
      }
    }
    return p
  }

  async function save() {
    const payload = buildPayload()
    if (isEdit) await onUpdate(existing!.item_id, payload)
    else await onCreate(payload)
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-text-primary/20 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-bg-card rounded-2xl border border-border shadow-xl w-full max-w-md animate-fade-up flex flex-col max-h-[calc(100vh-2rem)]">
          {/* Fixed header */}
          <div className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <h2 className="text-text-primary font-semibold text-base">
              {isEdit ? 'Edit item' : 'New item'}
            </h2>
          </div>

          {/* Scrollable content */}
          <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {type === 'totp' && isEdit && totp && (
            <div className="mb-4 rounded-lg bg-bg-page border border-border p-3 flex items-center justify-between">
              <div>
                <div className="text-2xl font-mono tracking-widest text-text-primary">{totp.code}</div>
                <div className="text-text-muted text-[11px]">expires in {totp.seconds_remaining}s</div>
              </div>
              <button
                type="button"
                onClick={() => void copySecret(totp.code, '2FA code')}
                className="p-2 rounded-lg text-text-muted hover:text-accent-gold hover:bg-accent-gold/10"
                aria-label="Copy code"
              >
                <Copy size={16} />
              </button>
            </div>
          )}

          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.key}>
                <label className="text-xs font-medium text-text-secondary block mb-1">{f.label}</label>
                <div className="relative">
                  {f.textarea ? (
                    <textarea
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      rows={f.secret && !revealed[f.key] ? 2 : 3}
                      className="w-full rounded-lg border border-border bg-bg-page px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-gold/50 resize-none"
                      style={f.secret && !revealed[f.key] ? { WebkitTextSecurity: 'disc' } as React.CSSProperties : undefined}
                    />
                  ) : (
                    <input
                      type={f.secret && !revealed[f.key] ? 'password' : 'text'}
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-bg-page px-3 py-2 pr-16 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-gold/50"
                    />
                  )}
                  {f.secret && (
                    <div className="absolute right-2 top-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setRevealed(r => ({ ...r, [f.key]: !r[f.key] }))}
                        className="p-1 rounded text-text-muted hover:text-text-secondary"
                        aria-label={revealed[f.key] ? 'Hide' : 'Reveal'}
                      >
                        {revealed[f.key] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copySecret(values[f.key] ?? '', f.label)}
                        className="p-1 rounded text-text-muted hover:text-accent-gold"
                        aria-label="Copy"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </div>

          {/* Fixed footer / actions */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border shrink-0">
            {isEdit ? (
              <button
                type="button"
                onClick={() => void onDelete(existing!.item_id)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent-gold/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                className="rounded-lg bg-accent-gold px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
