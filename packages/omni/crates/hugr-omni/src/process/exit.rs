//! `Exit` from the root's status and the cause the library committed: one pure function (contract §7). W07.

use crate::client::RootExit;
use crate::types::{Exit, Reason};

/// The `Exit` of a root that ended with `root`, given the termination cause the library committed (`None`: it had
/// not acted when the root's exit was observed).
///
/// Precedence of `reason` (contract §7, "the cause is committed when the library acts"):
/// 1. if the root's exit was observed before the library sent any termination, the root's own status decides:
///    `Exit` for an exit code, `Signal` for a Unix signal;
/// 2. otherwise the first of `Killed` (stop or drop), `Timeout` or `Aborted` that the library acted on, which the
///    caller commits once and passes here as `cause`.
///
/// `code` and `signal` always carry the root's native status, whatever the reason: a child that handles SIGTERM and
/// exits 0 after `stop()` is `Killed` with code 0. A `cause` of `Exit` or `Signal` is not a library action and
/// counts as none.
pub(super) fn of(root: RootExit, cause: Option<Reason>) -> Exit {
    let (code, signal, own) = match root {
        RootExit::Code(code) => (Some(code), None, Reason::Exit),
        RootExit::Signal(num) => (None, Some(signal_name(num, std::env::consts::OS)), Reason::Signal),
    };
    let reason = match cause {
        Some(acted @ (Reason::Killed | Reason::Timeout | Reason::Aborted)) => acted,
        Some(Reason::Exit | Reason::Signal) | None => own,
    };
    Exit { code, signal, reason }
}

/// The name of Unix signal `num` on `os` (`std::env::consts::OS`): Linux numbers its signals one way, macOS and
/// the BSDs another. Only signals whose default action ends a process are named; any other number (e.g. a Linux
/// real-time signal) is `SIG<num>`.
pub(super) fn signal_name(num: i32, os: &str) -> String {
    let shared = match num {
        1 => Some("SIGHUP"),
        2 => Some("SIGINT"),
        3 => Some("SIGQUIT"),
        4 => Some("SIGILL"),
        5 => Some("SIGTRAP"),
        6 => Some("SIGABRT"),
        8 => Some("SIGFPE"),
        9 => Some("SIGKILL"),
        11 => Some("SIGSEGV"),
        13 => Some("SIGPIPE"),
        14 => Some("SIGALRM"),
        15 => Some("SIGTERM"),
        24 => Some("SIGXCPU"),
        25 => Some("SIGXFSZ"),
        26 => Some("SIGVTALRM"),
        27 => Some("SIGPROF"),
        _ => None,
    };
    let own = match (os, num) {
        ("linux", 7) => Some("SIGBUS"),
        ("linux", 10) => Some("SIGUSR1"),
        ("linux", 12) => Some("SIGUSR2"),
        ("linux", 16) => Some("SIGSTKFLT"),
        ("linux", 29) => Some("SIGIO"),
        ("linux", 30) => Some("SIGPWR"),
        ("linux", 31) => Some("SIGSYS"),
        ("linux", _) => None,
        (_, 7) => Some("SIGEMT"),
        (_, 10) => Some("SIGBUS"),
        (_, 12) => Some("SIGSYS"),
        (_, 30) => Some("SIGUSR1"),
        (_, 31) => Some("SIGUSR2"),
        _ => None,
    };
    shared.or(own).map_or_else(|| format!("SIG{num}"), str::to_owned)
}
