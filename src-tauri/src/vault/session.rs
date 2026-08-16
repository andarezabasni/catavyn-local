use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use zeroize::Zeroize;

use crate::error::{AppError, AppResult};

/// Default auto-lock timeout (§14).
pub const AUTO_LOCK_SECS: u64 = 5 * 60;

/// Holds the decrypted DEK while the Vault is unlocked. The DEK never leaves
/// Rust and is zeroized on lock/drop (§9). The item-store connection is kept
/// open only while unlocked.
pub struct UnlockedVault {
    dek: [u8; 32],
    pub conn: Connection,
    #[allow(dead_code)] // retained for future per-item attachment paths
    pub data_dir: PathBuf,
    last_activity: Instant,
}

impl UnlockedVault {
    pub fn dek(&self) -> &[u8; 32] {
        &self.dek
    }
    pub fn touch(&mut self) {
        self.last_activity = Instant::now();
    }
    fn expired(&self, timeout: Duration) -> bool {
        self.last_activity.elapsed() >= timeout
    }
}

impl Drop for UnlockedVault {
    fn drop(&mut self) {
        self.dek.zeroize();
    }
}

/// Thread-safe Vault session state. Lives inside the app's managed state.
pub struct VaultSession {
    inner: Mutex<Option<UnlockedVault>>,
    /// Inactivity auto-lock timeout in seconds. Configurable by the user
    /// (persisted in the notes DB settings table); guarded for interior
    /// mutability so it can change without recreating the session.
    timeout_secs: Mutex<u64>,
}

impl Default for VaultSession {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
            timeout_secs: Mutex::new(AUTO_LOCK_SECS),
        }
    }
}

impl VaultSession {
    pub fn new() -> Self {
        Self::default()
    }

    fn timeout(&self) -> Duration {
        Duration::from_secs(*self.timeout_secs.lock().unwrap())
    }

    /// Update the inactivity auto-lock timeout (seconds). Applied immediately to
    /// the current session.
    pub fn set_timeout_secs(&self, secs: u64) {
        *self.timeout_secs.lock().unwrap() = secs.max(30); // floor of 30s
    }

    pub fn timeout_secs(&self) -> u64 {
        *self.timeout_secs.lock().unwrap()
    }

    /// Store a freshly-unlocked Vault.
    pub fn set(&self, mut dek: [u8; 32], conn: Connection, data_dir: PathBuf) {
        let mut guard = self.inner.lock().unwrap();
        // Zeroize any previous DEK via Drop by replacing the Option.
        *guard = Some(UnlockedVault {
            dek,
            conn,
            data_dir,
            last_activity: Instant::now(),
        });
        dek.zeroize();
    }

    pub fn is_unlocked(&self) -> bool {
        let mut guard = self.inner.lock().unwrap();
        if let Some(v) = guard.as_ref() {
            if v.expired(self.timeout()) {
                *guard = None; // auto-lock; Drop zeroizes the DEK
                return false;
            }
            return true;
        }
        false
    }

    /// Explicit lock — drops the unlocked state (Drop zeroizes the DEK).
    pub fn lock(&self) {
        let mut guard = self.inner.lock().unwrap();
        *guard = None;
    }

    /// Refresh the inactivity timer if currently unlocked. Returns whether the
    /// Vault is (still) unlocked. Used to count real UI activity (typing) as
    /// activity without exposing any secret. Auto-lock still applies once the
    /// window has genuinely been idle for the timeout.
    pub fn touch_if_unlocked(&self) -> bool {
        let mut guard = self.inner.lock().unwrap();
        let expired = guard.as_ref().map(|v| v.expired(self.timeout())).unwrap_or(false);
        if expired {
            *guard = None;
            return false;
        }
        match guard.as_mut() {
            Some(v) => {
                v.touch();
                true
            }
            None => false,
        }
    }

    /// Run `f` with the unlocked Vault, refreshing the activity timer. Fails
    /// with a locked error if not unlocked or if the session has expired.
    pub fn with_unlocked<T>(
        &self,
        f: impl FnOnce(&mut UnlockedVault) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut guard = self.inner.lock().unwrap();
        // Auto-lock check.
        let expired = guard.as_ref().map(|v| v.expired(self.timeout())).unwrap_or(false);
        if expired {
            *guard = None;
        }
        let vault = guard.as_mut().ok_or(AppError::VaultLocked)?;
        vault.touch();
        f(vault)
    }
}

/// Path helper re-exported for convenience.
#[allow(dead_code)]
pub fn vault_db_path(data_dir: &Path) -> PathBuf {
    crate::vault::meta::db_path(data_dir)
}
