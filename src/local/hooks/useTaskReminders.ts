import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { localdb } from '../../lib/localdb'
import { toast } from '../../lib/toast'

const CHECK_INTERVAL_MS = 30_000

// Local wall-clock time as "YYYY-MM-DDTHH:MM:SS". The Windows timezone lives
// here in the frontend; the backend compares against this string and never
// stores timezone data in the database.
function localNowString(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Native desktop task reminders. Replaces the original browser-Notification
// poller. While Catavyn is running it polls the backend every 30s; the backend
// decides which tasks are due (dedup, completed/deleted skipped, per-day sent
// state) and this hook fires OS notifications via tauri-plugin-notification.
//
// Limitation: notifications only fire while the app is running. There is no
// OS-level background scheduling in this phase — documented, not faked.
export function useTaskReminders() {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    void localdb.getRemindersEnabled().then(v => {
      setEnabled(v)
      setReady(true)
    })
  }, [])

  const check = useCallback(async () => {
    try {
      const due = await localdb.pollDueReminders(localNowString())
      for (const r of due) {
        sendNotification({
          title: 'Task due · Catavyn',
          body: `${r.title} — ${r.due_time}`,
        })
      }
    } catch {
      // A transient failure (e.g. no data dir) shouldn't crash the poller.
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    void check()
    timerRef.current = setInterval(() => void check(), CHECK_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, check])

  const toggle = useCallback(async () => {
    if (enabled) {
      await localdb.setRemindersEnabled(false)
      setEnabled(false)
      toast.success('Task reminders off')
      return
    }
    // Ensure OS notification permission before enabling.
    let granted = await isPermissionGranted()
    if (!granted) {
      const perm = await requestPermission()
      granted = perm === 'granted'
    }
    if (!granted) {
      toast.error('Notifications are blocked — allow them in Windows settings')
      return
    }
    await localdb.setRemindersEnabled(true)
    setEnabled(true)
    toast.success('Task reminders on — you’ll be notified when a task is due')
  }, [enabled])

  // Best-effort: focus the window if the user interacts. tauri notification
  // click routing is limited on desktop, so we don't rely on it.
  const focusApp = useCallback(async () => {
    try {
      await getCurrentWindow().setFocus()
    } catch {
      /* ignore */
    }
  }, [])

  return { enabled, ready, toggle, focusApp }
}
