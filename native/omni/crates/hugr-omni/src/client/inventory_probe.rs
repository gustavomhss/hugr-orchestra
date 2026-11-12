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

#[cfg(all(test, target_os = "linux"))]
impl Watch {
    /// Restricts only the test role's own supervisor; Drop restores it before releasing the observed reply.
    pub(crate) fn restrict(&self, supervisor: u32, record: &std::path::Path) -> std::io::Result<Limit> {
        let custody = Custody {
            role: identity(std::process::id())?.ok_or_else(|| std::io::Error::other("role is gone"))?,
            supervisor: identity(supervisor)?.ok_or_else(|| std::io::Error::other("supervisor is gone"))?,
        };
        let soft = set_nofile(&custody, 3, Some(record))?
            .ok_or_else(|| std::io::Error::other("supervisor identity changed before restriction"))?;
        Ok(Limit {
            custody,
            soft: Some(soft),
            record: record.to_owned(),
            observer: Arc::clone(&self.observer),
        })
    }
}

#[cfg(all(test, target_os = "linux"))]
pub(crate) struct Limit {
    custody: Custody,
    soft: Option<u64>,
    record: std::path::PathBuf,
    observer: Arc<Observer>,
}

#[cfg(all(test, target_os = "linux"))]
impl Limit {
    /// Makes recovery explicit on the success path, while Drop is the failure-path restore guard.
    pub(crate) fn restore(&mut self) -> std::io::Result<()> {
        if let Some(soft) = self.soft {
            set_nofile(&self.custody, soft, None)?;
            remove_record(&self.record)?;
            self.soft = None;
        }
        self.observer.release.notify_one();
        Ok(())
    }
}

#[cfg(all(test, target_os = "linux"))]
impl Drop for Limit {
    fn drop(&mut self) {
        if let Err(error) = self.restore() {
            eprintln!("N2 limit cleanup failed: {error}");
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct Identity {
    pid: u32,
    start: u64,
    parent: u32,
}

struct Custody {
    role: Identity,
    supervisor: Identity,
}

impl Custody {
    fn current(&self) -> std::io::Result<bool> {
        Ok(self.supervisor.parent == self.role.pid
            && identity(self.role.pid)? == Some(self.role)
            && identity(self.supervisor.pid)? == Some(self.supervisor))
    }
}

/// A live process's start tick and parent identity; absence/zombie is never a replacement target.
fn identity(pid: u32) -> std::io::Result<Option<Identity>> {
    let text = match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(libc::ESRCH) => return Ok(None),
        Err(e) => return Err(e),
    };
    let fields: Vec<_> = text
        .rsplit_once(')')
        .map(|(_, tail)| tail.split_whitespace().collect())
        .unwrap_or_default();
    if fields.first().is_some_and(|state| matches!(*state, "Z" | "X")) {
        return Ok(None);
    }
    let values = fields
        .get(1)
        .and_then(|s| s.parse::<u32>().ok())
        .zip(fields.get(19).and_then(|s| s.parse::<u64>().ok()));
    let Some((parent, start)) = values.filter(|(_, start)| *start > 0) else {
        return Err(std::io::Error::other("invalid owned process identity"));
    };
    Ok(Some(Identity { pid, start, parent }))
}

/// Reuses the supervisor inventory tests' prlimit mechanism: change only soft, preserve hard, return old soft.
#[cfg(all(test, target_os = "linux"))]
fn set_nofile(custody: &Custody, soft: u64, record: Option<&std::path::Path>) -> std::io::Result<Option<u64>> {
    if !custody.current()? {
        return Ok(None);
    }
    let pid = custody.supervisor.pid as i32;
    let mut old = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    // SAFETY: reads the limits of the test role's own supervisor into `old`.
    if unsafe { libc::prlimit(pid, libc::RLIMIT_NOFILE, std::ptr::null(), &raw mut old) } != 0 {
        let error = std::io::Error::last_os_error();
        return if error.raw_os_error() == Some(libc::ESRCH) {
            Ok(None)
        } else {
            Err(error)
        };
    }
    if let Some(record) = record {
        // The owning outer test can restore before killing a failed or hung role, too.
        std::fs::write(
            record,
            format!(
                "{} {} {} {} {} {} {}\n",
                custody.role.pid,
                custody.role.start,
                custody.role.parent,
                custody.supervisor.pid,
                custody.supervisor.start,
                custody.supervisor.parent,
                old.rlim_cur
            ),
        )?;
    }
    // This is a last identity check, not an atomic identity-bound prlimit operation.
    if !custody.current()? {
        return Ok(None);
    }
    let new = libc::rlimit {
        rlim_cur: soft,
        rlim_max: old.rlim_max,
    };
    // SAFETY: `new` is a valid limit (soft <= hard); only the owned supervisor's soft limit changes.
    if unsafe { libc::prlimit(pid, libc::RLIMIT_NOFILE, &raw const new, std::ptr::null_mut()) } != 0 {
        let error = std::io::Error::last_os_error();
        return if error.raw_os_error() == Some(libc::ESRCH) {
            Ok(None)
        } else {
            Err(error)
        };
    }
    Ok(Some(old.rlim_cur))
}

/// The outer role owner restores a recorded limit before its watchdog kills that role.
#[cfg(all(test, target_os = "linux"))]
pub(crate) fn restore_record(record: &std::path::Path) -> std::io::Result<()> {
    let text = match std::fs::read_to_string(record) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    let fields = text
        .split_whitespace()
        .map(str::parse::<u64>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(std::io::Error::other)?;
    let [
        role,
        role_start,
        role_parent,
        supervisor,
        supervisor_start,
        supervisor_parent,
        soft,
    ]: [u64; 7] = fields
        .try_into()
        .map_err(|_| std::io::Error::other("invalid owned supervisor restore record"))?;
    let custody = Custody {
        role: Identity {
            pid: u32::try_from(role).map_err(std::io::Error::other)?,
            start: role_start,
            parent: u32::try_from(role_parent).map_err(std::io::Error::other)?,
        },
        supervisor: Identity {
            pid: u32::try_from(supervisor).map_err(std::io::Error::other)?,
            start: supervisor_start,
            parent: u32::try_from(supervisor_parent).map_err(std::io::Error::other)?,
        },
    };
    // A gone or changed owner/supervisor is not a prlimit target, nor proof of fixture OS death.
    set_nofile(&custody, soft, None)?;
    remove_record(record)
}

fn remove_record(record: &std::path::Path) -> std::io::Result<()> {
    match std::fs::remove_file(record) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}
