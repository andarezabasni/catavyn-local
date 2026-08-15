use serde::Serialize;

use crate::repo::tasks::Task;

/// A task that is due and should trigger a notification. Pure data — the actual
/// OS notification is fired by the frontend via tauri-plugin-notification.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DueReminder {
    pub task_id: String,
    pub title: String,
    pub due_date: String,
    pub due_time: String,
}

/// Decide which of the given tasks are due at `now_local` and have not already
/// been notified. Pure function so the scheduling rules are unit-testable
/// without touching the OS notification layer.
///
/// Rules (mirrors the original web reminder, minus the browser API):
///   - skip completed tasks
///   - skip tasks without both a due_date and due_time
///   - skip tasks already in `already_sent`
///   - a task is due when its local due datetime is at or before `now_local`
///   - skip tasks that became due more than `late_window_secs` ago, so
///     enabling reminders / reopening the app late doesn't fire a burst of
///     stale notifications (they're still marked sent by the caller)
///
/// `now_local` and the task's due date/time are compared in the same local
/// wall-clock space; no timezone data is persisted to the database.
pub fn due_reminders(
    tasks: &[Task],
    now_local: chrono::NaiveDateTime,
    already_sent: &std::collections::HashSet<String>,
    late_window_secs: i64,
) -> Vec<DueReminder> {
    let mut out = Vec::new();
    for task in tasks {
        if task.is_completed {
            continue;
        }
        if already_sent.contains(&task.id) {
            continue;
        }
        let (Some(date), Some(time)) = (task.due_date.as_deref(), task.due_time.as_deref()) else {
            continue;
        };
        let Some(due) = parse_due(date, time) else {
            continue;
        };
        let delta = now_local.signed_duration_since(due).num_seconds();
        // delta < 0  -> not due yet
        // delta > late_window_secs -> too old (mark sent silently, don't fire)
        if delta < 0 {
            continue;
        }
        if delta > late_window_secs {
            // Caller marks these as sent so they don't linger, but we still
            // surface them here as "stale" via an empty push? No — we simply
            // skip firing. The caller records them separately.
            continue;
        }
        out.push(DueReminder {
            task_id: task.id.clone(),
            title: task.title.clone(),
            due_date: date.to_string(),
            due_time: time.to_string(),
        });
    }
    out
}

/// Task ids that are due but older than the late window — should be marked as
/// sent (to suppress future spam) without firing a notification now.
pub fn stale_due_ids(
    tasks: &[Task],
    now_local: chrono::NaiveDateTime,
    already_sent: &std::collections::HashSet<String>,
    late_window_secs: i64,
) -> Vec<String> {
    let mut out = Vec::new();
    for task in tasks {
        if task.is_completed || already_sent.contains(&task.id) {
            continue;
        }
        let (Some(date), Some(time)) = (task.due_date.as_deref(), task.due_time.as_deref()) else {
            continue;
        };
        let Some(due) = parse_due(date, time) else {
            continue;
        };
        let delta = now_local.signed_duration_since(due).num_seconds();
        if delta > late_window_secs {
            out.push(task.id.clone());
        }
    }
    out
}

/// Parse a stored `YYYY-MM-DD` + `HH:MM` (optionally `HH:MM:SS`) into a naive
/// local datetime. Returns None on malformed input rather than panicking.
fn parse_due(date: &str, time: &str) -> Option<chrono::NaiveDateTime> {
    let d = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    let t = chrono::NaiveTime::parse_from_str(time, "%H:%M:%S")
        .or_else(|_| chrono::NaiveTime::parse_from_str(time, "%H:%M"))
        .ok()?;
    Some(chrono::NaiveDateTime::new(d, t))
}
