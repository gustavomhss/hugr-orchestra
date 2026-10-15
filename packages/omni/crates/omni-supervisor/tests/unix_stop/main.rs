//! SUP-U, stopping and pinning: `Stop` gives the whole session one deadline and never touches another
//! process; the root stays pinned until its session is empty, `Release` notwithstanding; `List` answers
//! exactly what `Stop` would reach and tells an incomplete inventory from an empty one; members are reached
//! without pidfd too (ADR-0005 §3–§4, R3, R4, R5, R10).
#![cfg(unix)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "../common/mod.rs"]
mod common;
#[cfg(target_os = "linux")]
mod inventory;
mod member_states;

use std::collections::HashMap;
use std::time::{Duration, Instant};

use common::host::{Cmd, Host, field};
use common::os::{self, alive, wait_until};
use common::role::sentinel;
use omni_proto::{Ack, Exit, Msg};

/// Entry point of the child roles (`common::role`); a no-op in a normal run.
#[test]
fn role() {
    common::role::main();
}

fn ms(n: u64) -> Duration {
    Duration::from_millis(n)
}

#[test]
fn stop_gives_the_whole_session_one_deadline_and_spares_everyone_else() {
    let mut outsider = sentinel(); // unrelated, resists SIGTERM, own group
    let mut h = Host::start();
    // Root (polite) + resistant leaf in another group + resistant leaf in the root's group + polite leaf.
    let t = h.spawn(&Cmd::role("tree hang resist+group resist plain"));
    let leaves = field(&t.out.take("UP ", 3), 1);
    let took = h.stop(t.id, 400);
    assert!(
        took >= ms(400) && took < ms(1400),
        "the resistant leaves need the forced step at 400 ms: {took:?}"
    );
    assert_eq!(
        h.exits.get(&t.id),
        Some(&Exit::Signal(libc::SIGTERM)),
        "Exited comes before Stopped"
    );
    for p in leaves.iter().chain([&t.pid]) {
        assert!(!alive(*p), "{p} survived a confirmed Stop");
    }
    assert!(
        alive(outsider.id() as i32),
        "Stop touched a process outside the session"
    );

    // Control: a polite tree needs no forced step.
    let t = h.spawn(&Cmd::role("tree hang plain+group plain"));
    t.out.take("UP ", 2);
    assert!(h.stop(t.id, 5000) < ms(1000));
    outsider.kill().unwrap();
    outsider.wait().unwrap();
}

#[test]
fn stop_after_the_root_exited_ends_the_orphans_and_keeps_the_exit() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree exit resist+group"));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    assert_eq!(h.exited(t.id), Exit::Code(0));
    assert_eq!(os::sid(leaf), t.pid);
    assert!(
        os::zombie(t.pid),
        "the root must stay unreaped while its session has a live member"
    );
    let list = h.list(t.id).unwrap();
    assert_eq!(
        list.iter().map(|p| (p.pid, p.ppid)).collect::<Vec<_>>(),
        [(leaf as u32, None)]
    );

    assert!(h.stop(t.id, 200) >= ms(200));
    assert!(!alive(leaf));
    assert!(!os::exists(t.pid), "the root is reaped once the session is empty");
    assert_eq!(h.list(t.id).unwrap(), []);
    assert!(h.stop(t.id, 5000) < ms(100), "a gone tree is Stopped at once");
    assert_eq!(h.exits[&t.id], Exit::Code(0), "the recorded exit never changes");
}

#[test]
fn a_stop_after_an_idle_period_gets_its_whole_grace() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang resist"));
    t.out.take("UP ", 1);
    std::thread::sleep(ms(1500)); // the scenario: the supervisor sits idle, then a Stop arrives
    let took = h.stop(t.id, 1000);
    assert!(
        took >= ms(1000) && took < ms(2000),
        "the grace must start at the Stop: {took:?}"
    );
}

#[test]
fn overlapping_stops_share_the_earliest_deadline() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang resist"));
    t.out.take("UP ", 1);
    let (slow, fast) = (h.req(), h.req());
    let t0 = Instant::now();
    h.send(
        &Msg::Stop {
            req: slow,
            id: t.id,
            grace_ms: 20_000,
        },
        &[],
    );
    h.send(
        &Msg::Stop {
            req: fast,
            id: t.id,
            grace_ms: 300,
        },
        &[],
    );
    for req in [fast, slow] {
        assert!(matches!(h.reply(req), Msg::Stopped { id, .. } if id == t.id));
    }
    let took = t0.elapsed();
    assert!(took >= ms(300) && took < ms(2000), "{took:?}");
}

#[test]
fn list_is_exactly_what_stop_reaches() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang resist+group plain+group plain"));
    let ups = t.out.take("UP ", 3);
    let leaves = field(&ups, 1);
    assert_eq!(
        field(&ups, 2).iter().filter(|&&g| g != t.pid).count(),
        2,
        "two leaves in other groups"
    );
    let exe = std::env::current_exe().unwrap();
    let name = exe.file_name().unwrap().to_str().unwrap().to_owned(); // longer than Linux's 15-byte comm
    let mut want = HashMap::from([(t.pid as u32, (None, Some(name.clone())))]);
    for &l in &leaves {
        want.insert(l as u32, (Some(t.pid as u32), Some(name.clone())));
    }
    let got: HashMap<_, _> = h
        .list(t.id)
        .unwrap()
        .into_iter()
        .map(|p| (p.pid, (p.ppid, p.name)))
        .collect();
    assert_eq!(got, want);

    h.stop(t.id, 200);
    assert!(leaves.iter().all(|&l| !alive(l)));
    assert_eq!(h.list(t.id).unwrap(), [], "a gone tree lists nothing");
}

#[test]
fn release_keeps_the_pin_while_resistant_descendants_live_in_other_groups() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree exit resist+group resist+group").grace(300));
    let leaves = field(&t.out.take("UP ", 2), 1);
    assert_eq!(h.exited(t.id), Exit::Code(0));
    assert_eq!(h.ack(|req| Msg::Release { req, id: t.id }), Ack::Ok);
    for &l in &leaves {
        assert_eq!(
            (os::sid(l), os::pgid(l) == t.pid),
            (t.pid, false),
            "a session member in another group"
        );
    }
    assert!(os::zombie(t.pid), "Release must not end the pin while descendants live");

    // Group-only control: what a group-only implementation would send reaches neither leaf.
    os::killpg(t.pid, libc::SIGKILL);
    assert!(
        !wait_until(ms(300), || leaves.iter().any(|&l| !alive(l))),
        "the group signal reached a leaf"
    );
    assert!(os::zombie(t.pid), "still pinned");

    // The released id answers nothing, but cleanup duty stays: host death stops the whole session.
    assert_eq!(h.list(t.id), Err(Ack::Unknown));
    let status = h.close();
    assert_eq!(status.code(), Some(0), "clean exit = every tree confirmed gone");
    assert!(leaves.iter().all(|&l| !alive(l)));
}

#[test]
fn unknown_released_and_misdirected_requests_are_answered() {
    let mut h = Host::start();
    let id = 4242;
    assert_eq!(h.ack(|req| Msg::Stop { req, id, grace_ms: 0 }), Ack::Unknown);
    assert_eq!(h.list(id), Err(Ack::Unknown));
    assert_eq!(h.ack(|req| Msg::Go { req, id }), Ack::Unknown);
    assert_eq!(
        h.ack(|req| Msg::Resize {
            req,
            id,
            cols: 80,
            rows: 24
        }),
        Ack::Unknown
    );
    assert_eq!(h.ack(|req| Msg::Release { req, id }), Ack::Unknown);

    let t = h.spawn(&Cmd::role("leaf plain"));
    t.out.take("UP ", 1);
    assert_eq!(
        h.ack(|req| Msg::Go { req, id: t.id }),
        Ack::Ok,
        "a pipe root needs no Go"
    );
    assert_eq!(
        h.ack(|req| Msg::Resize {
            req,
            id: t.id,
            cols: 80,
            rows: 24
        }),
        Ack::Error,
        "no terminal"
    );
    assert_eq!(h.ack(|req| Msg::Release { req, id: t.id }), Ack::Ok);
    assert_eq!(h.ack(|req| Msg::Release { req, id: t.id }), Ack::Unknown);
    assert_eq!(
        h.ack(|req| Msg::Stop {
            req,
            id: t.id,
            grace_ms: 0
        }),
        Ack::Unknown
    );
    assert_eq!(h.close().code(), Some(0));
    assert!(!alive(t.pid), "a released tree is still stopped at host death");
}
