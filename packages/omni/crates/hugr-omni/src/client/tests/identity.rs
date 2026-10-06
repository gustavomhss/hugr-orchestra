//! Unix: ending a supervisor only by identity (Codex r2 finding 1). A stand-in plays the supervisor; the
//! test itself is the external reaper (as a host with `waitpid(-1)` or SIGCHLD ignored would be), and
//! number reuse is simulated by pointing the identity's pid at a sentinel that must survive.

use std::os::unix::net::UnixStream;
use std::process::{Child, Command, Stdio};

use super::{BOUND, READY, rt};
use crate::client::channel::Gen;
use crate::client::keeper::{Ident, Kill, Prepared, Watch};
use crate::client::unix::Chan;

fn stand_in() -> Child {
    let mut cmd = Command::new("/bin/sleep");
    cmd.arg("1000")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn().unwrap()
}

/// True while `child` runs: not exited (a zombie counts as gone), observed without reaping it.
fn running(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

fn pid(child: &Child) -> libc::pid_t {
    libc::pid_t::try_from(child.id()).unwrap()
}

/// Positive control: an identity taken at spawn ends its own live process.
#[test]
fn an_identity_ends_its_own_process() {
    let mut sup = stand_in();
    let ident = Ident::adopt(Prepared::new().unwrap(), sup.id());
    assert_eq!(ident.kill(), Kill::Sent);
    let status = sup.wait().unwrap();
    assert_eq!(
        std::os::unix::process::ExitStatusExt::signal(&status),
        Some(libc::SIGKILL)
    );
}

/// The supervisor exits and someone else reaps it; its number then names a sentinel. The kill must not
/// signal anything, and the sentinel survives.
#[test]
fn an_identity_never_signals_a_reaped_and_reused_number() {
    let mut sup = stand_in();
    let mut sentinel = stand_in();
    let mut ident = Ident::adopt(Prepared::new().unwrap(), sup.id());
    // The external reaper: the supervisor dies and is reaped by someone other than its keeper.
    sup.kill().unwrap();
    sup.wait().unwrap();
    ident.pid = pid(&sentinel); // simulated reuse: the old number now names the sentinel
    assert_eq!(ident.kill(), Kill::Gone);
    assert!(running(&mut sentinel), "the sentinel was signalled");
    sentinel.kill().unwrap();
    sentinel.wait().unwrap();
}

/// macOS: with the exit watch failing (an error is "unknown", never "exited"), the start-time check alone
/// still refuses a number that names another process, and still ends the right one.
#[cfg(not(target_os = "linux"))]
#[test]
fn without_its_exit_watch_the_start_time_still_decides() {
    use std::os::fd::OwnedFd;
    let broken = || OwnedFd::from(std::io::pipe().unwrap().0); // not a kqueue: every kevent fails
    let mut sup = stand_in();
    let mut sentinel = stand_in();
    let mut ident = Ident::adopt(Prepared { exits: broken() }, sup.id());
    assert!(
        !ident.exited.load(std::sync::atomic::Ordering::Acquire),
        "an error was read as an exit"
    );
    sup.kill().unwrap();
    sup.wait().unwrap();
    ident.pid = pid(&sentinel);
    assert_eq!(ident.kill(), Kill::Gone);
    assert!(running(&mut sentinel), "the sentinel was signalled");
    let live = Ident::adopt(Prepared { exits: broken() }, sentinel.id());
    assert_eq!(live.kill(), Kill::Sent, "an unknown exit must keep termination armed");
    sentinel.wait().unwrap();
}

/// Where the identity cannot be checked (Linux without pidfd; macOS without a start time), nothing is
/// signalled: the supervisor is abandoned, and the generation's error says so.
#[test]
fn an_unverifiable_supervisor_is_abandoned_and_named() {
    let mut sup = stand_in();
    #[cfg(target_os = "linux")]
    let blind = Ident {
        pid: pid(&sup),
        pidfd: None,
    };
    #[cfg(not(target_os = "linux"))]
    let blind = {
        let mut ident = Ident::adopt(Prepared::new().unwrap(), sup.id());
        ident.start = None;
        ident
    };
    let watch = Watch::from(blind);
    assert_eq!(watch.kill(), Kill::Abandoned);
    assert!(running(&mut sup), "an unverifiable process was signalled");
    let (host, mut peer) = UnixStream::pair().unwrap();
    let mut ready = Vec::new();
    omni_proto::encode(&READY, &mut ready).unwrap();
    std::io::Write::write_all(&mut peer, &ready).unwrap();
    let channel = Gen::start(rt(), 1, BOUND, move || Chan::new(host, Some(watch))).unwrap();
    channel.die("the test declared it stuck".into());
    super::assert_io(Err::<(), _>(channel.gone()), "it is abandoned");
    sup.kill().unwrap();
    sup.wait().unwrap();
}

/// A live process that is not our child: a grandchild whose parent has already exited (it stands in for a
/// number reused before the identity was taken).
fn orphan() -> libc::pid_t {
    use std::io::Read;
    use std::os::fd::AsRawFd;
    let (mut read, write) = std::io::pipe().unwrap();
    // SAFETY: the forked processes only call fork, write, pause and _exit (async-signal-safe); neither
    // returns into the test harness.
    let middle = unsafe { libc::fork() };
    assert!(middle >= 0, "fork");
    if middle == 0 {
        // SAFETY: as above.
        unsafe {
            let sentinel = libc::fork();
            if sentinel == 0 {
                loop {
                    libc::pause();
                }
            }
            let bytes = sentinel.to_ne_bytes();
            libc::write(write.as_raw_fd(), bytes.as_ptr().cast(), bytes.len());
            libc::_exit(0);
        }
    }
    drop(write);
    let mut bytes = [0u8; 4];
    read.read_exact(&mut bytes).unwrap();
    let mut status = 0;
    // SAFETY: reaps the middle process, our own child.
    assert_eq!(unsafe { libc::waitpid(middle, &mut status, 0) }, middle);
    let sentinel = libc::pid_t::from_ne_bytes(bytes);
    assert!(sentinel > 0, "the sentinel was not started");
    sentinel
}

/// True while `pid` exists and is not a zombie (a killed orphan stays a zombie until its new parent reaps).
#[cfg(target_os = "linux")]
fn alive(pid: libc::pid_t) -> bool {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).unwrap_or_default();
    let state = stat
        .rfind(')')
        .and_then(|i| stat.get(i + 1..))
        .and_then(|s| s.trim_start().chars().next());
    matches!(state, Some(c) if c != 'Z' && c != 'X')
}

/// True while `pid` exists and is not a zombie (a killed orphan stays a zombie until its new parent reaps).
#[cfg(not(target_os = "linux"))]
fn alive(pid: libc::pid_t) -> bool {
    // SAFETY: an all-zero `proc_bsdinfo` is a valid out-parameter.
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = libc::c_int::try_from(std::mem::size_of_val(&info)).unwrap();
    // SAFETY: asks for `pid`'s BSD info into `info`, which has `size` writable bytes.
    let n = unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDTBSDINFO, 0, (&raw mut info).cast(), size) };
    n == size && info.pbi_status != libc::SZOMB
}

/// r3: an identity taken of a live process that is not our child is never armed (Linux: the pidfd fails
/// the ppid check; macOS: no start time is recorded). The kill is refused and the sentinel survives.
#[test]
fn an_identity_of_a_process_that_is_not_our_child_is_never_armed() {
    let sentinel = orphan();
    assert!(alive(sentinel), "the sentinel must be running before the check");
    let ident = Ident::adopt(Prepared::new().unwrap(), u32::try_from(sentinel).unwrap());
    let kill = ident.kill();
    let survived = alive(sentinel);
    // SAFETY: ends our own sentinel (its new parent reaps it).
    unsafe { libc::kill(sentinel, libc::SIGKILL) };
    assert_eq!(
        kill,
        Kill::Abandoned,
        "the kill was armed for a process that is not our child"
    );
    assert!(survived, "the sentinel was signalled");
}
