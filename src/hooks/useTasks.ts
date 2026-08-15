import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { toast } from '../lib/toast'
import type { Database } from '../lib/database.types'

export type Task = Database['public']['Tables']['tasks']['Row']
type TaskInsert = Omit<Database['public']['Tables']['tasks']['Insert'], 'user_id'>
type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export function useTasks(date?: string) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })

    if (date) {
      query = query.eq('due_date', date)
    }

    const { data, error } = await query

    if (error) {
      setError(error.message)
    } else {
      setTasks(data ?? [])
    }
    setLoading(false)
  }, [user, date])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const createTask = useCallback(async (data: TaskInsert): Promise<Task | null> => {
    if (!user) return null

    const payload = {
      user_id: user.id,
      description: '',
      is_completed: false,
      priority: 'low' as const,
      position: tasks.length,
      ...data,
    }

    const tempId = `temp-${Date.now()}`
    const optimistic: Task = {
      id: tempId,
      due_date: null,
      due_time: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    }
    setTasks(prev => [...prev, optimistic])

    const { data: created, error } = await supabase
      .from('tasks')
      .insert(payload)
      .select()
      .single()

    if (error) {
      setTasks(prev => prev.filter(t => t.id !== tempId))
      setError(error.message)
      toast.error('Failed to create task')
      return null
    }

    setTasks(prev => prev.map(t => t.id === tempId ? created : t))
    return created
  }, [user, tasks.length])

  const updateTask = useCallback(async (id: string, data: TaskUpdate) => {
    const now = new Date().toISOString()
    const patch = { ...data, updated_at: now }

    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

    const { error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', id)

    if (error) {
      setError(error.message)
      toast.error('Failed to update task')
      await fetchTasks()
    }
  }, [fetchTasks])

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
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
