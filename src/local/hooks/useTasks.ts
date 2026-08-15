import { useCallback, useEffect, useState } from 'react'
import { localdb, type LocalTask, type NewTaskInput, type TaskPatch } from '../../lib/localdb'
import { toast } from '../../lib/toast'

// Local replacement for the Supabase `useTasks`. Same public surface.
export type Task = LocalTask

export function useTasks(date?: string) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTasks(await localdb.listTasks(date))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void fetchTasks()
  }, [fetchTasks])

  const createTask = useCallback(async (data: NewTaskInput): Promise<Task | null> => {
    try {
      const created = await localdb.createTask({ position: tasks.length, ...data })
      setTasks(prev => [...prev, created])
      return created
    } catch (e) {
      setError(String(e))
      toast.error('Failed to create task')
      return null
    }
  }, [tasks.length])

  const updateTask = useCallback(async (id: string, data: TaskPatch) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...data } as Task : t)))
    try {
      const updated = await localdb.updateTask(id, data)
      if (updated) setTasks(prev => prev.map(t => (t.id === id ? updated : t)))
    } catch (e) {
      setError(String(e))
      toast.error('Failed to update task')
      await fetchTasks()
    }
  }, [fetchTasks])

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await localdb.deleteTask(id)
    } catch (e) {
      setError(String(e))
      toast.error('Failed to delete task')
      await fetchTasks()
    }
  }, [fetchTasks])

  const toggleComplete = useCallback(async (id: string, completed: boolean) => {
    await updateTask(id, { is_completed: completed })
  }, [updateTask])

  return {
    tasks,
    loading,
    error,
    refetch: fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    toggleComplete,
  }
}
