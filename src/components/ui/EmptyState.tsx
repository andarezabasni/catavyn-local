import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <div className="flex justify-center mb-3">
        <Icon size={28} className="text-text-muted opacity-40" />
      </div>
      <p className="text-text-primary font-medium text-sm mb-1">{title}</p>
      {description && (
        <p className="text-text-muted text-xs mb-4">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-sm text-accent-gold font-medium hover:opacity-75 transition-opacity"
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}
