import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Database } from '../lib/database.types'

export type Tag = Database['public']['Tables']['tags']['Row']
type TagInsert = Omit<Database['public']['Tables']['tags']['Insert'], 'user_id'>

export const TAG_COLORS = [
  '#5B8B5A',
  '#8B8B6A',
  '#C4844D',
  '#C4A84D',
  '#6B8B9A',
  '#9A6B8B',
]

export function useTags() {
  const { user } = useAuth()
  const [tags, setTags] = useState<Tag[]>([])
  const [noteTagsMap, setNoteTagsMap] = useState<Record<string, Tag[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTags = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const [tagsResult, noteTagsResult] = await Promise.all([
      supabase
        .from('tags')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true }),
      supabase
        .from('note_tags')
        .select('note_id, tag_id'),
    ])

    if (tagsResult.error) {
      setError(tagsResult.error.message)
      setLoading(false)
      return
    }

    const allTags = tagsResult.data ?? []
    setTags(allTags)

    if (!noteTagsResult.error && noteTagsResult.data) {
      const tagsById = Object.fromEntries(allTags.map(t => [t.id, t]))
      const map: Record<string, Tag[]> = {}
      for (const { note_id, tag_id } of noteTagsResult.data) {
        const tag = tagsById[tag_id]
        if (!tag) continue
        if (!map[note_id]) map[note_id] = []
        map[note_id].push(tag)
      }
      setNoteTagsMap(map)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const createTag = useCallback(async (data: TagInsert): Promise<Tag | null> => {
    if (!user) return null

    const payload = {
      user_id: user.id,
      color: TAG_COLORS[tags.length % TAG_COLORS.length],
      ...data,
    }

    const tempId = `temp-${Date.now()}`
    const optimistic: Tag = {
      id: tempId,
      created_at: new Date().toISOString(),
      ...payload,
    }
    setTags(prev => [...prev, optimistic].sort((a, b) => a.name.localeCompare(b.name)))

    const { data: created, error } = await supabase
      .from('tags')
      .insert(payload)
      .select()
      .single()

    if (error) {
      setTags(prev => prev.filter(t => t.id !== tempId))
      setError(error.message)
      return null
    }

    setTags(prev => prev.map(t => t.id === tempId ? created : t))
    return created
  }, [user, tags.length])

  const deleteTag = useCallback(async (id: string) => {
    setTags(prev => prev.filter(t => t.id !== id))
    setNoteTagsMap(prev => {
      const next = { ...prev }
      for (const noteId of Object.keys(next)) {
        next[noteId] = next[noteId].filter(t => t.id !== id)
      }
      return next
    })

    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      await fetchTags()
    }
  }, [fetchTags])

  const attachTag = useCallback(async (noteId: string, tag: Tag) => {
    setNoteTagsMap(prev => {
      const existing = prev[noteId] ?? []
      if (existing.some(t => t.id === tag.id)) return prev
      return { ...prev, [noteId]: [...existing, tag] }
    })

    const { error } = await supabase
      .from('note_tags')
      .insert({ note_id: noteId, tag_id: tag.id })

    if (error) {
      setNoteTagsMap(prev => ({
        ...prev,
        [noteId]: (prev[noteId] ?? []).filter(t => t.id !== tag.id),
      }))
      setError(error.message)
    }
  }, [])

  const detachTag = useCallback(async (noteId: string, tagId: string) => {
    setNoteTagsMap(prev => ({
      ...prev,
      [noteId]: (prev[noteId] ?? []).filter(t => t.id !== tagId),
    }))

    const { error } = await supabase
      .from('note_tags')
      .delete()
      .eq('note_id', noteId)
      .eq('tag_id', tagId)

    if (error) {
      const tag = tags.find(t => t.id === tagId)
      if (tag) {
        setNoteTagsMap(prev => ({
          ...prev,
          [noteId]: [...(prev[noteId] ?? []), tag],
        }))
      }
      setError(error.message)
    }
  }, [tags])

  return {
    tags,
    noteTagsMap,
    loading,
    error,
    refetch: fetchTags,
    createTag,
    deleteTag,
    attachTag,
    detachTag,
  }
}
