import { Clock, Trash2 } from 'lucide-react'
import type { TaskView as Task } from '../../types/entities'
import PriorityBadge from './PriorityBadge'

interface TaskItemProps {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onEdit?: () => void
}

export default function TaskItem({ task, onToggle, onDelete, onEdit }: TaskItemProps) {
  const timeLabel = task.due_time
    ? task.due_time.slice(0, 5)
    : null

  return (
    <div className="group flex items-start gap-2.5 py-2.5 border-b border-white/10 last:border-0">
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={task.is_completed ? 'Mark incomplete' : 'Mark complete'}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all active:scale-90 ${
          task.is_completed
            ? 'bg-accent-green border-accent-green'
            : 'border-white/40 hover:border-white/70 bg-transparent'
        }`}
      >
        {task.is_completed && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onEdit}
          className={`w-full text-left text-sm font-medium leading-snug transition-colors ${
            task.is_completed
              ? 'line-through text-white/40'
              : 'text-white/90 hover:text-white'
          }`}
        >
          {task.title}
        </button>

        {task.description && (
          <p className={`text-xs mt-0.5 leading-relaxed truncate ${
            task.is_completed ? 'text-white/25' : 'text-white/50'
          }`}>
            {task.description}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <PriorityBadge priority={task.priority} />

          {/* Due time */}
          {timeLabel && (
            <span className="flex items-center gap-1 text-[10px] text-white/50">
              <Clock size={10} />
              {timeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete task"
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
