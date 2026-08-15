import { useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, X, FileText, ExternalLink, Image as ImageIcon } from 'lucide-react'
import type { LocalAttachment } from '../../lib/localdb'
import { useAttachments } from '../hooks/useAttachments'

const ACCEPTED_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer()
  return new Uint8Array(buf)
}

// Attachment strip shown inside the note editor. Supports file picker,
// drag & drop, and clipboard paste. Reuses the existing Catavyn visual
// language (cards, muted text, gold accents) rather than introducing new UI.
export default function AttachmentPanel({ noteId }: { noteId: string }) {
  const { attachments, thumbUrls, add, remove, openFull, reveal } = useAttachments(noteId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const bytes = await fileToBytes(file)
      await add({ name: file.name, type: file.type || 'application/octet-stream', bytes })
    }
  }

  // Clipboard image paste while this note is open.
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      const images: File[] = []
      for (const item of items) {
        if (item.kind === 'file' && ACCEPTED_IMAGE.includes(item.type)) {
          const f = item.getAsFile()
          if (f) {
            // Give pasted images a stable, sensible name.
            const ext = item.type.split('/')[1] ?? 'png'
            images.push(new File([f], `pasted-${Date.now()}.${ext}`, { type: item.type }))
          }
        }
      }
      if (images.length) {
        e.preventDefault()
        await addFiles(images)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  async function showFull(att: LocalAttachment) {
    if (!att.mime_type.startsWith('image/')) {
      await reveal(att.id)
      return
    }
    const url = await openFull(att)
    if (url) setLightbox({ url, name: att.original_filename })
  }

  function closeLightbox() {
    if (lightbox) URL.revokeObjectURL(lightbox.url)
    setLightbox(null)
  }

  return (
    <div className="mt-8 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-text-muted text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
          <Paperclip size={12} />
          Attachments ({attachments.length})
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-gold transition-colors"
        >
          <Upload size={12} />
          Add file
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files) void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
        }}
        className={`rounded-xl border border-dashed transition-colors mb-3 ${
          dragOver ? 'border-accent-gold bg-accent-gold/5' : 'border-border'
        } ${attachments.length === 0 ? 'p-6' : 'p-3'}`}
      >
        {attachments.length === 0 ? (
          <p className="text-text-muted text-xs text-center">
            Drag &amp; drop, paste an image, or use “Add file”.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {attachments.map(att => {
              const isImage = att.mime_type.startsWith('image/')
              const thumb = thumbUrls[att.id]
              return (
                <div key={att.id} className="group relative rounded-lg border border-border bg-bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => void showFull(att)}
                    className="block w-full text-left"
                    title={att.original_filename}
                  >
                    <div className="aspect-video bg-bg-page flex items-center justify-center overflow-hidden">
                      {isImage && thumb ? (
                        <img src={thumb} alt={att.original_filename} className="w-full h-full object-cover" />
                      ) : isImage ? (
                        <ImageIcon size={22} className="text-text-muted opacity-50" />
                      ) : (
                        <FileText size={22} className="text-text-muted opacity-50" />
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="text-text-primary text-[11px] font-medium truncate">{att.original_filename}</div>
                      <div className="text-text-muted text-[10px]">
                        {att.mime_type.split('/')[1]?.toUpperCase() ?? 'FILE'} · {formatBytes(att.file_size)}
                        {att.width && att.height ? ` · ${att.width}×${att.height}` : ''}
                      </div>
                    </div>
                  </button>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => void reveal(att.id)}
                      aria-label="Reveal in folder"
                      className="p-1 rounded bg-bg-page/80 text-text-muted hover:text-accent-gold"
                    >
                      <ExternalLink size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(att.id)}
                      aria-label="Delete attachment"
                      className="p-1 rounded bg-bg-page/80 text-text-muted hover:text-red-500"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6" onClick={closeLightbox}>
          <img src={lightbox.url} alt={lightbox.name} className="max-w-full max-h-full rounded-lg shadow-xl" />
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="Close preview"
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
