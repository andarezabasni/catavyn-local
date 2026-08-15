import { useState, useEffect, useCallback, useRef } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from '../../lib/toast'

interface ToastItem {
  id: string
  message: string
  type: 'error' | 'success'
}

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const show = useCallback((message: string, type: 'error' | 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setItems(prev => [...prev, { id, message, type }])
    const timer = setTimeout(() => dismiss(id), 4000)
    timers.current.set(id, timer)
  }, [dismiss])

  useEffect(() => {
    toast._register(show)
    return () => {
      toast._unregister()
      timers.current.forEach(t => clearTimeout(t))
    }
  }, [show])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map(item => (
        <div
          key={item.id}
          className={`animate-fade-up pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm max-w-sm ${
            item.type === 'error'
              ? 'bg-red-950 text-red-200 border border-red-800'
              : 'bg-text-primary text-bg-page'
          }`}
        >
          {item.type === 'error'
            ? <AlertCircle size={15} className="shrink-0 opacity-80" />
            : <CheckCircle size={15} className="shrink-0 opacity-80" />
          }
          <span className="truncate max-w-60">{item.message}</span>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            className="ml-auto shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
