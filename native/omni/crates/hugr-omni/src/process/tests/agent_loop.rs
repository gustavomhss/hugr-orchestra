//! QA-E, the W09 DoD: an agent's loop of 200 mixed commands, 20 at a time — `run()` and `spawn()`, quick and slow,
//! with output, input, descendants that hold the pipes or ignore the graceful request, output over the limit,
//! timeouts, stops, drops, and cancellations at arbitrary moments (before the start, during the run, racing its end).
//! It leaves no process behind (K1 = 0: every process the commands started is dead per the OS at the end) and no
//! call unresolved (K2 = 0: each command returns within `BOUND`, far above its own timeout + grace).

use std::path::{Path, PathBuf};
use std::time::Duration;

use super::deadline::pids_in;
use super::{assert_dead_logged, binary, log_path, pidlog, use_supervisor};
use crate::types::Reason;
use crate::{CancellationToken, Command, ErrorCode};

const COMMANDS: u64 = 200;
const AT_ONCE: usize = 20;
/// The kinds of command below.
const KINDS: u64 = 14;
/// The kind that is cancelled before it starts, so it logs nothing.
const NEVER_STARTS: u64 = 11;
const GRACE: Duration = Duration::from_millis(100);
/// K2: no command takes longer (each is meant to take at most ~0.5 s).
const BOUND: Duration = Duration::from_secs(5);

#[test]
fn an_agent_loop_leaves_nothing_behind() {
    use_supervisor();
    let log = log_path("w09-agent-loop");
    let fixture = binary("omni-fixture");
    let caller = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("caller runtime");
    caller.block_on(async {
        let all: Vec<u64> = (0..COMMANDS).collect();
        for batch in all.chunks(AT_ONCE) {
            let tasks: Vec<_> = batch
                .iter()
                .map(|&i| tokio::spawn(bounded(i, fixture.clone(), log.clone())))
                .collect();
            for task in tasks {
                task.await.expect("a command failed its check");
            }
        }
    });
    drop(caller);
    let pids = pids_in(&log);
    let started = (0..COMMANDS).filter(|i| i % KINDS != NEVER_STARTS).count();
    assert!(
        pids.len() >= started,
        "only {} pids logged for {started} commands",
        pids.len()
    );
    assert_dead_logged(&pids, Duration::from_secs(2), &log);
    let _ = std::fs::remove_file(&log);
}

/// K2: command `i` returns within `BOUND`.
async fn bounded(i: u64, fixture: PathBuf, log: PathBuf) {
    let done = tokio::time::timeout(BOUND, command(i, &fixture, &log)).await;
    assert!(
        done.is_ok(),
        "K2: command {i} (kind {}) did not return within {BOUND:?}",
        i % KINDS
    );
}

/// Command `i`, checked. `at` (0..300 ms, from `i`) is where its timeout or cancellation lands.
async fn command(i: u64, fixture: &Path, log: &Path) {
    let at = Duration::from_millis(spread(i) % 300);
    let token = CancellationToken::new();
    let mut cmd = Command::new(fixture);
    cmd.arg(pidlog(log)).grace(GRACE).cancel_on(token.clone());
    let cancel_at = |after: Duration| {
        let token = token.clone();
        async move {
            tokio::time::sleep(after).await;
            token.cancel();
        }
    };
    let kind = i % KINDS;
    match kind {
        0 => {
            let out = cmd.args(["out=ok", "exit=0"]).run().await.expect("run");
            assert!(out.exit.success() && out.stdout.to_string() == "ok", "{i}: {out:?}");
        }
        1 => {
            let out = cmd.args(["err=E", "exit=3"]).run().await.expect("run");
            assert_eq!((out.exit.code, out.exit.reason), (Some(3), Reason::Exit), "{i}");
            assert_eq!(out.stderr.to_string(), "E", "{i}");
        }
        2 => {
            let out = cmd.args(["lines=stdout:2000", "exit=0"]).run().await.expect("run");
            let text = out.stdout.to_string();
            assert!(
                text.starts_with("line 1\n") && text.ends_with("line 2000\n"),
                "{i}: {} bytes",
                text.len()
            );
        }
        3 => {
            let bytes = (spread(i) % 5000) as usize;
            let out = cmd
                .arg("count-stdin")
                .input(vec![b'x'; bytes])
                .run()
                .await
                .expect("run");
            assert_eq!(out.stdout.to_string(), format!("STDIN {bytes}\n"), "{i}");
        }
        4 => {
            // The root exits; a descendant holds the output past the grace window, then is stopped.
            let out = cmd
                .args(["out=ROOT\\n", "hold=60000", "exit=0"])
                .run()
                .await
                .expect("run");
            assert_eq!(
                (out.exit.reason, out.stdout.to_string()),
                (Reason::Exit, "ROOT\n".into()),
                "{i}"
            );
        }
        5 => {
            let timeout = at + Duration::from_millis(10);
            let out = cmd
                .args(["ignore-term", "tree=2:resist", "hang"])
                .timeout(timeout)
                .run()
                .await;
            let out = out.expect("run");
            assert_eq!(out.exit.reason, Reason::Timeout, "{i}: {out:?}");
        }
        6 => {
            let (ran, ()) = tokio::join!(cmd.args(["tree=1", "hang"]).run(), cancel_at(at));
            let e = ran.expect_err("a cancelled run that never ends");
            assert_eq!(e.code(), ErrorCode::Aborted, "{i}: {e}");
            assert_eq!(e.result().map(|r| r.exit.reason), Some(Reason::Aborted), "{i}");
        }
        7 => {
            // The cancellation races the end of a quick run: either outcome is right, nothing else is.
            let (ran, ()) = tokio::join!(cmd.args(["out=x", "exit=0"]).run(), cancel_at(at / 20));
            match ran {
                Ok(out) => assert!(out.exit.success(), "{i}: {out:?}"),
                Err(e) => assert!(e.code() == ErrorCode::Aborted && e.result().is_some(), "{i}: {e}"),
            }
        }
        8 => {
            let child = cmd
                .args(["tree=2", "hang"])
                .timeout(at + Duration::from_millis(10))
                .spawn();
            let exit = child.expect("spawn").wait().await.expect("wait");
            assert_eq!(exit.reason, Reason::Timeout, "{i}: {exit:?}");
        }
        9 => {
            let child = cmd
                .args(["ignore-term", "tree=1:resist", "hang"])
                .spawn()
                .expect("spawn");
            let (exit, ()) = tokio::join!(child.wait(), cancel_at(at));
            assert_eq!(exit.expect("wait").reason, Reason::Aborted, "{i}");
        }
        10 => {
            let child = cmd.args(["tree=2", "hang"]).spawn().expect("spawn");
            tokio::time::sleep(at).await;
            drop(child);
        }
        NEVER_STARTS => {
            token.cancel();
            let e = cmd.args(["out=x"]).run().await.expect_err("an already-cancelled run");
            assert!(e.code() == ErrorCode::Aborted && e.result().is_none(), "{i}: {e}");
        }
        12 => {
            let ran = cmd
                .args(["bytes=stdout:10000", "hang"])
                .max_output_bytes(1000)
                .run()
                .await;
            let e = ran.expect_err("a run over its output limit");
            assert_eq!(e.code(), ErrorCode::OutputLimit, "{i}: {e}");
        }
        _ => {
            let child = cmd.args(["tree=1", "hang"]).spawn().expect("spawn");
            tokio::time::sleep(at).await;
            assert_eq!(child.stop(None).await.expect("stop").reason, Reason::Killed, "{i}");
        }
    }
}

/// A fixed spread of `i` (a 64-bit LCG step).
fn spread(i: u64) -> u64 {
    i.wrapping_mul(0x5851_F42D_4C95_7F2D)
        .wrapping_add(0x1405_7B7E_F767_814F)
        >> 33
}
