//! C-SCOPE-01 (Rust drop), through the public API: dropping a child force-kills its whole tree at once, also after
//! the caller's runtime is gone, and the drop itself never blocks or panics.

use std::sync::mpsc;
use std::time::Duration;

use super::{LIMIT, assert_dead, binary, block, use_supervisor};
use crate::Command;
use crate::process::PipeChild;

/// A root and two descendants that all ignore the graceful request.
fn resisting() -> PipeChild {
    use_supervisor();
    Command::new(binary("omni-fixture"))
        .args(["ignore-term", "tree=2:resist", "hang"])
        .spawn()
        .expect("spawn")
}

/// Every pid of the tree, once its markers say each descendant is up and ignoring SIGTERM (`PID <level> <pid>`).
async fn tree_pids(child: &PipeChild) -> Vec<u32> {
    let mut lines = child.lines().expect("lines");
    let mut pids = vec![child.pid()];
    while pids.len() < 3 {
        let line = lines.next().await.expect("output ended early").expect("line");
        let pid = line.text.strip_prefix("PID ").and_then(|rest| rest.split_once(' '));
        pids.extend(pid.and_then(|(_, pid)| pid.parse::<u32>().ok()));
    }
    pids
}

/// Drops `child` on a thread of its own, which must finish within `bound`: a drop that blocks or panics fails.
fn drop_within(child: PipeChild, bound: Duration) {
    let (done, dropped) = mpsc::channel();
    std::thread::spawn(move || {
        drop(child);
        let _ = done.send(());
    });
    dropped
        .recv_timeout(bound)
        .expect("dropping the child blocked or panicked");
}

#[test]
fn dropping_a_child_kills_its_whole_tree() {
    let child = resisting();
    let pids = block(tree_pids(&child));
    drop_within(child, Duration::from_secs(1));
    assert_dead(&pids, Duration::from_secs(1));
}

#[test]
fn dropping_a_child_after_the_callers_runtime_shut_down_kills_its_whole_tree() {
    let caller = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .build()
        .expect("caller runtime");
    let (child, pids) = caller.block_on(async {
        let child = resisting();
        let pids = tokio::time::timeout(LIMIT, tree_pids(&child)).await.expect("timed out");
        (child, pids)
    });
    drop(caller);
    drop_within(child, Duration::from_secs(1));
    assert_dead(&pids, Duration::from_secs(1));
}
