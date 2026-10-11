//! The kill side of the oracle: an expired ask acts on nothing, and only strong evidence, confirmed again at the
//! kill, kills.

use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use super::super::rules;
use super::super::windows::kill_script;
use super::super::{Answer, Ask, MARKER, Proc, Root, Victim, Watch, before_spawn, confirmed};
use super::{WHO, probe, proc};
use crate::setup::test_fixture;

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
    let answer: Answer = Box::new(move |result| {
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
