use serde::Serialize;

/// Application-wide error type. Every Tauri command returns `Result<T, AppError>`
/// so the frontend receives a structured, serializable error instead of a panic.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("no data directory has been selected yet")]
    NoDataDirectory,

    #[error("invalid data directory: {0}")]
    InvalidDataDirectory(String),

    #[allow(dead_code)] // reserved for future command-level errors
    #[error("{0}")]
    Other(String),
}

// Tauri requires command error types to be `Serialize`. We serialize to the
// human-readable message so the renderer can surface it directly.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
