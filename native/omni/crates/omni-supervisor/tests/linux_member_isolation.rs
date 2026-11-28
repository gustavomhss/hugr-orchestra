//! Linux-only, opt-in proof that a supervisor can freeze exactly one single-task member in an owned cgroup v2 leaf.
//!
//! This is deliberately a fixture, not a product capability. It only runs when both
//! `HUGR_OMNI_ISOLATION_CI=1` and `HUGR_OMNI_ISOLATION_CGROUP_ROOT` name a pre-delegated ephemeral cgroup v2 root.
//! The fixture creates its own empty child leaf, sets `pids.max=1`, and is the only writer of that leaf's controls.
//! The worker is placed there atomically with `clone3(CLONE_INTO_CGROUP)` before it can run, then drops to uid/gid
//! 65534. This proves exact single-task isolation only; it makes no claim about arbitrary multithreaded members.
#![cfg(target_os = "linux")]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::io::{self, Read};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const CLONE_INTO_CGROUP: u64 = 0x0002_0000_0000;
const NOBODY: u32 = 65_534;
const WAIT: Duration = Duration::from_secs(5);

#[repr(C)]
struct CloneArgs {
    flags: u64,
    pidfd: u64,
    child_tid: u64,
    parent_tid: u64,
    exit_signal: u64,
    stack: u64,
    stack_size: u64,
    tls: u64,
    set_tid: u64,
    set_tid_size: u64,
    cgroup: u64,
}

#[test]
#[ignore = "requires an explicitly delegated Linux cgroup v2 and disposable fixture credentials"]
fn freezer_is_exact_for_a_supervisor_owned_single_task_member() {
    assert_eq!(std::env::var("HUGR_OMNI_ISOLATION_CI").as_deref(), Ok("1"));
    let root = std::env::var_os("HUGR_OMNI_ISOLATION_CGROUP_ROOT")
        .expect("the opt-in Linux isolation test needs a delegated ephemeral cgroup v2 root");
    let root = PathBuf::from(root);
    assert!(root.is_absolute(), "the delegated cgroup root must be an absolute path");
    assert!(
        root.join("cgroup.controllers").is_file(),
        "the delegated root is not cgroup v2"
    );
    assert!(
        root.join("cgroup.freeze").is_file(),
        "the delegated root has no cgroup freezer"
    );
    assert!(
        root.join("pids.max").is_file(),
        "the delegated root has no enabled pids controller"
    );

    let name = format!(
        "omni-member-isolation-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let leaf = root.join(name);
    fs::create_dir(&leaf).expect("create a private child cgroup under the explicitly delegated root");
    let fixture = Fixture { leaf: leaf.clone() };
    assert_eq!(fs::read_to_string(leaf.join("cgroup.procs")).unwrap().trim(), "");
    fs::write(leaf.join("pids.max"), "1").expect("bound this proof to exactly one OS task");
    assert_eq!(fs::read_to_string(leaf.join("pids.max")).unwrap().trim(), "1");

    let cgroup = fs::File::open(&leaf).expect("open the owned cgroup directory");
    let mut member = Worker::spawn(Some(cgroup.as_raw_fd()));
    assert!(
        has_progress(&mut member.pipe, WAIT),
        "the member must drop credentials and start before the freezer assertion"
    );
    assert_eq!(
        fs::read_to_string(leaf.join("cgroup.procs")).unwrap().trim(),
        member.pid.to_string()
    );
    assert_eq!(fs::read_to_string(leaf.join("pids.current")).unwrap().trim(), "1");
    assert_eq!(
        fs::read_to_string(format!("/proc/{}/status", member.pid))
            .unwrap()
            .lines()
            .find(|line| line.starts_with("Uid:"))
            .unwrap()
            .split_whitespace()
            .nth(1),
        Some("65534")
    );

    let mut outsider = Worker::spawn(None);
    assert!(
        has_progress(&mut outsider.pipe, WAIT),
        "the unrelated fixture must start outside the leaf"
    );

    fs::write(leaf.join("cgroup.freeze"), "1").unwrap();
    wait_frozen(&leaf, true);
    drain(&mut member.pipe);
    drain(&mut outsider.pipe);
    std::thread::sleep(Duration::from_millis(200));
    assert!(
        !has_progress(&mut member.pipe, Duration::from_millis(50)),
        "a confirmed-frozen member made progress"
    );
    assert!(
        has_progress(&mut outsider.pipe, WAIT),
        "freezing the member stopped an unrelated process"
    );

    fs::write(leaf.join("cgroup.freeze"), "0").unwrap();
    wait_frozen(&leaf, false);
    assert!(
        has_progress(&mut member.pipe, WAIT),
        "the member did not resume after thaw"
    );

    // A freezer thaw must not erase a pre-existing job-control stop. Only this fixture sends SIGCONT afterward.
    // SAFETY: this is the fixture-owned member pid, retained unreaped until cleanup.
    assert_eq!(unsafe { libc::kill(member.pid, libc::SIGSTOP) }, 0);
    wait_stopped(member.pid);
    fs::write(leaf.join("cgroup.freeze"), "1").unwrap();
    wait_frozen(&leaf, true);
    fs::write(leaf.join("cgroup.freeze"), "0").unwrap();
    wait_frozen(&leaf, false);
    drain(&mut member.pipe);
    drain(&mut outsider.pipe);
    std::thread::sleep(Duration::from_millis(200));
    assert!(
        !has_progress(&mut member.pipe, Duration::from_millis(50)),
        "thaw incorrectly resumed an externally stopped member"
    );
    assert!(
        has_progress(&mut outsider.pipe, WAIT),
        "the unrelated fixture must keep running during both transitions"
    );
    // SAFETY: this is the fixture-owned member pid, retained unreaped until cleanup.
    assert_eq!(unsafe { libc::kill(member.pid, libc::SIGCONT) }, 0);
    assert!(
        has_progress(&mut member.pipe, WAIT),
        "the fixture-owned explicit SIGCONT did not resume its member"
    );

    member.stop();
    drop(fixture);
    outsider.stop();
}

struct Fixture {
    leaf: PathBuf,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::write(self.leaf.join("cgroup.freeze"), "0");
        let _ = fs::remove_dir(&self.leaf);
    }
}

struct Worker {
    pid: libc::pid_t,
    pipe: fs::File,
    reaped: AtomicBool,
}

impl Worker {
    fn spawn(cgroup_fd: Option<libc::c_int>) -> Self {
        let mut fds = [-1; 2];
        // SAFETY: `fds` points to two writable c_int slots for pipe2 to initialize.
        let opened = unsafe { libc::pipe2(fds.as_mut_ptr(), libc::O_CLOEXEC | libc::O_NONBLOCK) };
        assert_eq!(opened, 0);
        // SAFETY: pipe2 returned two owned descriptors; the child keeps the write side and parent owns the read side.
        let read = unsafe { OwnedFd::from_raw_fd(fds[0]) };
        // SAFETY: pipe2 returned two owned descriptors; this descriptor is intentionally inherited by the fork-like child.
        let write = unsafe { OwnedFd::from_raw_fd(fds[1]) };
        let args = CloneArgs {
            flags: if cgroup_fd.is_some() { CLONE_INTO_CGROUP } else { 0 },
            pidfd: 0,
            child_tid: 0,
            parent_tid: 0,
            exit_signal: libc::SIGCHLD as u64,
            stack: 0,
            stack_size: 0,
            tls: 0,
            set_tid: 0,
            set_tid_size: 0,
            cgroup: cgroup_fd.map_or(0, |fd| fd as u64),
        };
        // SAFETY: clone3 is fork-like here (no CLONE_VM/CLONE_THREAD); child uses only raw syscalls and _exit.
        let pid = unsafe {
            libc::syscall(
                libc::SYS_clone3,
                &args as *const CloneArgs,
                std::mem::size_of::<CloneArgs>(),
            ) as libc::pid_t
        };
        assert!(
            pid >= 0,
            "clone3(CLONE_INTO_CGROUP) failed: {}",
            io::Error::last_os_error()
        );
        if pid == 0 {
            drop(read);
            // SAFETY: the child changes only its own credentials before doing fixture work.
            let _ = unsafe { libc::setresgid(NOBODY, NOBODY, NOBODY) };
            // SAFETY: the child changes only its own credentials before doing fixture work.
            let _ = unsafe { libc::setresuid(NOBODY, NOBODY, NOBODY) };
            // SAFETY: getuid/getgid have no preconditions.
            let uid = unsafe { libc::getuid() };
            // SAFETY: getuid/getgid have no preconditions.
            let gid = unsafe { libc::getgid() };
            if uid != NOBODY || gid != NOBODY {
                // SAFETY: _exit terminates only this fixture child without running inherited destructors.
                unsafe { libc::_exit(90) };
            }
            if let Some(fd) = cgroup_fd {
                // SAFETY: validate the permissions of the fixture's own cgroup through its inherited directory fd.
                let freezer = unsafe { libc::openat(fd, c"cgroup.freeze".as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC) };
                // SAFETY: validate migration permissions in the same fixture-owned cgroup.
                let migration = unsafe { libc::openat(fd, c"cgroup.procs".as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC) };
                if freezer >= 0 || migration >= 0 {
                    // SAFETY: exits only the fixture child and closes any opened descriptors.
                    unsafe { libc::_exit(91) };
                }
                // SAFETY: the fixture expects the pids controller to block sibling tasks. On unexpected success
                // both branches exit, so the fixture never leaves a stray worker running.
                let extra = unsafe { libc::fork() };
                // SAFETY: this accesses the thread-local errno immediately following the failed fork.
                if extra != -1 || unsafe { *libc::__errno_location() } != libc::EAGAIN {
                    // SAFETY: exits only this fixture worker, with no inherited destructors.
                    unsafe { libc::_exit(92) };
                }
            }
            loop {
                let byte = [1_u8];
                // SAFETY: the child owns this inherited pipe end and writes one byte at a time.
                unsafe { libc::write(write.as_raw_fd(), byte.as_ptr().cast(), 1) };
                let delay = libc::timespec {
                    tv_sec: 0,
                    tv_nsec: 20_000_000,
                };
                // SAFETY: delay is a valid constant timespec; no shared Rust state is touched after fork-like clone.
                unsafe { libc::nanosleep(&delay, std::ptr::null_mut()) };
            }
        }
        drop(write);
        Self {
            pid,
            pipe: fs::File::from(read),
            reaped: AtomicBool::new(false),
        }
    }

    fn stop(&self) {
        if self.reaped.swap(true, Ordering::SeqCst) {
            return;
        }
        // SAFETY: pid belongs to this fixture and is never reused before waitpid reaps it.
        unsafe { libc::kill(self.pid, libc::SIGKILL) };
        let mut status = 0;
        // SAFETY: this fixture reaps only the exact child it created.
        assert_eq!(unsafe { libc::waitpid(self.pid, &mut status, 0) }, self.pid);
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.stop();
    }
}

fn has_progress(pipe: &mut fs::File, timeout: Duration) -> bool {
    let end = Instant::now() + timeout;
    loop {
        let remaining = end.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }
        let mut pollfd = libc::pollfd {
            fd: pipe.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        let ms = remaining.as_millis().min(i32::MAX as u128) as i32;
        // SAFETY: pollfd points to one initialized descriptor and timeout is bounded.
        if unsafe { libc::poll(&mut pollfd, 1, ms) } <= 0 {
            return false;
        }
        let mut buf = [0_u8; 256];
        match pipe.read(&mut buf) {
            Ok(n) if n > 0 => return true,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => continue,
            _ => return false,
        }
    }
}

fn drain(pipe: &mut fs::File) {
    let mut buf = [0_u8; 256];
    while pipe.read(&mut buf).is_ok_and(|n| n > 0) {}
}

fn wait_frozen(leaf: &Path, expected: bool) {
    let end = Instant::now() + WAIT;
    loop {
        let events = fs::read_to_string(leaf.join("cgroup.events")).unwrap();
        let frozen = events
            .lines()
            .any(|line| line == format!("frozen {}", u8::from(expected)));
        if frozen {
            return;
        }
        assert!(
            Instant::now() < end,
            "cgroup.events did not report frozen={}: {events}",
            u8::from(expected)
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn wait_stopped(pid: libc::pid_t) {
    let end = Instant::now() + WAIT;
    loop {
        let status = fs::read_to_string(format!("/proc/{pid}/status")).unwrap();
        if status
            .lines()
            .any(|line| line.starts_with("State:") && line.contains("T (stopped)"))
        {
            return;
        }
        assert!(Instant::now() < end, "SIGSTOP did not stop fixture worker {pid}");
        std::thread::sleep(Duration::from_millis(10));
    }
}
