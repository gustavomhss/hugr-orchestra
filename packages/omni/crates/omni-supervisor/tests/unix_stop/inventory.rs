//! Stopping when the inventory is incomplete or pidfd is missing (Linux): descriptor exhaustion injected
//! with `prlimit`, and a kernel without pidfd simulated with seccomp.

use omni_proto::{Ack, Exit, Msg};

use super::common::host::{Cmd, Host, field};
use super::common::os::{self, alive};
use super::ms;

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
