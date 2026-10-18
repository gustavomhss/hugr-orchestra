//! Unix ledger of descriptors, threads and processes, run alone in a process of its own (other tests open
//! descriptors and threads in parallel): every spawn error path closes each end exactly once (lead trap 4),
//! a stuck supervisor is killed by identity after its window and reaped (Codex r1 finding 4), and without
//! its reaper thread or its observation resources no supervisor is started at all (r1 finding 5, r2
//! finding 2); a failing exit watch still ends a suspended supervisor (r2 finding 2).

use std::os::fd::AsRawFd;
#[cfg(not(target_os = "linux"))]
use std::os::fd::OwnedFd;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use omni_proto::{FailCode, Msg};

use super::{BOUND, LIMIT, READY, assert_io, pair, rt, spec, with_tree};
use crate::client::channel::Gen;
use crate::client::keeper::{Keeper, Prepared};
use crate::client::start::spawn_on;
use crate::client::unix::{Chan, start};

fn open_fds() -> usize {
    std::fs::read_dir("/dev/fd").unwrap().count()
}

#[cfg(target_os = "linux")]
fn threads() -> usize {
    std::fs::read_dir("/proc/self/task").unwrap().count()
}

#[cfg(target_os = "macos")]
fn threads() -> usize {
    // SAFETY: an all-zero `proc_taskinfo` is a valid out-parameter of the given size.
    let mut info: libc::proc_taskinfo = unsafe { std::mem::zeroed() };
    let size = libc::c_int::try_from(std::mem::size_of_val(&info)).unwrap();
    // SAFETY: asks for this process's task info into `info`, which has `size` writable bytes.
    let n = unsafe { libc::proc_pidinfo(libc::getpid(), libc::PROC_PIDTASKINFO, 0, (&raw mut info).cast(), size) };
    assert_eq!(n, size, "proc_pidinfo");
    usize::try_from(info.pti_threadnum).unwrap()
}

/// True while this process has any child, running, stopped or unreaped (nothing is reaped here).
fn has_children() -> bool {
    // SAFETY: an all-zero `siginfo_t` is a valid out-parameter.
    let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
    let flags = libc::WEXITED | libc::WSTOPPED | libc::WNOHANG | libc::WNOWAIT;
    // SAFETY: a non-reaping, non-blocking query; `info` is writable.
    let r = unsafe { libc::waitid(libc::P_ALL, 0, &mut info, flags) };
    !(r == -1 && std::io::Error::last_os_error().raw_os_error() == Some(libc::ECHILD))
}

/// Polls `done` until it holds, failing at the test limit (an incomplete observation is a failure).
fn eventually(what: &str, mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + LIMIT;
    while !done() {
        assert!(Instant::now() < deadline, "{what}");
        thread::yield_now();
    }
}

/// The ledger itself, run by `every_error_path_returns_fds_threads_and_processes`.
#[test]
#[ignore = "run by every_error_path_returns_fds_threads_and_processes, in a process of its own"]
fn ledger() {
    let rt = rt();
    assert!(!has_children(), "the ledger process must start without children");

    // Finding 5: no reaper thread, no supervisor. A failing thread builder (an impossible stack) is the
    // injected creation failure; `sleep` would be started if the order were wrong.
    let impossible = thread::Builder::new().stack_size(1 << 50);
    let started = start(rt, 1, BOUND, Path::new("/bin/sleep"), impossible);
    assert_io(started, "its reaper or exit watch failed");
    assert!(!has_children(), "a supervisor was started without its reaper");
    no_start_without_descriptors();

    descriptors();
    stuck_supervisor_is_killed(|| Prepared::new().unwrap());
    // r2 finding 2 (macOS): an exit watch whose every kevent fails is "unknown", never "exited": the
    // suspended supervisor is still ended (by its start time) and every resource comes back.
    #[cfg(not(target_os = "linux"))]
    stuck_supervisor_is_killed(|| Prepared {
        exits: OwnedFd::from(std::io::pipe().unwrap().0),
    });
}

/// r2 finding 2: the observation resources are made before the supervisor. With too few descriptors the
/// start fails with `Io` and nothing runs. macOS leaves room for exactly two: the exit kqueue (the first
/// descriptor of a start) takes one, so the channel's pair fails before any spawn; a start that spawned
/// before observing would get its pair and leave a child behind. Linux (no pre-spawn descriptor) gets none.
fn no_start_without_descriptors() {
    let lowest = std::fs::File::open("/dev/null").unwrap().as_raw_fd(); // every number below it is in use
    let room = if cfg!(target_os = "linux") { 0 } else { 2 };
    // SAFETY: an all-zero `rlimit` is a valid out-parameter.
    let mut old: libc::rlimit = unsafe { std::mem::zeroed() };
    // SAFETY: reads this process's descriptor limit into `old`.
    assert_eq!(unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut old) }, 0);
    let low = libc::rlimit {
        rlim_cur: libc::rlim_t::try_from(lowest + room).unwrap(),
        rlim_max: old.rlim_max,
    };
    // SAFETY: lowers the soft limit so that at most `room` new descriptors can be made (open ones stay valid).
    assert_eq!(unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &low) }, 0);
    let started = start(rt(), 1, BOUND, Path::new("/bin/sleep"), thread::Builder::new());
    // SAFETY: restores the limit read above.
    assert_eq!(unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &old) }, 0);
    assert_io(started, "its channel failed"); // after the watch, before any spawn attempt
    assert!(
        !has_children(),
        "a supervisor was started without its observation resources"
    );
}

/// Lead trap 4: each pipe end and transferred descriptor is closed exactly once on every error path.
fn descriptors() {
    let before = open_fds();
    let (sup, mut peer, warm) = with_tree();
    peer.fds.clear(); // the warm tree's child ends
    let base = open_fds();
    for _ in 0..20 {
        // Pipes created, frame never sent: over the 1 MiB frame limit.
        let mut huge = spec(false);
        huge.env = vec![("K".into(), "x".repeat(2 << 20).into())];
        assert_io(spawn_on(&sup, &huge), "over the 1 MiB limit");
        // Frame sent with its three ends, then refused by the supervisor.
        let caller = {
            let sup = sup.clone();
            thread::spawn(move || spawn_on(&sup, &spec(false)))
        };
        let Msg::Spawn(s) = peer.recv() else {
            panic!("expected Spawn")
        };
        assert_eq!(peer.fds.len(), 3);
        peer.fds.clear();
        let msg = "no such file".into();
        peer.send(&Msg::SpawnFailed {
            req: s.req,
            code: FailCode::NotFound,
            errno: 2,
            msg,
        });
        assert!(caller.join().unwrap().is_err());
        assert_eq!(open_fds(), base, "a refused spawn leaked a descriptor");
    }
    for _ in 0..20 {
        // Frame sent, then the supervisor died.
        let (sup, mut peer) = pair(BOUND);
        let caller = thread::spawn(move || spawn_on(&sup, &spec(false)));
        assert!(matches!(peer.recv(), Msg::Spawn(_)));
        drop(peer);
        assert_io(caller.join().unwrap(), "it closed the channel");
    }
    // A dead generation's socket closes once the runtime has dropped its aborted tasks.
    eventually("a dead generation leaked a descriptor", || open_fds() == base);
    // The warm generation too, so the next phase starts from a settled count.
    sup.die("the phase is over".into());
    drop((sup, peer, warm));
    eventually("the warm generation leaked a descriptor", || open_fds() == before);
}

/// r1 finding 4: a really suspended supervisor never reads the EOF. Once its generation is declared dead
/// it gets the cooperative window, then SIGKILL by identity, and is reaped: the process, the reaper thread
/// and the observation descriptors are all gone.
fn stuck_supervisor_is_killed(prepare: impl FnOnce() -> Prepared) {
    let (base_threads, base_fds) = (threads(), open_fds());
    let window = Duration::from_millis(1000);
    // No stdio of ours: a stopped stand-in must not hold the pipes the outer test reads to their end.
    let child = Command::new("/bin/sleep")
        .arg("1000")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let pid = libc::pid_t::try_from(child.id()).unwrap();
    let _cleanup = KillOnPanic(pid);
    // SAFETY: stops our own child, which nothing has reaped.
    assert_eq!(unsafe { libc::kill(pid, libc::SIGSTOP) }, 0);
    let watch = Keeper::with(thread::Builder::new(), prepare()).unwrap().adopt(child);
    eventually("the stand-in supervisor did not stop", || stopped(pid));
    let (host, mut peer) = UnixStream::pair().unwrap();
    let mut ready = Vec::new();
    omni_proto::encode(&READY, &mut ready).unwrap();
    std::io::Write::write_all(&mut peer, &ready).unwrap();
    let sup = Gen::start(rt(), 1, window, move || Chan::new(host, Some(watch))).unwrap();
    let t0 = Instant::now();
    sup.die("the test declared it stuck".into());
    let gone = || {
        // SAFETY: signal 0 sends nothing; ESRCH means no process, not even a zombie, has the pid any more.
        let r = unsafe { libc::kill(pid, 0) };
        r == -1 && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH)
    };
    eventually("the stuck supervisor was neither killed nor reaped", gone);
    assert!(t0.elapsed() >= window, "killed before its cooperative window");
    eventually("the reaper thread is still alive", || threads() == base_threads);
    drop((sup, peer));
    eventually("a descriptor of the dead generation leaked", || open_fds() == base_fds);
}

/// If the test fails half-way, the stopped stand-in must not outlive it.
struct KillOnPanic(libc::pid_t);

impl Drop for KillOnPanic {
    fn drop(&mut self) {
        if thread::panicking() {
            // SAFETY: the stand-in was not confirmed gone, so the pid is still our child's; nothing is shared.
            unsafe { libc::kill(self.0, libc::SIGKILL) };
        }
    }
}

/// True once our child `pid` is stopped (observed without reaping it).
fn stopped(pid: libc::pid_t) -> bool {
    // SAFETY: an all-zero `siginfo_t` is a valid out-parameter.
    let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
    let id = libc::id_t::try_from(pid).unwrap();
    // SAFETY: a non-reaping, non-blocking query about our own child; `info` is writable.
    let r = unsafe {
        libc::waitid(
            libc::P_PID,
            id,
            &mut info,
            libc::WSTOPPED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    // SAFETY: `si_pid` is set by a successful waitid that reported a state change.
    r == 0 && unsafe { info.si_pid() } == pid
}

#[test]
fn every_error_path_returns_fds_threads_and_processes() {
    let ledger = "client::tests::ledger::ledger";
    let out = Command::new(std::env::current_exe().unwrap())
        .args([ledger, "--exact", "--ignored", "--test-threads=1"])
        .output()
        .unwrap();
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success(), "{stdout}{}", String::from_utf8_lossy(&out.stderr));
    assert!(stdout.contains("1 passed"), "the ledger did not run: {stdout}");
}
