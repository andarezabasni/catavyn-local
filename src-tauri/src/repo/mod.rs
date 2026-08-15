//! Data-access layer. Each submodule owns SQL for one entity so raw SQL never
//! leaks into the frontend or the command layer. Commands call these functions
//! and wrap multi-step mutations in transactions.

pub mod attachments;
pub mod categories;
pub mod notes;
pub mod tags;
pub mod tasks;

/// Current UTC timestamp as an ISO-8601 string. Used for all `created_at` /
/// `updated_at` columns so data stays portable (no locale/machine coupling).
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Fresh UUID v4 as a TEXT id. No autoincrement — keeps rows portable and
/// merge-friendly across machines.
pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
