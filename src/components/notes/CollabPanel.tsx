import { useState, useRef, useEffect } from 'react'
import { X, UserPlus, Trash2, Users, Clock, History } from 'lucide-react'
import { useCollaborators } from '../../hooks/useCollaborators'
import { useAuth } from '../../context/AuthContext'

interface CollabPanelProps {
  noteId: string
  noteOwnerId: string
  onClose: () => void
}

const AVATAR_COLORS = ['#C4A84D', '#6B8B6A', '#C4844D', '#5B8B5A', '#8B7B6A']

function Avatar({ email }: { email: string }) {
  const initial = email[0]?.toUpperCase() ?? '?'
  const color = AVATAR_COLORS[email.charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initial}
    </span>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const ACTION_LABELS: Record<string, string> = {
  created: 'created this note',
  edited: 'edited this note',
  renamed: 'renamed this note',
  shared: 'shared this note',
}

export default function CollabPanel({ noteId, noteOwnerId, onClose }: CollabPanelProps) {
  const { user } = useAuth()
  const { collaborators, activity, loading, invite, remove } = useCollaborators(noteId)
  const [tab, setTab] = useState<'people' | 'activity'>('people')
  const [emailInput, setEmailInput] = useState('')
  const [inviting, setInviting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isOwner = user?.id === noteOwnerId

  useEffect(() => {
    if (tab === 'people') inputRef.current?.focus()
  }, [tab])

  async function handleInvite() {
    const email = emailInput.trim()
    if (!email) return
    setInviting(true)
    const ok = await invite(email)
    if (ok) setEmailInput('')
    setInviting(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-bg-card border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-text-primary font-semibold text-sm">Collaboration</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-page transition-colors"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setTab('people')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              tab === 'people'
                ? 'text-accent-gold border-accent-gold'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            <Users size={13} />
            People
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              tab === 'activity'
                ? 'text-accent-gold border-accent-gold'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            <History size={13} />
            Activity
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'people' ? (
            <div className="p-4 flex flex-col gap-5">
              {/* Invite form */}
              {isOwner && (
                <div>
                  <p className="text-text-muted text-xs mb-2 font-medium">Invite by email</p>
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleInvite() }}
                      placeholder="user@example.com"
                      className="flex-1 min-w-0 rounded-lg bg-bg-page border border-border px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-gold/50"
                    />
                    <button
                      onClick={() => void handleInvite()}
                      disabled={inviting || !emailInput.trim()}
                      aria-label="Invite"
                      className="rounded-lg bg-accent-gold px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                    >
                      <UserPlus size={14} />
                    </button>
                  </div>
                  <p className="text-text-muted text-[10px] mt-1.5">
                    The user must already have a Catavyn account.
                  </p>
                </div>
              )}

              {/* Collaborators */}
              <div>
                <p className="text-text-muted text-xs mb-2 font-medium">
                  {collaborators.length === 0
                    ? 'No collaborators yet'
                    : `${collaborators.length} collaborator${collaborators.length !== 1 ? 's' : ''}`}
                </p>
                <div className="flex flex-col gap-2">
                  {collaborators.map(c => (
                    <div
                      key={c.user_id}
                      className="flex items-center gap-2.5 rounded-xl bg-bg-page px-3 py-2.5 border border-border"
                    >
                      <Avatar email={c.invited_email} />
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-xs font-medium truncate">
                          {c.invited_email}
                        </p>
                        <p className="text-text-muted text-[10px]">
                          {c.can_edit ? 'Can edit' : 'View only'}
                        </p>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => void remove(c.user_id)}
                          aria-label={`Remove ${c.invited_email}`}
                          className="p-1 rounded text-text-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}

                  {collaborators.length === 0 && !isOwner && (
                    <p className="text-text-muted text-xs italic">
                      Only the note owner can invite collaborators.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-xl bg-bg-page animate-pulse" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="text-text-muted text-xs text-center py-10 italic">
                  No activity recorded yet.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {activity.map(entry => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2.5 rounded-xl bg-bg-page px-3 py-2.5 border border-border"
                    >
                      <Avatar email={entry.user_email ?? '?'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-xs font-medium truncate">
                          {entry.user_email ?? 'Unknown'}
                        </p>
                        <p className="text-text-muted text-[10px]">
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-text-muted shrink-0 mt-0.5">
                        <Clock size={10} />
                        <span className="text-[10px]">{timeAgo(entry.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
