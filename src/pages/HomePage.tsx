import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Pin, Bell, Clock, CheckSquare, FolderOpen, FileText, Pencil, Trash2 } from 'lucide-react'
import { useCategories, type Category } from '../hooks/useCategories'
import { useNotes } from '../hooks/useNotes'
import { useTags } from '../hooks/useTags'
import { useTasks, type Task } from '../hooks/useTasks'
import { useAuth } from '../context/AuthContext'
import NoteCard from '../components/notes/NoteCard'
import PriorityBadge from '../components/tasks/PriorityBadge'
import TaskPanel from '../components/tasks/TaskPanel'

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { categories, createCategory, updateCategory, deleteCategory } = useCategories()
  const { notes, loading: notesLoading, togglePin } = useNotes({ rootOnly: true, includeShared: true })
  const { noteTagsMap } = useTags()
  const { tasks: allTasks } = useTasks()

  const todayISO = new Date().toISOString().slice(0, 10)

  const upcomingTasks = useMemo(() => {
    return allTasks
      .filter(t => !t.is_completed && t.due_date !== null && t.due_date >= todayISO)
      .sort((a, b) => {
        if (a.due_date! < b.due_date!) return -1
        if (a.due_date! > b.due_date!) return 1
        if ((a.due_time ?? '') < (b.due_time ?? '')) return -1
        if ((a.due_time ?? '') > (b.due_time ?? '')) return 1
        return 0
      })
      .slice(0, 5)
  }, [allTasks, todayISO])

  const firstName = user?.email?.split('@')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const noteCounts = notes.reduce<Record<string, number>>((acc, note) => {
    if (note.category_id) {
      acc[note.category_id] = (acc[note.category_id] ?? 0) + 1
    }
    return acc
  }, {})

  const pinnedNotes = notes.filter(n => n.is_pinned)
  const recentNotes = notes.filter(n => !n.is_pinned).slice(0, 6)

  const [syncedAt, setSyncedAt] = useState('')
  useEffect(() => {
    if (!notesLoading) {
      setSyncedAt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
    }
  }, [notesLoading])

  const [showCatForm, setShowCatForm] = useState(false)
  const [catName, setCatName] = useState('')
  const [catIcon, setCatIcon] = useState('📁')
  const [catCreating, setCatCreating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catName.trim()) return
    setCatCreating(true)
    await createCategory({ name: catName.trim(), icon: catIcon })
    setCatName('')
    setCatIcon('📁')
    setShowCatForm(false)
    setCatCreating(false)
  }

  function cancelCatForm() {
    setShowCatForm(false)
    setCatName('')
    setCatIcon('📁')
  }

  return (
    <>
      {/* Main scrollable content — shifts left of task panel on lg+ */}
      <div className={`animate-fade-up p-4 sm:p-6 transition-[padding] duration-300 ${panelOpen ? 'lg:pr-80' : ''}`}>
        <div className="max-w-4xl mx-auto">

          {/* Greeting + panel toggle */}
          <div className="mb-6 sm:mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-text-primary font-semibold text-xl sm:text-2xl">
                {greeting}, {firstName}
              </h1>
              <p className="text-text-muted text-sm mt-1">{today}</p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(p => !p)}
              aria-label={panelOpen ? 'Close task panel' : 'Open task panel'}
              className={`shrink-0 mt-1 p-2 rounded-lg border transition-colors ${
                panelOpen
                  ? 'bg-bg-task-panel text-white border-transparent'
                  : 'bg-bg-card border-border text-text-muted hover:text-text-primary'
              }`}
            >
              <CheckSquare size={16} />
            </button>
          </div>

          {/* Categories */}
          <section className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-text-primary font-semibold text-base">Categories</h2>
              {!showCatForm && (
                <button
                  onClick={() => setShowCatForm(true)}
                  className="flex items-center gap-1.5 text-sm text-accent-gold hover:opacity-75 font-medium transition-opacity"
                >
                  <Plus size={15} />
                  New category
                </button>
              )}
            </div>

            {showCatForm && (
              <form
                onSubmit={handleCreateCategory}
                className="mb-4 bg-bg-card rounded-xl border border-border p-4 flex flex-wrap gap-3 items-center"
              >
                <input
                  type="text"
                  placeholder="Category name"
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  autoFocus
                  maxLength={40}
                  className="flex-1 min-w-0 rounded-lg border border-border bg-bg-page px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
                />
                <input
                  type="text"
                  value={catIcon}
                  onChange={e => setCatIcon(e.target.value)}
                  title="Icon (emoji)"
                  className="w-14 text-center rounded-lg border border-border bg-bg-page px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-gold"
                />
                <button
                  type="submit"
                  disabled={catCreating || !catName.trim()}
                  className="rounded-lg bg-accent-gold px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {catCreating ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={cancelCatForm}
                  className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </form>
            )}

            {categories.length === 0 ? (
              <EmptyHint icon={FolderOpen}>No categories yet. Create one to organize your notes.</EmptyHint>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {categories.map(cat => (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    noteCount={noteCounts[cat.id] ?? 0}
                    onRename={name => updateCategory(cat.id, { name })}
                    onDelete={() => deleteCategory(cat.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Reminders */}
          {upcomingTasks.length > 0 && (
            <section className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Bell size={15} className="text-accent-gold" />
                <h2 className="text-text-primary font-semibold text-base">Reminders</h2>
              </div>
              <div className="flex flex-col gap-2">
                {upcomingTasks.map(task => (
                  <ReminderRow key={task.id} task={task} todayISO={todayISO} />
                ))}
              </div>
            </section>
          )}

          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <section className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Pin size={15} className="text-accent-gold" />
                <h2 className="text-text-primary font-semibold text-base">Pinned</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pinnedNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    tags={noteTagsMap[note.id] ?? []}
                    onClick={() => navigate(`/notes?edit=${note.id}`)}
                    onPin={() => togglePin(note.id, !note.is_pinned)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Recent Notes */}
          <section>
            <h2 className="text-text-primary font-semibold text-base mb-4">Recent Notes</h2>
            {recentNotes.length === 0 ? (
              <EmptyHint icon={FileText}>No notes yet. Head to Notes to create your first one.</EmptyHint>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    tags={noteTagsMap[note.id] ?? []}
                    onClick={() => navigate(`/notes?edit=${note.id}`)}
                    onPin={() => togglePin(note.id, !note.is_pinned)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Status bar */}
          {!notesLoading && (
            <div className="mt-8 pt-3 border-t border-border/50">
              <p className="text-text-muted text-[11px]">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'} total
                {' · '}
                {pinnedNotes.length} pinned
                {syncedAt && <> · Last synced: {syncedAt}</>}
              </p>
            </div>
          )}

        </div>
      </div>

      {/* Mobile/tablet backdrop — tap to close panel */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-20 bg-text-primary/20 lg:hidden"
          onClick={() => setPanelOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Task Panel — full-screen modal on mobile, fixed right sidebar on lg+ */}
      <div
        className={`fixed inset-0 z-40 lg:inset-auto lg:right-0 lg:top-0 lg:h-screen lg:w-80 lg:z-30 transition-transform duration-300 ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <TaskPanel onClose={() => setPanelOpen(false)} />
      </div>
    </>
  )
}

function CategoryCard({
  category,
  noteCount,
  onRename,
  onDelete,
}: {
  category: Category
  noteCount: number
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    setName(category.name)
  }, [category.name])

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== category.name) {
      onRename(trimmed)
    } else {
      setName(category.name)
    }
    setEditing(false)
  }

  return (
    <div
      className="group relative bg-bg-card rounded-xl border border-border p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      style={{ borderLeftColor: category.color, borderLeftWidth: '3px' }}
    >
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename category"
          className="p-1 rounded-md text-text-muted hover:text-accent-gold hover:bg-bg-page transition-colors"
        >
          <Pencil size={12} />
        </button>
        {confirmingDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 transition-colors"
          >
            Confirm?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(true)
              setTimeout(() => setConfirmingDelete(false), 3000)
            }}
            aria-label="Delete category"
            className="p-1 rounded-md text-text-muted hover:text-red-500 hover:bg-bg-page transition-colors"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="text-2xl mb-2 leading-none">{category.icon}</div>

      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setName(category.name); setEditing(false) }
          }}
          maxLength={40}
          className="w-full rounded-md border border-accent-gold bg-bg-page px-1.5 py-0.5 text-sm text-text-primary focus:outline-none"
        />
      ) : (
        <div className="text-text-primary font-medium text-sm truncate">{category.name}</div>
      )}

      <div className="text-text-muted text-xs mt-1">
        {noteCount} {noteCount === 1 ? 'note' : 'notes'}
      </div>
    </div>
  )
}

function EmptyHint({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      {Icon && <Icon size={24} className="text-text-muted opacity-40 mx-auto mb-2" />}
      <p className="text-text-muted text-sm">{children}</p>
    </div>
  )
}

function ReminderRow({ task, todayISO }: { task: Task; todayISO: string }) {
  const tomorrowISO = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  let dateLabel: string
  if (task.due_date === todayISO)          dateLabel = 'Today'
  else if (task.due_date === tomorrowISO)  dateLabel = 'Tomorrow'
  else dateLabel = new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })

  const timeLabel = task.due_time ? task.due_time.slice(0, 5) : null

  return (
    <div className="flex items-center gap-3 bg-bg-card rounded-xl border border-border px-4 py-3">
      <PriorityBadge priority={task.priority} />
      <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{task.title}</span>
      <div className="flex items-center gap-1.5 shrink-0 text-xs text-text-muted">
        {timeLabel && (
          <>
            <Clock size={11} />
            <span>{timeLabel}</span>
          </>
        )}
        <span className={task.due_date === todayISO ? 'text-accent-gold font-medium' : ''}>
          {dateLabel}
        </span>
      </div>
    </div>
  )
}
