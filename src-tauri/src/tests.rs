//! Integration tests for the Phase 1 local data layer. All tests operate in OS
//! temp directories — the user's real Catavyn data is never touched.

use rusqlite::Connection;

use crate::attachments as fs_attach;
use crate::config;
use crate::db;
use crate::repo::{attachments, categories, notes, tags, tasks};
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

// A small real PNG (generated in-memory) so `image` can decode dimensions.
fn tiny_png() -> Vec<u8> {
    let img = image::RgbImage::from_pixel(4, 3, image::Rgb([10, 20, 30]));
    let mut buf = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(img)
        .write_to(&mut buf, image::ImageFormat::Png)
        .unwrap();
    buf.into_inner()
}

// Build a larger real PNG (800x600) to force thumbnail generation.
fn big_png() -> Vec<u8> {
    let img = image::RgbImage::from_fn(800, 600, |x, _| {
        image::Rgb([(x % 256) as u8, 100, 150])
    });
    let mut buf = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(img)
        .write_to(&mut buf, image::ImageFormat::Png)
        .unwrap();
    buf.into_inner()
}

#[test]
fn attachment_metadata_and_file_lifecycle() {
    let (dir, conn) = fresh_db();
    let note = notes::create(&conn, notes::NewNote { title: Some("with image".into()), ..Default::default() }).unwrap();

    // Store a small image (no thumbnail expected).
    let id = attachments::generate_id();
    let png = tiny_png();
    let stored = fs_attach::store_attachment(&dir, &id, "user photo.png", "image/png", &png).unwrap();
    assert!(stored.stored_filename.starts_with(&id), "stored filename is UUID-based, not user-provided");
    assert!(stored.relative_path.starts_with("attachments/images/"));
    assert_eq!(stored.width, Some(4));
    assert_eq!(stored.height, Some(3));
    assert!(stored.thumbnail_path.is_none(), "tiny image needs no thumbnail");

    let att = attachments::create(
        &conn,
        &id,
        attachments::NewAttachment {
            note_id: note.id.clone(),
            original_filename: "user photo.png".into(),
            stored_filename: stored.stored_filename.clone(),
            relative_path: stored.relative_path.clone(),
            mime_type: "image/png".into(),
            file_size: stored.file_size,
            width: stored.width,
            height: stored.height,
            thumbnail_path: stored.thumbnail_path.clone(),
        },
    )
    .unwrap();

    // Retrieval + file exists.
    let list = attachments::list_for_note(&conn, &note.id).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, att.id);
    let abs = fs_attach::resolve_within(&dir, &att.relative_path).unwrap();
    assert!(abs.exists());
    let bytes = fs_attach::read_relative(&dir, &att.relative_path).unwrap();
    assert_eq!(bytes, png);

    // Delete files + row; files gone.
    fs_attach::delete_files(&dir, &att.relative_path, att.thumbnail_path.as_deref()).unwrap();
    attachments::delete_row(&conn, &att.id).unwrap();
    assert!(!abs.exists());
    assert_eq!(attachments::list_for_note(&conn, &note.id).unwrap().len(), 0);

    cleanup(&dir);
}

#[test]
fn large_image_gets_thumbnail() {
    let (dir, _conn) = fresh_db();
    let id = attachments::generate_id();
    let png = big_png();
    let stored = fs_attach::store_attachment(&dir, &id, "big.png", "image/png", &png).unwrap();
    assert_eq!(stored.width, Some(800));
    assert_eq!(stored.height, Some(600));
    let thumb = stored.thumbnail_path.expect("large image should get a thumbnail");
    assert!(thumb.starts_with("attachments/thumbnails/"));
    assert!(fs_attach::resolve_within(&dir, &thumb).unwrap().exists());
    cleanup(&dir);
}

#[test]
fn attachment_cascades_when_note_hard_deleted() {
    let (dir, conn) = fresh_db();
    let note = notes::create(&conn, notes::NewNote::default()).unwrap();
    let id = attachments::generate_id();
    let png = tiny_png();
    let stored = fs_attach::store_attachment(&dir, &id, "f.png", "image/png", &png).unwrap();
    attachments::create(&conn, &id, attachments::NewAttachment {
        note_id: note.id.clone(),
        original_filename: "f.png".into(),
        stored_filename: stored.stored_filename,
        relative_path: stored.relative_path,
        mime_type: "image/png".into(),
        file_size: stored.file_size,
        width: stored.width,
        height: stored.height,
        thumbnail_path: stored.thumbnail_path,
    }).unwrap();

    // FK ON DELETE CASCADE removes the metadata row (file cleanup is the
    // command layer's job; here we assert the row cascade).
    notes::hard_delete(&conn, &note.id).unwrap();
    assert_eq!(attachments::list_for_note(&conn, &note.id).unwrap().len(), 0);
    cleanup(&dir);
}

#[test]
fn missing_file_read_errors_cleanly() {
    let (dir, _conn) = fresh_db();
    // No panic — a clean error for a path that doesn't exist.
    let res = fs_attach::read_relative(&dir, "attachments/images/does-not-exist.png");
    assert!(res.is_err());
    cleanup(&dir);
}

#[test]
fn path_traversal_is_rejected() {
    let (dir, _conn) = fresh_db();
    for bad in [
        "../secret.txt",
        "../../etc/passwd",
        "attachments/../../escape.png",
        "attachments/images/../../../escape.png",
    ] {
        assert!(fs_attach::resolve_within(&dir, bad).is_err(), "should reject {bad}");
        assert!(fs_attach::read_relative(&dir, bad).is_err(), "should reject read {bad}");
    }
    // Absolute path rejected too.
    #[cfg(windows)]
    assert!(fs_attach::resolve_within(&dir, "C:/Windows/System32/x.dll").is_err());
    #[cfg(not(windows))]
    assert!(fs_attach::resolve_within(&dir, "/etc/passwd").is_err());
    cleanup(&dir);
}

#[test]
fn storage_usage_includes_attachment_breakdown() {
    let (dir, _conn) = fresh_db();
    let id = attachments::generate_id();
    let png = big_png();
    fs_attach::store_attachment(&dir, &id, "big.png", "image/png", &png).unwrap();
    // A non-image file.
    let fid = attachments::generate_id();
    fs_attach::store_attachment(&dir, &fid, "notes.txt", "text/plain", b"hello world").unwrap();

    let usage = storage::usage(&dir);
    assert!(usage.images_bytes > 0);
    assert!(usage.files_bytes > 0);
    assert!(usage.thumbnails_bytes > 0);
    assert_eq!(usage.attachments_bytes, usage.images_bytes + usage.files_bytes + usage.thumbnails_bytes);
    assert!(usage.total_bytes >= usage.database_bytes + usage.attachments_bytes);
    cleanup(&dir);
}

#[test]
fn attachments_are_portable_across_copied_dir() {
    let base = std::env::temp_dir().join(format!("catavyn_att_{}", uuid::Uuid::new_v4()));
    let a = base.join("CatavynData");
    let b = base.join("Copied");
    config::ensure_data_dir(&a).unwrap();

    let (note_id, att_id, rel_path, thumb_path) = {
        let mut conn = db::open(&config::db_path(&a)).unwrap();
        db::migrate(&mut conn).unwrap();
        let note = notes::create(&conn, notes::NewNote { title: Some("p".into()), ..Default::default() }).unwrap();
        let id = attachments::generate_id();
        let stored = fs_attach::store_attachment(&a, &id, "big.png", "image/png", &big_png()).unwrap();
        let att = attachments::create(&conn, &id, attachments::NewAttachment {
            note_id: note.id.clone(),
            original_filename: "big.png".into(),
            stored_filename: stored.stored_filename,
            relative_path: stored.relative_path.clone(),
            mime_type: "image/png".into(),
            file_size: stored.file_size,
            width: stored.width,
            height: stored.height,
            thumbnail_path: stored.thumbnail_path.clone(),
        }).unwrap();
        (note.id, att.id, att.relative_path, att.thumbnail_path)
    };

    // Verified copy (same path the migrate command uses) A -> B.
    storage::migrate_data_dir(&a, &b, false).unwrap();

    // Reopen from B: note + attachment metadata + files all present.
    let conn = db::open(&config::db_path(&b)).unwrap();
    assert!(notes::get(&conn, &note_id).unwrap().is_some());
    let att = attachments::get(&conn, &att_id).unwrap().unwrap();
    assert_eq!(att.relative_path, rel_path);
    // Original readable from the copied dir.
    let bytes = fs_attach::read_relative(&b, &rel_path).unwrap();
    assert!(!bytes.is_empty());
    // Thumbnail readable too.
    let thumb = thumb_path.expect("thumbnail should exist");
    assert!(fs_attach::read_relative(&b, &thumb).unwrap().len() > 0);
    // relative_path carries no drive/absolute component.
    assert!(!rel_path.contains(':') && !rel_path.starts_with('/'));

    std::fs::remove_dir_all(&base).ok();
}
