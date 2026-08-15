function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-text-muted/15 rounded-lg ${className}`} />
}

export function NoteCardSkeleton() {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
      <Block className="h-4 w-3/4" />
      <Block className="h-3 w-full" />
      <Block className="h-3 w-2/3" />
      <div className="flex gap-2 mt-1">
        <Block className="h-5 w-12 rounded-full" />
        <Block className="h-5 w-16 rounded-full" />
      </div>
    </div>
  )
}

export function NoteListRowSkeleton() {
  return (
    <div className="bg-bg-card rounded-xl border border-border px-4 py-3 flex items-baseline gap-4">
      <Block className="h-4 flex-1 max-w-48" />
      <Block className="h-3 flex-[2] hidden sm:block" />
      <Block className="h-3 w-12 shrink-0" />
    </div>
  )
}

export function CategoryCardSkeleton() {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <Block className="h-7 w-7 rounded-md mb-3" />
      <Block className="h-4 w-2/3 mb-2" />
      <Block className="h-3 w-1/3" />
    </div>
  )
}

export function TagCardSkeleton() {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <Block className="h-4 w-4 rounded-full mb-3" />
      <Block className="h-4 w-2/3 mb-2" />
      <Block className="h-3 w-1/3" />
    </div>
  )
}

export function TaskItemSkeleton() {
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-white/10 last:border-0">
      <div className="mt-0.5 shrink-0 w-4 h-4 rounded border-2 border-white/20 animate-pulse" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="h-3.5 w-3/4 bg-white/15 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-white/10 rounded animate-pulse" />
      </div>
    </div>
  )
}
