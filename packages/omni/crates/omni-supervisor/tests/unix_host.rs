//! SUP-U, host death: however the host dies — `exit`, `abort`, SIGINT to its process group, SIGTERM,
//! SIGKILL, mid-spawn with a full or a half `Spawn` frame, or while a forked copy keeps its channel open —
//! every tree (resistant leaves included, one in another process group) is stopped with its grace, nothing
//! survives, and the supervisor exits. Each death is checked to have happened as requested (ADR-0005 §7,
//! R4, R10).
#![cfg(unix)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use std::os::unix::process::CommandExt;
use std::process::Stdio;
use std::time::{Duration, Instant};

use std::os::fd::AsRawFd;

use common::host::{Cmd, Host, Lines, T, field, send_with_fds, signal_of, wait_child};
use common::os::{alive, kill, killpg, wait_until};
use common::role::command;

/// Entry point of the child roles (`common::role`); a no-op in a normal run.
#[test]
fn role() {
    common::role::main();
}

/// How the host must have ended.
enum Death {
    Code(i32),
    Signal(i32),
}

/// Who delivers the death: the host itself, or the test (to the host, or to its process group).
enum By {
    Itself,
    Test(i32),
    TestToGroup(i32),
}

/// Runs `host <mode>`, kills it `by`, checks it died as `want`, then that zero tree processes survive and
/// the supervisor exited; returns the host's `Ready.info` and the time from its death to zero survivors.
fn host_dies(mode: &str, by: By, want: Death) -> (u32, Duration) {
    let mut c = command(&format!("host {mode}"));
    c.process_group(0).stdout(Stdio::piped());
    let mut host = c.spawn().unwrap();
    let out = Lines::new(host.stdout.take().unwrap());
    let line = out.take("TREE ", 1).remove(0);
    let nums: Vec<i32> = line.split(' ').skip(1).map(|s| s.parse().unwrap()).collect();
    let (mut tree, sup) = (nums[..3].to_vec(), nums[3]);
    let info = field(&out.take("INFO ", 1), 1)[0] as u32;
    let mut holder = None;
    match mode {
        "midspawn" => tree.extend(field(&out.take("INFLIGHT ", 1), 1)),
        "partial" => _ = out.take("PARTIAL", 1),
        "held" | "held-nopidfd" => {
            holder = Some(field(&out.take("HOLDER ", 1), 1)[0]);
            out.take("WAIT", 1);
        }
        "signal" => _ = out.take("WAIT", 1),
        _ => {}
    }
    let host_pid = host.id() as i32;
    match by {
        By::Itself => {}
        By::Test(sig) => kill(host_pid, sig),
        By::TestToGroup(sig) => killpg(host_pid, sig),
    }
    let status = wait_child(&mut host, T).expect("the host did not die");
    match want {
        Death::Code(code) => assert_eq!(status.code(), Some(code), "{mode}: {status:?}"),
        Death::Signal(sig) => assert_eq!(signal_of(status), Some(sig), "{mode}: {status:?}"),
    }
    let dead = Instant::now();
    let clean = wait_until(Duration::from_secs(3), || {
        tree.iter().all(|&p| !alive(p)) && !alive(sup)
    });
    let survivors: Vec<i32> = tree.iter().copied().filter(|&p| alive(p)).collect();
    if let Some(h) = holder {
        kill(h, libc::SIGKILL);
    }
    assert!(
        clean,
        "{mode}: survivors {survivors:?}, supervisor alive: {} ({:?} after death)",
        alive(sup),
        dead.elapsed()
    );
    (info, dead.elapsed())
}

#[test]
fn host_exits() {
    host_dies("exit", By::Itself, Death::Code(0));
}

#[test]
fn host_aborts() {
    host_dies("abort", By::Itself, Death::Signal(libc::SIGABRT));
}

#[test]
fn host_group_gets_sigint() {
    // Like Ctrl-C in the host's terminal: the supervisor (own group) and the trees (own sessions) don't get it.
    host_dies("signal", By::TestToGroup(libc::SIGINT), Death::Signal(libc::SIGINT));
}

#[test]
fn host_gets_sigterm() {
    host_dies("signal", By::Test(libc::SIGTERM), Death::Signal(libc::SIGTERM));
}

#[test]
fn host_gets_sigkill() {
    host_dies("signal", By::Test(libc::SIGKILL), Death::Signal(libc::SIGKILL));
}

#[test]
fn host_dies_mid_spawn_after_a_full_frame() {
    // The in-flight child runs (its marker was read) and its `Spawned` was never read: it is stopped too.
    host_dies("midspawn", By::Itself, Death::Signal(libc::SIGKILL));
}

#[test]
fn host_dies_mid_spawn_after_half_a_frame() {
    host_dies("partial", By::Itself, Death::Signal(libc::SIGKILL));
}

#[test]
fn host_dies_while_a_forked_copy_keeps_the_channel_open() {
    // No EOF reaches the supervisor: only the event-based watch (pidfd / kqueue) sees the death.
    let (info, _) = host_dies("held", By::Test(libc::SIGKILL), Death::Signal(libc::SIGKILL));
    assert_eq!(info & omni_proto::INFO_PIDFD_HOST, omni_proto::INFO_PIDFD_HOST);
}

/// The same without pidfd (Linux, seccomp): the documented fallback polls `getppid()`.
#[cfg(target_os = "linux")]
#[test]
fn host_dies_while_the_channel_is_held_and_pidfd_is_missing() {
    let (info, _) = host_dies("held-nopidfd", By::Test(libc::SIGKILL), Death::Signal(libc::SIGKILL));
    assert_eq!(info, 0);
}

#[test]
fn host_dies_after_an_idle_period_and_the_trees_still_get_their_grace() {
    // The grace (1000 ms) starts at the death, not at the supervisor's last wakeup before the idle period.
    let (_, to_zero) = host_dies("idle", By::Itself, Death::Signal(libc::SIGKILL));
    assert!(to_zero >= Duration::from_millis(900), "forced too early: {to_zero:?}");
}

/// The channel turns out closed in the very turn that creates a child: two Spawns are handled in one turn,
/// the first one's `Spawned` is queued, the host has closed its end, so the first flush after the second
/// child exists notices host death. That child is registered before, so it is stopped with its own grace at
/// the death and confirmed gone: the supervisor exits 0 at once, not at its exit bound with exit 1.
#[test]
fn a_child_started_as_the_channel_closes_is_stopped_and_reaped() {
    let mut h = Host::start();
    let sup = h.sup.id() as i32;
    kill(sup, libc::SIGSTOP); // both Spawns and the close are all there when it runs again
    let (out_r, out_w) = std::io::pipe().unwrap();
    let (first, second) = (h.req(), h.req());
    // Only the role variable in the environment: both frames must fit the socket buffer of a stopped reader.
    let small = |c: Cmd| {
        let mut c = c;
        c.env.retain(|(k, _)| k == common::role::VAR);
        c
    };
    let mut frames = Vec::new();
    let early = small(Cmd::role("leaf plain")).spawn_msg(first);
    omni_proto::encode(&omni_proto::Msg::Spawn(early), &mut frames).unwrap();
    let late = small(Cmd::role("leaf plain").grace(5000)).spawn_msg(second);
    omni_proto::encode(&omni_proto::Msg::Spawn(late), &mut frames).unwrap();
    assert!(frames.len() < 4096, "{} bytes", frames.len());
    // One sendmsg (both stdout ends on its first byte): macOS ends a read at a record that carries
    // descriptors, so two sends could be handled in two turns.
    let fd = out_w.as_raw_fd();
    let sent = send_with_fds(&h.sock, &frames, &[fd, fd]);
    assert_eq!(sent, frames.len());
    drop(out_w);
    drop(std::mem::replace(
        &mut h.sock,
        std::os::unix::net::UnixStream::pair().unwrap().0,
    )); // fully closed
    let t0 = Instant::now();
    kill(sup, libc::SIGCONT);
    let status = wait_child(&mut h.sup, T).expect("the supervisor did not exit");
    let took = t0.elapsed();
    assert_eq!(status.code(), Some(0), "a tree was not confirmed gone ({took:?})");
    assert!(
        took < Duration::from_millis(1500),
        "the late child was not stopped at the death: {took:?}"
    );
    Lines::new(out_r).rest(); // end of file: no process holding the children's stdout survives
}

/// Host death while the supervisor's descriptor table is full (Linux, `prlimit` at exactly what it holds):
/// its emergency reserve still lets it read the inventory and reach a resistant member in another group.
#[cfg(target_os = "linux")]
#[test]
fn host_death_with_a_full_descriptor_table_still_stops_every_member() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang resist+group").grace(300));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    let sup = h.sup.id();
    common::os::set_nofile(sup as i32, common::os::fds_of(sup).len() as u64); // not one free slot
    assert_eq!(h.close().code(), Some(0), "every tree confirmed gone");
    assert!(!alive(leaf) && !alive(t.pid));
}

/// With not even the reserve usable (limit 3), members outside the root's group cannot be found: the
/// supervisor never claims a clean exit; at its bound it says so on stderr and exits 1 (documented risk).
#[cfg(target_os = "linux")]
#[test]
fn host_death_without_any_inventory_ends_loudly() {
    let mut h = Host::start_with(|c| {
        c.stderr(Stdio::piped());
    });
    let t = h.spawn(&Cmd::role("tree hang resist+group").grace(300));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    let mut err = h.sup.stderr.take().unwrap();
    common::os::set_nofile(h.sup.id() as i32, 3);
    let status = h.close();
    let mut text = String::new();
    std::io::Read::read_to_string(&mut err, &mut text).unwrap();
    kill(leaf, libc::SIGKILL); // the member the supervisor could not find
    assert_eq!(status.code(), Some(1), "{text}");
    assert!(
        text.contains("not confirmed gone") && text.contains("inventory is incomplete"),
        "{text}"
    );
}

/// Host death with one free descriptor (Linux, `prlimit` at open fds + 1): the member's pidfd takes the last
/// slot, so its `/proc` re-check needs the reserve; a resistant member in another group still dies.
#[cfg(target_os = "linux")]
#[test]
fn host_death_with_one_free_descriptor_still_stops_every_member() {
    let mut h = Host::start();
    assert_ne!(
        h.info & omni_proto::INFO_PIDFD_MEMBERS,
        0,
        "this case is about pidfd signalling"
    );
    let t = h.spawn(&Cmd::role("tree hang resist+group").grace(300));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    let sup = h.sup.id();
    common::os::set_nofile(sup as i32, common::os::fds_of(sup).len() as u64 + 1);
    assert_eq!(h.close().code(), Some(0), "every tree confirmed gone");
    assert!(!alive(leaf) && !alive(t.pid));
}

/// The supervisor's stderr is `stderr` (a protocol error is reported there): host death still stops every
/// tree, and the supervisor still exits on time with 1.
fn stderr_never_blocks(stderr: std::os::fd::OwnedFd) {
    let mut h = Host::start_with(move |c| {
        c.stderr(Stdio::from(stderr));
    });
    let t = h.spawn(&Cmd::role("tree hang resist+group").grace(300));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    let req = h.req();
    h.send(&omni_proto::Msg::Spawn(Cmd::role("leaf plain").spawn_msg(req)), &[]); // no descriptor
    let t0 = Instant::now();
    let status = wait_child(&mut h.sup, T).expect("the supervisor did not exit");
    assert_eq!(status.code(), Some(1), "{status:?}");
    assert!(t0.elapsed() < Duration::from_secs(2), "late: {:?}", t0.elapsed());
    assert!(!alive(leaf) && !alive(t.pid));
}

#[test]
fn a_full_stderr_never_blocks_host_death_or_the_exit() {
    let (_unread, w) = common::os::full_pipe();
    stderr_never_blocks(w.into());
}

#[test]
fn a_closed_stderr_never_blocks_host_death_or_the_exit() {
    let (r, w) = std::io::pipe().unwrap();
    drop(r); // every write fails with EPIPE
    stderr_never_blocks(w.into());
}

/// The exit bound's report goes to a full stderr (Linux, `prlimit` 3 makes a tree unconfirmable): the
/// supervisor still exits, at its bound plus at most the drain bound.
#[cfg(target_os = "linux")]
#[test]
fn a_full_stderr_never_delays_the_exit_bound() {
    let (_unread, w) = common::os::full_pipe();
    let mut h = Host::start_with(move |c| {
        c.stderr(Stdio::from(std::os::fd::OwnedFd::from(w)));
    });
    let t = h.spawn(&Cmd::role("tree hang resist+group").grace(300));
    let leaf = field(&t.out.take("UP ", 1), 1)[0];
    common::os::set_nofile(h.sup.id() as i32, 3);
    let t0 = Instant::now();
    let status = h.close();
    kill(leaf, libc::SIGKILL); // the member the supervisor could not find
    assert_eq!(status.code(), Some(1));
    assert!(
        t0.elapsed() < Duration::from_secs(7),
        "0.3 s grace + 5 s of sweeps + 0.5 s drain: {:?}",
        t0.elapsed()
    );
}
