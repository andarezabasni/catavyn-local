// Shared presentational entity types. These describe only the fields the UI
// components actually render — deliberately free of persistence-specific
// columns (user_id, updated_by, etc.) so the same components work with both the
// web (Supabase) and local (SQLite) data layers.

export interface NoteView {
  id: string
  category_id: string | null
  parent_id: string | null
  title: string
  content: string
  is_pinned: boolean
  pin_hash: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface TagView {
  id: string
  name: string
  color: string
  created_at: string
}

export interface CategoryView {
  id: string
  name: string
  icon: string
  color: string
  position: number
  created_at: string
  updated_at: string
}

export interface TaskView {
  id: string
  title: string
  description: string
  due_date: string | null
  due_time: string | null
  is_completed: boolean
  priority: 'low' | 'medium' | 'high'
  position: number
  created_at: string
  updated_at: string
}
