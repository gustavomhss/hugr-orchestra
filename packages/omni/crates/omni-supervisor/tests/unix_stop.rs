//! SUP-U, stopping and pinning: `Stop` gives the whole session one deadline and never touches another
//! process; the root stays pinned until its session is empty, `Release` notwithstanding; `List` answers
//! exactly what `Stop` would reach and tells an incomplete inventory from an empty one; members are reached
//! without pidfd too (ADR-0005 §3–§4, R3, R4, R5, R10).
#![cfg(unix)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

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

/// Descriptor exhaustion injected with `prlimit` (Linux), below even the supervisor's emergency reserve
/// (limit 3: no new descriptor at all): the `/proc` scan fails, so `List` is an error (never an empty list)
/// and `Stop` is not confirmed. Afterwards everything works and the supervisor holds exactly the descriptors
/// it held before (the reserve was released and refilled).
#[cfg(target_os = "linux")]
#[test]
fn an_incomplete_inventory_is_an_error_and_never_confirms_a_stop() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang resist+group"));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    let sup = h.sup.id();
    let before = os::fds_of(sup);

    let soft = os::set_nofile(sup as i32, 3); // only stdio numbers: the inventory cannot be read at all
    assert_eq!(
        h.list(t.id),
        Err(Ack::Error),
        "an incomplete inventory is not an empty list"
    );
    let req = h.req();
    h.send(
        &Msg::Stop {
            req,
            id: t.id,
            grace_ms: 0,
        },
        &[],
    );
    while let Ok(Some(msg)) = h.recv_within(ms(500)) {
        assert!(
            matches!(msg, Msg::Exited { .. }),
            "no Stopped from an incomplete scan: {msg:?}"
        );
    }
    assert!(
        alive(leaf),
        "the member in another group cannot be found without the inventory"
    );

    os::set_nofile(sup as i32, soft);
    assert!(matches!(h.reply(req), Msg::Stopped { .. }));
    assert!(!alive(leaf));
    assert_eq!(os::fds_of(sup), before, "exhaustion leaked no descriptor");
}

/// A kernel without pidfd, simulated with seccomp (Linux): `Ready.info` says so, and members in other
/// groups are still reached by the documented fallback (session re-check, then `kill`).
#[cfg(target_os = "linux")]
#[test]
fn without_pidfd_members_in_other_groups_are_still_stopped() {
    let mut h = Host::start_with(os::without_pidfd);
    assert_eq!(h.info, 0, "neither host watch nor member signalling may claim pidfd");
    let t = h.spawn(&Cmd::role("tree hang resist+group resist"));
    let leaves = field(&t.out.take("UP ", 2), 1);
    assert!(h.stop(t.id, 200) >= ms(200));
    assert!(leaves.iter().all(|&l| !alive(l)));
}

/// The graceful step waits for a complete inventory (Linux, `prlimit` below the reserve): a cooperative member
/// in another group that the first sweeps could not see still gets SIGTERM once the inventory recovers, long
/// before the deadline, instead of going straight to SIGKILL at it (contract §5).
#[cfg(target_os = "linux")]
#[test]
fn the_graceful_step_waits_for_a_complete_inventory() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang report+group"));
    t.out.take("UP ", 1);
    let sup = h.sup.id() as i32;
    let soft = os::set_nofile(sup, 3);
    let req = h.req();
    h.send(
        &Msg::Stop {
            req,
            id: t.id,
            grace_ms: 60_000,
        },
        &[],
    );
    // The root's group needs no inventory: its SIGTERM proves sweeps ran while the inventory was missing.
    assert_eq!(h.exited(t.id), Exit::Signal(libc::SIGTERM));
    os::set_nofile(sup, soft);
    t.out.take("TERM", 1); // the member in another group got its graceful signal after the recovery
    assert!(
        matches!(h.reply(req), Msg::Stopped { .. }),
        "confirmed long before the 60 s deadline"
    );
}

/// One free descriptor (Linux, `prlimit` at open fds + 1): the `/proc` scan works, then the member's pidfd
/// takes the last slot and its `/proc` re-check fails. The signal step must use the reserve too, or a
/// resistant member in another group is never reached and `Stopped` never comes.
#[cfg(target_os = "linux")]
#[test]
fn a_stop_with_one_free_descriptor_still_reaches_members_in_other_groups() {
    let mut h = Host::start();
    assert_ne!(
        h.info & omni_proto::INFO_PIDFD_MEMBERS,
        0,
        "this case is about pidfd signalling"
    );
    let t = h.spawn(&Cmd::role("tree hang resist+group"));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    let sup = h.sup.id();
    os::set_nofile(sup as i32, os::fds_of(sup).len() as u64 + 1);
    assert!(h.stop(t.id, 200) >= ms(200));
    assert!(!alive(leaf));
}

/// macOS `waitid(WEXITED | WNOWAIT)` also reports a child that is merely stopped (found by W04): a stopped,
/// then continued root is never reported as exited, never unpinned; it gets exactly one `Exited` when it
/// really exits.
#[test]
fn a_stopped_root_is_not_an_exited_root() {
    let mut h = Host::start();
    let mut t = h.spawn(&Cmd::role("tree stdin").stdin());
    t.out.take("ROOT ", 1);
    os::kill(t.pid, libc::SIGSTOP);
    assert!(wait_until(Duration::from_secs(5), || os::stopped(t.pid)));
    // Another root's exit makes the supervisor ask waitid about every root, the stopped one included.
    let other = h.spawn(&Cmd::role("exit 0"));
    assert_eq!(h.exited(other.id), Exit::Code(0));
    let list = h.list(t.id).unwrap(); // a round trip: anything sent before it has been read
    assert!(!h.exits.contains_key(&t.id), "a stop is not an exit");
    assert!(
        list.iter().any(|p| p.pid == t.pid as u32),
        "a stopped root is a live member"
    );
    os::kill(t.pid, libc::SIGCONT);
    drop(t.stdin.take()); // end of input: the root exits 0
    assert_eq!(h.exited(t.id), Exit::Code(0));
    assert!(h.stop(t.id, 1000) < ms(1000)); // another round trip: a second Exited would fail the host
}

/// `Stopped` means gone: a member that takes long to tear down after SIGKILL (macOS: `getsid` and
/// `proc_pidinfo` already fail for it, but it is not a zombie yet) must be a zombie or gone, per the OS, when
/// `Stopped` arrives (lead r4: an exiting process is never "gone").
#[test]
fn stopped_waits_for_a_member_that_is_still_being_torn_down() {
    let mut h = Host::start();
    for _ in 0..3 {
        let t = h.spawn(&Cmd::role("tree hang resist+group+heavy"));
        let leaf = field(&t.out.take("UP ", 1), 1)[0];
        h.stop(t.id, 100);
        assert!(
            !alive(leaf),
            "Stopped arrived while member {leaf} was still being torn down"
        );
    }
}

/// Linux: a thread-group leader that ended while another thread runs shows as a zombie in /proc, yet the
/// process lives: `List` reaches it, and `Stopped` comes only after its last thread ended (its threads ignore
/// SIGTERM, so only the SIGKILL at the deadline ends them).
#[cfg(target_os = "linux")]
#[test]
fn a_zombie_leader_with_a_running_thread_is_a_live_member() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang resist+group+zleader"));
    let leaf = field(&t.out.take("ZLEADER ", 1), 1)[0];
    let stat = std::fs::read_to_string(format!("/proc/{leaf}/stat")).unwrap();
    assert!(
        stat.rsplit_once(')').unwrap().1.trim_start().starts_with('Z'),
        "precondition: a zombie leader"
    );
    assert!(alive(leaf), "precondition: a thread still runs");
    let list = h.list(t.id).unwrap();
    assert!(
        list.iter().any(|p| p.pid == leaf as u32),
        "List must reach it: {list:?}"
    );
    let took = h.stop(t.id, 300);
    assert!(
        took >= ms(300),
        "Stopped before the SIGKILL at the deadline ended the thread: {took:?}"
    );
    assert!(!alive(leaf));
}
