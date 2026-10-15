//! K1's oracle: which processes a task left alive, asked of the OS process table (never of the library), and the
//! process figures K6 reads (open fds or handles, resident memory).
//!
//! One `Watch` per runner, in the orchestrator, answers the runner's checks: each task is checked by an OS snapshot
//! taken after it returned (checks that arrive together share one), and on Windows snapshots are also taken while a
//! batch runs, to observe who is whose parent before parents exit. Ownership is decided on positive evidence only
//! (`rules`): the task's marker (`HUGR_QA_TASK=<tag>`, inherited by every descendant; Unix shows it, except for Apple
//! platform binaries on macOS), the process group of a marked process, and parent links observed between live
//! processes up to a root identified by its pid and creation time (Windows). A process tied to a task's roots only by
//! an unobserved link is an incomplete observation: counted apart, never killed. Zombies count as dead.
//!
//! Counting is generous, killing strict: a proven process is killed only on strong evidence, confirmed again right
//! before the kill (`Victim`, `reap`): its own marker or root identity, or a chain of parent links up to such a process
//! (or the runner's supervisor) in which every parent is still alive with the same identity and every child still has
//! that parent. Anything else is counted but left running (link unconfirmable), and logged.

mod rules;
mod unix;
mod watch;
mod windows;

#[cfg(test)]
mod tests;

use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

pub use rules::Found;
pub use watch::{Answer, Ask, Watch};

/// The environment variable that marks a task's processes. Its value starts with the run's random token (`token`),
/// which nothing outside the run can carry by chance; it is only ever given in the environment, never in argv.
pub const MARKER: &str = "HUGR_QA_TASK";

/// 128 random bits as 32 hex digits, for the run's id: std seeds every `RandomState` from the OS's random source.
pub fn token() -> String {
    use std::hash::{BuildHasher, Hasher};
    let half = |salt: u64| {
        let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
        hasher.write_u64(salt);
        hasher.finish()
    };
    format!("{:016x}{:016x}", half(1), half(2))
}

/// The history start for a host about to be spawned (read before the spawn): nothing it starts can carry an earlier
/// creation time, not even with the clock-tick stamp (`STAMP`).
pub fn before_spawn() -> u64 {
    filetime_now().saturating_sub(STAMP)
}

/// How long an OS tool (`ps`, `lsof`, PowerShell, `kill`, `taskkill`) gets before its observation counts as failed.
pub const TOOL_BOUND: Duration = Duration::from_secs(30);

/// One task to look for: its marker value, the roots it started, and when it started.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Probe {
    /// The value of `HUGR_QA_TASK` given to every process the task started.
    pub tag: String,
    /// The roots whose pid the task knows (a `spawn`; `run()` does not tell it).
    pub roots: Vec<Root>,
    /// When the task started, in Windows FILETIME units (100 ns since 1601), from `filetime_now()`.
    pub since: u64,
}

/// A root a task started: its pid, and the spawn call's window in FILETIME units (read before and after it). Only the
/// task's own root can have been created with that pid inside that window, so on Windows a process with the pid is
/// the root only if its creation time falls in it; a process that later reuses the pid never does. (Unix proves a root
/// by the task's marker instead.)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Root {
    pub pid: u32,
    pub from: u64,
    pub to: u64,
}

/// Windows stamps a process's creation with the system time of the last clock tick (15.6 ms by default), which can
/// precede a precise reading taken before the spawn: creation times are compared with that much slack.
pub const STAMP: u64 = 200_000;

impl Root {
    /// Whether `p` is this root: same pid, created within the spawn window.
    pub fn is(&self, pid: u32, created: u64) -> bool {
        self.pid == pid && (self.from.saturating_sub(STAMP)..=self.to).contains(&created)
    }
}

/// A live process as the OS reports it.
#[derive(Debug, Clone, PartialEq)]
pub struct Proc {
    pub pid: u32,
    pub ppid: u32,
    /// Unix process group (0 on Windows).
    pub pgid: u32,
    /// When it started, its identity with the pid: Windows FILETIME, Linux clock ticks since boot, macOS
    /// `YYYYMMDDhhmmss` (local, to the second).
    pub created: u64,
    /// The executable's file name, without directory.
    pub name: String,
    /// The value of `HUGR_QA_TASK` in its environment, when the OS shows it (Unix only).
    pub tag: Option<String>,
}

/// Now, in Windows FILETIME units (100 ns since 1601-01-01): comparable with `Proc::created`.
pub fn filetime_now() -> u64 {
    let unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() / 100)
        .unwrap_or(0);
    u64::try_from(unix).unwrap_or(u64::MAX) + 116_444_736_000_000_000
}

/// Every live process, from the OS. An incomplete observation is an error, never a shorter list.
pub fn snapshot() -> Result<Vec<Proc>, String> {
    if cfg!(target_os = "linux") {
        unix::proc_fs()
    } else if cfg!(windows) {
        windows::cim()
    } else {
        unix::ps()
    }
}

/// A proven process to kill, as observed, with the evidence that may kill it: `Some([])` when it is strong evidence
/// itself (the task's marker, the task's root identity, an identity the controls took); `Some(chain)` = its parent,
/// that one's parent, ... up to such a process or to the runner's supervisor; `None` = no chain of live links ties it
/// to strong evidence: counted, never killed.
#[derive(Debug, Clone, PartialEq)]
pub struct Victim {
    pub proc: Proc,
    pub via: Option<Vec<Proc>>,
}

/// What `reap` did: the pids killed, and those alive but left running because their link could not be confirmed.
#[derive(Debug, Default, PartialEq)]
pub struct Reaped {
    pub killed: Vec<u32>,
    pub left: Vec<u32>,
}

/// Kills the `victims` that a fresh snapshot confirms (`confirmed`); logs those left running. Windows kills through
/// one handle, checking the creation time on it; Unix signals right after the snapshot (a pid would have to be reused
/// within that window for a stranger to be hit: declared).
pub fn reap(victims: &[Victim]) -> Reaped {
    if victims.is_empty() {
        return Reaped::default();
    }
    let pids = || victims.iter().map(|v| v.proc.pid).collect::<Vec<_>>();
    let now = match snapshot() {
        Ok(now) => now,
        Err(e) => {
            eprintln!(
                "omni-qa: could not confirm the leftovers {:?} before a kill: {e}",
                pids()
            );
            return Reaped::default();
        }
    };
    let (sure, left) = confirmed(victims, &now);
    if !left.is_empty() {
        eprintln!("omni-qa: left running (link unconfirmable): {left:?}");
    }
    let killed = if sure.is_empty() {
        Ok(Vec::new())
    } else if cfg!(windows) {
        let sure: Vec<Proc> = victims
            .iter()
            .filter(|v| sure.contains(&v.proc.pid))
            .map(|v| v.proc.clone())
            .collect();
        windows::kill_confirmed(&sure)
    } else {
        let mut kill = Command::new("kill");
        kill.arg("-KILL").args(sure.iter().map(u32::to_string));
        // `kill` exits 1 when one of them died meanwhile: the others were still signalled.
        crate::bounded::run(&mut kill, TOOL_BOUND).map(|_| sure)
    };
    let killed = killed.unwrap_or_else(|e| {
        eprintln!("omni-qa: could not kill the leftovers {:?}: {e}", pids());
        Vec::new()
    });
    Reaped { killed, left }
}

/// The victims `now` (a fresh snapshot) confirms, and those it leaves running. A victim is confirmed when it and every
/// process of its chain are listed once with the identity (pid and start; an unknown start, 0, never) and the evidence
/// they were observed with: the same marker, or none (so a chain's marked base is marked still), and each child's
/// parent pid still its parent's. A dead identity never comes back, so a parent alive now held its pid all along, and
/// was the parent. macOS starts are to the second: a replacement born in the same second shares the identity, which
/// is why the marker itself is compared again. Windows FILETIME (100 ns) makes the identity itself unique. Alive (by
/// identity) but not confirmed, or ambiguous: left running.
pub fn confirmed(victims: &[Victim], now: &[Proc]) -> (Vec<u32>, Vec<u32>) {
    let entries = |p: &Proc| {
        now.iter()
            .filter(|q| p.created != 0 && q.pid == p.pid && q.created == p.created)
            .collect::<Vec<_>>()
    };
    let same = |p: &Proc| match entries(p).as_slice() {
        [q] if q.tag == p.tag => Some(q.ppid),
        _ => None,
    };
    let (mut sure, mut left) = (Vec::new(), Vec::new());
    for v in victims.iter().filter(|v| !entries(&v.proc).is_empty()) {
        let linked = same(&v.proc).is_some()
            && v.via.as_ref().is_some_and(|via| {
                std::iter::once(&v.proc)
                    .chain(via)
                    .zip(via)
                    .all(|(child, parent)| same(parent).is_some() && same(child) == Some(parent.pid))
            });
        if linked {
            sure.push(v.proc.pid);
        } else {
            left.push(v.proc.pid);
        }
    }
    (sure, left)
}

/// What K6 reads of one process: open descriptors (Unix fds, Windows handles) and resident memory.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Usage {
    pub fds: u64,
    pub rss_kb: u64,
}

/// K6's figures for a host and, once it has one, its supervisor (its child named `hugr-omni-supervisor`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct HostUsage {
    pub host: Usage,
    pub supervisor: Option<Usage>,
}

pub fn host_usage(pid: u32) -> Result<HostUsage, String> {
    let snap = snapshot()?;
    let sup = rules::supervisor(&snap, pid).map(|p| p.pid);
    Ok(HostUsage {
        host: usage(pid)?,
        supervisor: sup.map(usage).transpose()?,
    })
}

fn usage(pid: u32) -> Result<Usage, String> {
    if cfg!(target_os = "linux") {
        unix::proc_usage(pid)
    } else if cfg!(windows) {
        windows::usage(pid)
    } else {
        unix::mac_usage(pid)
    }
}

/// Runs a tool of the OS within `TOOL_BOUND` and returns its stdout; failing to run it, a failing exit, or no
/// answer in time is an error.
fn tool(program: &str, args: &[&str]) -> Result<String, String> {
    crate::bounded::stdout(program, args, TOOL_BOUND)
}
