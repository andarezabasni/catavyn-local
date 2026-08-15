import { useCallback, useEffect, useState } from 'react'
import { localdb, type LocalTag } from '../../lib/localdb'

// Local replacement for the Supabase `useTags`. Same public surface, including
// the `noteTagsMap` (note_id -> Tag[]) the UI relies on.
export type Tag = LocalTag

export const TAG_COLORS = [
  '#5B8B5A',
  '#8B8B6A',
  '#C4844D',
  '#C4A84D',
  '#6B8B9A',
  '#9A6B8B',
]

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [noteTagsMap, setNoteTagsMap] = useState<Record<string, Tag[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTags = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [allTags, links] = await Promise.all([
        localdb.listTags(),
        localdb.listNoteTagLinks(),
      ])
      setTags(allTags)
      const tagsById = Object.fromEntries(allTags.map(t => [t.id, t]))
      const map: Record<string, Tag[]> = {}
      for (const { note_id, tag_id } of links) {
        const tag = tagsById[tag_id]
        if (!tag) continue
        ;(map[note_id] ??= []).push(tag)
      }
      setNoteTagsMap(map)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTags()
  }, [fetchTags])

  const createTag = useCallback(async (data: { name: string; color?: string }): Promise<Tag | null> => {
    try {
      const color = data.color ?? TAG_COLORS[tags.length % TAG_COLORS.length]
      const created = await localdb.createTag({ name: data.name, color })
      setTags(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      return created
    } catch (e) {
      setError(String(e))
      return null
    }
  }, [tags.length])

  const deleteTag = useCallback(async (id: string) => {
    setTags(prev => prev.filter(t => t.id !== id))
    setNoteTagsMap(prev => {
      const next: Record<string, Tag[]> = {}
      for (const noteId of Object.keys(prev)) {
        next[noteId] = prev[noteId].filter(t => t.id !== id)
      }
      return next
    })
    try {
      await localdb.deleteTag(id)
    } catch (e) {
      setError(String(e))
      await fetchTags()
    }
  }, [fetchTags])

  const attachTag = useCallback(async (noteId: string, tag: Tag) => {
    setNoteTagsMap(prev => {
      const existing = prev[noteId] ?? []
      if (existing.some(t => t.id === tag.id)) return prev
      return { ...prev, [noteId]: [...existing, tag] }
    })
    try {
      await localdb.attachTag(noteId, tag.id)
    } catch (e) {
      setError(String(e))
      await fetchTags()
    }
  }, [fetchTags])

  const detachTag = useCallback(async (noteId: string, tagId: string) => {
    setNoteTagsMap(prev => ({
      ...prev,
      [noteId]: (prev[noteId] ?? []).filter(t => t.id !== tagId),
    }))
    try {
      await localdb.detachTag(noteId, tagId)
    } catch (e) {
      setError(String(e))
      await fetchTags()
    }
  }, [fetchTags])

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
