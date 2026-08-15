import { useCallback, useEffect, useRef, useState } from 'react'
import { localdb, type VaultItemSummary, type VaultStatus } from '../../lib/localdb'
import { toast } from '../../lib/toast'

// Frontend Vault state. Keys never live here — only lock status, item metadata,
// and on-demand decrypted fields. The master credential is passed straight to
// the backend and never stored in state.
export function useVault() {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [items, setItems] = useState<VaultItemSummary[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await localdb.vaultStatus()
      setStatus(s)
      return s
    } catch (e) {
      toast.error(String(e))
      return null
    }
  }, [])

  const refreshItems = useCallback(async () => {
    try {
      setItems(await localdb.vaultListItems())
    } catch {
      // Locked or no vault — clear the list.
      setItems([])
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // While unlocked, poll status so the UI reflects backend auto-lock (5 min).
  useEffect(() => {
    if (!status?.unlocked) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    void refreshItems()
    pollRef.current = setInterval(async () => {
      const s = await refreshStatus()
      if (s && !s.unlocked) setItems([])
    }, 15_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status?.unlocked, refreshStatus, refreshItems])

  const create = useCallback(async (credential: string) => {
    await localdb.vaultCreate(credential)
    await refreshStatus()
  }, [refreshStatus])

  const unlock = useCallback(async (credential: string) => {
    await localdb.vaultUnlock(credential)
    await refreshStatus()
    await refreshItems()
  }, [refreshStatus, refreshItems])

  const lock = useCallback(async () => {
    await localdb.vaultLock()
    setItems([])
    await refreshStatus()
  }, [refreshStatus])

  const createItem = useCallback(async (itemType: string, payload: Record<string, unknown>) => {
    await localdb.vaultCreateItem(itemType, payload)
    await refreshItems()
  }, [refreshItems])

  const updateItem = useCallback(async (itemId: string, payload: Record<string, unknown>) => {
    await localdb.vaultUpdateItem(itemId, payload)
    await refreshItems()
  }, [refreshItems])

  const deleteItem = useCallback(async (itemId: string) => {
    await localdb.vaultDeleteItem(itemId)
    await refreshItems()
  }, [refreshItems])

  return { status, items, refreshStatus, refreshItems, create, unlock, lock, createItem, updateItem, deleteItem }
}
