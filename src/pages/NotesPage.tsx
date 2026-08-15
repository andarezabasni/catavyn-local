import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { LayoutGrid, List, Plus, RotateCcw, X, FileText, Upload } from 'lucide-react'
import { useNotes } from '../hooks/useNotes'
import { useCategories } from '../hooks/useCategories'
import { useTags } from '../hooks/useTags'
import { useCollaborators } from '../hooks/useCollaborators'
import { useAuth } from '../context/AuthContext'
import NoteEditor from '../components/notes/NoteEditor'
import NoteCard from '../components/notes/NoteCard'
import NotePinModal from '../components/notes/NotePinModal'
import CollabPanel from '../components/notes/CollabPanel'
import SearchBar from '../components/ui/SearchBar'
import { NoteCardSkeleton, NoteListRowSkeleton } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { parseMarkdownFile, isImportableFile } from '../lib/markdown'
import { toast } from '../lib/toast'
import type { Note } from '../hooks/useNotes'

type ViewMode = 'grid' | 'list'

// Wrapper so useNotes({ parentId }) can be called as a hook (rules of hooks)
function EditorWithSubNotes(props: React.ComponentProps<typeof NoteEditor> & { noteId: string }) {
  const { noteId, ...editorProps } = props
  const { notes: subNotes, createNote } = useNotes({ parentId: noteId, includeShared: true })
  return (
    <NoteEditor
      {...editorProps}
      subNotes={subNotes}
      onNewSubNote={async () => {
        const created = await createNote({ title: 'Untitled', content: '', parent_id: noteId })
        if (created) editorProps.onOpenSubNote?.(created)
      }}
    />
  )
}

export default function NotesPage() {
  const { user } = useAuth()
  const { notes, loading, createNote, updateNote, deleteNote, restoreNote, togglePin } = useNotes({ rootOnly: true, includeShared: true })
  const { categories } = useCategories()
  const { tags, noteTagsMap, createTag, attachTag, detachTag } = useTags()

  const [searchParams, setSearchParams] = useSearchParams()
  const urlTagId = searchParams.get('tag')
  const activeTagFilter = tags.find(t => t.id === urlTagId) ?? null

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)

  // Stack of parent note IDs for sub-note navigation
  // editorStack[0] = root note being edited, editorStack[1] = sub-note, etc.
  const [editorStack, setEditorStack] = useState<Note[]>([])

  const [undoNote, setUndoNote] = useState<{ id: string; title: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null)
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([])

  const [unlockedNoteIds, setUnlockedNoteIds] = useState<Set<string>>(new Set())
  const [pinModal, setPinModal] = useState<{ note: Note; view: 'unlock' | 'remove' | 'set' } | null>(null)
  // Stores the full sub-note data when navigating into a sub-note, since sub-notes
  // are not in the root-only `notes` array and can't be found via notes.find()
  const [openedSubNote, setOpenedSubNote] = useState<Note | null>(null)
  const [collabPanelOpen, setCollabPanelOpen] = useState(false)

  const isInSubNote = editorStack.length > 0
  const currentParentNote = editorStack[editorStack.length - 1] ?? null
  // When in a sub-note, use openedSubNote data; otherwise find from root notes list
  const editingNote = isInSubNote
    ? openedSubNote
    : (editingNoteId ? notes.find(n => n.id === editingNoteId) ?? null : null)

  // Active note ID for collab (root note only, not sub-notes)
  const collabNoteId = editorOpen && !isInSubNote ? editingNoteId : null
  const { logActivity } = useCollaborators(collabNoteId)

  // Sub-note counts fetched per card — done inline via a helper map built from noteTagsMap
  // (actual sub-note counts require a separate query; we use a simple approach below)

  const filteredNotes = notes
    .filter(n => {
      if (categoryFilter && n.category_id !== categoryFilter) return false
      if (urlTagId) {
        const noteTags = noteTagsMap[n.id] ?? []
        if (!noteTags.some(t => t.id === urlTagId)) return false
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const inTitle = n.title.toLowerCase().includes(q)
        const inContent = n.content.toLowerCase().includes(q)
        const inTags = (noteTagsMap[n.id] ?? []).some(t => t.name.toLowerCase().includes(q))
        if (!inTitle && !inContent && !inTags) return false
      }
      return true
    })
    .sort((a, b) => {
      if (a.is_pinned === b.is_pinned) return 0
      return a.is_pinned ? -1 : 1
    })

  const editParam = searchParams.get('edit')
  useEffect(() => {
    if (!editParam || loading || editorOpen) return
    const note = notes.find(n => n.id === editParam)
    if (!note) return
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('edit')
      return next
    }, { replace: true })
    if (note.pin_hash && !unlockedNoteIds.has(note.id)) {
      setPinModal({ note, view: 'unlock' })
      return
    }
    setEditingNoteId(note.id)
    setPendingTagIds([])
    setEditorOpen(true)
  }, [editParam, loading, notes, editorOpen, setSearchParams, unlockedNoteIds])

  function openNew() {
    setEditingNoteId(null)
    setEditorStack([])
    setPendingCategoryId(categoryFilter)
    setPendingTagIds([])
    setEditorOpen(true)
  }

  function openEdit(note: Note) {
    if (note.pin_hash && !unlockedNoteIds.has(note.id)) {
      setPinModal({ note, view: 'unlock' })
      return
    }
    setEditingNoteId(note.id)
    setEditorStack([])
    setPendingTagIds([])
    setEditorOpen(true)
  }

  function openSubNote(parentNote: Note, subNote: Note) {
    setEditorStack(prev => [...prev, parentNote])
    setEditingNoteId(subNote.id)
    setOpenedSubNote(subNote)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingNoteId(null)
    setEditorStack([])
    setOpenedSubNote(null)
  }

  function handleBack() {
    if (editorStack.length > 0) {
      // Go back to parent note
      const parent = editorStack[editorStack.length - 1]
      setEditorStack(prev => prev.slice(0, -1))
      setEditingNoteId(parent.id)
      setOpenedSubNote(null)
    } else {
      closeEditor()
    }
  }

  function handlePinUnlocked() {
    if (!pinModal) return
    const { note } = pinModal
    setUnlockedNoteIds(prev => new Set(prev).add(note.id))
    setPinModal(null)
    setEditingNoteId(note.id)
    setEditorStack([])
    setPendingTagIds([])
    setEditorOpen(true)
  }

  function handlePinChanged(newHash: string | null) {
    if (!pinModal) return
    void updateNote(pinModal.note.id, { pin_hash: newHash })
    if (!newHash) setUnlockedNoteIds(prev => new Set(prev).add(pinModal.note.id))
    setPinModal(null)
  }

  function handleLockToggle() {
    const note = isInSubNote ? currentParentNote : editingNote
    if (!note) return
    setPinModal({ note, view: note.pin_hash ? 'remove' : 'set' })
  }

  async function handleSave(title: string, content: string) {
    const targetId = isInSubNote ? currentParentNote?.id : editingNoteId

    if (targetId) {
      const prevTitle = isInSubNote ? openedSubNote?.title : editingNote?.title
      await updateNote(targetId, { title, content })
      if (!isInSubNote && collabNoteId) {
        void logActivity(prevTitle !== title ? 'renamed' : 'edited')
      }
    } else {
      const created = await createNote({ title, content, category_id: pendingCategoryId ?? undefined })
      if (created) {
        setEditingNoteId(created.id)
        await Promise.all(
          pendingTagIds.map(tagId => {
            const tag = tags.find(t => t.id === tagId)
            return tag ? attachTag(created.id, tag) : Promise.resolve()
          })
        )
        setPendingTagIds([])
        void logActivity('created')
      }
    }
  }


  async function handleCategoryChange(catId: string | null) {
    if (editingNoteId) {
      await updateNote(editingNoteId, { category_id: catId })
    } else {
      setPendingCategoryId(catId)
    }
  }

  async function handleTagAdd(tagId: string) {
    if (editingNoteId) {
      const tag = tags.find(t => t.id === tagId)
      if (tag) await attachTag(editingNoteId, tag)
    } else {
      setPendingTagIds(prev => prev.includes(tagId) ? prev : [...prev, tagId])
    }
  }

  async function handleTagRemove(tagId: string) {
    if (editingNoteId) {
      await detachTag(editingNoteId, tagId)
    } else {
      setPendingTagIds(prev => prev.filter(id => id !== tagId))
    }
  }

  async function handleTagCreate(name: string) {
    const created = await createTag({ name })
    if (created) {
      if (editingNoteId) {
        await attachTag(editingNoteId, created)
      } else {
        setPendingTagIds(prev => [...prev, created.id])
      }
    }
    return created
  }

  async function handleImportFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    const skipped = files.filter(f => !isImportableFile(f))
    const importable = files.filter(isImportableFile)

    setImporting(true)
    let imported = 0
    for (const file of importable) {
      try {
        const text = await file.text()
        const { title, content } = parseMarkdownFile(text, file.name)
        const created = await createNote({ title, content, category_id: categoryFilter ?? undefined })
        if (created) imported++
      } catch {
        // Unreadable file — counted below as not imported
      }
    }
    setImporting(false)

    if (imported > 0) toast.success(`Imported ${imported} note${imported === 1 ? '' : 's'}`)
    if (skipped.length > 0) toast.error(`Skipped ${skipped.length} file${skipped.length === 1 ? '' : 's'} (only .md, .markdown, .txt up to 1 MB)`)
    else if (imported < importable.length) toast.error(`${importable.length - imported} file(s) could not be imported`)
  }

  async function handleDelete(note: Note) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    await deleteNote(note.id)
    if (editorOpen) closeEditor()
    setUndoNote({ id: note.id, title: note.title || 'Untitled' })
    undoTimerRef.current = setTimeout(() => setUndoNote(null), 5000)
  }

  async function handleUndo() {
    if (!undoNote) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    await restoreNote(undoNote.id)
    setUndoNote(null)
  }

  // Sub-note view: parent note is in editorStack, editing a sub-note
  if (editorOpen && isInSubNote && currentParentNote) {
    return (
      <>
        <NoteEditor
          initialTitle={editingNote?.title ?? ''}
          initialContent={editingNote?.content ?? ''}
          categoryId={editingNote?.category_id ?? null}
          categories={categories}
          noteTags={editingNoteId ? (noteTagsMap[editingNoteId] ?? []) : []}
          allTags={tags}
          isPinned={editingNote?.is_pinned ?? false}
          pinHash={editingNote?.pin_hash ?? null}
          onPin={editingNote ? () => togglePin(editingNote.id, !editingNote.is_pinned) : undefined}
          onLockToggle={editingNoteId ? handleLockToggle : undefined}
          onSave={async (title, content) => {
            if (editingNoteId) await updateNote(editingNoteId, { title, content })
          }}
          onBack={handleBack}
          onDelete={editingNote ? () => handleDelete(editingNote) : undefined}
          onCategoryChange={handleCategoryChange}
          onTagAdd={handleTagAdd}
          onTagRemove={handleTagRemove}
          onTagCreate={handleTagCreate}
        />
        {pinModal && (
          <NotePinModal
            noteTitle={pinModal.note.title}
            pinHash={pinModal.note.pin_hash}
            initialView={pinModal.view}
            onUnlocked={handlePinUnlocked}
            onPinChanged={handlePinChanged}
            onClose={() => setPinModal(null)}
          />
        )}
      </>
    )
  }

  return (
    <>
    {editorOpen ? (
      editingNoteId ? (
        <EditorWithSubNotes
          noteId={editingNoteId}
          initialTitle={editingNote?.title ?? ''}
          initialContent={editingNote?.content ?? ''}
          categoryId={editingNote?.category_id ?? pendingCategoryId}
          categories={categories}
          noteTags={noteTagsMap[editingNoteId] ?? []}
          allTags={tags}
          isPinned={editingNote?.is_pinned ?? false}
          pinHash={editingNote?.pin_hash ?? null}
          onPin={editingNote ? () => togglePin(editingNote.id, !editingNote.is_pinned) : undefined}
          onLockToggle={handleLockToggle}
          onSave={handleSave}
          onBack={handleBack}
          onDelete={editingNote ? () => handleDelete(editingNote) : undefined}
          onCategoryChange={handleCategoryChange}
          onTagAdd={handleTagAdd}
          onTagRemove={handleTagRemove}
          onTagCreate={handleTagCreate}
          onOpenSubNote={(sub) => openSubNote(editingNote!, sub as unknown as Note)}
          onShare={() => setCollabPanelOpen(true)}
        />
      ) : (
        <NoteEditor
          initialTitle=""
          initialContent=""
          categoryId={pendingCategoryId}
          categories={categories}
          noteTags={tags.filter(t => pendingTagIds.includes(t.id))}
          allTags={tags}
          isPinned={false}
          pinHash={null}
          onSave={handleSave}
          onBack={handleBack}
          onCategoryChange={handleCategoryChange}
          onTagAdd={handleTagAdd}
          onTagRemove={handleTagRemove}
          onTagCreate={handleTagCreate}
        />
      )
    ) : (
    <div className="animate-fade-up p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-text-primary font-semibold text-xl">Notes</h1>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-bg-card p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-bg-page text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-bg-page text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept=".md,.markdown,.txt"
            multiple
            className="hidden"
            onChange={e => {
              void handleImportFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm font-medium text-text-secondary hover:border-accent-gold/50 disabled:opacity-50 transition-colors"
          >
            <Upload size={15} />
            <span className="hidden sm:inline">{importing ? 'Importing…' : 'Import'}</span>
          </button>

          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-accent-gold px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={15} />
            New note
          </button>
        </div>
      </div>

      {/* Search */}
      <SearchBar
        placeholder="Search notes…"
        onSearch={setSearchQuery}
        className="mb-4"
      />

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === null
                ? 'bg-accent-gold text-white'
                : 'bg-bg-card border border-border text-text-secondary hover:border-accent-gold/50'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id === categoryFilter ? null : cat.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat.id
                  ? 'bg-accent-gold text-white'
                  : 'bg-bg-card border border-border text-text-secondary hover:border-accent-gold/50'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Active tag filter chip */}
      {activeTagFilter && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-text-muted text-xs">Filtered by tag:</span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: activeTagFilter.color }}
          >
            {activeTagFilter.name}
            <button
              type="button"
              onClick={() => setSearchParams({})}
              aria-label="Clear tag filter"
              className="hover:opacity-75 transition-opacity leading-none"
            >
              <X size={11} />
            </button>
          </span>
        </div>
      )}

      {/* Notes */}
      {loading ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <NoteCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => <NoteListRowSkeleton key={i} />)}
          </div>
        )
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={categoryFilter || urlTagId ? 'No notes match this filter.' : 'No notes yet.'}
          description={categoryFilter || urlTagId ? 'Try a different filter or search term.' : 'Start capturing your thoughts and ideas.'}
          action={!categoryFilter && !urlTagId ? { label: 'Create your first note', onClick: openNew } : undefined}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              tags={noteTagsMap[note.id] ?? []}
              searchQuery={searchQuery}
              isShared={note.user_id !== user?.id}
              onClick={() => openEdit(note)}
              onDelete={note.user_id === user?.id ? () => handleDelete(note) : undefined}
              onPin={note.user_id === user?.id ? () => togglePin(note.id, !note.is_pinned) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredNotes.map(note => (
            <NoteListRow
              key={note.id}
              note={note}
              onClick={() => openEdit(note)}
              onDelete={() => handleDelete(note)}
            />
          ))}
        </div>
      )}

    </div>
    )}
    {undoNote && <UndoToast title={undoNote.title} onUndo={handleUndo} />}
    {pinModal && (
      <NotePinModal
        noteTitle={pinModal.note.title}
        pinHash={pinModal.note.pin_hash}
        initialView={pinModal.view}
        onUnlocked={handlePinUnlocked}
        onPinChanged={handlePinChanged}
        onClose={() => setPinModal(null)}
      />
    )}
    {collabPanelOpen && collabNoteId && (
      <CollabPanel
        noteId={collabNoteId}
        noteOwnerId={editingNote?.user_id ?? user?.id ?? ''}
        onClose={() => setCollabPanelOpen(false)}
      />
    )}
    </>
  )
}

function NoteListRow({
  note,
  onClick,
  onDelete,
}: {
  note: Note
  onClick: () => void
  onDelete: () => void
}) {
  const date = new Date(note.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="group flex items-center gap-2">
      <button
        onClick={onClick}
        className="text-left flex-1 min-w-0 bg-bg-card rounded-xl border border-border px-4 py-3 hover:shadow-sm transition-shadow flex items-baseline gap-4"
      >
        <div className="text-text-primary font-medium text-sm truncate flex-1 min-w-0">
          {note.title || 'Untitled'}
        </div>
        <div className="text-text-muted text-xs shrink-0">{date}</div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Move to trash"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  )
}

function UndoToast({ title, onUndo }: { title: string; onUndo: () => void }) {
  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-text-primary text-bg-page rounded-xl px-4 py-3 shadow-lg text-sm whitespace-nowrap">
      <RotateCcw size={14} className="shrink-0 opacity-70" />
      <span className="truncate max-w-48">
        &ldquo;<span className="font-medium">{title}</span>&rdquo; moved to trash
      </span>
      <button
        onClick={onUndo}
        className="font-semibold text-accent-gold hover:opacity-80 transition-opacity shrink-0"
      >
        Undo
      </button>
    </div>
  )
}
