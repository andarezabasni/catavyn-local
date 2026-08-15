export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          icon: string
          color: string
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          icon?: string
          color?: string
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          icon?: string
          color?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          id: string
          user_id: string
          category_id: string | null
          parent_id: string | null
          title: string
          content: string
          is_pinned: boolean
          pin_hash: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          category_id?: string | null
          parent_id?: string | null
          title?: string
          content?: string
          is_pinned?: boolean
          pin_hash?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          category_id?: string | null
          parent_id?: string | null
          title?: string
          content?: string
          is_pinned?: boolean
          pin_hash?: string | null
          updated_by?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          created_at?: string
        }
        Update: {
          display_name?: string | null
        }
        Relationships: []
      }
      note_collaborators: {
        Row: {
          note_id: string
          user_id: string
          invited_email: string
          can_edit: boolean
          added_at: string
        }
        Insert: {
          note_id: string
          user_id: string
          invited_email: string
          can_edit?: boolean
          added_at?: string
        }
        Update: {
          can_edit?: boolean
        }
        Relationships: []
      }
      note_activity: {
        Row: {
          id: string
          note_id: string
          user_id: string | null
          user_email: string | null
          action: 'created' | 'edited' | 'renamed' | 'shared'
          created_at: string
        }
        Insert: {
          id?: string
          note_id: string
          user_id?: string | null
          user_email?: string | null
          action: 'created' | 'edited' | 'renamed' | 'shared'
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
        }
        Relationships: []
      }
      note_tags: {
        Row: {
          note_id: string
          tag_id: string
        }
        Insert: {
          note_id: string
          tag_id: string
        }
        Update: {
          note_id?: string
          tag_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          user_id: string
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
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string
          due_date?: string | null
          due_time?: string | null
          is_completed?: boolean
          priority?: 'low' | 'medium' | 'high'
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string
          due_date?: string | null
          due_time?: string | null
          is_completed?: boolean
          priority?: 'low' | 'medium' | 'high'
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      lookup_profile_by_email: {
        Args: { lookup_email: string }
        Returns: { id: string; email: string }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
