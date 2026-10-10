//! The ownership rules on made-up process tables (both OSes' rules run on every OS), and the parsers on the shapes the
//! OS tools print. The rules decide K1 and what the harness kills, so every table holds processes that must be
//! proven, ones that may only be reported as incomplete, and strangers that must be neither.

use std::collections::{BTreeSet, HashMap};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use super::rules::{self, History, Who};
use super::unix::{command_lines, marker_in_environ, parse_ps_line, parse_stat};
use super::windows::kill_script;
use super::windows::parse_line;
use super::{Ask, Found, MARKER, Probe, Proc, Root, STAMP, Victim, Watch, before_spawn, confirmed, token};
use crate::setup::test_fixture;

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

/// An ask whose snapshot finishes after its deadline acts on nothing: a final observation that overran its timeout
/// must not kill the runner's marked process, and answers that it expired.
#[test]
fn an_expired_ask_kills_nothing() {
    let mut marked = Command::new(test_fixture())
        .arg("sleep=20000")
        .env(MARKER, "qexp1i0-std-1-")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let watch = Watch::start(std::process::id(), before_spawn());
    let (tx, rx) = mpsc::channel();
    let answer: super::Answer = Box::new(move |result| {
        let _ = tx.send(result);
    });
    let final_ask = Ask::Final {
        prefix: "qexp1i0-".into(),
    };
    watch.ask(final_ask, Duration::ZERO, Some(answer));
    let result = rx.recv_timeout(Duration::from_secs(60)).unwrap();
    let alive = marked.try_wait().unwrap().is_none();
    let _ = marked.kill();
    let _ = marked.wait();
    assert!(matches!(&result, Err(e) if e.contains("expired")), "{result:?}");
    assert!(alive, "the expired final observation killed a process");
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

/// The kill re-checks every identity: a pid now held by a newer process, a gone pid and an unknown start are spared.
#[test]
fn reap_kills_only_identities_confirmed_again() {
    let victims = [
        proc(10, 1, 10, 100, None),
        proc(11, 1, 11, 200, None),
        proc(12, 1, 12, 300, None),
        proc(13, 1, 13, 0, None),
    ];
    let now = [
        proc(10, 1, 10, 100, None),
        proc(11, 1, 11, 999, None),
        proc(13, 1, 13, 5, None),
    ];
    let strong: Vec<Victim> = victims
        .iter()
        .map(|p| Victim {
            proc: p.clone(),
            via: Some(Vec::new()),
        })
        .collect();
    assert_eq!(confirmed(&strong, &now), (vec![10], vec![]));
    let script = kill_script(&victims[..2]);
    assert!(script.contains("@(10,100,11,200)"), "{script}");
    assert!(
        script.contains("$null = $p.Handle") && script.contains("-lt 10) { $p.Kill()"),
        "{script}"
    );
}

#[test]
fn linux_stat_and_environ() {
    let tail = "0 -1 4194560 100 0 0 0 1 2 0 0 20 0 1 0 987654 1000 10";
    let stat = format!("4321 (omni fix (x)) S 4000 4321 4321 {tail}");
    let p = parse_stat(4321, &stat).unwrap().unwrap();
    assert_eq!(
        (p.ppid, p.pgid, p.created, p.name.as_str()),
        (4000, 4321, 987654, "omni fix (x)")
    );
    assert_eq!(
        parse_stat(4321, &format!("4321 (sh) Z 1 4321 4321 {tail}")).unwrap(),
        None
    );
    assert!(parse_stat(4321, "4321 (sh) S 1 4321 4321").is_err());
    let env = b"A=1\0HUGR_QA_TASK=q-1-\0B=2\0";
    assert_eq!(marker_in_environ(env).as_deref(), Some("q-1-"));
    assert_eq!(marker_in_environ(b"XHUGR_QA_TASK=q-1-\0"), None);
}

/// macOS: the marker counts only as an exact `HUGR_QA_TASK=<value>` word of the environment, which is what follows
/// the process's own command line (from the `ps` without `-E`). In argv, under another name, glued to another word, or
/// when the command lines do not line up, it is no marker.
#[test]
fn macos_ps_lines() {
    let args =
        "  812 /usr/local/bin/node vite.js\n   90 /bin/sh -c vite\n  93 fx HUGR_QA_TASK=q-1-\n  94 fx\n  95 fx\n";
    let argv = command_lines(args);
    assert_eq!(argv.get(&812), Some(&"/usr/local/bin/node vite.js"));
    let ps = |line: &str| parse_ps_line(line, &argv).unwrap().unwrap();
    let p =
        ps("  812   1   800 S    Sun Oct  4 02:31:07 2026     /usr/local/bin/node vite.js HUGR_QA_TASK=q-1- TERM=x");
    assert_eq!((p.pid, p.ppid, p.pgid, p.created), (812, 1, 800, 20261004023107));
    assert_eq!((p.name.as_str(), p.tag.as_deref()), ("node", Some("q-1-")));
    let hidden = ps("  90  89  89 S+   Mon Jan 12 10:00:00 2026 /bin/sh -c vite");
    assert_eq!((hidden.name.as_str(), hidden.tag), ("sh", None));
    let not_ours = [
        "  93   1  93 S    Mon Jan 12 10:00:00 2026 fx HUGR_QA_TASK=q-1- A=1", // only in argv
        "  94   1  94 S    Mon Jan 12 10:00:00 2026 fx OTHER_HUGR_QA_TASK=q-1-", // another variable
        "  95   1  95 S    Mon Jan 12 10:00:00 2026 fx X=HUGR_QA_TASK=q-1-",   // inside another value
        "  96   1  96 S    Mon Jan 12 10:00:00 2026 fx HUGR_QA_TASK=q-1-",     // no command line to split on
        "  95   1  95 S    Mon Jan 12 10:00:00 2026 fxHUGR_QA_TASK=q-1-",      // does not follow its command line
    ];
    for line in not_ours {
        assert_eq!(ps(line).tag, None, "{line}");
    }
    assert_eq!(
        parse_ps_line("  91  89  89 Z    Mon Jan 12 10:00:00 2026 (sh)", &argv).unwrap(),
        None
    );
    assert!(parse_ps_line("  92  89  89 S    Mon Foo 12 10:00:00 2026 x", &HashMap::new()).is_err());
    let (a, b) = (token(), token());
    assert!(
        a.len() == 32 && a.bytes().all(|c| c.is_ascii_hexdigit()) && a != b,
        "{a} {b}"
    );
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

#[test]
fn windows_cim_lines() {
    let p = parse_line("4321 4000 134049600000000000 omni fixture.exe").unwrap();
    assert_eq!((p.pid, p.ppid, p.created), (4321, 4000, 134049600000000000));
    assert_eq!(p.name, "omni fixture.exe");
    assert!(parse_line("4321 x 1 a").is_err());
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

/// Counting is generous, killing strict (Codex Q1 r9). The snapshot is not atomic: the marked parent P (20, created
/// 100) is read, then exits; a stranger reuses pid 20 (created 200) and spawns C (11, created 300), read later. C is
/// counted, but its link to P cannot be confirmed at the kill: left running. A leftover whose marked parent lives is
/// killed through that live link; a marked orphan whose parent exited is killed on its own marker. Windows: a root's
/// descendant is killed while the root (its identity bound to the task) lives, left running once it has exited.
#[test]
fn only_strong_evidence_confirmed_at_the_kill_kills() {
    let snap = [
        proc(20, 1, 20, 100, Some("q-1-")), // P, read first
        proc(11, 20, 11, 300, None),        // C, the stranger's child, read later
        proc(30, 1, 30, 100, Some("q-1-")), // marked, lives on
        proc(31, 30, 31, 150, None),        // its child, in a group of its own, environment hidden
        proc(40, 1, 40, 100, Some("q-1-")), // a marked orphan
    ];
    let found = rules::unix(&snap, &probe("q-1-", &[], 0), WHO);
    assert_eq!(found.proven, [11, 20, 30, 31, 40], "counted generously");
    let marked = |p: &Proc| p.tag.as_deref() == Some("q-1-");
    let victims = rules::victims(&snap, &found.proven, &marked, &|_| false);
    let now = [
        proc(20, 1, 20, 200, None), // the stranger holding P's pid
        proc(11, 20, 11, 300, None),
        proc(30, 1, 30, 100, Some("q-1-")),
        proc(31, 30, 31, 150, None),
        proc(40, 1, 40, 100, Some("q-1-")),
    ];
    assert_eq!(confirmed(&victims, &now), (vec![30, 31, 40], vec![11]));
    // Windows: the task's root 10 (bound by its spawn window) and its child 11.
    let snap = [
        proc(5, 4, 0, 100, None),
        proc(10, 5, 0, 210, None),
        proc(11, 10, 0, 220, None),
    ];
    let bound = Root {
        pid: 10,
        from: 200,
        to: 300,
    };
    let root = |p: &Proc| bound.is(p.pid, p.created);
    let victims = rules::victims(&snap, &[10, 11], &root, &|_| false);
    assert_eq!(confirmed(&victims, &snap), (vec![10, 11], vec![]));
    let root_gone = [proc(5, 4, 0, 100, None), proc(11, 10, 0, 220, None)];
    assert_eq!(confirmed(&victims, &root_gone), (vec![], vec![11]));
}

/// Codex Q1 r10: macOS starts are to the second, so the marked P (20, started at second 100) and an unmarked
/// replacement born in the same second share the observed identity. The marker is compared again: neither the
/// replacement nor P's child C is killed; both are left running.
#[test]
fn a_same_second_replacement_without_the_marker_is_never_killed() {
    let snap = [proc(20, 1, 20, 100, Some("q-1-")), proc(11, 20, 11, 100, None)];
    let marked = |p: &Proc| p.tag.as_deref() == Some("q-1-");
    let victims = rules::victims(&snap, &[20, 11], &marked, &|_| false);
    let now = [proc(20, 1, 20, 100, None), proc(11, 20, 11, 100, None)];
    assert_eq!(confirmed(&victims, &now), (vec![], vec![20, 11]));
    assert_eq!(
        confirmed(&victims, &snap),
        (vec![20, 11], vec![]),
        "the marked P itself is still killed"
    );
}
