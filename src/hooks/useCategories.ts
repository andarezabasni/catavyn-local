import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Database } from '../lib/database.types'

export type Category = Database['public']['Tables']['categories']['Row']
type CategoryInsert = Omit<Database['public']['Tables']['categories']['Insert'], 'user_id'>
type CategoryUpdate = Database['public']['Tables']['categories']['Update']

export function useCategories() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      setCategories(data ?? [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const createCategory = useCallback(async (data: CategoryInsert): Promise<Category | null> => {
    if (!user) return null

    const payload = {
      user_id: user.id,
      icon: '📁',
      color: '#8B7E6A',
      position: categories.length,
      ...data,
    }

    const tempId = `temp-${Date.now()}`
    const optimistic: Category = {
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    }
    setCategories(prev => [...prev, optimistic])

    const { data: created, error } = await supabase
      .from('categories')
      .insert(payload)
      .select()
      .single()

    if (error) {
      setCategories(prev => prev.filter(c => c.id !== tempId))
      setError(error.message)
      return null
    }

    setCategories(prev => prev.map(c => c.id === tempId ? created : c))
    return created
  }, [user, categories.length])

  const updateCategory = useCallback(async (id: string, data: CategoryUpdate) => {
    const patch = { ...data, updated_at: new Date().toISOString() }

    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

    const { error } = await supabase
      .from('categories')
      .update(patch)
      .eq('id', id)

    if (error) {
      setError(error.message)
      await fetchCategories()
    }
  }, [fetchCategories])

  const deleteCategory = useCallback(async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id))

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      await fetchCategories()
    }
  }, [fetchCategories])

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  }
}
