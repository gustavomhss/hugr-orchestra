//! SUP-W, trees (ADR-0005 R1, R3, R5, R7, R10): `List` from the Job, graceful CTRL_BREAK and forced Job
//! termination under one shared deadline, unknown and released ids, host death (channel end, malformed
//! frame, killed host, stalled host), supervisor death, and the host's console left untouched.
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "windows_host.rs"]
pub mod host;

use std::os::windows::process::CommandExt;
use std::process::Stdio;
use std::time::{Duration, Instant};

use host::{Host, Lines, Proc, Spec, T, Tree, child_cmd};
use omni_proto::{Ack, Msg, ProcEntry};
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

const CTRL_BREAK_EXIT: u32 = 0xC000_013A;

fn last_number(line: &str) -> u32 {
    line.rsplit(' ').next().unwrap().parse().unwrap()
}

/// A chain root → 1 → 2, all hanging; `resist` makes each ignore CTRL_BREAK. Returns the tree and
/// [level 1, level 2] as seen by the OS.
fn chain(host: &mut Host, resist: bool, grace_ms: u32) -> (Tree, [Proc; 2]) {
    let mut spec = Spec::child(&["chain", "0", "2", if resist { "1" } else { "0" }, "0"]);
    spec.grace_ms = grace_ms;
    let t = host.spawn(spec).unwrap();
    let p1 = Proc::open(last_number(&t.stdout.line("PID 1 ")));
    let p2 = Proc::open(last_number(&t.stdout.line("PID 2 ")));
    t.stdout.line("READY");
    (t, [p1, p2])
}

/// One stop timing for the CI log (`-- --nocapture`).
fn timing(what: &str, took: Duration) {
    eprintln!("STOP-TIMING {what}: {} ms", took.as_millis());
}

fn exe_name() -> Option<String> {
    Some(
        std::env::current_exe()
            .unwrap()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned(),
    )
}

fn all_dead(t: &Tree, rest: &[Proc]) {
    assert!(!t.root.alive(), "the root survived");
    for p in rest {
        assert!(!p.alive(), "pid {} survived", p.pid());
    }
}

#[test]
fn list_follows_the_job_and_a_graceful_stop_breaks_the_root_group() {
    let mut host = Host::start();
    let (t, [p1, p2]) = chain(&mut host, false, 5000);
    let mut list = host.list(t.id);
    list.sort_by_key(|e| e.pid);
    let mut want = vec![
        ProcEntry {
            pid: t.pid,
            ppid: None,
            name: exe_name(),
        },
        ProcEntry {
            pid: p1.pid(),
            ppid: Some(t.pid),
            name: exe_name(),
        },
        ProcEntry {
            pid: p2.pid(),
            ppid: Some(p1.pid()),
            name: exe_name(),
        },
    ];
    want.sort_by_key(|e| e.pid);
    assert_eq!(list, want);
    let took = host.stop(t.id, 5000);
    timing("graceful, 3 processes, grace 5000", took);
    assert!(took < Duration::from_millis(2500), "a graceful stop took {took:?}");
    assert_eq!(host.exited(t.id), CTRL_BREAK_EXIT, "the root ended by CTRL_BREAK");
    assert_eq!(host.list(t.id), []);
    all_dead(&t, &[p1, p2]);
}

#[test]
fn a_resistant_tree_is_forced_at_the_earliest_of_overlapping_deadlines() {
    let mut host = Host::start();
    let (t, rest) = chain(&mut host, true, 1000);
    let t0 = Instant::now();
    let (a, b) = (host.req(), host.req());
    host.send(&Msg::Stop {
        req: a,
        id: t.id,
        grace_ms: 30_000,
    });
    host.send(&Msg::Stop {
        req: b,
        id: t.id,
        grace_ms: 1000,
    });
    assert_eq!(host.reply(a), Msg::Stopped { req: a, id: t.id });
    assert_eq!(host.reply(b), Msg::Stopped { req: b, id: t.id });
    let took = t0.elapsed();
    timing("forced, resistant, earliest deadline 1000", took);
    assert!(
        took >= Duration::from_millis(950) && took < Duration::from_millis(3000),
        "{took:?}"
    );
    assert_eq!(host.exited(t.id), 1, "forced by TerminateJobObject");
    all_dead(&t, &rest);
}

#[test]
fn after_the_root_exits_its_descendants_are_listed_and_still_stopped() {
    let mut host = Host::start();
    let t = host.spawn(Spec::child(&["chain", "0", "1", "0", "1"])).unwrap();
    let p1 = Proc::open(last_number(&t.stdout.line("PID 1 ")));
    assert_eq!(host.exited(t.id), 0);
    assert_eq!(
        host.list(t.id),
        [ProcEntry {
            pid: p1.pid(),
            ppid: None,
            name: exe_name()
        }]
    );
    let took = host.stop(t.id, 5000);
    timing("graceful after the root exited, grace 5000", took);
    assert!(
        took < Duration::from_millis(2500),
        "CTRL_BREAK did not reach the root's group: {took:?}"
    );
    assert_eq!(host.list(t.id), []);
    all_dead(&t, &[p1]);
}

#[test]
fn unknown_and_released_ids_get_ack_unknown_for_every_request() {
    let requests: [fn(u64, u64) -> Msg; 5] = [
        |req, id| Msg::Go { req, id },
        |req, id| Msg::Stop { req, id, grace_ms: 0 },
        |req, id| Msg::Resize {
            req,
            id,
            cols: 80,
            rows: 24,
        },
        |req, id| Msg::List { req, id },
        |req, id| Msg::Release { req, id },
    ];
    let mut host = Host::start();
    let mut ack = |id: u64, make: fn(u64, u64) -> Msg| match host.call(|req| make(req, id)) {
        Msg::Ack { result, .. } => result,
        other => panic!("{other:?}"),
    };
    for make in requests {
        assert_eq!(ack(999, make), Ack::Unknown);
    }
    let t = host.spawn(Spec::child(&["chain", "0", "0", "0", "0"])).unwrap();
    t.stdout.line("READY");
    let mut ack = |make: fn(u64, u64) -> Msg| match host.call(|req| make(req, t.id)) {
        Msg::Ack { result, .. } => result,
        other => panic!("{other:?}"),
    };
    assert_eq!(ack(requests[0]), Ack::Ok, "Go is a no-op on Windows");
    assert_eq!(ack(requests[2]), Ack::Closed, "a pipe tree has no terminal");
    assert_eq!(ack(requests[4]), Ack::Ok);
    for make in requests {
        assert_eq!(ack(make), Ack::Unknown);
    }
    assert!(t.root.alive(), "Release ends nothing");
    host.disconnect();
    assert!(
        t.root.dead_within(T),
        "a released tree is still stopped when the host dies"
    );
}

#[test]
fn host_death_by_channel_end_or_malformed_frame_stops_every_tree() {
    for malformed in [false, true] {
        let mut host = Host::start();
        let (t1, rest1) = chain(&mut host, true, 500);
        let (t2, rest2) = chain(&mut host, false, 500);
        let sup = host.sup_proc();
        if malformed {
            host.write(&[1, 0, 0, 0, 0x7F]); // unknown kind
        } else {
            host.disconnect();
        }
        assert!(
            sup.dead_within(T),
            "the supervisor outlived its host (malformed={malformed})"
        );
        assert_eq!(sup.exit_code(), 0, "clean shutdown: every tree gone");
        all_dead(&t1, &rest1);
        all_dead(&t2, &rest2);
    }
}

/// A sub-host (see `host::sub_host`) and its supervisor and tree.
fn sub_host(kind: &str) -> (std::process::Child, Lines, Proc, Vec<Proc>) {
    let mut sub = child_cmd(&["host", kind])
        .stdout(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .unwrap();
    let lines = Lines::new(sub.stdout.take().unwrap());
    let sup = Proc::open(last_number(&lines.line("SUP ")));
    let tree = lines
        .line("TREE ")
        .split(' ')
        .skip(1)
        .map(|p| Proc::open(p.parse().unwrap()))
        .collect();
    (sub, lines, sup, tree)
}

#[test]
fn a_killed_host_takes_its_trees_but_not_its_own_children() {
    let (mut sub, lines, sup, tree) = sub_host("kill");
    let control = Proc::open(last_number(&lines.line("CONTROL ")));
    sub.kill().unwrap(); // TerminateProcess: the host dies without a word
    assert!(sup.dead_within(T), "the supervisor outlived its host");
    assert_eq!(sup.exit_code(), 0);
    for p in &tree {
        assert!(!p.alive(), "pid {} survived its host", p.pid());
    }
    assert!(
        control.alive(),
        "control: a host's own std::process child survives the host"
    );
    control.kill();
}

#[test]
fn a_flooding_host_is_held_back_and_its_death_still_stops_the_trees() {
    let (mut sub, lines, sup, tree) = sub_host("flood");
    // A host write pending for 2 s: the supervisor stopped reading because its queues are bounded.
    lines.line("STALLED");
    sub.kill().unwrap();
    assert!(sup.dead_within(T), "a stalled channel kept the supervisor alive");
    assert_eq!(sup.exit_code(), 0);
    for p in &tree {
        assert!(!p.alive(), "pid {} survived", p.pid());
    }
}

#[test]
fn supervisor_death_ends_every_tree() {
    let mut host = Host::start();
    let (t, rest) = chain(&mut host, true, 30_000);
    host.sup.kill().unwrap();
    assert!(t.root.dead_within(T), "a tree outlived its supervisor");
    for p in &rest {
        assert!(p.dead_within(T), "a tree outlived its supervisor");
    }
}

#[test]
fn stops_never_reach_the_hosts_console() {
    // The sub-host owns a console and counts the console events it receives. It stops a tree gracefully
    // (CTRL_BREAK, which ends the root), then sends one CTRL_BREAK to its own console as the control:
    // exactly that one must have been counted.
    let (_sub, lines, _sup, tree) = sub_host("console");
    let line = lines.line("EVENTS ");
    let words: Vec<&str> = line.split(' ').collect();
    assert_eq!(words[..4], ["EVENTS", "1", "EXIT", "3221225786"], "{line}");
    assert!(words[5].parse::<u64>().unwrap() < 2500, "{line}");
    for p in &tree {
        assert!(!p.alive());
    }
}

#[test]
fn the_grace_starts_when_a_stop_or_the_host_death_is_received_even_after_idle() {
    let (mut a, mut b) = (Host::start(), Host::start());
    let (ta, _) = chain(&mut a, true, 1000);
    let (_tb, rest) = chain(&mut b, true, 1000);
    // Both supervisors sit idle (nothing to poll, no deadline) for longer than the grace. This sleep is the
    // scenario's length, not a synchronization: nothing waits on it.
    std::thread::sleep(Duration::from_millis(1500));
    let took = a.stop(ta.id, 1000);
    timing("forced after 1.5 s idle, grace 1000", took);
    assert!(
        took >= Duration::from_millis(950),
        "the grace started before the Stop arrived: {took:?}"
    );
    let sup = b.sup_proc();
    let t0 = Instant::now();
    b.disconnect();
    assert!(sup.dead_within(T), "the supervisor outlived its host");
    let took = t0.elapsed();
    timing("host death after 1.5 s idle, grace 1000 (supervisor exit)", took);
    assert!(
        took >= Duration::from_millis(950),
        "the grace started before the host died: {took:?}"
    );
    for p in &rest {
        assert!(!p.alive(), "pid {} survived", p.pid());
    }
}

#[test]
fn stopped_arrives_only_once_every_member_is_gone_even_ones_born_between_polls() {
    let log = std::env::temp_dir().join(format!("hugr-w06-{}-breed.log", std::process::id()));
    let _ = std::fs::remove_file(&log);
    let mut host = Host::start();
    let t = host.spawn(Spec::child(&["breed", log.to_str().unwrap()])).unwrap();
    t.stdout.line("READY");
    // The barrier: the root starts descendants only once the stop's CTRL_BREAK reaches it, and keeps
    // starting them until the Job is terminated at the deadline, so the last ones live between two polls.
    timing("breeding tree, grace 2000", host.stop(t.id, 2000));
    // The oracle, independent of the supervisor: the root logged each descendant's pid and creation time as
    // soon as it existed; the OS must report every one of them gone at the moment Stopped arrived.
    let logged = std::fs::read_to_string(&log).unwrap_or_default();
    let entries: Vec<(u32, u64)> = logged
        .lines()
        .filter_map(|l| {
            l.split_once(' ')
                .and_then(|(p, b)| Some((p.parse().ok()?, b.parse().ok()?)))
        })
        .collect();
    assert!(entries.len() >= 3, "the barrier never opened: {logged:?}");
    for (pid, born) in entries {
        assert!(host::os::gone(pid, born), "pid {pid} was alive when Stopped arrived");
    }
    assert!(!t.root.alive());
}

#[test]
fn a_tree_whose_root_made_its_own_nested_job_is_stopped_without_the_fallback() {
    let mut host = Host::start();
    let t = host.spawn(Spec::child(&["nest"])).unwrap();
    let p2 = Proc::open(last_number(&t.stdout.line("PID 2 ")));
    t.stdout.line("READY");
    let took = host.stop(t.id, 0);
    timing("forced at once, nested Job", took);
    // The port's NEW_PROCESS count matches the Job's TotalProcesses with a child Job inside: no 1 s fallback.
    assert!(took < Duration::from_millis(900), "the fallback ran: {took:?}");
    assert!(!p2.alive());
}
