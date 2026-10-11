//! SUP-U, PID-reuse sentinel (ADR-0005 §4, R10): the number of a gone tree is really handed to an unrelated
//! process-group leader, and `Stop`/`List` on the old tree never reach it (control: a naive `killpg` on the
//! old number kills it). While a root is pinned (exited, members alive), the allocator skips its number.
//!
//! Linux steers the allocator with `/proc/sys/kernel/ns_last_pid`, in a private pid namespace when the test
//! cannot write it here (`unshare -Urpf --mount-proc`). macOS allocates pids sequentially, so the test
//! cycles the allocator around to the number. This test never skips: if neither is possible, it fails.
#![cfg(unix)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use std::os::unix::process::CommandExt;
use std::process::{Child, Stdio};
use std::time::{Duration, Instant};

use common::host::{Cmd, Host, Lines, field};
use common::os::{self, alive, wait_until};
use common::role::command;
use omni_proto::{Ack, Exit, Msg};

/// Entry point of the child roles (`common::role`); a no-op in a normal run.
#[test]
fn role() {
    common::role::main();
}

#[test]
fn a_gone_tree_never_touches_its_recycled_number_and_a_pinned_one_is_skipped() {
    #[cfg(target_os = "linux")]
    if !linux::can_steer() {
        return linux::in_private_pid_namespace(
            "a_gone_tree_never_touches_its_recycled_number_and_a_pinned_one_is_skipped",
        );
    }
    let mut h = Host::start();
    // A: completely gone (root exited, no descendant, reaped).
    let a = h.spawn(&Cmd::role("exit 0"));
    assert_eq!(h.exited(a.id), Exit::Code(0));
    h.stop(a.id, 0);
    // B: root exited, a member lives: the zombie root pins the number.
    let b = h.spawn(&Cmd::role("tree exit resist+group+long")); // must outlive the cycle
    let b_leaf = field(&b.out.take("UP ", 1), 1)[0];
    assert_eq!(h.exited(b.id), Exit::Code(0));

    let (on_a, after_b) = steer_both(a.pid, b.pid);
    assert_eq!(
        on_a.pid(),
        a.pid,
        "precondition: the gone tree's number now leads another group"
    );
    assert_eq!(os::pgid(a.pid), a.pid);
    assert_ne!(after_b.pid(), b.pid, "a pinned number must be skipped by the allocator");

    let t0 = Instant::now();
    h.stop(a.id, 5000);
    assert!(
        t0.elapsed() < Duration::from_millis(100),
        "a gone tree is Stopped at once"
    );
    assert_eq!(h.list(a.id).unwrap(), [], "the recycled number is not the old tree");
    assert_eq!(h.ack(|req| Msg::Release { req, id: a.id }), Ack::Ok);
    h.stop(b.id, 200);
    assert!(!alive(b_leaf));
    assert!(
        alive(on_a.pid()) && alive(after_b.pid()),
        "Stop reached an unrelated process"
    );

    // Control: what a supervisor that forgot the tree was gone would do does kill the newcomer.
    os::killpg(a.pid, libc::SIGKILL);
    assert!(
        wait_until(Duration::from_secs(5), || !alive(on_a.pid())),
        "the control must hit"
    );
}

/// A child of this test that is killed and reaped whenever it goes out of scope, a failing assert included.
struct Owned(Child);

impl Owned {
    fn pid(&self) -> i32 {
        self.0.id() as i32
    }
}

impl Drop for Owned {
    fn drop(&mut self) {
        let _ = self.0.kill(); // it may have exited already
        let _ = self.0.wait();
    }
}

/// A new unrelated group leader in its own group, once it runs. It outlives a whole macOS cycle (`long`):
/// the first one must still lead its group after the second steer, which may take minutes.
fn newcomer() -> Owned {
    let mut c = command("leaf plain+long");
    c.process_group(0).stdout(Stdio::piped());
    let mut child = Owned(c.spawn().unwrap());
    Lines::new(child.0.stdout.take().unwrap()).take("UP ", 1);
    child
}

/// Spawns one newcomer right after `a - 1` (it must get `a`) and one right after `b - 1` (it must not get
/// `b`), retrying a few times when another process took the number first.
fn steer_both(a: i32, b: i32) -> (Owned, Owned) {
    let mut on_a = None;
    for _ in 0..5 {
        let c = steer(a);
        if c.pid() == a {
            on_a = Some(c);
            break;
        } // else dropped: killed and reaped
    }
    let on_a = on_a.unwrap_or_else(|| panic!("could not hand pid {a} to a newcomer"));
    (on_a, steer(b))
}

#[cfg(target_os = "linux")]
const NS_LAST_PID: &str = "/proc/sys/kernel/ns_last_pid";

/// Linux: the next pid of this namespace is `target` (or the first free one after it).
#[cfg(target_os = "linux")]
fn steer(target: i32) -> Owned {
    std::fs::write(NS_LAST_PID, (target - 1).to_string()).unwrap();
    newcomer()
}

/// macOS: pids are handed out in order (wrapping at 99999), skipping numbers in use. Cycle the allocator to
/// just below `target`: parallel helpers race to a window below it, then single forks reach `target - 1`.
#[cfg(target_os = "macos")]
fn steer(target: i32) -> Owned {
    let end = Instant::now() + Duration::from_secs(300);
    let window = ((target - 1500).max(100), (target - 200).max(100));
    loop {
        assert!(
            Instant::now() < end,
            "could not cycle the pid allocator to {target} within 300 s"
        );
        let last = probe();
        if last < target && (last + 1..target).all(os::exists) {
            return newcomer();
        }
        if last >= target || last < window.0 {
            let n = std::thread::available_parallelism().map_or(4, |n| n.get()).min(8);
            let mut helpers: Vec<Owned> = (0..n)
                .map(|_| Owned(command(&format!("cycle {} {}", window.0, window.1)).spawn().unwrap()))
                .collect();
            assert!(wait_until(end - Instant::now(), || helpers.iter_mut().any(|h| h
                .0
                .try_wait()
                .unwrap()
                .is_some())));
            drop(helpers); // killed and reaped
        }
    }
}

/// One fork + reap; the pid it got.
#[cfg(target_os = "macos")]
fn probe() -> i32 {
    // SAFETY: the child only calls _exit (async-signal-safe), so forking this multi-threaded test is sound.
    let pid = unsafe { libc::fork() };
    if pid == 0 {
        // SAFETY: async-signal-safe exit of the forked child.
        unsafe { libc::_exit(0) };
    }
    let mut st = 0;
    // SAFETY: reaping our own child.
    assert_eq!(unsafe { libc::waitpid(pid, &raw mut st, 0) }, pid);
    pid
}

#[cfg(target_os = "linux")]
mod linux {
    use super::NS_LAST_PID;

    /// Writing needs CAP_SYS_ADMIN over this pid namespace: probe by writing the current value back.
    pub fn can_steer() -> bool {
        std::fs::read_to_string(NS_LAST_PID)
            .and_then(|v| std::fs::write(NS_LAST_PID, v.trim()))
            .is_ok()
    }

    /// Re-runs `test` as root of a new user + pid namespace, where `ns_last_pid` is writable.
    pub fn in_private_pid_namespace(test: &str) {
        assert!(
            std::env::var_os("OMNI_SUP_PIDNS").is_none(),
            "inside the private pid namespace and ns_last_pid is still not writable"
        );
        let exe = std::env::current_exe().unwrap();
        let status = std::process::Command::new("unshare")
            .args(["--user", "--map-root-user", "--pid", "--fork", "--mount-proc"])
            .arg(exe)
            .args(["--exact", test, "--nocapture", "--test-threads=1"])
            .env("OMNI_SUP_PIDNS", "1")
            .status();
        let ok = status.as_ref().is_ok_and(std::process::ExitStatus::success);
        assert!(
            ok,
            "PID-reuse coverage is required on Linux and could not run ({status:?}): it needs a writable \
             /proc/sys/kernel/ns_last_pid (root in a privileged container) or unprivileged user namespaces \
             (`unshare -Urpf --mount-proc true` must work)"
        );
    }
}
