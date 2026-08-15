import { useCallback, useEffect, useState } from 'react'
import { localdb, type LocalCategory, type CategoryPatch } from '../../lib/localdb'

// Local replacement for the Supabase `useCategories`. Same public surface.
export type Category = LocalCategory

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCategories(await localdb.listCategories())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchCategories()
  }, [fetchCategories])

  const createCategory = useCallback(
    async (data: { name: string; icon?: string; color?: string }): Promise<Category | null> => {
      try {
        const created = await localdb.createCategory({ ...data, position: categories.length })
        setCategories(prev => [...prev, created])
        return created
      } catch (e) {
        setError(String(e))
        return null
      }
    },
    [categories.length],
  )

  const updateCategory = useCallback(async (id: string, patch: CategoryPatch) => {
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)))
    try {
      const updated = await localdb.updateCategory(id, patch)
      if (updated) setCategories(prev => prev.map(c => (c.id === id ? updated : c)))
    } catch (e) {
      setError(String(e))
      await fetchCategories()
    }
  }, [fetchCategories])

  const deleteCategory = useCallback(async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id))
    try {
      await localdb.deleteCategory(id)
    } catch (e) {
      setError(String(e))
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
