//! Each case keeps the actual child until after its independent OS observations.

use std::sync::Arc;
use std::time::Duration;

use super::super::deadline::logged;
use super::super::{alive, block};
use super::support::{MIB, Scenario, TIMEOUT};
use crate::{CancellationToken, Reason};

pub(super) fn rss() {
    let mut run = Scenario::new("rss", Some(64 * MIB), None, None);
    assert!(run.rss() < 64 * MIB, "actual root+descendant must start below the cap");
    run.fault();
    run.incomplete();
    assert!(run.rss() < 64 * MIB, "fault must precede actual memory growth");
    assert!(run.pids.iter().all(|pid| alive(*pid)));
    run.recover();
    run.gate("grow");
    assert_eq!(logged(&run.directory.join("allocating.pids"), 1), [run.pids[1]]);
    run.assert_dead(Duration::from_secs(3));
    let exit = block(run.child().wait()).expect("memory enforcement status");
    assert_eq!(
        exit.reason,
        Reason::MemoryExceeded,
        "real RSS after recovery must enforce the cap"
    );
    run.no_weak();
    run.finish().expect("successful RSS case cleanup");
}

pub(super) fn deadline(periodic: bool, cancel: bool) {
    let token = CancellationToken::new();
    let mut run = Scenario::new(
        "hang",
        None,
        (!cancel).then_some(TIMEOUT),
        cancel.then(|| token.clone()),
    );
    if periodic {
        run.gate("root-exit");
        let exit = block(run.child().wait()).expect("root exit");
        assert_eq!((exit.code, exit.reason), (Some(0), Reason::Exit));
        run.listed(); // No diagnostic processes() call: this reply belongs to the actual settled watcher.
        run.lingering();
    }
    if !cancel {
        run.place_timeout_fault();
    }
    run.fault();
    if !periodic {
        run.gate("root-exit");
        let exit = block(run.child().wait()).expect("gated root exit");
        assert_eq!((exit.code, exit.reason), (Some(0), Reason::Exit));
    }
    run.incomplete();
    assert!(alive(run.pids[1]), "real pipeless member present at inventory failure");
    run.recover();
    if cancel {
        assert!(!token.is_cancelled());
        token.cancel();
        run.assert_dead(Duration::from_secs(3));
    }
    if !cancel {
        let remaining = (TIMEOUT + Duration::from_secs(1)).saturating_sub(run.started.elapsed());
        run.assert_dead(remaining);
        assert!(
            run.started.elapsed() < TIMEOUT + Duration::from_millis(1200),
            "deadline reset after recovery"
        );
    }
    // The root's status was committed before timeout/cancellation, so it remains its own result.
    let exit = block(run.child().wait()).expect("same root status after member enforcement");
    assert_eq!((exit.code, exit.reason), (Some(0), Reason::Exit));
    run.no_weak();
    run.finish().expect("successful deadline case cleanup");
}

pub(super) fn release(drop_child: bool) {
    let mut run = Scenario::new(if drop_child { "hang" } else { "normal" }, Some(1024 * MIB), None, None);
    run.fault();
    run.incomplete();
    run.recover();
    if drop_child {
        run.drop_child();
    }
    if !drop_child {
        run.gate("finish");
        run.gate("root-exit");
        let exit = block(run.child().wait()).expect("normal completion");
        assert_eq!((exit.code, exit.reason), (Some(0), Reason::Exit));
    }
    run.assert_dead(Duration::from_secs(3));
    run.no_weak();
    assert_eq!(Arc::weak_count(&run.inner), 0);
    run.finish().expect("successful release case cleanup");
}
