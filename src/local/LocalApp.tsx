import { useEffect, useState } from 'react'
import { FolderOpen, Database } from 'lucide-react'
import { ThemeProvider } from '../context/ThemeContext'
import Toaster from '../components/ui/Toaster'
import { localdb, type StorageStatus } from '../lib/localdb'
import { toast } from '../lib/toast'
import LocalLayout, { type LocalView } from './LocalLayout'
import LocalHomePage from './pages/LocalHomePage'
import LocalNotesPage from './pages/LocalNotesPage'
import LocalTagsPage from './pages/LocalTagsPage'
import LocalPinnedPage from './pages/LocalPinnedPage'
import LocalTrashPage from './pages/LocalTrashPage'
import LocalSettingsPage from './pages/LocalSettingsPage'

// First-run screen: pick where Catavyn stores data. Reuses the design system.
function StorageSetup({ onReady }: { onReady: () => void }) {
  const [busy, setBusy] = useState(false)

  async function choose() {
    setBusy(true)
    try {
      const path = await localdb.chooseDataDir()
      if (path) {
        toast.success(`Data directory set: ${path}`)
        onReady()
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg-page">
      <div className="max-w-md w-full bg-bg-card border border-border rounded-2xl p-8 text-center animate-fade-up">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-accent-gold/15 flex items-center justify-center">
            <Database size={26} className="text-accent-gold" />
          </div>
        </div>
        <h1 className="text-text-primary font-semibold text-lg mb-2">Choose where Catavyn stores your data</h1>
        <p className="text-text-muted text-sm mb-6 leading-relaxed">
          Pick a folder on any drive (for example <code>D:\CatavynData</code>). Your notes live
          entirely inside that folder — portable and fully offline.
        </p>
        <button
          type="button"
          onClick={() => void choose()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <FolderOpen size={16} />
          {busy ? 'Opening…' : 'Select data folder'}
        </button>
      </div>
    </div>
  )
}

function Shell({ status, onStatusChange }: { status: StorageStatus; onStatusChange: (s: StorageStatus) => void }) {
  const [view, setView] = useState<LocalView>('home')
  // When set, LocalNotesPage should open this note on mount.
  const [pendingOpenNoteId, setPendingOpenNoteId] = useState<string | null>(null)
  const [tagFilterId, setTagFilterId] = useState<string | null>(null)

  function openNote(id: string) {
    setPendingOpenNoteId(id)
    setView('notes')
  }

  function openTag(tagId: string) {
    setTagFilterId(tagId)
    setView('notes')
  }

  return (
    <LocalLayout active={view} onNavigate={setView}>
      {view === 'home' && <LocalHomePage onOpenNote={openNote} />}
      {view === 'notes' && (
        <LocalNotesPage
          key={`${pendingOpenNoteId ?? ''}-${tagFilterId ?? ''}`}
          openNoteId={pendingOpenNoteId}
          initialTagFilter={tagFilterId}
          onConsumed={() => { setPendingOpenNoteId(null); setTagFilterId(null) }}
        />
      )}
      {view === 'tags' && <LocalTagsPage onTagClick={openTag} />}
      {view === 'pinned' && <LocalPinnedPage onOpenNote={openNote} />}
      {view === 'trash' && <LocalTrashPage />}
      {view === 'settings' && <LocalSettingsPage status={status} onStatusChange={onStatusChange} />}
    </LocalLayout>
  )
}

export default function LocalApp() {
  const [status, setStatus] = useState<StorageStatus | null>(null)

  const load = () => {
    void localdb.getStorageStatus().then(setStatus)
  }

  useEffect(load, [])

  return (
    <ThemeProvider>
      {status === null ? (
        <div className="min-h-screen bg-bg-page" />
      ) : status.configured ? (
        <Shell status={status} onStatusChange={setStatus} />
      ) : (
        <StorageSetup onReady={load} />
      )}
      <Toaster />
    </ThemeProvider>
  )
}
