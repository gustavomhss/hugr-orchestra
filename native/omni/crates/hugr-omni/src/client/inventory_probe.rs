//! Test-only observation of real List replies, and Linux descriptor pressure on a test role's own supervisor.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError, mpsc};
use std::time::Duration;

use tokio::sync::Notify;

/// An actual reply consumed by this tree's inventory call, not a substitute inventory.
#[derive(Debug)]
pub(crate) enum Receipt {
    Listed(Vec<u32>),
    Incomplete,
}

/// Installed separately on each actual tree; a tree without an observer follows its ordinary path.
#[derive(Debug, Default)]
pub(crate) struct Probe(Mutex<Option<Arc<Observer>>>);

impl Probe {
    pub(super) fn attach(&self) -> Watch {
        let (send, receipts) = mpsc::channel();
        let observer = Arc::new(Observer {
            send,
            first_error: AtomicBool::new(true),
            release: Notify::new(),
        });
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(Arc::clone(&observer));
        Watch { observer, receipts }
    }

    pub(super) async fn received(&self, receipt: Receipt) {
        let observer = self.0.lock().unwrap_or_else(PoisonError::into_inner).clone();
        if let Some(observer) = observer {
            observer.received(receipt).await;
        }
    }
}

#[derive(Debug)]
struct Observer {
    send: mpsc::Sender<Receipt>,
    first_error: AtomicBool,
    release: Notify,
}

impl Observer {
    async fn received(&self, receipt: Receipt) {
        let held = matches!(receipt, Receipt::Incomplete) && self.first_error.swap(false, Ordering::AcqRel);
        if self.send.send(receipt).is_err() {
            return;
        }
        if held {
            // Observe the real AckError, then keep its caller here until the OS limit has been restored.
            let released = tokio::time::timeout(Duration::from_secs(20), self.release.notified()).await;
            assert!(released.is_ok(), "inventory observation barrier was not released");
        }
    }
}

/// The controller's receipts and release permit, without owning the tree or changing its reply.
pub(crate) struct Watch {
    observer: Arc<Observer>,
    pub receipts: mpsc::Receiver<Receipt>,
}

#[cfg(target_os = "linux")]
impl Watch {
    /// Restricts only the test role's own supervisor; Drop restores it before releasing the observed reply.
    pub(crate) fn restrict(&self, supervisor: u32, record: &std::path::Path) -> std::io::Result<Limit> {
        Ok(Limit {
            supervisor: supervisor as i32,
            soft: Some(set_nofile(supervisor as i32, 3, Some(record))?),
            record: record.to_owned(),
            observer: Arc::clone(&self.observer),
        })
    }
}

#[cfg(target_os = "linux")]
pub(crate) struct Limit {
    supervisor: i32,
    soft: Option<u64>,
    record: std::path::PathBuf,
    observer: Arc<Observer>,
}

#[cfg(target_os = "linux")]
impl Limit {
    /// Makes recovery explicit on the success path, while Drop is the failure-path restore guard.
    pub(crate) fn restore(&mut self) -> std::io::Result<()> {
        if let Some(soft) = self.soft {
            set_nofile(self.supervisor, soft, None)?;
            self.soft = None;
            let _ = std::fs::remove_file(&self.record);
        }
        self.observer.release.notify_one();
        Ok(())
    }
}

#[cfg(target_os = "linux")]
impl Drop for Limit {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}

/// Reuses the supervisor inventory tests' prlimit mechanism: change only soft, preserve hard, return old soft.
#[cfg(target_os = "linux")]
fn set_nofile(pid: i32, soft: u64, record: Option<&std::path::Path>) -> std::io::Result<u64> {
    let mut old = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    // SAFETY: reads the limits of the test role's own supervisor into `old`.
    if unsafe { libc::prlimit(pid, libc::RLIMIT_NOFILE, std::ptr::null(), &raw mut old) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    if let Some(record) = record {
        // The owning outer test can restore before killing a failed or hung role, too.
        std::fs::write(record, format!("{pid} {}\n", old.rlim_cur))?;
    }
    let new = libc::rlimit {
        rlim_cur: soft,
        rlim_max: old.rlim_max,
    };
    // SAFETY: `new` is a valid limit (soft <= hard); only the owned supervisor's soft limit changes.
    if unsafe { libc::prlimit(pid, libc::RLIMIT_NOFILE, &raw const new, std::ptr::null_mut()) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(old.rlim_cur)
}

/// The outer role owner restores a recorded limit before its watchdog kills that role.
#[cfg(target_os = "linux")]
pub(crate) fn restore_record(record: &std::path::Path) -> std::io::Result<()> {
    let text = match std::fs::read_to_string(record) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    let fields: Vec<_> = text.split_whitespace().collect();
    let values = fields
        .first()
        .and_then(|s| s.parse::<i32>().ok())
        .zip(fields.get(1).and_then(|s| s.parse::<u64>().ok()));
    let Some((pid, soft)) = values.filter(|(pid, _)| *pid > 0 && fields.len() == 2) else {
        return Err(std::io::Error::other("invalid owned supervisor restore record"));
    };
    set_nofile(pid, soft, None)?;
    std::fs::remove_file(record)
}
