import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../lib/toast'

export interface Collaborator {
  user_id: string
  invited_email: string
  can_edit: boolean
  added_at: string
}

export interface ActivityEntry {
  id: string
  user_email: string | null
  action: 'created' | 'edited' | 'renamed' | 'shared'
  created_at: string
}

export function useCollaborators(noteId: string | null) {
  const { user } = useAuth()
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetchCollaborators = useCallback(async () => {
    if (!noteId) return
    const { data } = await supabase
      .from('note_collaborators')
      .select('user_id, invited_email, can_edit, added_at')
      .eq('note_id', noteId)
      .order('added_at', { ascending: true })
    setCollaborators((data ?? []) as Collaborator[])
  }, [noteId])

  const fetchActivity = useCallback(async () => {
    if (!noteId) return
    const { data } = await supabase
      .from('note_activity')
      .select('id, user_email, action, created_at')
      .eq('note_id', noteId)
      .order('created_at', { ascending: false })
      .limit(50)
    setActivity((data ?? []) as ActivityEntry[])
  }, [noteId])

  useEffect(() => {
    if (!noteId) return
    setLoading(true)
    Promise.all([fetchCollaborators(), fetchActivity()]).finally(() => setLoading(false))
  }, [fetchCollaborators, fetchActivity, noteId])

  const invite = useCallback(async (email: string): Promise<boolean> => {
    if (!noteId || !user) return false

    // Exact-match lookup via SECURITY DEFINER RPC — profiles table is no
    // longer openly readable, so emails can't be harvested in bulk.
    const { data: profiles } = await supabase
      .rpc('lookup_profile_by_email', { lookup_email: email.trim().toLowerCase() })

    const profile = profiles?.[0]
    if (!profile) {
      toast.error('No Catavyn account found with that email')
      return false
    }

    if (profile.id === user.id) {
      toast.error('Cannot invite yourself')
      return false
    }

    const { error } = await supabase
      .from('note_collaborators')
      .insert({ note_id: noteId, user_id: profile.id, invited_email: profile.email })

    if (error) {
      if (error.code === '23505') toast.error('Already a collaborator')
      else toast.error('Failed to invite collaborator')
      return false
    }

    await supabase.from('note_activity').insert({
      note_id: noteId,
      user_id: user.id,
      user_email: user.email ?? null,
      action: 'shared' as const,
    })

    toast.success(`Invited ${profile.email}`)
    await Promise.all([fetchCollaborators(), fetchActivity()])
    return true
  }, [noteId, user, fetchCollaborators, fetchActivity])

  const remove = useCallback(async (userId: string) => {
    if (!noteId) return
    const { error } = await supabase
      .from('note_collaborators')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', userId)
    if (error) { toast.error('Failed to remove collaborator'); return }
    setCollaborators(prev => prev.filter(c => c.user_id !== userId))
  }, [noteId])

  const logActivity = useCallback(async (action: 'created' | 'edited' | 'renamed') => {
    if (!noteId || !user) return
    await supabase.from('note_activity').insert({
      note_id: noteId,
      user_id: user.id,
      user_email: user.email ?? null,
      action,
    })
    await fetchActivity()
  }, [noteId, user, fetchActivity])

  return { collaborators, activity, loading, invite, remove, logActivity, refetchActivity: fetchActivity }
}
