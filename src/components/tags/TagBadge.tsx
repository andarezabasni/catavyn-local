import type { TagView as Tag } from '../../types/entities'

interface TagBadgeProps {
  tag: Tag
  onClick?: () => void
}

export default function TagBadge({ tag, onClick }: TagBadgeProps) {
  const cls =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white'
  const style = { backgroundColor: tag.color }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} hover:opacity-80 transition-opacity`}
        style={style}
      >
        {tag.name}
      </button>
    )
  }

  return (
    <span className={cls} style={style}>
      {tag.name}
    </span>
  )
}
