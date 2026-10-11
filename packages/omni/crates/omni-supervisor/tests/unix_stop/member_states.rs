//! Members in unusual states: a stopped root, a member still being torn down after SIGKILL, and a zombie
//! thread-group leader whose other thread still runs.

use std::time::Duration;

use omni_proto::Exit;

use super::common::host::{Cmd, Host, field};
use super::common::os::{self, alive, wait_until};
use super::ms;

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
