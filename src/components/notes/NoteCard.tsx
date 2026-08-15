import { Pin, Trash2, Lock, FileText, Users } from 'lucide-react'
import type { NoteView as Note } from '../../types/entities'
import type { TagView as Tag } from '../../types/entities'
import TagBadge from '../tags/TagBadge'

interface NoteCardProps {
  note: Note
  tags?: Tag[]
  searchQuery?: string
  subNoteCount?: number
  isShared?: boolean
  onClick?: () => void
  onDelete?: () => void
  onPin?: () => void
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-accent-gold/25 text-text-primary not-italic rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function getExcerpt(content: string, query: string, maxLen = 120): string {
  const plain = stripHtml(content).trim()
  if (!plain) return ''
  if (!query) return plain.slice(0, maxLen)
  const idx = plain.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return plain.slice(0, maxLen)
  const start = Math.max(0, idx - 30)
  return (start > 0 ? '…' : '') + plain.slice(start, start + maxLen)
}

export default function NoteCard({
  note,
  tags = [],
  searchQuery = '',
  subNoteCount = 0,
  isShared = false,
  onClick,
  onDelete,
  onPin,
}: NoteCardProps) {
  const excerpt = getExcerpt(note.content, searchQuery)
  const date = new Date(note.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left w-full bg-bg-card rounded-xl border border-border p-4 flex flex-col gap-1.5 transition-all duration-200 ${
        onClick ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'
      }`}
    >
      {/* Title + pin */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-text-primary font-medium text-sm truncate">
            <Highlight text={note.title || 'Untitled'} query={searchQuery} />
          </span>
          {isShared && (
            <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
              <Users size={10} />
              Shared with you
            </span>
          )}
        </div>
        {onPin ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onPin() }}
            aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'}
            className={`shrink-0 mt-0.5 p-0.5 rounded transition-all ${
              note.is_pinned
                ? 'text-accent-gold'
                : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-accent-gold'
            }`}
          >
            <Pin size={12} />
          </button>
        ) : note.is_pinned ? (
          <Pin size={12} className="text-accent-gold shrink-0 mt-0.5" />
        ) : null}
      </div>

      {/* Excerpt — hidden for locked notes */}
      {note.pin_hash ? (
        <p className="text-text-muted text-xs italic flex items-center gap-1">
          <Lock size={10} />
          Protected note
        </p>
      ) : excerpt ? (
        <p className="text-text-muted text-xs leading-relaxed line-clamp-3">
          <Highlight text={excerpt} query={searchQuery} />
        </p>
      ) : null}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {tags.map(tag => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </div>
      )}

      {/* Date + sub-note count + delete */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">{date}</span>
          {subNoteCount > 0 && (
            <span className="flex items-center gap-0.5 text-text-muted text-xs">
              <FileText size={10} />
              {subNoteCount}
            </span>
          )}
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete() }}
            aria-label="Move to trash"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </button>
  )
}
