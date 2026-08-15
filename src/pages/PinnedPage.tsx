import { useNavigate } from 'react-router'
import { Pin } from 'lucide-react'
import { useNotes } from '../hooks/useNotes'
import { useTags } from '../hooks/useTags'
import NoteCard from '../components/notes/NoteCard'
import { NoteCardSkeleton } from '../components/ui/Skeleton'

export default function PinnedPage() {
  const navigate = useNavigate()
  const { notes, loading, togglePin, deleteNote } = useNotes({ rootOnly: true, includeShared: true })
  const { noteTagsMap } = useTags()

  const pinnedNotes = notes.filter(n => n.is_pinned)

  return (
    <div className="animate-fade-up p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Pin size={18} className="text-accent-gold" />
        <div>
          <h1 className="text-text-primary font-semibold text-xl">Pinned</h1>
          <p className="text-text-muted text-xs mt-0.5">
            {pinnedNotes.length} {pinnedNotes.length === 1 ? 'note' : 'notes'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <NoteCardSkeleton key={i} />)}
        </div>
      ) : pinnedNotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Pin size={24} className="text-text-muted mx-auto mb-3 opacity-50" />
          <p className="text-text-muted text-sm">No pinned notes yet.</p>
          <p className="text-text-muted text-xs mt-1">
            Pin a note from the editor or note card to see it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pinnedNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              tags={noteTagsMap[note.id] ?? []}
              onClick={() => navigate(`/notes?edit=${note.id}`)}
              onPin={() => togglePin(note.id, false)}
              onDelete={() => deleteNote(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
