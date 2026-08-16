import { invoke } from '@tauri-apps/api/core'

// Thin typed wrapper around the Rust/Tauri command layer. This is the ONLY
// place the renderer talks to the local database — no raw SQL lives in the
// frontend. Field shapes mirror the existing Catavyn types so UI components
// can be reused with minimal changes.

export interface LocalNote {
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

export interface LocalCategory {
  id: string
  name: string
  icon: string
  color: string
  position: number
  created_at: string
  updated_at: string
}

export interface LocalTag {
  id: string
  name: string
  color: string
  created_at: string
}

export interface NoteTagLink {
  note_id: string
  tag_id: string
}

export interface LocalTask {
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

export interface LocalAttachment {
  id: string
  note_id: string
  original_filename: string
  stored_filename: string
  relative_path: string
  mime_type: string
  file_size: number
  width: number | null
  height: number | null
  thumbnail_path: string | null
  created_at: string
  updated_at: string
}

export interface StorageStatus {
  configured: boolean
  data_dir: string | null
}

export interface DueReminder {
  task_id: string
  title: string
  due_date: string
  due_time: string
}

export interface VaultStatus {
  exists: boolean
  unlocked: boolean
}

export interface VaultItemSummary {
  item_id: string
  item_type: string
  created_at: string
  updated_at: string
  // Non-secret display label derived from the item (e.g. account name, TOTP
  // issuer, note title). Empty string when the item has no obvious label.
  label: string
}

export interface VaultItem {
  item_id: string
  item_type: string
  created_at: string
  updated_at: string
  payload: Record<string, unknown>
}

export interface GeneratedTotp {
  code: string
  seconds_remaining: number
}

export interface BackupResult {
  path: string
  file_count: number
  total_size: number
}

export interface RestoreValidation {
  created_at: string
  file_count: number
  total_size: number
  token: string
}

export interface StorageUsage {
  database_bytes: number
  images_bytes: number
  files_bytes: number
  thumbnails_bytes: number
  attachments_bytes: number
  backups_bytes: number
  total_bytes: number
}

// --- input shapes ---------------------------------------------------------

export interface NewNoteInput {
  title?: string
  content?: string
  category_id?: string | null
  parent_id?: string | null
}

// Nested-optional fields: omit to leave unchanged, pass null to clear.
export interface NotePatch {
  title?: string
  content?: string
  category_id?: string | null
  is_pinned?: boolean
  pin_hash?: string | null
  parent_id?: string | null
}

export interface NoteQuery {
  deleted?: boolean
  parent_id?: string
  root_only?: boolean
  search?: string
}

export interface NewCategoryInput {
  name: string
  icon?: string
  color?: string
  position?: number
}

export interface CategoryPatch {
  name?: string
  icon?: string
  color?: string
  position?: number
}

export interface NewTagInput {
  name: string
  color?: string
}

export interface NewTaskInput {
  title: string
  description?: string
  due_date?: string | null
  due_time?: string | null
  priority?: 'low' | 'medium' | 'high'
  position?: number
}

export interface TaskPatch {
  title?: string
  description?: string
  due_date?: string | null
  due_time?: string | null
  is_completed?: boolean
  priority?: 'low' | 'medium' | 'high'
  position?: number
}

export const localdb = {
  // storage
  getStorageStatus: () => invoke<StorageStatus>('get_storage_status'),
  chooseDataDir: () => invoke<string | null>('choose_data_dir'),
  openDataDir: (path: string) => invoke<StorageStatus>('open_data_dir', { path }),
  openDataDirInExplorer: () => invoke<void>('open_data_dir_in_explorer'),
  getStorageUsage: () => invoke<StorageUsage>('get_storage_usage'),
  migrateStorage: () => invoke<string | null>('migrate_storage'),
  deleteAllData: (confirmPath: string) =>
    invoke<StorageStatus>('delete_all_data', { confirmPath }),

  // notes
  listNotes: (query: NoteQuery = {}) => invoke<LocalNote[]>('list_notes', { query }),
  getNote: (id: string) => invoke<LocalNote | null>('get_note', { id }),
  createNote: (input: NewNoteInput = {}) => invoke<LocalNote>('create_note', { input }),
  updateNote: (id: string, patch: NotePatch) =>
    invoke<LocalNote | null>('update_note', { id, patch }),
  deleteNote: (id: string) => invoke<void>('delete_note', { id }),
  restoreNote: (id: string) => invoke<void>('restore_note', { id }),
  permanentlyDeleteNote: (id: string) => invoke<void>('permanently_delete_note', { id }),
  emptyTrash: () => invoke<number>('empty_trash'),

  // categories
  listCategories: () => invoke<LocalCategory[]>('list_categories'),
  createCategory: (input: NewCategoryInput) => invoke<LocalCategory>('create_category', { input }),
  updateCategory: (id: string, patch: CategoryPatch) =>
    invoke<LocalCategory | null>('update_category', { id, patch }),
  deleteCategory: (id: string) => invoke<void>('delete_category', { id }),

  // tags
  listTags: () => invoke<LocalTag[]>('list_tags'),
  listNoteTagLinks: () => invoke<NoteTagLink[]>('list_note_tag_links'),
  createTag: (input: NewTagInput) => invoke<LocalTag>('create_tag', { input }),
  deleteTag: (id: string) => invoke<void>('delete_tag', { id }),
  attachTag: (noteId: string, tagId: string) =>
    invoke<void>('attach_tag', { noteId, tagId }),
  detachTag: (noteId: string, tagId: string) =>
    invoke<void>('detach_tag', { noteId, tagId }),

  // tasks
  listTasks: (dueDate?: string) => invoke<LocalTask[]>('list_tasks', { dueDate: dueDate ?? null }),
  createTask: (input: NewTaskInput) => invoke<LocalTask>('create_task', { input }),
  updateTask: (id: string, patch: TaskPatch) =>
    invoke<LocalTask | null>('update_task', { id, patch }),
  deleteTask: (id: string) => invoke<void>('delete_task', { id }),

  // attachments — bytes are sent/received as number arrays (Tauri encodes
  // efficiently over IPC; we avoid base64 for filesystem-backed files).
  listAttachments: (noteId: string) =>
    invoke<LocalAttachment[]>('list_attachments', { noteId }),  addAttachment: (noteId: string, originalFilename: string, mimeType: string, bytes: Uint8Array) =>
    invoke<LocalAttachment>('add_attachment', {
      noteId,
      originalFilename,
      mimeType,
      bytes: Array.from(bytes),
    }),
  readAttachment: (id: string) =>
    invoke<number[]>('read_attachment', { id }).then(a => new Uint8Array(a)),
  readAttachmentThumbnail: (id: string) =>
    invoke<number[]>('read_attachment_thumbnail', { id }).then(a => new Uint8Array(a)),
  deleteAttachment: (id: string) => invoke<void>('delete_attachment', { id }),
  revealAttachment: (id: string) => invoke<void>('reveal_attachment', { id }),

  // settings (key/value)
  getSetting: (key: string) => invoke<string | null>('get_setting', { key }),
  setSetting: (key: string, value: string) => invoke<void>('set_setting', { key, value }),

  // task reminders
  getRemindersEnabled: () => invoke<boolean>('get_reminders_enabled'),
  setRemindersEnabled: (enabled: boolean) =>
    invoke<void>('set_reminders_enabled', { enabled }),
  // now_local is the caller's local wall-clock time (YYYY-MM-DDTHH:MM:SS);
  // the Windows timezone lives in the frontend, never in the database.
  pollDueReminders: (nowLocal: string) =>
    invoke<DueReminder[]>('poll_due_reminders', { nowLocal }),
  // vault — keys never cross this boundary; only status, item metadata, and
  // the specific decrypted fields the UI requests are returned.
  vaultStatus: () => invoke<VaultStatus>('vault_status'),
  vaultCreate: (credential: string) => invoke<void>('vault_create', { credential }),
  vaultUnlock: (credential: string) => invoke<void>('vault_unlock', { credential }),
  vaultLock: () => invoke<void>('vault_lock'),
  vaultKeepalive: () => invoke<boolean>('vault_keepalive'),
  vaultListItems: () => invoke<VaultItemSummary[]>('vault_list_items'),
  vaultGetItem: (itemId: string) => invoke<VaultItem | null>('vault_get_item', { itemId }),
  vaultCreateItem: (itemType: string, payload: Record<string, unknown>) =>
    invoke<string>('vault_create_item', { input: { item_type: itemType, payload } }),
  vaultUpdateItem: (itemId: string, payload: Record<string, unknown>) =>
    invoke<void>('vault_update_item', { itemId, payload }),
  vaultDeleteItem: (itemId: string) => invoke<void>('vault_delete_item', { itemId }),
  vaultChangeMasterCredential: (oldCredential: string, newCredential: string) =>
    invoke<void>('vault_change_master_credential', { oldCredential, newCredential }),
  vaultGenerateTotp: (itemId: string) =>
    invoke<GeneratedTotp>('vault_generate_totp', { itemId }),
  vaultGetAutoLock: () => invoke<number>('vault_get_auto_lock'),
  vaultSetAutoLock: (secs: number) => invoke<void>('vault_set_auto_lock', { secs }),

  // backup & restore
  createBackup: () => invoke<BackupResult | null>('create_backup'),
  restoreValidate: () => invoke<RestoreValidation | null>('restore_validate'),
  restoreCancel: (token: string) => invoke<void>('restore_cancel', { token }),
  restoreActivate: (token: string, allowExisting: boolean) =>
    invoke<string | null>('restore_activate', { token, allowExisting }),
}
