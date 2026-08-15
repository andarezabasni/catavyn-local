import { Home, FileText, Tag, Pin, Trash2, Settings, Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import appLogo from '../assets/logo.png'

// Local desktop navigation. Mirrors the original Catavyn Sidebar look but drops
// cloud-only actions (sign out, collaboration, web task reminders). Uses simple
// view state instead of react-router so the offline shell stays self-contained.

export type LocalView = 'home' | 'notes' | 'tags' | 'pinned' | 'trash' | 'settings'

const NAV_ITEMS: { view: LocalView; icon: typeof Home; label: string }[] = [
  { view: 'home', icon: Home, label: 'Home' },
  { view: 'notes', icon: FileText, label: 'Notes' },
  { view: 'tags', icon: Tag, label: 'Tags' },
  { view: 'pinned', icon: Pin, label: 'Pinned' },
  { view: 'trash', icon: Trash2, label: 'Trash' },
  { view: 'settings', icon: Settings, label: 'Settings' },
]

export default function LocalLayout({
  active,
  onNavigate,
  children,
}: {
  active: LocalView
  onNavigate: (view: LocalView) => void
  children: React.ReactNode
}) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <div className="min-h-screen bg-bg-page">
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-20 flex-col items-center bg-bg-sidebar border-r border-border py-6 z-10">
        <img src={appLogo} alt="Catavyn" className="w-10 h-10 mb-8 object-contain" />
        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ view, icon: Icon, label }) => (
            <button
              key={view}
              type="button"
              onClick={() => onNavigate(view)}
              className={`flex flex-col items-center gap-1 w-14 py-3 rounded-xl transition-colors ${
                active === view
                  ? 'bg-accent-gold/15 text-accent-gold'
                  : 'text-text-muted hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex flex-col items-center gap-1 w-14 py-3 rounded-xl text-text-muted hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          {isDark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
          <span className="text-[10px] font-medium">{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </aside>

      {/* Mobile / narrow-window bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around bg-bg-sidebar border-t border-border z-10 py-2">
        {NAV_ITEMS.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            type="button"
            onClick={() => onNavigate(view)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors ${
              active === view ? 'text-accent-gold' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Icon size={19} strokeWidth={1.75} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>

      <main className="md:ml-20 pb-20 md:pb-0 min-h-screen">{children}</main>
    </div>
  )
}
