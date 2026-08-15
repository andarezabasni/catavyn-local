import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export interface RemoteUpdate {
  title: string
  content: string
  updatedByEmail?: string
}

export function useNoteRealtime(
  noteId: string | null,
  onRemoteUpdate: (update: RemoteUpdate) => void
) {
  const { user } = useAuth()

  useEffect(() => {
    if (!noteId) return

    const channel = supabase
      .channel(`note-rt-${noteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notes',
          filter: `id=eq.${noteId}`,
        },
        (payload) => {
          const updated = payload.new as {
            title: string
            content: string
            updated_by: string | null
          }
          // Ignore updates triggered by the current user
          if (updated.updated_by === user?.id) return

          onRemoteUpdate({ title: updated.title, content: updated.content })
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [noteId, user?.id, onRemoteUpdate])
}
