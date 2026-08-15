import { useMemo, useState } from 'react'
import { Plus, Pin, CheckSquare, FileText, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { useCategories, type Category } from '../hooks/useCategories'
import { useNotes } from '../hooks/useNotes'
import { useTags } from '../hooks/useTags'
import { useTasks } from '../hooks/useTasks'
import NoteCard from '../../components/notes/NoteCard'
import PriorityBadge from '../../components/tasks/PriorityBadge'
import LocalTaskPanel from './LocalTaskPanel'

// Local Home. Keeps the original Catavyn home structure — greeting, pinned +
// recent notes, category management, upcoming tasks, and the side task panel —
// but wired to local hooks and without the cloud sync indicator.
export default function LocalHomePage({ onOpenNote }: { onOpenNote?: (id: string) => void }) {
  const { categories, createCategory, updateCategory, deleteCategory } = useCategories()
  const { notes, loading: notesLoading, togglePin, deleteNote } = useNotes({ rootOnly: true })
  const { noteTagsMap } = useTags()
  const { tasks: allTasks } = useTasks()

  const todayISO = new Date().toISOString().slice(0, 10)
  const upcomingTasks = useMemo(
    () =>
      allTasks
        .filter(t => !t.is_completed && t.due_date && t.due_date >= todayISO)
        .sort((a, b) => {
          if (a.due_date! !== b.due_date!) return a.due_date! < b.due_date! ? -1 : 1
          return (a.due_time ?? '') < (b.due_time ?? '') ? -1 : 1
        })
        .slice(0, 5),
    [allTasks, todayISO],
  )

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const noteCounts = notes.reduce<Record<string, number>>((acc, note) => {
    if (note.category_id) acc[note.category_id] = (acc[note.category_id] ?? 0) + 1
    return acc
  }, {})

  const pinnedNotes = notes.filter(n => n.is_pinned)
  const recentNotes = notes.filter(n => !n.is_pinned).slice(0, 6)

  const [showCatForm, setShowCatForm] = useState(false)
  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('📁')
  const [editingCat, setEditingCat] = useState<Category | null>(null)

  async function submitCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catName.trim()) return
    if (editingCat) await updateCategory(editingCat.id, { name: catName.trim(), icon: catIcon })
    else await createCategory({ name: catName.trim(), icon: catIcon })
    setCatName('')
    setCatIcon('📁')
    setEditingCat(null)
    setShowCatForm(false)
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex-1 animate-fade-up p-4 sm:p-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-text-primary font-semibold text-2xl">{greeting}</h1>
          <p className="text-text-muted text-sm mt-0.5">{today}</p>
        </div>

        {/* Pinned */}
        {pinnedNotes.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Pin size={15} className="text-accent-gold" />
              <h2 className="text-text-primary font-semibold text-sm">Pinned</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pinnedNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  tags={noteTagsMap[note.id] ?? []}
                  onClick={() => onOpenNote?.(note.id)}
                  onPin={() => togglePin(note.id, false)}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-accent-gold" />
              <h2 className="text-text-primary font-semibold text-sm">Categories</h2>
            </div>
            {!showCatForm && (
              <button onClick={() => setShowCatForm(true)} className="flex items-center gap-1 text-xs text-accent-gold hover:opacity-75 font-medium transition-opacity">
                <Plus size={13} />
                New
              </button>
            )}
          </div>

          {showCatForm && (
            <form onSubmit={submitCategory} className="mb-3 bg-bg-card rounded-xl border border-border p-3 flex flex-wrap gap-2 items-center">
              <input
                type="text"
                value={catIcon}
                onChange={e => setCatIcon(e.target.value.slice(0, 2))}
                className="w-12 text-center rounded-lg border border-border bg-bg-page px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-gold"
                aria-label="Category icon"
              />
              <input
                type="text"
                placeholder="Category name"
                value={catName}
                onChange={e => setCatName(e.target.value)}
                autoFocus
                maxLength={40}
                className="flex-1 min-w-0 rounded-lg border border-border bg-bg-page px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
              />
              <button type="submit" disabled={!catName.trim()} className="rounded-lg bg-accent-gold px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {editingCat ? 'Save' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowCatForm(false); setCatName(''); setEditingCat(null) }} className="rounded-lg px-2 py-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors">
                Cancel
              </button>
            </form>
          )}

          {categories.length === 0 ? (
            <p className="text-text-muted text-xs italic">No categories yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {categories.map(cat => (
                <div key={cat.id} className="group relative bg-bg-card rounded-xl border border-border p-3 flex items-center gap-2">
                  <span className="text-lg">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary font-medium text-sm truncate">{cat.name}</div>
                    <div className="text-text-muted text-xs">{noteCounts[cat.id] ?? 0} notes</div>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => { setEditingCat(cat); setCatName(cat.name); setCatIcon(cat.icon); setShowCatForm(true) }} aria-label={`Edit ${cat.name}`} className="p-1 rounded text-text-muted hover:text-accent-gold">
                      <Pencil size={12} />
                    </button>
                    <button type="button" onClick={() => void deleteCategory(cat.id)} aria-label={`Delete ${cat.name}`} className="p-1 rounded text-text-muted hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent notes */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={15} className="text-accent-gold" />
            <h2 className="text-text-primary font-semibold text-sm">Recent notes</h2>
          </div>
          {notesLoading ? (
            <p className="text-text-muted text-xs">Loading…</p>
          ) : recentNotes.length === 0 ? (
            <p className="text-text-muted text-xs italic">No notes yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  tags={noteTagsMap[note.id] ?? []}
                  onClick={() => onOpenNote?.(note.id)}
                  onPin={() => togglePin(note.id, !note.is_pinned)}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Upcoming tasks summary */}
        {upcomingTasks.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={15} className="text-accent-gold" />
              <h2 className="text-text-primary font-semibold text-sm">Upcoming tasks</h2>
            </div>
            <div className="flex flex-col gap-2">
              {upcomingTasks.map(task => (
                <div key={task.id} className="bg-bg-card rounded-xl border border-border px-4 py-2.5 flex items-center gap-3">
                  <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{task.title}</span>
                  <PriorityBadge priority={task.priority} />
                  <span className="text-text-muted text-xs shrink-0">{task.due_date}{task.due_time ? ` ${task.due_time.slice(0, 5)}` : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Task panel — fixed right column on wide screens */}
      <div className="hidden lg:block w-80 shrink-0 h-screen sticky top-0">
        <LocalTaskPanel />
      </div>
    </div>
  )
}
