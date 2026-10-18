//! W09 through the public API, where no contract scenario reaches: the deadline of a spawned child after its root
//! exited (C-TMO-01/02, §8), the armed work never outliving its child, and the Rust idioms of `run()` (C-RS-01: it
//! never blocks the caller's executor, dropping it kills the tree, its future is `Send`). Liveness comes from the OS.

use std::path::Path;
use std::pin::pin;
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

use super::{LIMIT, alive, assert_dead, binary, block, log_path, pidlog, use_supervisor};
use crate::types::{Data, Reason};
use crate::{CancellationToken, Command};

/// The pids in `log` once it holds `n` complete lines (each fixture process logs itself as it starts).
pub(super) fn logged(log: &Path, n: usize) -> Vec<u32> {
    let deadline = Instant::now() + LIMIT;
    loop {
        let pids = pids_in(log);
        if pids.len() >= n {
            assert_eq!(pids.len(), n, "more processes than expected: {pids:?}");
            return pids;
        }
        assert!(Instant::now() < deadline, "{n} pids never came: {pids:?}");
        std::thread::sleep(Duration::from_millis(5));
    }
}

/// Every complete line of `log`, as a pid.
pub(super) fn pids_in(log: &Path) -> Vec<u32> {
    let text = std::fs::read_to_string(log).unwrap_or_default();
    text.split_inclusive('\n')
        .filter_map(|line| line.strip_suffix('\n')?.trim().parse().ok())
        .collect()
}

/// Waits until `holds`, failing after `LIMIT`. For library state that has no marker to wait on.
pub(super) fn eventually(what: &str, holds: impl Fn() -> bool) {
    let deadline = Instant::now() + LIMIT;
    while !holds() {
        assert!(Instant::now() < deadline, "never happened: {what}");
        std::thread::sleep(Duration::from_millis(5));
    }
}

fn fixture() -> Command {
    use_supervisor();
    Command::new(binary("omni-fixture"))
}

/// §8: a spawned child cancelled after its root exited keeps the root's `Exit`, and what is left of its tree (a
/// descendant holding the output) is stopped.
#[test]
fn a_cancel_after_the_root_exited_stops_the_rest_and_keeps_its_exit() {
    let log = log_path("w09-cancel-after-exit");
    let token = CancellationToken::new();
    let child = fixture()
        .args([&pidlog(&log), "hold=60000", "exit=3"])
        .cancel_on(token.clone())
        .spawn()
        .expect("spawn");
    let holder = logged(&log, 2)[1];
    let exit = block(child.wait()).expect("wait");
    assert_eq!((exit.code, exit.reason), (Some(3), Reason::Exit), "{exit:?}");
    assert!(alive(holder), "the holder died before the cancellation");

    token.cancel();
    assert_dead(&[holder], Duration::from_secs(3));
    assert_eq!(block(child.wait()).expect("wait"), exit);
    let _ = std::fs::remove_file(&log);
}

/// `sh` starting the fixture with `steps` in the background, its stdio on the null device, and exiting: the root
/// ends at once and its output with it, but the tree keeps a member that holds none of its pipes. (A shell is the
/// program under test here, only to redirect the member's stdio.)
#[cfg(unix)]
pub(super) fn pipeless_member(log: &Path, steps: &str) -> Command {
    use_supervisor();
    let mut cmd = Command::new("sh");
    cmd.arg("-c")
        .arg(format!("\"$0\" \"$1\" {steps} </dev/null >/dev/null 2>&1 &"))
        .arg(binary("omni-fixture"))
        .arg(pidlog(log));
    cmd
}

/// C-TMO-01, nothing left behind: the root exits at once and its output ends, but it left a member of its tree
/// that holds none of its pipes. The timeout still stops that member, while the child is held, and the root's
/// `Exit` stays its own.
#[cfg(unix)]
#[test]
fn a_member_without_the_pipes_is_stopped_at_the_timeout() {
    let log = log_path("w09-lingering");
    let timeout = Duration::from_secs(2);
    let child = pipeless_member(&log, "hang")
        .timeout(timeout)
        .grace(Duration::from_millis(200))
        .spawn()
        .expect("spawn");
    let member = logged(&log, 1)[0];
    let exit = block(child.wait()).expect("wait");
    assert_eq!((exit.code, exit.reason), (Some(0), Reason::Exit), "{exit:?}");
    let left = block(child.processes()).expect("processes");
    assert_eq!(left.iter().map(|p| p.pid).collect::<Vec<_>>(), [member], "{left:?}");

    assert_dead(&[member], timeout + Duration::from_secs(2));
    assert_eq!(block(child.wait()).expect("wait"), exit);
    drop(child);
    let _ = std::fs::remove_file(&log);
}

/// The lingering armed work holds nothing past its tree either: with a member left without the pipes, no timeout
/// and a token that never fires, it lets go of everything once the member was stopped, killed by the drop of the
/// child, or ended on its own, without the deadline. (After the drop, our own hold keeps the child readable.)
#[cfg(unix)]
#[test]
fn lingering_armed_work_lets_go_without_its_deadline() {
    let token = CancellationToken::new();
    for end in ["stop", "drop", "itself"] {
        let log = log_path(&format!("w09-linger-{end}"));
        let steps = if end == "itself" { "sleep=1500" } else { "hang" };
        let child = pipeless_member(&log, steps)
            .cancel_on(token.clone())
            .spawn()
            .expect("spawn");
        let member = logged(&log, 1)[0];
        block(child.wait()).expect("wait");
        let inner = Arc::clone(&child.inner);
        // Held by the child and by us, and weakly by the armed work: it lingers.
        eventually(&format!("{end}: the armed work lingers"), || {
            Arc::strong_count(&inner) == 2 && Arc::weak_count(&inner) == 1
        });
        match end {
            "stop" => drop(block(child.stop(None)).expect("stop")),
            "drop" => drop(child),
            _ => {}
        }
        eventually(&format!("{end}: the armed work let go"), || {
            Arc::weak_count(&inner) == 0
        });
        assert_dead(&[member], Duration::from_secs(2));
        let _ = std::fs::remove_file(&log);
    }
    assert!(!token.is_cancelled());
}

/// The armed work never outlives its child, even with a token that never fires (K6): it lets go of a child that
/// ended on its own, or whose root exited and whose holder of the output was then stopped, without even a weak
/// hold left; and a dropped child is released (its tree with it).
#[test]
fn the_armed_work_lets_go_of_its_child() {
    let token = CancellationToken::new();
    let let_go = |inner: &Arc<_>| Arc::strong_count(inner) == 1 && Arc::weak_count(inner) == 0;
    let ended = fixture()
        .args(["out=x", "exit=0"])
        .cancel_on(token.clone())
        .spawn()
        .expect("spawn");
    block(ended.wait()).expect("wait");
    eventually("the armed work let go of an ended child", || let_go(&ended.inner));

    let held = fixture()
        .args(["hold=60000", "exit=0"])
        .cancel_on(token.clone())
        .spawn()
        .expect("spawn");
    block(held.wait()).expect("wait");
    block(held.stop(None)).expect("stop");
    eventually("the armed work let go of a stopped child", || let_go(&held.inner));

    let running = fixture()
        .args(["hang"])
        .cancel_on(token.clone())
        .timeout(LIMIT * 10)
        .spawn()
        .expect("spawn");
    let held = Arc::downgrade(&running.inner);
    drop(running);
    eventually("a dropped child was released", || held.upgrade().is_none());
    assert!(!token.is_cancelled());
}

/// C-RS-01: `run()` never blocks the caller's executor. On a single-threaded runtime the fixture waits for a line
/// that only another task of that same runtime writes, once the fixture has started: a `run()` that blocked its
/// thread would never let it be written. The runtime runs on a thread of its own, so a block fails the test.
#[test]
fn run_never_blocks_the_callers_executor() {
    let (log, go) = (log_path("w09-executor"), log_path("w09-executor-go"));
    let mut cmd = fixture();
    cmd.args([
        pidlog(&log),
        format!("watch=stdout:1:{}", go.display()),
        "exit=0".into(),
    ])
    .timeout(LIMIT);
    let (done, result) = mpsc::channel();
    std::thread::spawn(move || {
        let writer = async {
            while pids_in(&log).is_empty() {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            std::fs::write(&go, "go\n").expect("write the go file");
        };
        let ran = block(async { tokio::join!(cmd.run(), writer).0 });
        let _ = done.send(ran);
        let _ = std::fs::remove_file(&log);
        let _ = std::fs::remove_file(&go);
    });
    let out = result
        .recv_timeout(LIMIT)
        .expect("run() blocked the caller's executor")
        .expect("run");
    assert_eq!(out.stdout, Data::Text("LOGGED go\n".into()));
    assert!(out.exit.success(), "{:?}", out.exit);
}

/// C-IO-04, §6: once the root exited, the grace window is all its descendants get. A descendant that holds the
/// output and ignores the graceful request (it inherits the root's `ignore-term`) is stopped at once when the window
/// ends: `run()` returns about one grace after the root's exit, not two, with the root's own `Exit`, and only after
/// the holder is gone. The clock starts before the spawn, so the root's own start-up (slow on a loaded Windows
/// runner) is inside it: the bound is "less than two graces", with a grace long enough to tell the two apart.
#[test]
fn run_stops_a_resisting_holder_when_the_grace_window_ends() {
    let log = log_path("w09-window");
    let grace = Duration::from_millis(2000);
    let mut cmd = fixture();
    cmd.args([&pidlog(&log), "ignore-term", "out=ROOT\\n", "hold=60000", "exit=0"])
        .grace(grace);
    let started = Instant::now();
    let out = block(cmd.run()).expect("run");
    let took = started.elapsed();
    assert_eq!(
        (out.exit.code, out.exit.reason),
        (Some(0), Reason::Exit),
        "{:?}",
        out.exit
    );
    assert_eq!(out.stdout, Data::Text("ROOT\n".into()));
    assert!(took >= grace, "the window was cut short: {took:?}");
    assert!(took < grace * 2, "stopped after a second grace: {took:?}");
    assert_dead(&logged(&log, 2), Duration::ZERO);
    let _ = std::fs::remove_file(&log);
}

/// C-TMO-01, §6: a run that finishes at or after its deadline timed out, even when its root exited 0 at once and
/// `arm` applied the timeout before the run's own timer rang (timeout 0). The race depends on timing, so many runs.
#[test]
fn a_run_with_a_zero_timeout_always_times_out() {
    use_supervisor();
    let fixture = binary("omni-fixture");
    let caller = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("caller runtime");
    caller.block_on(async {
        for round in 0..4 {
            let runs: Vec<_> = (0..50)
                .map(|i| {
                    let mut cmd = Command::new(&fixture);
                    cmd.arg("exit=0").timeout(Duration::ZERO).grace(Duration::ZERO);
                    tokio::spawn(async move { (i, cmd.run().await) })
                })
                .collect();
            for run in runs {
                let (i, ran) = tokio::time::timeout(LIMIT, run)
                    .await
                    .expect("a run hung")
                    .expect("task");
                let exit = ran.expect("run").exit;
                assert!(
                    exit.reason == Reason::Timeout && !exit.success(),
                    "round {round} run {i}: {exit:?}"
                );
            }
        }
    });
}

/// C-RS-01 (drop kills): dropping a `run()` future that has not finished (a `select!`, an aborted task) kills its
/// whole tree at once, members that ignore the graceful request included.
#[test]
fn dropping_a_run_future_kills_its_tree() {
    let log = log_path("w09-run-drop");
    let mut cmd = fixture();
    cmd.args([&pidlog(&log), "ignore-term", "tree=2:resist", "hang"]);
    let pids = block(async {
        let mut run = pin!(cmd.run());
        loop {
            let polled = tokio::time::timeout(Duration::from_millis(10), run.as_mut()).await;
            assert!(polled.is_err(), "the run ended: {polled:?}");
            if pids_in(&log).len() == 3 {
                break logged(&log, 3);
            }
        }
    });
    assert_dead(&pids, Duration::from_secs(1));
    let _ = std::fs::remove_file(&log);
}

/// C-RS-01: a `run()` future can move to another thread (`tokio::spawn`, a binding's runtime).
#[test]
fn the_run_future_is_send() {
    fn send<T: Send>(_: &T) {}
    let cmd = Command::new("x");
    send(&cmd.run());
}
