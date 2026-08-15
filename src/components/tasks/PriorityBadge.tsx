import type { TaskView as Task } from '../../types/entities'

interface PriorityBadgeProps {
  priority: Task['priority']
  className?: string
}

const PRIORITY_META: Record<Task['priority'], { bg: string; label: string }> = {
  high:   { bg: 'bg-priority-high', label: 'High' },
  medium: { bg: 'bg-priority-med',  label: 'Med' },
  low:    { bg: 'bg-priority-low',  label: 'Low' },
}

export default function PriorityBadge({ priority, className = '' }: PriorityBadgeProps) {
  const { bg, label } = PRIORITY_META[priority]
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-text-primary ${bg} ${className}`}
    >
      {label}
    </span>
  )
}
