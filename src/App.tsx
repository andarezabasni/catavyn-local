import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Toaster from './components/ui/Toaster'
import MainLayout from './components/layout/MainLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import HomePage from './pages/HomePage'
import LandingPage from './pages/LandingPage'
import NotesPage from './pages/NotesPage'
import TagsPage from './pages/TagsPage'
import PinnedPage from './pages/PinnedPage'
import TrashPage from './pages/TrashPage'
import { useDesktopShortcuts } from './hooks/useDesktopShortcuts'
import { isTauri } from './lib/tauri'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return <MainLayout>{children}</MainLayout>
}

// "/" shows the marketing landing page to visitors and the app home to
// signed-in users — this also gives Google real content to index.
function RootRoute() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <MainLayout><HomePage /></MainLayout>
  return <LandingPage />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  useDesktopShortcuts()

  useEffect(() => {
    if (!isTauri()) return
    const block = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', block)
    return () => document.removeEventListener('contextmenu', block)
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<RootRoute />} />
      <Route path="/notes" element={<ProtectedRoute><NotesPage /></ProtectedRoute>} />
      <Route path="/tags" element={<ProtectedRoute><TagsPage /></ProtectedRoute>} />
      <Route path="/pinned" element={<ProtectedRoute><PinnedPage /></ProtectedRoute>} />
      <Route path="/trash" element={<ProtectedRoute><TrashPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
