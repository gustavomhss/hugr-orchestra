//! `max_rss_bytes` through the public API, against the real supervisor and `omni-fixture`: a tree that goes over its
//! cap is killed with `MemoryExceeded` (not `Timeout`, not its own exit), the resident memory of a descendant counts,
//! and a tree under its cap ends on its own.

use std::time::Duration;

use super::{LIMIT, binary, block, use_supervisor};
use crate::Command;
use crate::types::Reason;

const MIB: u64 = 1 << 20;

fn fixture() -> Command {
    use_supervisor();
    Command::new(binary("omni-fixture"))
}

/// The root itself holds 256 MiB against a cap of 64 MiB: `run()` ends long before its timeout, and says why.
#[test]
fn a_root_over_the_cap_is_killed_with_memory_exceeded() {
    let mut cmd = fixture();
    cmd.args(["alloc=256", "hang"]).max_rss_bytes(64 * MIB).timeout(LIMIT);
    let out = block(cmd.run()).expect("run");
    assert_eq!(out.exit.reason, Reason::MemoryExceeded, "{out:?}");
    assert!(!out.exit.success());
}

/// Only a descendant holds the memory (the root stays tiny): the cap is on the whole tree. Nothing of the tree is
/// left.
#[test]
fn a_descendant_over_the_cap_kills_the_whole_tree() {
    let mut cmd = fixture();
    cmd.args(["alloc-child=256", "hang"]).max_rss_bytes(64 * MIB);
    let child = cmd.spawn().expect("spawn");
    let exit = block(child.wait()).expect("wait");
    assert_eq!(exit.reason, Reason::MemoryExceeded, "{exit:?}");
    // `wait()` resolves at the root's exit; the stop that confirms the rest of the tree gone may still be finishing.
    let deadline = std::time::Instant::now() + LIMIT;
    while !block(child.processes()).expect("processes").is_empty() {
        assert!(std::time::Instant::now() < deadline, "the tree is still alive");
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// Control: the same program under a roomy cap, living through several samples (the period is 250 ms), exits on its
/// own and is not touched.
#[test]
fn a_tree_under_the_cap_exits_normally() {
    let mut cmd = fixture();
    cmd.args(["alloc=8", "sleep=1000", "exit=0"])
        .max_rss_bytes(1024 * MIB)
        .timeout(LIMIT);
    let started = std::time::Instant::now();
    let out = block(cmd.run()).expect("run");
    assert!(
        started.elapsed() >= Duration::from_millis(1000),
        "it did not live through the samples"
    );
    assert_eq!(out.exit.reason, Reason::Exit, "{out:?}");
    assert!(out.exit.success());
}
