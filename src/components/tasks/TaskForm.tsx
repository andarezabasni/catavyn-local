import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { TaskView as Task } from '../../types/entities'

type Priority = Task['priority']

interface TaskFormProps {
  defaultDate?: string
  task?: Task
  onSave: (data: {
    title: string
    description: string
    due_date: string | null
    due_time: string | null
    priority: Priority
  }) => Promise<void>
  onClose: () => void
}

const PRIORITIES: { value: Priority; label: string; bg: string }[] = [
  { value: 'low',    label: 'Low',    bg: 'bg-priority-low' },
  { value: 'medium', label: 'Medium', bg: 'bg-priority-med' },
  { value: 'high',   label: 'High',   bg: 'bg-priority-high' },
]

export default function TaskForm({ defaultDate, task, onSave, onClose }: TaskFormProps) {
  const [title, setTitle]           = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate, setDueDate]       = useState(task?.due_date ?? defaultDate ?? '')
  const [dueTime, setDueTime]       = useState(task?.due_time?.slice(0, 5) ?? '')
  const [priority, setPriority]     = useState<Priority>(task?.priority ?? 'low')
  const [saving, setSaving]         = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    await onSave({
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate || null,
      due_time: dueTime || null,
      priority,
    })
    setSaving(false)
  }

  const isEdit = !!task

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(44,44,44,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-bg-card rounded-2xl shadow-xl border border-border flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <h2 className="text-text-primary font-semibold text-base">
            {isEdit ? 'Edit task' : 'New task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-page transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Title</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              maxLength={100}
              required
              className="rounded-lg border border-border bg-bg-page px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold/50"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Description <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add details…"
              rows={2}
              maxLength={500}
              className="rounded-lg border border-border bg-bg-page px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold/50 resize-none"
            />
          </div>

          {/* Date + Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="rounded-lg border border-border bg-bg-page px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-gold/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Due time</label>
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="rounded-lg border border-border bg-bg-page px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-gold/50"
              />
            </div>
          </div>

          {/* Priority */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Priority</label>
            <div className="flex items-center gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold text-text-primary transition-all border-2 ${p.bg} ${
                    priority === p.value
                      ? 'border-text-primary/30 shadow-sm scale-[1.03]'
                      : 'border-transparent opacity-50 hover:opacity-75'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="rounded-lg bg-accent-gold px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
