//! C-KILL-01, C-KILL-02, C-EXIT-01, C-PROC-01, C-SCOPE-01 against the real supervisor: what `stop`, `kill` (drop),
//! `wait` and `processes` do to a fixture tree, checked with the OS.

use std::time::{Duration, Instant};

use super::{Started, alive, assert_dead, block, fixture_name, log_path, pidlog};
use crate::types::{ProcessInfo, Reason};

/// Signals exist (contract §7: always `None` on Windows).
fn unix() -> bool {
    std::env::consts::OS != "windows"
}

/// The entries `processes()` must return for a chain of pids (each the parent of the next); the first one's parent
/// is not listed.
fn chain(pids: &[u32]) -> Vec<ProcessInfo> {
    let parents = std::iter::once(None).chain(pids.iter().copied().map(Some));
    let mut want: Vec<ProcessInfo> = pids
        .iter()
        .zip(parents)
        .map(|(&pid, parent_pid)| ProcessInfo {
            pid,
            parent_pid,
            name: Some(fixture_name()),
        })
        .collect();
    want.sort_by_key(|p| p.pid);
    want
}

fn listed(t: &Started) -> Vec<ProcessInfo> {
    let mut list = block(t.life.processes()).expect("processes");
    list.sort_by_key(|p| p.pid);
    list
}

/// C-KILL-01, C-PROC-01: a 4-level tree is listed with its links and names; `stop()` ends all of it on the graceful
/// request alone, then is a no-op returning the same `Exit`, and nothing is listed any more.
#[test]
fn stop_ends_the_whole_tree_once() {
    let log = log_path("whole");
    let t = Started::new(log.clone(), &[&pidlog(&log), "tree=3", "hang"]);
    let pids = t.pids(4);
    assert_eq!(listed(&t), chain(&pids));

    let grace = Duration::from_secs(5);
    let started = Instant::now();
    let exit = block(t.life.stop(Reason::Killed, grace)).expect("stop");
    assert!(
        started.elapsed() < grace / 5,
        "not ended by the graceful request: {:?}",
        started.elapsed()
    );
    assert_eq!(exit.reason, Reason::Killed, "{exit:?}");
    if unix() {
        assert_eq!((exit.code, exit.signal.as_deref()), (None, Some("SIGTERM")), "{exit:?}");
    }
    assert_dead(&pids, Duration::ZERO);
    assert_eq!(listed(&t), []);

    let again = Instant::now();
    assert_eq!(block(t.life.stop(Reason::Killed, grace)).expect("stop again"), exit);
    assert!(
        again.elapsed() < grace / 5,
        "a second stop waited: {:?}",
        again.elapsed()
    );
}

/// C-KILL-01, C-PROC-01, C-EXIT-01: once the root exited on its own, its descendants stay listed (without the root)
/// and alive; `stop()` ends them and keeps the root's `Exit`, and so does every later call.
#[test]
fn stop_after_the_root_exited_ends_the_rest_and_keeps_its_exit() {
    let log = log_path("rest");
    let watch = format!("watch=stdout:3:{}", log.display());
    let t = Started::new(log.clone(), &[&pidlog(&log), "tree=2", &watch, "exit=5"]);
    let pids = t.pids(3);
    let exit = block(t.life.wait()).expect("wait");
    assert_eq!(
        (exit.code, exit.signal.as_deref(), exit.reason),
        (Some(5), None, Reason::Exit)
    );
    let rest = &pids[1..];
    assert!(
        rest.iter().all(|&p| alive(p)),
        "the descendants died with the root: {rest:?}"
    );
    assert_eq!(listed(&t), chain(rest));

    let started = Instant::now();
    assert_eq!(
        block(t.life.stop(Reason::Killed, Duration::from_secs(5))).expect("stop"),
        exit
    );
    assert!(started.elapsed() < Duration::from_secs(1), "{:?}", started.elapsed());
    assert_dead(&pids, Duration::ZERO);
    assert_eq!(listed(&t), []);
    assert_eq!(
        block(t.life.stop(Reason::Killed, Duration::ZERO)).expect("stop again"),
        exit
    );
    assert_eq!(block(t.life.wait()).expect("wait again"), exit);
}

/// C-KILL-02, C-EXIT-01: the graceful request comes first; a cooperative child finishes and exits 0, well inside the
/// grace, and that is still `killed` (contract §7).
#[test]
fn a_cooperative_child_exits_on_the_graceful_request() {
    let log = log_path("cooperative");
    let t = Started::new(log.clone(), &["on-term=bye", &pidlog(&log), "hang"]);
    let pids = t.pids(1);
    let started = Instant::now();
    let exit = block(t.life.stop(Reason::Killed, Duration::from_secs(5))).expect("stop");
    assert!(started.elapsed() < Duration::from_secs(1), "{:?}", started.elapsed());
    assert_eq!(
        (exit.code, exit.signal.as_deref(), exit.reason),
        (Some(0), None, Reason::Killed)
    );
    assert!(!exit.success());
    assert_dead(&pids, Duration::ZERO);
}

/// C-KILL-02: a tree that ignores the graceful request is forced at the deadline: not before `grace`, not long
/// after, and nothing survives.
#[test]
fn a_resisting_tree_is_forced_at_the_deadline() {
    let log = log_path("resisting");
    let t = Started::new(log.clone(), &[&pidlog(&log), "ignore-term", "tree=2:resist", "hang"]);
    // The root and level 1 ignore SIGTERM before level 2 starts and logs.
    let pids = t.pids(3);
    let grace = Duration::from_millis(1500);
    let started = Instant::now();
    let exit = block(t.life.stop(Reason::Killed, grace)).expect("stop");
    let took = started.elapsed();
    assert!(
        took >= grace - Duration::from_millis(100),
        "forced before the deadline: {took:?}"
    );
    assert!(took < grace + Duration::from_secs(1), "forced late: {took:?}");
    assert_eq!(exit.reason, Reason::Killed, "{exit:?}");
    if unix() {
        assert_eq!((exit.code, exit.signal.as_deref()), (None, Some("SIGKILL")), "{exit:?}");
    }
    assert_dead(&pids, Duration::ZERO);
}

/// C-SCOPE-01 (Rust drop): `kill`, what dropping a `Child` does (a synchronous call that only queues the `Stop`),
/// forces the whole tree at once: it is gone soon after per the OS although it ignores the graceful request, and the
/// cause is `killed`.
#[test]
fn kill_forces_the_whole_tree_at_once() {
    let log = log_path("kill");
    let t = Started::new(log.clone(), &[&pidlog(&log), "ignore-term", "tree=2:resist", "hang"]);
    let pids = t.pids(3);
    t.life.kill();
    assert_dead(&pids, Duration::from_secs(1));
    let exit = block(t.life.wait()).expect("wait");
    assert_eq!(exit.reason, Reason::Killed, "{exit:?}");
    if unix() {
        assert_eq!(exit.signal.as_deref(), Some("SIGKILL"), "{exit:?}");
    }
}

/// C-EXIT-01: exit codes (0/1/42/255; on Windows also above 255) and Unix signals are reported as is, with reason
/// `exit` / `signal`, and `wait` returns the same `Exit` every time.
#[test]
fn exit_codes_and_signals_are_reported_as_is() {
    let mut codes = vec![0, 1, 42, 255];
    if !unix() {
        codes.extend([3_221_225_786, u32::MAX]);
    }
    for code in codes {
        let t = Started::new(log_path(&format!("code-{code}")), &[&format!("exit={code}")]);
        let exit = block(t.life.wait()).expect("wait");
        assert_eq!(
            (exit.code, exit.signal.as_deref(), exit.reason),
            (Some(code), None, Reason::Exit)
        );
        assert_eq!(exit.success(), code == 0);
        assert_eq!(block(t.life.wait()).expect("wait again"), exit);
    }
    let signals: &[&str] = if unix() { &["SIGTERM", "SIGKILL"] } else { &[] };
    for &name in signals {
        let t = Started::new(log_path(name), &[&format!("signal={name}")]);
        let exit = block(t.life.wait()).expect("wait");
        assert_eq!(
            (exit.code, exit.signal.as_deref(), exit.reason),
            (None, Some(name), Reason::Signal)
        );
        assert!(!exit.success());
    }
}
