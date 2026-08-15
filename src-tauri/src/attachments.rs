use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};

// Maximum edge length for generated thumbnails. Originals are never modified.
const THUMBNAIL_MAX_EDGE: u32 = 512;
// Only generate a thumbnail when the source is larger than this on either edge.
const THUMBNAIL_TRIGGER_EDGE: u32 = 640;

/// Subfolder an attachment lives in, based on whether it's an image.
fn category_dir(is_image: bool) -> &'static str {
    if is_image {
        "images"
    } else {
        "files"
    }
}

/// Map a MIME type / extension to a stored-file extension. We rely on the
/// detected format rather than the user's filename for images.
fn extension_for(mime: &str, original: &str) -> String {
    match mime {
        "image/png" => "png".into(),
        "image/jpeg" => "jpg".into(),
        "image/webp" => "webp".into(),
        "image/gif" => "gif".into(),
        "image/bmp" => "bmp".into(),
        _ => {
            // Non-image: preserve the original extension if it looks sane,
            // otherwise fall back to `bin`. Never used as a path component.
            Path::new(original)
                .extension()
                .and_then(|e| e.to_str())
                .filter(|e| e.len() <= 8 && e.chars().all(|c| c.is_ascii_alphanumeric()))
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_else(|| "bin".into())
        }
    }
}

pub struct StoredFile {
    pub stored_filename: String,
    pub relative_path: String,
    pub file_size: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub thumbnail_path: Option<String>,
}

/// Write attachment bytes into the data directory using a UUID-based filename.
/// The user's original filename is never used as a path component. For images,
/// dimensions are read and a thumbnail is generated when the image is large.
pub fn store_attachment(
    data_dir: &Path,
    attachment_id: &str,
    original_filename: &str,
    mime_type: &str,
    bytes: &[u8],
) -> AppResult<StoredFile> {
    if bytes.is_empty() {
        return Err(AppError::Other("attachment is empty".into()));
    }

    let is_image = mime_type.starts_with("image/");
    let ext = extension_for(mime_type, original_filename);
    let stored_filename = format!("{attachment_id}.{ext}");

    let sub = category_dir(is_image);
    let rel_dir = Path::new("attachments").join(sub);
    let abs_dir = data_dir.join(&rel_dir);
    fs::create_dir_all(&abs_dir)?;

    let abs_path = abs_dir.join(&stored_filename);
    fs::write(&abs_path, bytes)?;

    let relative_path = rel_dir.join(&stored_filename).to_string_lossy().replace('\\', "/");

    let mut width = None;
    let mut height = None;
    let mut thumbnail_path = None;

    if is_image {
        // Decode from memory to read dimensions + build a thumbnail. On decode
        // failure we keep the original file but skip dimensions/thumbnail
        // rather than failing the whole upload.
        if let Ok(img) = image::load_from_memory(bytes) {
            let (w, h) = (img.width(), img.height());
            width = Some(w as i64);
            height = Some(h as i64);

            if w > THUMBNAIL_TRIGGER_EDGE || h > THUMBNAIL_TRIGGER_EDGE {
                let thumb = img.thumbnail(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE);
                let rel_thumb_dir = Path::new("attachments").join("thumbnails");
                let abs_thumb_dir = data_dir.join(&rel_thumb_dir);
                fs::create_dir_all(&abs_thumb_dir)?;
                let thumb_name = format!("{attachment_id}.jpg");
                let abs_thumb = abs_thumb_dir.join(&thumb_name);
                // JPEG thumbnails keep size small; originals stay untouched.
                if thumb.to_rgb8().save_with_format(&abs_thumb, image::ImageFormat::Jpeg).is_ok() {
                    thumbnail_path = Some(
                        rel_thumb_dir.join(&thumb_name).to_string_lossy().replace('\\', "/"),
                    );
                }
            }
        }
    }

    Ok(StoredFile {
        stored_filename,
        relative_path,
        file_size: bytes.len() as i64,
        width,
        height,
        thumbnail_path,
    })
}

/// Resolve a data-dir-relative path to an absolute path, rejecting any path
/// that would escape the data directory (path traversal defense). The renderer
/// only ever sends relative paths that came from the database; this is the
/// enforced boundary.
pub fn resolve_within(data_dir: &Path, relative: &str) -> AppResult<PathBuf> {
    let rel = Path::new(relative);

    // Reject absolute paths and any traversal components outright.
    if rel.is_absolute() {
        return Err(AppError::Other("absolute paths are not allowed".into()));
    }
    for comp in rel.components() {
        match comp {
            Component::Normal(_) => {}
            // `.` is harmless but `..`, root, and prefixes are rejected.
            Component::CurDir => {}
            _ => return Err(AppError::Other("invalid path component".into())),
        }
    }

    let joined = data_dir.join(rel);

    // Belt-and-suspenders: canonicalize both and confirm containment. The data
    // dir must exist (it always does when a DB is open).
    let base = data_dir.canonicalize()?;
    // The target may not need canonicalization if it doesn't exist; guard it.
    let candidate = if joined.exists() {
        joined.canonicalize()?
    } else {
        joined.clone()
    };
    if !candidate.starts_with(&base) {
        return Err(AppError::Other("path escapes the data directory".into()));
    }

    Ok(joined)
}

/// Read the bytes of an attachment file given its data-dir-relative path.
pub fn read_relative(data_dir: &Path, relative: &str) -> AppResult<Vec<u8>> {
    let path = resolve_within(data_dir, relative)?;
    Ok(fs::read(path)?)
}

/// Delete an attachment's file and thumbnail. Missing files are tolerated
/// (idempotent) so a partially-deleted attachment can always be fully removed.
pub fn delete_files(
    data_dir: &Path,
    relative_path: &str,
    thumbnail_path: Option<&str>,
) -> AppResult<()> {
    let main = resolve_within(data_dir, relative_path)?;
    if main.exists() {
        fs::remove_file(&main)?;
    }
    if let Some(thumb) = thumbnail_path {
        let t = resolve_within(data_dir, thumb)?;
        if t.exists() {
            fs::remove_file(&t)?;
        }
    }
    Ok(())
}
