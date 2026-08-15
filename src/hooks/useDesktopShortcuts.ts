import { useEffect } from 'react'
import { useNavigate } from 'react-router'

const SHORTCUTS: Record<string, string> = {
  '1': '/',
  '2': '/notes',
  '3': '/tags',
  '4': '/pinned',
  '5': '/trash',
}

export function useDesktopShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      // Don't intercept inside text inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return

      const route = SHORTCUTS[e.key]
      if (route) {
        e.preventDefault()
        navigate(route)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])
}
