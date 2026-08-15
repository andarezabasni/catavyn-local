import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useTasks } from '../../hooks/useTasks'
import TaskItem from './TaskItem'
import TaskForm from './TaskForm'
import MiniCalendar from './MiniCalendar'
import { TaskItemSkeleton } from '../ui/Skeleton'

interface TaskPanelProps {
  onClose?: () => void
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatHeader(d: Date): string {
  const today     = toISODate(new Date())
  const target    = toISODate(d)
  const tomorrow  = toISODate(new Date(Date.now() + 86400000))
  const yesterday = toISODate(new Date(Date.now() - 86400000))

  if (target === today)     return 'Today'
  if (target === tomorrow)  return 'Tomorrow'
  if (target === yesterday) return 'Yesterday'

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function TaskPanel({ onClose }: TaskPanelProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const dateStr = toISODate(selectedDate)
  const isToday = dateStr === toISODate(new Date())

  // Fetch all tasks — filter client-side for daily view, compute dots for calendar
  const { tasks: allTasks, loading, createTask, updateTask, deleteTask, toggleComplete } = useTasks()

  const tasks = useMemo(
    () => allTasks.filter(t => t.due_date === dateStr),
    [allTasks, dateStr]
  )

  const taskDates = useMemo(
    () => new Set(allTasks.map(t => t.due_date).filter(Boolean) as string[]),
    [allTasks]
  )

  const [editingId, setEditingId]   = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  function prevDay() { setSelectedDate(d => new Date(d.getTime() - 86400000)) }
  function nextDay() { setSelectedDate(d => new Date(d.getTime() + 86400000)) }
  function goToday() { setSelectedDate(new Date()) }

  const editingTask = editingId ? allTasks.find(t => t.id === editingId) : undefined

  const pending   = tasks.filter(t => !t.is_completed)
  const completed = tasks.filter(t => t.is_completed)

  return (
    <>
      <div className="flex flex-col h-full bg-bg-task-panel text-white select-none">
        {/* Mobile-only close bar */}
        {onClose && (
          <div className="lg:hidden flex items-center justify-between px-5 pt-4 pb-1">
            <span className="text-sm font-semibold text-white/70">Tasks</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close task panel"
              className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prevDay}
              aria-label="Previous day"
              className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={goToday}
              className="flex flex-col items-center gap-0.5"
              aria-label="Go to today"
            >
              <span className="text-base font-semibold text-white leading-none">
                {formatHeader(selectedDate)}
              </span>
              {!isToday && (
                <span className="text-[10px] text-white/40 leading-none mt-0.5">tap for today</span>
              )}
            </button>

            <button
              type="button"
              onClick={nextDay}
              aria-label="Next day"
              className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <p className="text-center text-[11px] text-white/40 mt-2">
            {selectedDate.toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </p>
        </div>

        {/* Mini Calendar */}
        <MiniCalendar
          selectedDate={selectedDate}
          taskDates={taskDates}
          onSelect={setSelectedDate}
        />

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {loading ? (
            <div className="pt-2">
              {Array.from({ length: 3 }).map((_, i) => <TaskItemSkeleton key={i} />)}
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/40 text-xs">No tasks for this day.</p>
              <p className="text-white/25 text-[11px] mt-1">Click below to add one.</p>
            </div>
          ) : (
            <>
              {pending.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={() => toggleComplete(task.id, true)}
                  onDelete={() => deleteTask(task.id)}
                  onEdit={() => setEditingId(task.id)}
                />
              ))}

              {completed.length > 0 && (
                <>
                  {pending.length > 0 && <div className="my-2 border-t border-white/10" />}
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1 font-medium">
                    Completed · {completed.length}
                  </p>
                  {completed.map(task => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => toggleComplete(task.id, false)}
                      onDelete={() => deleteTask(task.id)}
                      onEdit={() => setEditingId(task.id)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors w-full"
          >
            <Plus size={16} />
            <span>Add new task</span>
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <TaskForm
          defaultDate={dateStr}
          onSave={async (data) => {
            await createTask({ ...data, position: allTasks.length })
            setShowCreate(false)
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit form */}
      {editingTask && (
        <TaskForm
          task={editingTask}
          onSave={async (data) => {
            await updateTask(editingTask.id, data)
            setEditingId(null)
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  )
}
