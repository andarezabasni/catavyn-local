use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::repo::{new_id, now};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub is_completed: bool,
    pub priority: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl Task {
    fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Task {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            due_date: row.get("due_date")?,
            due_time: row.get("due_time")?,
            is_completed: row.get::<_, i64>("is_completed")? != 0,
            priority: row.get("priority")?,
            position: row.get("position")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct NewTask {
    pub title: String,
    pub description: Option<String>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub priority: Option<String>,
    pub position: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub due_date: Option<Option<String>>,
    pub due_time: Option<Option<String>>,
    pub is_completed: Option<bool>,
    pub priority: Option<String>,
    pub position: Option<i64>,
}

fn valid_priority(p: &str) -> bool {
    matches!(p, "low" | "medium" | "high")
}

pub fn list(conn: &Connection, due_date: Option<&str>) -> AppResult<Vec<Task>> {
    let mut sql = String::from("SELECT * FROM tasks");
    if due_date.is_some() {
        sql.push_str(" WHERE due_date = ?1");
    }
    sql.push_str(" ORDER BY position ASC, created_at ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = if let Some(d) = due_date {
        stmt.query_map([d], Task::from_row)?
    } else {
        stmt.query_map([], Task::from_row)?
    };
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn get(conn: &Connection, id: &str) -> AppResult<Option<Task>> {
    let mut stmt = conn.prepare("SELECT * FROM tasks WHERE id = ?1")?;
    let mut rows = stmt.query_map([id], Task::from_row)?;
    match rows.next() {
        Some(t) => Ok(Some(t?)),
        None => Ok(None),
    }
}

pub fn create(conn: &Connection, input: NewTask) -> AppResult<Task> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Other("task title is required".into()));
    }
    let priority = input.priority.unwrap_or_else(|| "low".into());
    if !valid_priority(&priority) {
        return Err(AppError::Other(format!("invalid priority: {priority}")));
    }
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO tasks (id, title, description, due_date, due_time, is_completed, priority, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?8)",
        rusqlite::params![
            id,
            title,
            input.description.unwrap_or_default(),
            input.due_date,
            input.due_time,
            priority,
            input.position.unwrap_or(0),
            ts,
        ],
    )?;
    Ok(get(conn, &id)?.expect("task just inserted"))
}

pub fn update(conn: &Connection, id: &str, patch: TaskPatch) -> AppResult<Option<Task>> {
    if let Some(title) = patch.title {
        conn.execute("UPDATE tasks SET title = ?1 WHERE id = ?2", rusqlite::params![title.trim(), id])?;
    }
    if let Some(description) = patch.description {
        conn.execute("UPDATE tasks SET description = ?1 WHERE id = ?2", rusqlite::params![description, id])?;
    }
    if let Some(due_date) = patch.due_date {
        conn.execute("UPDATE tasks SET due_date = ?1 WHERE id = ?2", rusqlite::params![due_date, id])?;
    }
    if let Some(due_time) = patch.due_time {
        conn.execute("UPDATE tasks SET due_time = ?1 WHERE id = ?2", rusqlite::params![due_time, id])?;
    }
    if let Some(is_completed) = patch.is_completed {
        conn.execute("UPDATE tasks SET is_completed = ?1 WHERE id = ?2", rusqlite::params![is_completed as i64, id])?;
    }
    if let Some(priority) = patch.priority {
        if !valid_priority(&priority) {
            return Err(AppError::Other(format!("invalid priority: {priority}")));
        }
        conn.execute("UPDATE tasks SET priority = ?1 WHERE id = ?2", rusqlite::params![priority, id])?;
    }
    if let Some(position) = patch.position {
        conn.execute("UPDATE tasks SET position = ?1 WHERE id = ?2", rusqlite::params![position, id])?;
    }
    conn.execute("UPDATE tasks SET updated_at = ?1 WHERE id = ?2", rusqlite::params![now(), id])?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    Ok(())
}
