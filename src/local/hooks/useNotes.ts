import { useCallback, useEffect, useState } from 'react'
import { localdb, type LocalNote, type NewNoteInput, type NotePatch } from '../../lib/localdb'
import { toast } from '../../lib/toast'

// Local-first replacement for the original Supabase `useNotes`. Preserves the
// same public surface (notes, loading, createNote, updateNote, deleteNote,
// restoreNote, permanentlyDeleteNote, togglePin, refetch) so existing UI can be
// reused. Backed entirely by the Rust/SQLite command layer.
export type Note = LocalNote

interface UseNotesOptions {
  deleted?: boolean
  parentId?: string
  rootOnly?: boolean
  search?: string
}

export function useNotes(options: UseNotesOptions = {}) {
  const { deleted, parentId, rootOnly, search } = options
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await localdb.listNotes({
        deleted,
        parent_id: parentId,
        root_only: rootOnly,
        search,
      })
      setNotes(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [deleted, parentId, rootOnly, search])

  useEffect(() => {
    void fetchNotes()
  }, [fetchNotes])

  const createNote = useCallback(async (data: NewNoteInput = {}): Promise<Note | null> => {
    try {
      const created = await localdb.createNote(data)
      if (!deleted) setNotes(prev => [created, ...prev])
      return created
    } catch (e) {
      setError(String(e))
      toast.error(`Failed to create note: ${e}`)
      return null
    }
  }, [deleted])

  const updateNote = useCallback(async (id: string, data: NotePatch) => {
    // Optimistic update, then reconcile with the returned row.
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, ...data } as Note : n)))
    try {
      const updated = await localdb.updateNote(id, data)
      if (updated) setNotes(prev => prev.map(n => (n.id === id ? updated : n)))
    } catch (e) {
      setError(String(e))
      toast.error('Failed to save note')
      await fetchNotes()
    }
  }, [fetchNotes])

  const deleteNote = useCallback(async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id && n.parent_id !== id))
    try {
      await localdb.deleteNote(id)
    } catch (e) {
      setError(String(e))
      toast.error('Failed to delete note')
      await fetchNotes()
    }
  }, [fetchNotes])

  const restoreNote = useCallback(async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id && n.parent_id !== id))
    try {
      await localdb.restoreNote(id)
    } catch (e) {
      setError(String(e))
      toast.error('Failed to restore note')
      await fetchNotes()
    }
  }, [fetchNotes])

  const permanentlyDeleteNote = useCallback(async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    try {
      await localdb.permanentlyDeleteNote(id)
    } catch (e) {
      setError(String(e))
      toast.error('Failed to permanently delete note')
      await fetchNotes()
    }
  }, [fetchNotes])

  const togglePin = useCallback(async (id: string, pinned: boolean) => {
    await updateNote(id, { is_pinned: pinned })
  }, [updateNote])

  return {
    notes,
    loading,
    error,
    refetch: fetchNotes,
    createNote,
    updateNote,
    deleteNote,
    restoreNote,
    permanentlyDeleteNote,
    togglePin,
  }
}
