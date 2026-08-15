import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { Home, FileText, Tag, Pin, Trash2, LogOut, Moon, Sun, Coffee, Bell, BellOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useTaskReminders } from '../../hooks/useTaskReminders'
import SupportModal from '../ui/SupportModal'
import appLogo from '../../assets/logo.png'

const NAV_ITEMS = [
  { to: '/',        icon: Home,     label: 'Home'   },
  { to: '/notes',   icon: FileText, label: 'Notes'  },
  { to: '/tags',    icon: Tag,      label: 'Tags'   },
  { to: '/pinned',  icon: Pin,      label: 'Pinned' },
  { to: '/trash',   icon: Trash2,   label: 'Trash'  },
]

export default function Sidebar() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useTheme()
  const [showSupport, setShowSupport] = useState(false)
  const { supported, enabled: remindersOn, toggle: toggleReminders } = useTaskReminders()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Desktop sidebar — fixed left strip */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-20 flex-col items-center bg-bg-sidebar border-r border-border py-6 z-10">
        <img src={appLogo} alt="Catavyn" className="w-10 h-10 mb-8 object-contain" />

        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 w-14 py-3 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-accent-gold/15 text-accent-gold'
                    : 'text-text-muted hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
                }`
              }
            >
              <Icon size={20} strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        {supported && (
          <button
            type="button"
            onClick={() => void toggleReminders()}
            aria-label={remindersOn ? 'Turn off task reminders' : 'Turn on task reminders'}
            className={`flex flex-col items-center gap-1 w-14 py-3 rounded-xl transition-colors mb-1 ${
              remindersOn
                ? 'text-accent-gold hover:bg-accent-gold/10'
                : 'text-text-muted hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {remindersOn ? <Bell size={20} strokeWidth={1.75} /> : <BellOff size={20} strokeWidth={1.75} />}
            <span className="text-[10px] font-medium">Remind</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowSupport(true)}
          aria-label="Support Catavyn"
          className="flex flex-col items-center gap-1 w-14 py-3 rounded-xl text-text-muted hover:text-accent-gold hover:bg-accent-gold/10 transition-colors mb-1"
        >
          <Coffee size={20} strokeWidth={1.75} />
          <span className="text-[10px] font-medium">Support</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex flex-col items-center gap-1 w-14 py-3 rounded-xl text-text-muted hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors mb-1"
        >
          {isDark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
          <span className="text-[10px] font-medium">{isDark ? 'Light' : 'Dark'}</span>
        </button>

        <button
          onClick={handleSignOut}
          className="flex flex-col items-center gap-1 w-14 py-3 rounded-xl text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          aria-label="Sign out"
        >
          <LogOut size={20} strokeWidth={1.75} />
          <span className="text-[10px] font-medium">Out</span>
        </button>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around bg-bg-sidebar border-t border-border z-10 py-2">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                isActive
                  ? 'text-accent-gold'
                  : 'text-text-muted hover:text-text-secondary'
              }`
            }
          >
            <Icon size={20} strokeWidth={1.75} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-text-muted hover:text-text-secondary transition-colors"
        >
          {isDark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
          <span className="text-[10px] font-medium">{isDark ? 'Light' : 'Dark'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowSupport(true)}
          aria-label="Support Catavyn"
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-text-muted hover:text-accent-gold transition-colors"
        >
          <Coffee size={20} strokeWidth={1.75} />
          <span className="text-[10px] font-medium">Support</span>
        </button>

        <button
          onClick={handleSignOut}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-text-muted hover:text-red-500 transition-colors"
          aria-label="Sign out"
        >
          <LogOut size={20} strokeWidth={1.75} />
          <span className="text-[10px] font-medium">Out</span>
        </button>
      </nav>

      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
    </>
  )
}
