//! The tree of one child, apart from its I/O: the cause the library commits, the one stop with one deadline for the
//! whole tree, the root's `Exit`, and the live members (contract §5, §7). W07.

use std::future::Future;
use std::pin::pin;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::task::{Context, Poll, Waker};
use std::time::Duration;

use super::exit;
use crate::client::Tree;
use crate::error::Error;
use crate::types::{Exit, ProcessInfo, Reason};

/// The largest grace (contract §3: the protocol carries it as u32 milliseconds).
const MAX_GRACE_MS: u128 = u32::MAX as u128;

/// One tree of the supervisor and the termination cause this library committed for it.
///
/// In a forked copy of the host (`std::process::id() != home`) it touches no lock and sends nothing; the client
/// refuses that copy's calls (ADR-0005 §9).
#[derive(Debug)]
pub(super) struct Life {
    tree: Tree,
    cause: Mutex<Cause>,
    home: u32,
}

/// The cause of contract §7, decided once: at the library's first termination of the tree.
#[derive(Debug, Clone, Copy)]
enum Cause {
    /// The library has not acted yet.
    Open,
    /// The root's exit was observed before the library acted: the root's own status is the reason.
    Root,
    /// The library acted first, for this reason (`Killed`, `Timeout` or `Aborted`).
    Acted(Reason),
}

impl Life {
    pub(super) fn new(tree: Tree) -> Life {
        Life {
            tree,
            cause: Mutex::new(Cause::Open),
            home: std::process::id(),
        }
    }

    /// False in a forked copy of the host process that created this tree.
    pub(super) fn at_home(&self) -> bool {
        std::process::id() == self.home
    }

    /// Resolves at root exit; every call returns the same `Exit`. The root's status has one source, the supervisor's
    /// report (`Tree::exited`); the reason is the committed cause.
    pub(super) async fn wait(&self) -> Result<Exit, Error> {
        let root = self.tree.exited().await?;
        let cause = match *lock(&self.cause) {
            Cause::Acted(reason) => Some(reason),
            Cause::Open | Cause::Root => None,
        };
        Ok(exit::of(root, cause))
    }

    /// Commits `cause` unless one is committed already, then ends the whole tree with one deadline: graceful now,
    /// forced at `grace` (whole milliseconds, see `grace`). Resolves with the root's `Exit` once the supervisor
    /// confirmed the tree gone, at once if it is gone already. After the root exited, only its descendants are left to
    /// stop, and the root's `Exit` is unchanged. Overlapping calls share the earliest deadline (the supervisor's rule).
    /// In a forked copy, the client's refusal comes back before any lock is taken.
    pub(super) async fn stop(&self, cause: Reason, grace: Duration) -> Result<Exit, Error> {
        if self.at_home() {
            self.commit(cause);
        }
        self.tree.stop(grace).await?;
        self.wait().await
    }

    /// Force-kills the tree without waiting for it (drop): never blocks. Does nothing in a forked copy.
    pub(super) fn kill(&self) {
        if self.at_home() {
            self.commit(Reason::Killed);
            self.tree.stop_detached(Duration::ZERO);
        }
    }

    /// A held Unix PTY root may exec now: call it once the terminal's reader runs (ADR-0005 R9). Returns when the exec
    /// succeeded or failed; a no-op for every other tree.
    pub(super) fn go(&self) -> Result<(), Error> {
        self.tree.go()
    }

    /// Resizes the terminal without waiting; `Closed` once the root's exit is known.
    pub(super) fn resize(&self, cols: u16, rows: u16) -> Result<(), Error> {
        self.tree.resize(cols, rows)
    }

    /// The live members `stop` would end now (the supervisor sets `parent_pid` only when the parent is listed).
    pub(super) async fn processes(&self) -> Result<Vec<ProcessInfo>, Error> {
        let list = self.tree.processes().await?;
        Ok(list
            .into_iter()
            .map(|p| ProcessInfo {
                pid: p.pid,
                parent_pid: p.ppid,
                name: p.name,
            })
            .collect())
    }

    /// Contract §7: the cause is committed when the library acts, before the termination is sent.
    fn commit(&self, cause: Reason) {
        let mut committed = lock(&self.cause);
        if let Cause::Open = *committed {
            *committed = if self.root_exited() {
                Cause::Root
            } else {
                Cause::Acted(cause)
            };
        }
    }

    /// Whether the client has already observed the root's exit, without waiting: `Tree::exited` is ready on its
    /// first poll once the exit is known. Polled outside tokio's cooperative budget, which could otherwise make a
    /// known exit look pending.
    fn root_exited(&self) -> bool {
        let mut cx = Context::from_waker(Waker::noop());
        let exited = pin!(tokio::task::unconstrained(self.tree.exited()));
        matches!(exited.poll(&mut cx), Poll::Ready(Ok(_)))
    }
}

/// A grace for `stop`: whole milliseconds, a fraction rounding up (contract §3); `InvalidArgument` above
/// 4294967295 ms.
pub(super) fn grace(grace: Duration) -> Result<Duration, Error> {
    let ms = grace.as_nanos().div_ceil(1_000_000);
    match u64::try_from(ms) {
        Ok(whole) if ms <= MAX_GRACE_MS => Ok(Duration::from_millis(whole)),
        _ => Err(Error::duration_out_of_range("graceMs", ms)),
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}
