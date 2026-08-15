import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  placeholder?: string
  onSearch: (query: string) => void
  className?: string
}

export default function SearchBar({
  placeholder = 'Search…',
  onSearch,
  className = '',
}: SearchBarProps) {
  const [value, setValue] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => onSearch(value.trim()), 300)
    return () => clearTimeout(timer)
  }, [value, onSearch])

  function clear() {
    setValue('')
    onSearch('')
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <Search
        size={15}
        className="absolute left-3 text-text-muted pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-card border border-border rounded-xl pl-9 pr-8 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold/50 transition-shadow"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-3 text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
