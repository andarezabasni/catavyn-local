import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Trash2, Tag as TagIcon } from 'lucide-react'
import { useTags } from '../hooks/useTags'
import { TagCardSkeleton } from '../components/ui/Skeleton'

export default function TagsPage() {
  const navigate = useNavigate()
  const { tags, noteTagsMap, loading, createTag, deleteTag } = useTags()

  const tagNoteCount = Object.values(noteTagsMap).reduce<Record<string, number>>(
    (acc, noteTags) => {
      for (const tag of noteTags) {
        acc[tag.id] = (acc[tag.id] ?? 0) + 1
      }
      return acc
    },
    {}
  )

  const [showForm, setShowForm] = useState(false)
  const [tagName, setTagName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!tagName.trim()) return
    setCreating(true)
    await createTag({ name: tagName.trim() })
    setTagName('')
    setShowForm(false)
    setCreating(false)
  }

  return (
    <div className="animate-fade-up p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-text-primary font-semibold text-xl">Tags</h1>
          <p className="text-text-muted text-xs mt-0.5">
            {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm text-accent-gold hover:opacity-75 font-medium transition-opacity"
          >
            <Plus size={15} />
            New tag
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-bg-card rounded-xl border border-border p-4 flex flex-wrap gap-3 items-center"
        >
          <input
            type="text"
            placeholder="Tag name"
            value={tagName}
            onChange={e => setTagName(e.target.value)}
            autoFocus
            maxLength={30}
            className="flex-1 min-w-0 rounded-lg border border-border bg-bg-page px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
          />
          <button
            type="submit"
            disabled={creating || !tagName.trim()}
            className="rounded-lg bg-accent-gold px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setTagName('') }}
            className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <TagCardSkeleton key={i} />)}
        </div>
      ) : tags.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <TagIcon size={24} className="text-text-muted mx-auto mb-3 opacity-50" />
          <p className="text-text-muted text-sm mb-3">No tags yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-accent-gold font-medium hover:opacity-75 transition-opacity"
          >
            Create your first tag →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tags.map(tag => {
            const count = tagNoteCount[tag.id] ?? 0
            return (
              <div
                key={tag.id}
                className="group relative bg-bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer"
                style={{ borderLeftColor: tag.color, borderLeftWidth: '3px' }}
                onClick={() => navigate(`/notes?tag=${tag.id}`)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-text-primary font-medium text-sm truncate">
                    {tag.name}
                  </span>
                </div>
                <div className="text-text-muted text-xs">
                  {count} {count === 1 ? 'note' : 'notes'}
                </div>

                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); void deleteTag(tag.id) }}
                  aria-label={`Delete tag ${tag.name}`}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
