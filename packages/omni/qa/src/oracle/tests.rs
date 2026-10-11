//! The ownership rules on made-up process tables (both OSes' rules run on every OS); the parsers (`parse`) and the
//! kill side (`kill`) are in submodules. The rules decide K1 and what the harness kills, so every table holds
//! processes that must be proven, ones that may only be reported as incomplete, and strangers that must be neither.

use std::collections::BTreeSet;

use super::rules::{self, History, Who};
use super::{Found, Probe, Proc, Root, STAMP};

mod kill;
mod parse;

fn proc(pid: u32, ppid: u32, pgid: u32, created: u64, tag: Option<&str>) -> Proc {
    Proc {
        pid,
        ppid,
        pgid,
        created,
        name: "p".into(),
        tag: tag.map(Into::into),
    }
}

/// Each root was spawned within `since..=since + 100`.
fn probe(tag: &str, roots: &[u32], since: u64) -> Probe {
    Probe {
        tag: tag.into(),
        roots: roots
            .iter()
            .map(|&pid| Root {
                pid,
                from: since,
                to: since + 100,
            })
            .collect(),
        since,
    }
}

fn found(proven: &[u32], incomplete: &[u32], batch: &[u32]) -> Found {
    Found {
        proven: proven.to_vec(),
        incomplete: incomplete.to_vec(),
        batch: batch.to_vec(),
    }
}

const WHO: Who = Who { host: 5, me: 4 };

fn supervisor(pid: u32, ppid: u32, pgid: u32, created: u64) -> Proc {
    Proc {
        name: "hugr-omni-supervisor".into(),
        ..proc(pid, ppid, pgid, created, None)
    }
}

#[test]
fn unix_proves_the_marker_the_groups_and_children_and_reports_an_exited_roots_group_as_incomplete() {
    let snap = [
        proc(4, 1, 4, 0, None),
        proc(5, 4, 4, 0, None),           // the host, in the asker's group
        supervisor(7, 5, 7, 0),           //
        proc(20, 1, 99, 0, Some("q-1-")), // marked, in a group of its own, orphaned
        proc(21, 20, 21, 0, None),        // its child, environment hidden (an Apple binary)
        proc(31, 1, 99, 0, None),         // in the marked process's group
        proc(70, 7, 70, 0, None),         // a live root of the task, environment hidden: its pid is no proof
        proc(71, 1, 70, 0, None),         // in that root's group: incomplete
        proc(30, 1, 10, 0, None),         // in the group of the root 10, which has exited: incomplete
        proc(32, 30, 32, 0, None),        // its child: incomplete
        proc(40, 1, 40, 0, Some("q-2-")), // another task's
        proc(60, 5, 4, 0, Some("q-1-")),  // marked, in the asker's group: proven, the group is not taken
        proc(61, 1, 4, 0, None),          // so this one is not
    ];
    let got = rules::unix(&snap, &probe("q-1-", &[10, 70], 0), WHO);
    assert_eq!(got, found(&[20, 21, 31, 60], &[30, 32, 70, 71], &[]));
}

/// The root 10 of task a has exited, and another task of the same runner, b, got pid 10 for its own root, with a
/// child. Only b's identity proves them; for a they are nothing, neither counted nor killed.
#[test]
fn a_root_pid_reused_by_another_task_of_the_runner_is_never_the_first_task_s() {
    // Unix: b's root carries b's marker.
    let snap = [
        proc(4, 1, 4, 0, None),
        proc(5, 4, 4, 0, None),
        supervisor(7, 5, 7, 0),
        proc(10, 7, 10, 0, Some("q-2-")),
        proc(11, 10, 10, 0, None),
    ];
    assert_eq!(rules::unix(&snap, &probe("q-1-", &[10], 0), WHO), Found::default());
    assert_eq!(
        rules::unix(&snap, &probe("q-2-", &[10], 0), WHO),
        found(&[10, 11], &[], &[])
    );
    // Windows: a's root was created at 210 (a's spawn window is 200..=300), b's at 400.
    let base = [
        proc(4, 1, 0, 50, None),
        proc(5, 4, 0, 100, None),
        supervisor(7, 5, 0, 150),
    ];
    let first = [proc(10, 7, 0, 210, None)];
    let then = [proc(10, 7, 0, 400, None), proc(11, 10, 0, 410, None)];
    let first: Vec<Proc> = base.iter().chain(&first).cloned().collect();
    let then: Vec<Proc> = base.iter().chain(&then).cloned().collect();
    let mut hist = History::default();
    hist.record(&first, 120, 300, 5);
    hist.record(&then, 120, 500, 5);
    let a = probe("a", &[10], 200);
    assert_eq!(rules::windows(&then, &hist, &a, None, WHO), Found::default());
    let named = BTreeSet::from([10]);
    assert_eq!(
        rules::windows(&then, &hist, &a, Some((200, &named)), WHO),
        Found::default()
    );
    let b = probe("b", &[10], 350);
    assert_eq!(rules::windows(&then, &hist, &b, None, WHO), found(&[10, 11], &[], &[]));
}

#[test]
fn strangers_whose_parent_exited_are_never_counted() {
    // Unix: the stranger and its child, in a group of their own, the parent gone.
    let snap = [
        proc(4, 1, 4, 0, None),
        proc(5, 4, 4, 0, None),
        proc(50, 1, 50, 0, None),
        proc(51, 50, 50, 0, None),
    ];
    assert_eq!(rules::unix(&snap, &probe("q-1-", &[10], 0), WHO), Found::default());
    // Windows: created during the task, its parent never seen and not a root of the task.
    let snap = [
        proc(4, 1, 0, 50, None),
        proc(5, 4, 0, 100, None),
        proc(17, 99, 0, 420, None),
    ];
    let mut hist = History::default();
    hist.record(&snap, 120, 500, 5);
    let named = BTreeSet::from([10]);
    let got = rules::windows(&snap, &hist, &probe("a", &[10], 200), Some((200, &named)), WHO);
    assert_eq!(got, Found::default());
}

/// Two snapshots: one while the batch runs (300), the last after the task returned (500). The task's root 10 (a
/// child of the host) has exited by then and its pid was reused by a stranger.
#[test]
fn windows_proves_links_observed_while_alive_and_nothing_through_a_reused_pid() {
    let base = [
        proc(4, 1, 0, 50, None),
        proc(5, 4, 0, 100, None),
        supervisor(7, 5, 0, 150),
    ];
    let during = [
        proc(10, 5, 0, 210, None), // the task's root
        proc(11, 10, 0, 220, None),
        proc(15, 7, 0, 230, None), // a root of omni's `run()` (pid unknown to the task)
        proc(16, 15, 0, 240, None),
        proc(19, 5, 0, 250, None), // the root of another task of the batch
        proc(80, 5, 0, 260, None), // the host's own child, no task's root
        proc(81, 80, 0, 270, None),
    ];
    let after = [
        proc(11, 10, 0, 220, None),
        proc(12, 11, 0, 400, None), // born after the root exited, of a live proven parent
        proc(13, 10, 0, 450, None), // claims the root as parent, born after it was last seen: incomplete
        proc(14, 10, 0, 290, None), // never seen with its parent, but born while the root was seen alive
        proc(16, 15, 0, 240, None),
        proc(19, 5, 0, 250, None),
        proc(81, 80, 0, 270, None),
        proc(10, 3, 0, 460, None), // the root's pid, reused by a stranger
    ];
    let mut hist = History::default();
    let during: Vec<Proc> = base.iter().chain(&during).cloned().collect();
    let after: Vec<Proc> = base.iter().chain(&after).cloned().collect();
    hist.record(&during, 120, 300, 5);
    hist.record(&after, 120, 500, 5);
    let task = probe("a", &[10], 200);
    assert_eq!(
        rules::windows(&after, &hist, &task, None, WHO),
        found(&[11, 12, 14], &[13], &[])
    );
    // Last check of the batch: omni's root and its child are the batch's, not the other task's root 19.
    let named = BTreeSet::from([10, 19]);
    let last = rules::windows(&after, &hist, &task, Some((200, &named)), WHO);
    assert_eq!(last, found(&[11, 12, 14], &[13], &[16]));
}

/// Windows, a `run()` task as a batch of its own (how the omni arm runs them there): its root (the supervisor's child)
/// leaves a short-lived descendant and exits. Checked at once, on the task's return, the chain observed while the
/// root lived proves it; a check that waited for a longer task of the same batch would find nothing left to count.
#[test]
fn windows_a_run_root_s_short_leftover_is_proven_when_its_own_task_returns() {
    let base = [
        proc(4, 1, 0, 50, None),
        proc(5, 4, 0, 100, None),
        supervisor(7, 5, 0, 150),
    ];
    let while_running = [proc(15, 7, 0, 230, None), proc(16, 15, 0, 240, None)];
    let on_return = [proc(16, 15, 0, 240, None)]; // the root has exited, its descendant lives on briefly
    let mut hist = History::default();
    let while_running: Vec<Proc> = base.iter().chain(&while_running).cloned().collect();
    let on_return: Vec<Proc> = base.iter().chain(&on_return).cloned().collect();
    hist.record(&while_running, 120, 300, 5);
    hist.record(&on_return, 120, 500, 5);
    let task = probe("a", &[], 200);
    let alone = BTreeSet::new();
    assert_eq!(
        rules::windows(&on_return, &hist, &task, Some((200, &alone)), WHO),
        found(&[], &[], &[16])
    );
    // When the longer task ends, the leftover is gone: only the immediate check could have counted it.
    hist.record(&base, 120, 4000, 5);
    assert_eq!(
        rules::windows(&base, &hist, &task, Some((200, &alone)), WHO),
        Found::default()
    );
}

/// Windows: once the runner has ended, a stranger gets its pid, with a child and a would-be supervisor of its own; the
/// snapshot that sees them is late. The pinned identity keeps them out: only the runner's real descendant is its.
#[test]
fn windows_a_process_reusing_the_runner_s_pid_is_never_its_anchor() {
    let during = [
        proc(4, 1, 0, 50, None),
        proc(5, 4, 0, 100, None), // the runner, pinned on its first snapshot
        supervisor(7, 5, 0, 150),
        proc(10, 5, 0, 210, None),
        proc(11, 10, 0, 220, None),
    ];
    let after = [
        proc(4, 1, 0, 50, None),
        proc(5, 3, 0, 600, None), // a stranger with the runner's pid
        supervisor(8, 5, 0, 605), // named like a supervisor, the stranger's child
        proc(30, 5, 0, 610, None),
        proc(31, 8, 0, 620, None),
        proc(11, 10, 0, 220, None),
    ];
    let mut hist = History::default();
    hist.record(&during, 120, 300, 5);
    hist.record(&after, 120, 5000, 5);
    assert_eq!(rules::leftovers(&after, &hist, "q1i3-", WHO, true), [11]);
    let named = BTreeSet::new();
    let check = rules::windows(&after, &hist, &probe("a", &[], 200), Some((200, &named)), WHO);
    assert_eq!(
        check,
        Found::default(),
        "neither the stranger's children nor its would-be supervisor's"
    );
}

#[test]
fn leftovers_after_a_runner_ended_are_its_marked_processes_or_its_observed_descendants() {
    let unix = [
        proc(4, 1, 4, 0, None),
        proc(20, 1, 20, 0, Some("q1i3-omni-4-")),  // a task of this runner
        proc(21, 1, 20, 0, None),                  // in its group, environment hidden
        proc(22, 21, 22, 0, None),                 // a child of that one
        proc(30, 1, 30, 0, Some("q1i33-omni-1-")), // another runner's (its prefix only looks alike)
        proc(40, 1, 40, 0, None),                  // a stranger
    ];
    assert_eq!(
        rules::leftovers(&unix, &History::default(), "q1i3-", WHO, false),
        [20, 21, 22]
    );
    // Windows: the runner (5) was seen alive with its child 10; now the runner is gone and 11 lives on.
    let during = [
        proc(4, 1, 0, 50, None),
        proc(5, 4, 0, 100, None),
        proc(10, 5, 0, 210, None),
        proc(11, 10, 0, 220, None),
    ];
    let after = [
        proc(4, 1, 0, 50, None),
        proc(11, 10, 0, 220, None),
        proc(17, 99, 0, 420, None),
    ];
    let mut hist = History::default();
    hist.record(&during, 120, 300, 5);
    hist.record(&after, 120, 500, 5);
    assert_eq!(rules::leftovers(&after, &hist, "q1i3-", WHO, true), [11]);
}

/// Windows: the runner and the root and descendant it started at once, all created before the oracle's thread ran
/// (the root on the very tick boundary: `start` is read before the spawn, less one stamp). The history keeps them
/// from that start on: the task's check proves both, and so does the final observation once the runner is gone.
#[test]
fn windows_a_root_created_before_the_oracle_thread_started_is_still_the_task_s() {
    let spawn = 1_000_000; // read just before the runner was spawned
    let start = spawn - STAMP;
    let during = [
        proc(4, 1, 0, 50, None),
        proc(5, 4, 0, start, None),       // the runner, stamped a tick early
        proc(10, 5, 0, start, None),      // its root, on the boundary
        proc(11, 10, 0, start + 1, None), // the root's descendant
    ];
    let mut hist = History::default();
    hist.record(&during, start, spawn + 3_000_000, 5); // the oracle thread's first snapshot, much later
    let task = Probe {
        tag: "a".into(),
        roots: vec![Root {
            pid: 10,
            from: spawn,
            to: spawn + 100,
        }],
        since: spawn,
    };
    assert_eq!(
        rules::windows(&during, &hist, &task, None, WHO),
        found(&[10, 11], &[], &[])
    );
    let after = [
        proc(4, 1, 0, 50, None),
        proc(10, 5, 0, start, None),
        proc(11, 10, 0, start + 1, None),
    ];
    hist.record(&after, start, spawn + 9_000_000, 5);
    assert_eq!(rules::leftovers(&after, &hist, "q-x-", WHO, true), [10, 11]);
    // The bug this guards: a history started on the oracle's thread, after the spawn, kept neither.
    let mut late = History::default();
    late.record(&during, spawn + 2_000_000, spawn + 3_000_000, 5);
    assert_eq!(rules::windows(&during, &late, &task, None, WHO), Found::default());
}

/// Codex Q1 r8: a child read before its parent exited, whose parent's pid a marked process of the task then reused in
/// the same (non-atomic) snapshot, is not that new process's child: a parent never postdates its child.
#[test]
fn a_parent_newer_than_its_child_never_adopts_it() {
    let snap = vec![proc(11, 20, 11, 100, None), proc(20, 1, 20, 300, Some("q-1-"))];
    let mut set = std::collections::BTreeSet::from([20]);
    super::rules::children_for_test(&snap, &mut set);
    assert_eq!(
        set.into_iter().collect::<Vec<_>>(),
        vec![20],
        "the older stranger 11 was adopted"
    );
}
