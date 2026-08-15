import { useCallback, useEffect, useRef, useState } from 'react'
import { localdb, type LocalAttachment } from '../../lib/localdb'
import { toast } from '../../lib/toast'

// Manages a note's attachments via the Tauri command layer. Object URLs for
// thumbnails/previews are created lazily and revoked on unmount so large image
// bytes never linger in React state longer than needed.
export function useAttachments(noteId: string | null) {
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [loading, setLoading] = useState(false)
  // id -> object URL for thumbnail (or original for small images)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const urlsRef = useRef<Record<string, string>>({})

  const revokeAll = useCallback(() => {
    for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url)
    urlsRef.current = {}
  }, [])

  const loadThumb = useCallback(async (att: LocalAttachment) => {
    if (!att.mime_type.startsWith('image/')) return
    if (urlsRef.current[att.id]) return
    try {
      const bytes = await localdb.readAttachmentThumbnail(att.id)
      const blob = new Blob([bytes as BlobPart], { type: att.mime_type })
      const url = URL.createObjectURL(blob)
      urlsRef.current[att.id] = url
      setThumbUrls(prev => ({ ...prev, [att.id]: url }))
    } catch {
      // Missing/corrupt file — leave without a preview.
    }
  }, [])

  const refetch = useCallback(async () => {
    if (!noteId) {
      setAttachments([])
      return
    }
    setLoading(true)
    try {
      const list = await localdb.listAttachments(noteId)
      setAttachments(list)
      await Promise.all(list.map(loadThumb))
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoading(false)
    }
  }, [noteId, loadThumb])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => () => revokeAll(), [revokeAll])

  const add = useCallback(
    async (file: { name: string; type: string; bytes: Uint8Array }) => {
      if (!noteId) return null
      try {
        const created = await localdb.addAttachment(noteId, file.name, file.type, file.bytes)
        setAttachments(prev => [...prev, created])
        await loadThumb(created)
        return created
      } catch (e) {
        toast.error(`Failed to add attachment: ${e}`)
        return null
      }
    },
    [noteId, loadThumb],
  )

  const remove = useCallback(async (id: string) => {
    try {
      await localdb.deleteAttachment(id)
      setAttachments(prev => prev.filter(a => a.id !== id))
      const url = urlsRef.current[id]
      if (url) {
        URL.revokeObjectURL(url)
        delete urlsRef.current[id]
        setThumbUrls(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    } catch (e) {
      toast.error(`Failed to delete attachment: ${e}`)
    }
  }, [])

  // Fetch full-resolution bytes on demand (e.g. opening a lightbox). Not held
  // in state — caller owns the returned object URL.
  const openFull = useCallback(async (att: LocalAttachment): Promise<string | null> => {
    try {
      const bytes = await localdb.readAttachment(att.id)
      const blob = new Blob([bytes as BlobPart], { type: att.mime_type })
      return URL.createObjectURL(blob)
    } catch (e) {
      toast.error(String(e))
      return null
    }
  }, [])

  const reveal = useCallback(async (id: string) => {
    try {
      await localdb.revealAttachment(id)
    } catch (e) {
      toast.error(String(e))
    }
  }, [])

  return { attachments, loading, thumbUrls, add, remove, openFull, reveal, refetch }
}
