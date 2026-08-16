import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)
// Exported so local-first hooks can read it optionally (no provider = null)
// without throwing the way `useAuth()` does.
export { AuthContext }

function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>
    const message = [candidate.message, candidate.error_description, candidate.msg]
      .find(value => typeof value === 'string' && value.trim())

    if (typeof message === 'string') return message

    if (typeof candidate.status === 'number') {
      return `${fallback} (status ${candidate.status})`
    }
  }

  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signUp(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      })
      if (error) return { error: error.message, needsConfirmation: false }

      // Supabase returns a user with no identities (and no session) instead of
      // an error when the email is already registered, to avoid leaking which
      // emails exist. Detect that case explicitly so we can tell the user.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        return {
          error: 'An account with this email already exists. Try signing in instead.',
          needsConfirmation: false,
        }
      }

      return { error: null, needsConfirmation: data.session === null }
    } catch (error) {
      return {
        error: getAuthErrorMessage(error, 'Registration failed. Check Supabase Auth email/redirect settings.'),
        needsConfirmation: false,
      }
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    } catch (error) {
      return { error: getAuthErrorMessage(error, 'Sign in failed.') }
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function resetPasswordForEmail(email: string) {
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      return { error: error?.message ?? null }
    } catch (error) {
      return {
        error: getAuthErrorMessage(error, 'Password reset failed. Check Supabase Auth email/redirect settings.'),
      }
    }
  }

  async function updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      return { error: error?.message ?? null }
    } catch (error) {
      return { error: getAuthErrorMessage(error, 'Updating password failed.') }
    }
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      signUp,
      signIn,
      signOut,
      resetPasswordForEmail,
      updatePassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
