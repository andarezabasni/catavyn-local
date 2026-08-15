import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface ThemeContextValue {
  isDark: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(
    () => localStorage.getItem('catavyn-theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('catavyn-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme: () => setIsDark(p => !p) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
