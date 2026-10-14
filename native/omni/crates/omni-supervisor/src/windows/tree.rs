//! One tree: its Job, its root (whose handle pins the pid until the record is dropped), its terminal,
//! and the single stop deadline shared by every `Stop` waiter (ADR-0005 §3–4, R2).

use std::os::windows::io::{AsRawHandle, OwnedHandle};
use std::time::{Duration, Instant};

use omni_proto::{Ack, ProcEntry};
use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, GenerateConsoleCtrlEvent};

use super::diag::Diag;
use super::members::{Members, Proof};
use super::{inventory, job};
use crate::pty_windows::ConPty;

/// How long the per-member proof may run once the Job is empty (the kernel's own count says the tree is
/// gone): after it, a member that cannot be inspected does not hold `Stopped` back (K2: no hangs).
const PROOF_BOUND: Duration = Duration::from_secs(1);

/// A stop in progress: one deadline, every waiting `Stop` request.
#[derive(Debug)]
pub(super) struct Stopping {
    pub waiters: Vec<u64>,
    pub deadline: Instant,
    pub forced: bool,
}

#[derive(Debug)]
pub(super) struct Tree {
    pub id: u64,
    pub pid: u32,
    /// Held until the record is dropped, so the root's pid (also its console process group) is never reused
    /// while this supervisor may still signal it.
    _process: OwnedHandle,
    job: OwnedHandle,
    pty: Option<ConPty>,
    /// When the Job was first seen empty.
    empty_since: Option<Instant>,
    /// The tree's grace, used when the host dies.
    pub grace_ms: u32,
    pub exit: Option<u32>,
    pub gone: bool,
    pub released: bool,
    pub stop: Option<Stopping>,
}

impl Tree {
    pub(super) fn new(
        id: u64,
        pid: u32,
        process: OwnedHandle,
        job: OwnedHandle,
        pty: Option<ConPty>,
        grace_ms: u32,
    ) -> Tree {
        Tree {
            id,
            pid,
            _process: process,
            job,
            pty,
            empty_since: None,
            grace_ms,
            exit: None,
            gone: false,
            released: false,
            stop: None,
        }
    }

    /// Starts a stop or joins the one in progress; the earliest deadline wins. `grace_ms` 0 forces at once.
    /// `now` is when the request was received.
    pub(super) fn stop(&mut self, waiter: Option<u64>, grace_ms: u32, now: Instant) {
        let deadline = now + Duration::from_millis(grace_ms.into());
        match &mut self.stop {
            Some(s) => {
                s.waiters.extend(waiter);
                s.deadline = s.deadline.min(deadline);
            }
            None => {
                self.stop = Some(Stopping {
                    waiters: waiter.into_iter().collect(),
                    deadline,
                    forced: false,
                });
                if grace_ms > 0 {
                    self.graceful(deadline);
                }
            }
        }
        self.enforce(now);
    }

    /// Forces the tree once its deadline has passed (`settle` repeats the pass until the Job is empty).
    pub(super) fn enforce(&mut self, now: Instant) {
        if let Some(s) = self.stop.as_mut().filter(|s| !s.forced && now >= s.deadline) {
            s.forced = true;
            job::terminate(&self.job);
            self.close_pty(now);
        }
    }

    /// The deadline still to enforce, if any.
    pub(super) fn deadline(&self) -> Option<Instant> {
        self.stop.as_ref().filter(|s| !s.forced).map(|s| s.deadline)
    }

    /// Records the root's exit; a terminal hangs up with it (as a Unix session ends with its leader).
    pub(super) fn root_exited(&mut self, code: u32, now: Instant) {
        self.exit = Some(code);
        self.close_pty(now + Duration::from_millis(self.grace_ms.into()));
    }

    /// Gone = the root exited, the Job has no live member (an unknown count is not zero), and every process
    /// that ever joined it is proven gone (`Members::prove`), or `PROOF_BOUND` has passed since the Job was
    /// first seen empty (then one diagnostic line says why). Returns the `Stop` waiters to answer, once.
    /// While a forced stop's Job still has members, each call repeats the forced pass.
    pub(super) fn settle(&mut self, members: &Members, diag: &Diag, now: Instant) -> Option<Vec<u64>> {
        if self.gone {
            return None;
        }
        let active = job::active(&self.job);
        if active != Some(0) && self.stop.as_ref().is_some_and(|s| s.forced) {
            // Forced means until the Job is empty, as SIGKILL until the session is empty on Unix: what a pass
            // left alive (it failed, or a process was still joining the Job while it ran) meets the next one.
            job::terminate(&self.job);
        }
        if self.exit.is_none() || active != Some(0) {
            return None;
        }
        let since = *self.empty_since.get_or_insert(now);
        match members.prove(self.id, &self.job) {
            Proof::Gone => {}
            Proof::Pending(why) | Proof::Unknown(why) if now >= since + PROOF_BOUND => diag.report(format!(
                "tree {} reported gone {} ms after its Job emptied, unproven: {why}",
                self.id,
                now.duration_since(since).as_millis()
            )),
            _ => return None,
        }
        self.gone = true;
        Some(self.stop.take().map(|s| s.waiters).unwrap_or_default())
    }

    /// Whether `settle` must be polled: the root exited and descendants may live on, or a stop is under way.
    pub(super) fn polled(&self) -> bool {
        !self.gone && (self.exit.is_some() || self.stop.is_some())
    }

    pub(super) fn list(&self) -> std::io::Result<Vec<ProcEntry>> {
        if self.gone {
            return Ok(Vec::new());
        }
        // A Windows root that exited is not a member any more; it is excluded in case the scan races it.
        inventory::list(&self.job, self.exit.map(|_| self.pid))
    }

    pub(super) fn resize(&self, cols: u16, rows: u16) -> Ack {
        match &self.pty {
            Some(pty) if self.exit.is_none() => match pty.resize(cols, rows) {
                Ok(()) => Ack::Ok,
                Err(_) => Ack::Error,
            },
            _ => Ack::Closed,
        }
    }

    /// Pipe root: CTRL_BREAK to its console process group (it was created with `CREATE_NEW_PROCESS_GROUP`
    /// on the supervisor's own console, so the host never sees it). Terminal root: hang up the terminal.
    /// Best effort; the deadline forces the rest.
    fn graceful(&mut self, deadline: Instant) {
        if self.pty.is_some() {
            self.close_pty(deadline);
        } else {
            // SAFETY: a plain call; the group id is the pinned root pid.
            unsafe { GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, self.pid) };
        }
    }

    fn close_pty(&mut self, deadline: Instant) {
        if let Some(pty) = self.pty.take() {
            pty.close(deadline);
        }
    }
}

impl Drop for Tree {
    /// Closing the Job handle ends whatever is left (KILL_ON_JOB_CLOSE).
    fn drop(&mut self) {
        self.close_pty(Instant::now());
    }
}

/// The exit code of a process that has exited.
pub(super) fn exit_code(process: &OwnedHandle) -> u32 {
    let mut code = 0;
    // SAFETY: a process handle with query access; on failure `code` stays 0.
    unsafe { windows_sys::Win32::System::Threading::GetExitCodeProcess(process.as_raw_handle(), &mut code) };
    code
}
