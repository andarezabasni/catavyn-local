import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../lib/toast'

// Browser-notification reminders for tasks with a due time today.
// Mount once (Sidebar) so the poller runs on every page. Web-only by design —
// no emails, no server: the tab checks Supabase every 30s while the app is open.

const PREF_KEY = 'catavyn:task-reminders'
const SENT_KEY = 'catavyn:task-reminders-sent'
const CHECK_INTERVAL_MS = 30_000
// Don't notify for tasks that were already overdue by more than this when the
// checker first sees them (e.g. reminders just turned on, or tab reopened late)
const LATE_WINDOW_MS = 10 * 60_000

function localDateStr(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Sent-set persists across reloads so a task is never notified twice; it
// resets automatically when the date changes.
function loadSent(today: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) ?? 'null')
    if (raw && raw.date === today && Array.isArray(raw.ids)) return new Set(raw.ids)
  } catch { /* corrupted entry — start fresh */ }
  return new Set()
}

function saveSent(today: string, ids: Set<string>) {
  localStorage.setItem(SENT_KEY, JSON.stringify({ date: today, ids: [...ids] }))
}

export function useTaskReminders() {
  const { user } = useAuth()
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [enabled, setEnabled] = useState(
    () => supported && localStorage.getItem(PREF_KEY) === 'on' && Notification.permission === 'granted'
  )

  const toggle = useCallback(async () => {
    if (!supported) {
      toast.error('Notifications are not supported in this browser')
      return
    }
    if (enabled) {
      localStorage.setItem(PREF_KEY, 'off')
      setEnabled(false)
      toast.success('Task reminders off')
      return
    }
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission !== 'granted') {
      toast.error('Notifications are blocked — allow them in your browser settings')
      return
    }
    localStorage.setItem(PREF_KEY, 'on')
    setEnabled(true)
    toast.success('Task reminders on — you’ll be notified when a task is due')
  }, [enabled, supported])

  useEffect(() => {
    if (!enabled || !user) return
    let cancelled = false

    async function check() {
      const today = localDateStr()
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_time')
        .eq('user_id', user!.id)
        .eq('due_date', today)
        .eq('is_completed', false)
        .not('due_time', 'is', null)

      if (cancelled || error || !data) return

      const sent = loadSent(today)
      const now = Date.now()
      let changed = false

      for (const task of data) {
        if (sent.has(task.id)) continue
        const [h, min] = (task.due_time as string).split(':').map(Number)
        const due = new Date()
        due.setHours(h, min, 0, 0)
        const overdueBy = now - due.getTime()

        if (overdueBy < 0) continue // not due yet — next poll will catch it

        sent.add(task.id)
        changed = true
        if (overdueBy <= LATE_WINDOW_MS) {
          const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
          const n = new Notification('Task due · Catavyn', {
            body: `${task.title} — ${time}`,
            tag: `catavyn-task-${task.id}`,
            icon: '/favicon.svg',
          })
          n.onclick = () => {
            window.focus()
            n.close()
          }
        }
        // Older than the window: mark as sent silently so enabling reminders
        // late in the day doesn't fire a burst of stale notifications
      }

      if (changed) saveSent(today, sent)
    }

    void check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, user])

  return { supported, enabled, toggle }
}
