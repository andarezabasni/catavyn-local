import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, FolderInput, RefreshCw, Trash2, HardDrive, AlertTriangle } from 'lucide-react'
import { localdb, type StorageStatus, type StorageUsage } from '../../lib/localdb'
import { toast } from '../../lib/toast'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

// Local Settings → Storage. Implements the safe storage flows described in the
// spec: view/open/change location, storage usage breakdown, and a guarded
// "delete all data" that requires the user to type the exact path.
export default function LocalSettingsPage({
  status,
  onStatusChange,
}: {
  status: StorageStatus
  onStatusChange: (s: StorageStatus) => void
}) {
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const dataDir = status.data_dir ?? ''

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await localdb.getStorageUsage())
    } catch (e) {
      toast.error(String(e))
    }
  }, [])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  async function openInExplorer() {
    try {
      await localdb.openDataDirInExplorer()
    } catch (e) {
      toast.error(String(e))
    }
  }

  async function changeLocation() {
    setBusy('migrate')
    try {
      const newPath = await localdb.migrateStorage()
      if (newPath) {
        toast.success(`Data moved to ${newPath}`)
        const s = await localdb.getStorageStatus()
        onStatusChange(s)
        await loadUsage()
      }
    } catch (e) {
      // Backend guarantees the original data is untouched on failure.
      toast.error(`Move failed — original data is safe. ${e}`)
    } finally {
      setBusy(null)
    }
  }

  async function deleteAll() {
    if (confirmText !== dataDir) {
      toast.error('Type the exact directory path to confirm')
      return
    }
    setBusy('delete')
    try {
      const s = await localdb.deleteAllData(dataDir)
      toast.success('All Catavyn data deleted')
      onStatusChange(s)
      setConfirmDelete(false)
      setConfirmText('')
      await loadUsage()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="animate-fade-up p-6 max-w-3xl mx-auto">
      <h1 className="text-text-primary font-semibold text-xl mb-6">Settings</h1>

      {/* Storage location */}
      <section className="bg-bg-card rounded-xl border border-border p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={16} className="text-accent-gold" />
          <h2 className="text-text-primary font-semibold text-sm">Storage location</h2>
        </div>
        <p className="text-text-muted text-xs mb-1">Your Catavyn data lives here:</p>
        <code className="block bg-bg-page border border-border rounded-lg px-3 py-2 text-xs text-text-primary break-all mb-4">
          {dataDir || '—'}
        </code>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void openInExplorer()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent-gold/50 transition-colors"
          >
            <FolderOpen size={14} />
            Open folder
          </button>
          <button
            type="button"
            onClick={() => void changeLocation()}
            disabled={busy === 'migrate'}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent-gold/50 disabled:opacity-50 transition-colors"
          >
            <FolderInput size={14} />
            {busy === 'migrate' ? 'Moving…' : 'Change location'}
          </button>
        </div>
        <p className="text-text-muted text-[11px] mt-3 leading-relaxed">
          Changing location copies and verifies your data before switching. The original
          data stays intact until the move succeeds, and an existing Catavyn folder is
          never overwritten.
        </p>
      </section>

      {/* Storage usage */}
      <section className="bg-bg-card rounded-xl border border-border p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-text-primary font-semibold text-sm">Storage usage</h2>
          <button
            type="button"
            onClick={() => void loadUsage()}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-gold transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
        {usage ? (
          <div className="space-y-2 text-sm">
            <Row label="Database" value={formatBytes(usage.database_bytes)} />
            <Row label="Images" value={formatBytes(usage.images_bytes)} />
            <Row label="Files" value={formatBytes(usage.files_bytes)} />
            <Row label="Thumbnails" value={formatBytes(usage.thumbnails_bytes)} />
            <Row label="Backups" value={formatBytes(usage.backups_bytes)} />
            <div className="border-t border-border pt-2">
              <Row label="Total" value={formatBytes(usage.total_bytes)} bold />
            </div>
          </div>
        ) : (
          <p className="text-text-muted text-xs">Calculating…</p>
        )}
      </section>

      {/* Danger zone */}
      <section className="bg-bg-card rounded-xl border border-red-200 dark:border-red-900/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-red-500" />
          <h2 className="text-text-primary font-semibold text-sm">Delete all data</h2>
        </div>
        <p className="text-text-muted text-xs mb-3 leading-relaxed">
          This permanently deletes every note, tag, category, and task inside the folder
          below. This cannot be undone. Your app installation is not affected.
        </p>
        <code className="block bg-bg-page border border-border rounded-lg px-3 py-2 text-xs text-text-primary break-all mb-3">
          {dataDir || '—'}
        </code>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={14} />
            Delete all data
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-text-secondary text-xs">
              Type the exact path above to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={dataDir}
              className="w-full rounded-lg border border-border bg-bg-page px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void deleteAll()}
                disabled={busy === 'delete' || confirmText !== dataDir}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {busy === 'delete' ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); setConfirmText('') }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent-gold/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-text-secondary ${bold ? 'font-semibold text-text-primary' : ''}`}>{label}</span>
      <span className={`text-text-muted ${bold ? 'font-semibold text-text-primary' : ''}`}>{value}</span>
    </div>
  )
}
