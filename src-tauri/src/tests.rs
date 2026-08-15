//! Integration tests for the Phase 1 local data layer. All tests operate in OS
//! temp directories — the user's real Catavyn data is never touched.

use rusqlite::Connection;

use crate::config;
use crate::db;
use crate::repo::{categories, notes, tags, tasks};
use crate::storage;

/// Create a fresh, migrated database in a unique temp data directory.
fn fresh_db() -> (std::path::PathBuf, Connection) {
    let dir = std::env::temp_dir().join(format!("catavyn_it_{}", uuid::Uuid::new_v4()));
    config::ensure_data_dir(&dir).unwrap();
    let mut conn = db::open(&config::db_path(&dir)).unwrap();
    db::migrate(&mut conn).unwrap();
    (dir, conn)
}

fn cleanup(dir: &std::path::Path) {
    // Best-effort; parent temp folder holds everything for this test.
    if let Some(parent) = dir.parent() {
        let _ = parent;
    }
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn migrations_apply_and_are_idempotent() {
    let (dir, mut conn) = fresh_db();
    let uv: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(uv, db::migration_count() as i64);
    // Running migrate again is a no-op.
    db::migrate(&mut conn).unwrap();
    let uv2: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(uv, uv2);
    cleanup(&dir);
}

#[test]
fn note_crud_delete_restore() {
    let (dir, conn) = fresh_db();

    // create
    let note = notes::create(
        &conn,
        notes::NewNote { title: Some("First".into()), content: Some("body".into()), ..Default::default() },
    )
    .unwrap();

    // edit
    let updated = notes::update(
        &conn,
        &note.id,
        notes::NotePatch { title: Some("First edited".into()), is_pinned: Some(true), ..Default::default() },
    )
    .unwrap()
    .unwrap();
    assert_eq!(updated.title, "First edited");
    assert!(updated.is_pinned);

    // list active (root)
    let active = notes::list(&conn, notes::NoteQuery { root_only: Some(true), ..Default::default() }).unwrap();
    assert_eq!(active.len(), 1);

    // soft delete -> not in active, in trash
    notes::soft_delete(&conn, &note.id).unwrap();
    let active = notes::list(&conn, notes::NoteQuery { root_only: Some(true), ..Default::default() }).unwrap();
    assert_eq!(active.len(), 0);
    let trashed = notes::list(&conn, notes::NoteQuery { deleted: Some(true), ..Default::default() }).unwrap();
    assert_eq!(trashed.len(), 1);

    // restore
    notes::restore(&conn, &note.id).unwrap();
    let active = notes::list(&conn, notes::NoteQuery { root_only: Some(true), ..Default::default() }).unwrap();
    assert_eq!(active.len(), 1);

    // hard delete
    notes::hard_delete(&conn, &note.id).unwrap();
    assert!(notes::get(&conn, &note.id).unwrap().is_none());

    cleanup(&dir);
}

#[test]
fn sub_notes_cascade_on_soft_delete_and_restore() {
    let (dir, conn) = fresh_db();
    let parent = notes::create(&conn, notes::NewNote { title: Some("Parent".into()), ..Default::default() }).unwrap();
    let child = notes::create(
        &conn,
        notes::NewNote { title: Some("Child".into()), parent_id: Some(parent.id.clone()), ..Default::default() },
    )
    .unwrap();

    // Trashing the parent trashes the child too.
    notes::soft_delete(&conn, &parent.id).unwrap();
    assert!(notes::get(&conn, &child.id).unwrap().unwrap().deleted_at.is_some());

    // Restoring the parent restores the child.
    notes::restore(&conn, &parent.id).unwrap();
    assert!(notes::get(&conn, &child.id).unwrap().unwrap().deleted_at.is_none());

    // Hard-deleting the parent cascades to the child (FK ON DELETE CASCADE).
    notes::hard_delete(&conn, &parent.id).unwrap();
    assert!(notes::get(&conn, &child.id).unwrap().is_none());

    cleanup(&dir);
}

#[test]
fn note_cannot_be_its_own_parent() {
    let (dir, conn) = fresh_db();
    let note = notes::create(&conn, notes::NewNote::default()).unwrap();
    let err = notes::update(
        &conn,
        &note.id,
        notes::NotePatch { parent_id: Some(Some(note.id.clone())), ..Default::default() },
    );
    assert!(err.is_err());
    cleanup(&dir);
}

#[test]
fn fts_search_matches_title_and_content() {
    let (dir, conn) = fresh_db();
    notes::create(&conn, notes::NewNote { title: Some("Grocery list".into()), content: Some("milk and eggs".into()), ..Default::default() }).unwrap();
    notes::create(&conn, notes::NewNote { title: Some("Meeting".into()), content: Some("discuss budget".into()), ..Default::default() }).unwrap();

    let by_title = notes::list(&conn, notes::NoteQuery { search: Some("grocery".into()), ..Default::default() }).unwrap();
    assert_eq!(by_title.len(), 1);
    assert_eq!(by_title[0].title, "Grocery list");

    let by_content = notes::list(&conn, notes::NoteQuery { search: Some("budget".into()), ..Default::default() }).unwrap();
    assert_eq!(by_content.len(), 1);
    assert_eq!(by_content[0].title, "Meeting");

    // Prefix search.
    let prefix = notes::list(&conn, notes::NoteQuery { search: Some("egg".into()), ..Default::default() }).unwrap();
    assert_eq!(prefix.len(), 1);

    // Punctuation must not break FTS (would otherwise be a syntax error).
    let safe = notes::list(&conn, notes::NoteQuery { search: Some("milk\"".into()), ..Default::default() }).unwrap();
    assert_eq!(safe.len(), 1);

    // Updating a note keeps the index in sync.
    let m = &by_content[0];
    notes::update(&conn, &m.id, notes::NotePatch { content: Some("discuss revenue".into()), ..Default::default() }).unwrap();
    let stale = notes::list(&conn, notes::NoteQuery { search: Some("budget".into()), ..Default::default() }).unwrap();
    assert_eq!(stale.len(), 0);

    cleanup(&dir);
}

#[test]
fn categories_and_note_relationship() {
    let (dir, conn) = fresh_db();
    let cat = categories::create(&conn, categories::NewCategory { name: "Work".into(), icon: None, color: None, position: None }).unwrap();
    let note = notes::create(&conn, notes::NewNote { title: Some("Task".into()), category_id: Some(cat.id.clone()), ..Default::default() }).unwrap();
    assert_eq!(note.category_id.as_deref(), Some(cat.id.as_str()));

    // Deleting the category NULLs the note's category_id (SET NULL), note kept.
    categories::delete(&conn, &cat.id).unwrap();
    let n = notes::get(&conn, &note.id).unwrap().unwrap();
    assert!(n.category_id.is_none());

    // Empty name rejected.
    assert!(categories::create(&conn, categories::NewCategory { name: "  ".into(), icon: None, color: None, position: None }).is_err());

    cleanup(&dir);
}

#[test]
fn tags_attach_detach_and_unique() {
    let (dir, conn) = fresh_db();
    let note = notes::create(&conn, notes::NewNote::default()).unwrap();
    let tag = tags::create(&conn, tags::NewTag { name: "urgent".into(), color: None }).unwrap();

    tags::attach(&conn, &note.id, &tag.id).unwrap();
    // idempotent
    tags::attach(&conn, &note.id, &tag.id).unwrap();
    let links = tags::list_links(&conn).unwrap();
    assert_eq!(links.len(), 1);

    tags::detach(&conn, &note.id, &tag.id).unwrap();
    assert_eq!(tags::list_links(&conn).unwrap().len(), 0);

    // Duplicate tag name rejected (UNIQUE), no panic.
    assert!(tags::create(&conn, tags::NewTag { name: "urgent".into(), color: None }).is_err());

    // Deleting a tag removes its links but keeps the note.
    tags::attach(&conn, &note.id, &tag.id).unwrap();
    tags::delete(&conn, &tag.id).unwrap();
    assert_eq!(tags::list_links(&conn).unwrap().len(), 0);
    assert!(notes::get(&conn, &note.id).unwrap().is_some());

    cleanup(&dir);
}

#[test]
fn tasks_crud_and_validation() {
    let (dir, conn) = fresh_db();
    let task = tasks::create(
        &conn,
        tasks::NewTask { title: "Do thing".into(), description: None, due_date: Some("2025-01-01".into()), due_time: Some("09:00".into()), priority: Some("high".into()), position: None },
    )
    .unwrap();
    assert_eq!(task.priority, "high");

    let done = tasks::update(&conn, &task.id, tasks::TaskPatch { is_completed: Some(true), ..Default::default() }).unwrap().unwrap();
    assert!(done.is_completed);

    // filter by date
    assert_eq!(tasks::list(&conn, Some("2025-01-01")).unwrap().len(), 1);
    assert_eq!(tasks::list(&conn, Some("2030-01-01")).unwrap().len(), 0);

    // invalid priority rejected
    assert!(tasks::create(&conn, tasks::NewTask { title: "x".into(), description: None, due_date: None, due_time: None, priority: Some("urgent".into()), position: None }).is_err());
    // empty title rejected
    assert!(tasks::create(&conn, tasks::NewTask { title: "  ".into(), description: None, due_date: None, due_time: None, priority: None, position: None }).is_err());

    tasks::delete(&conn, &task.id).unwrap();
    assert_eq!(tasks::list(&conn, None).unwrap().len(), 0);

    cleanup(&dir);
}

#[test]
fn empty_trash_removes_only_trashed() {
    let (dir, conn) = fresh_db();
    let keep = notes::create(&conn, notes::NewNote { title: Some("keep".into()), ..Default::default() }).unwrap();
    let trash = notes::create(&conn, notes::NewNote { title: Some("trash".into()), ..Default::default() }).unwrap();
    notes::soft_delete(&conn, &trash.id).unwrap();

    let removed = notes::empty_trash(&conn).unwrap();
    assert_eq!(removed, 1);
    assert!(notes::get(&conn, &keep.id).unwrap().is_some());
    assert!(notes::get(&conn, &trash.id).unwrap().is_none());

    cleanup(&dir);
}

#[test]
fn storage_usage_counts_only_data_dir() {
    let (dir, conn) = fresh_db();
    notes::create(&conn, notes::NewNote { title: Some("x".into()), content: Some("y".repeat(1000)), ..Default::default() }).unwrap();
    drop(conn); // flush

    let usage = storage::usage(&dir);
    assert!(usage.database_bytes > 0);
    assert_eq!(usage.total_bytes, usage.database_bytes + usage.attachments_bytes + usage.backups_bytes);

    cleanup(&dir);
}

#[test]
fn safe_storage_migration_verifies_and_preserves_source() {
    let base = std::env::temp_dir().join(format!("catavyn_mig_{}", uuid::Uuid::new_v4()));
    let src = base.join("CatavynData");
    let dst = base.join("CatavynDataTest");
    config::ensure_data_dir(&src).unwrap();

    let note_id = {
        let mut conn = db::open(&config::db_path(&src)).unwrap();
        db::migrate(&mut conn).unwrap();
        notes::create(&conn, notes::NewNote { title: Some("migrate me".into()), ..Default::default() }).unwrap().id
    };

    // Migrate + verify.
    storage::migrate_data_dir(&src, &dst, false).unwrap();

    // Source still intact.
    {
        let conn = db::open(&config::db_path(&src)).unwrap();
        assert!(notes::get(&conn, &note_id).unwrap().is_some());
    }
    // Destination has the data.
    {
        let conn = db::open(&config::db_path(&dst)).unwrap();
        assert!(notes::get(&conn, &note_id).unwrap().is_some());
    }

    // Refuses to overwrite an existing DB unless allowed.
    assert!(storage::migrate_data_dir(&src, &dst, false).is_err());
    // Source remains readable after the refused migration.
    {
        let conn = db::open(&config::db_path(&src)).unwrap();
        assert!(notes::get(&conn, &note_id).unwrap().is_some());
    }

    std::fs::remove_dir_all(&base).ok();
}

#[test]
fn failed_migration_leaves_source_untouched() {
    let base = std::env::temp_dir().join(format!("catavyn_fail_{}", uuid::Uuid::new_v4()));
    let src = base.join("CatavynData");
    config::ensure_data_dir(&src).unwrap();
    let note_id = {
        let mut conn = db::open(&config::db_path(&src)).unwrap();
        db::migrate(&mut conn).unwrap();
        notes::create(&conn, notes::NewNote { title: Some("safe".into()), ..Default::default() }).unwrap().id
    };

    // Nested destination is rejected before any copy happens.
    let nested = src.join("inner");
    assert!(storage::migrate_data_dir(&src, &nested, false).is_err());

    // Source database is completely intact.
    let conn = db::open(&config::db_path(&src)).unwrap();
    assert!(notes::get(&conn, &note_id).unwrap().is_some());

    std::fs::remove_dir_all(&base).ok();
}

#[test]
fn wipe_data_dir_resets_to_empty_state() {
    let (dir, conn) = fresh_db();
    notes::create(&conn, notes::NewNote { title: Some("bye".into()), ..Default::default() }).unwrap();
    drop(conn);

    storage::wipe_data_dir(&dir).unwrap();

    // Structure recreated, DB reinitializable and empty.
    assert!(dir.join("attachments").is_dir());
    let mut conn = db::open(&config::db_path(&dir)).unwrap();
    db::migrate(&mut conn).unwrap();
    assert_eq!(notes::list(&conn, notes::NoteQuery::default()).unwrap().len(), 0);

    cleanup(&dir);
}

#[test]
fn portability_note_readable_from_copied_dir() {
    let base = std::env::temp_dir().join(format!("catavyn_port_{}", uuid::Uuid::new_v4()));
    let a = base.join("CatavynData");
    let b = base.join("Copied");
    config::ensure_data_dir(&a).unwrap();

    let id = {
        let mut conn = db::open(&config::db_path(&a)).unwrap();
        db::migrate(&mut conn).unwrap();
        notes::create(&conn, notes::NewNote { title: Some("portable".into()), content: Some("data".into()), ..Default::default() }).unwrap().id
    };

    // Verified copy = the same path the migrate command uses.
    storage::migrate_data_dir(&a, &b, false).unwrap();
    let conn = db::open(&config::db_path(&b)).unwrap();
    let got = notes::get(&conn, &id).unwrap().unwrap();
    assert_eq!(got.content, "data");

    std::fs::remove_dir_all(&base).ok();
}
