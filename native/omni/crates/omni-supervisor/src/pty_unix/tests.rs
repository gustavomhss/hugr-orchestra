//! PTYSYS-U, the `pty_unix` seam (W12): `open` gives a close-on-exec terminal of the requested size that carries
//! bytes both ways; `resize` is what the terminal then reports; `make_controlling` gives a new session the
//! terminal as its controlling terminal on fds 0..=2, so `"\x03"` typed on the master interrupts it, while the
//! same child without it reads past the `"\x03"` (the control); outside a new session it returns the errno.
//!
//! The forked children run only async-signal-safe calls (this test binary has other threads). Every wait is
//! bounded: a marker or an exit that does not come fails the test.

use std::os::fd::{AsFd, AsRawFd, BorrowedFd, OwnedFd};
use std::time::{Duration, Instant};

use super::{make_controlling, open, resize};

const LIMIT: Duration = Duration::from_secs(10);

fn size(fd: BorrowedFd<'_>) -> (u16, u16) {
    // SAFETY: TIOCGWINSZ writes one `winsize` into the zeroed local.
    let mut ws: libc::winsize = unsafe { std::mem::zeroed() };
    // SAFETY: as above.
    assert_eq!(unsafe { libc::ioctl(fd.as_raw_fd(), libc::TIOCGWINSZ, &raw mut ws) }, 0);
    (ws.ws_col, ws.ws_row)
}

fn write_all(fd: BorrowedFd<'_>, data: &[u8]) {
    // SAFETY: `data` is readable for its length.
    let n = unsafe { libc::write(fd.as_raw_fd(), data.as_ptr().cast(), data.len()) };
    assert_eq!(n, data.len() as isize, "write: {}", std::io::Error::last_os_error());
}

/// Reads `fd` until what was read ends with `want`, which must then be all that was read.
fn read_exactly(fd: BorrowedFd<'_>, want: &[u8]) {
    let end = Instant::now() + LIMIT;
    let mut got = Vec::new();
    while !got.ends_with(want) {
        let left = end.saturating_duration_since(Instant::now());
        assert!(!left.is_zero(), "never read {want:?}; got {got:?}");
        let mut p = libc::pollfd {
            fd: fd.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        // SAFETY: one live pollfd.
        if unsafe { libc::poll(&raw mut p, 1, left.as_millis().min(1000) as libc::c_int) } <= 0 {
            continue;
        }
        let mut buf = [0u8; 256];
        // SAFETY: `buf` is writable for its length.
        let n = unsafe { libc::read(fd.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) };
        assert!(n > 0, "read: {n} ({}); got {got:?}", std::io::Error::last_os_error());
        got.extend_from_slice(&buf[..n as usize]);
    }
    assert_eq!(got, want);
}

/// Forks a child that runs `child` and exits with what it returns.
///
/// # Safety
/// `child` may make async-signal-safe calls only: no allocation, no lock, no panic.
unsafe fn fork(child: impl FnOnce() -> i32) -> libc::pid_t {
    // SAFETY: the child runs only `child` (async-signal-safe, the caller's promise) and `_exit`.
    let pid = unsafe { libc::fork() };
    assert!(pid >= 0, "fork: {}", std::io::Error::last_os_error());
    if pid == 0 {
        let code = child();
        // SAFETY: ends the child at once, running nothing of the parent's copy.
        unsafe { libc::_exit(code) }
    }
    pid
}

/// The wait status of `pid`, once it ended (killed after `LIMIT`, then the test fails). Meanwhile whatever the
/// terminal shows is read from `master` and dropped: macOS holds an exiting session leader until its terminal's
/// output was read (as the host's reader always does).
fn status(pid: libc::pid_t, master: BorrowedFd<'_>) -> libc::c_int {
    let end = Instant::now() + LIMIT;
    let mut st = 0;
    loop {
        // SAFETY: waits for our own child, writing its status into a live local.
        let r = unsafe { libc::waitpid(pid, &raw mut st, libc::WNOHANG) };
        if r == pid {
            return st;
        }
        assert_eq!(r, 0, "waitpid: {}", std::io::Error::last_os_error());
        if Instant::now() > end {
            // SAFETY: our own child, not yet reaped, so the pid is still its own.
            unsafe { libc::kill(pid, libc::SIGKILL) };
            panic!("child {pid} did not end within {LIMIT:?}");
        }
        let mut p = libc::pollfd {
            fd: master.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        let mut buf = [0u8; 256];
        // SAFETY: one live pollfd; `buf` is writable for its length (a failed read, e.g. EIO once the terminal
        // closed, is ignored: the exit is what is awaited).
        unsafe {
            if libc::poll(&raw mut p, 1, 5) > 0 {
                libc::read(master.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len());
            }
        }
    }
}

#[test]
fn open_makes_a_close_on_exec_terminal_of_the_requested_size() {
    let pair = open(100, 30).unwrap();
    for fd in [&pair.master, &pair.slave] {
        // SAFETY: F_GETFD only reads the descriptor's flags.
        let flags = unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_GETFD) };
        assert!(
            flags != -1 && flags & libc::FD_CLOEXEC != 0,
            "{fd:?} is not close-on-exec"
        );
    }
    // SAFETY: isatty only inspects the descriptor.
    assert_eq!(unsafe { libc::isatty(pair.slave.as_raw_fd()) }, 1);
    assert_eq!(size(pair.slave.as_fd()), (100, 30));
    // Typed on the master, a line on the slave; the master then reads the terminal's echo of it and what the slave
    // wrote, as a terminal shows them (`\n` becomes `\r\n`).
    write_all(pair.master.as_fd(), b"ping\n");
    read_exactly(pair.slave.as_fd(), b"ping\n");
    write_all(pair.slave.as_fd(), b"pong\n");
    read_exactly(pair.master.as_fd(), b"ping\r\npong\r\n");
}

#[test]
fn resize_sets_the_size_the_terminal_reports() {
    let pair = open(80, 24).unwrap();
    resize(pair.master.as_fd(), 120, 40).unwrap();
    assert_eq!(size(pair.slave.as_fd()), (120, 40));
    resize(pair.master.as_fd(), 1, 32767).unwrap();
    assert_eq!(size(pair.slave.as_fd()), (1, 32767));
}

/// A child in a new session that takes (`ctty`) or only wires (control) the terminal, checks that fds 0..=2 are
/// its controlling terminal with its group in the foreground (with `ctty`), prints `READY`, then reads a line
/// and exits 0. Exit codes 10.. name the step that failed.
fn session_child(slave: &OwnedFd, ctty: bool) -> libc::pid_t {
    let slave = slave.as_raw_fd();
    // SAFETY: the closure makes async-signal-safe calls only, on plain integers and stack buffers.
    unsafe {
        fork(move || {
            libc::signal(libc::SIGINT, libc::SIG_DFL);
            if libc::setsid() == -1 {
                return 10;
            }
            if ctty {
                if make_controlling(slave).is_err() {
                    return 11;
                }
                let me = libc::getpid();
                if (0..3).any(|fd| libc::tcgetpgrp(fd) != me) {
                    return 12;
                }
            } else if (0..3).any(|fd| libc::dup2(slave, fd) == -1) {
                return 13;
            }
            let ready = b"READY\n";
            if libc::write(1, ready.as_ptr().cast(), ready.len()) != ready.len() as isize {
                return 14;
            }
            let mut buf = [0u8; 64];
            match libc::read(0, buf.as_mut_ptr().cast(), buf.len()) {
                n if n > 0 => 0,
                _ => 15,
            }
        })
    }
}

#[test]
fn ctrl_c_on_the_terminal_interrupts_the_session_that_took_it() {
    let pair = open(80, 24).unwrap();
    let pid = session_child(&pair.slave, true);
    read_exactly(pair.master.as_fd(), b"READY\r\n");
    write_all(pair.master.as_fd(), b"\x03x\n");
    let st = status(pid, pair.master.as_fd());
    assert!(
        libc::WIFSIGNALED(st) && libc::WTERMSIG(st) == libc::SIGINT,
        "not interrupted by SIGINT: wait status {st:#x} (exit code {})",
        libc::WEXITSTATUS(st)
    );
}

#[test]
fn control_without_make_controlling_ctrl_c_interrupts_nothing() {
    let pair = open(80, 24).unwrap();
    let pid = session_child(&pair.slave, false);
    read_exactly(pair.master.as_fd(), b"READY\r\n");
    write_all(pair.master.as_fd(), b"\x03x\n");
    let st = status(pid, pair.master.as_fd());
    assert!(
        libc::WIFEXITED(st) && libc::WEXITSTATUS(st) == 0,
        "the control read past the \\x03 and exited 0; wait status {st:#x}"
    );
}

#[test]
fn make_controlling_outside_a_new_session_returns_the_errno() {
    let pair = open(80, 24).unwrap();
    let slave = pair.slave.as_raw_fd();
    // SAFETY: the closure makes async-signal-safe calls only (`make_controlling` reads errno without allocating).
    let pid = unsafe {
        fork(move || match make_controlling(slave) {
            Err(libc::EPERM) => 0,
            Err(_) => 1,
            Ok(()) => 2,
        })
    };
    let st = status(pid, pair.master.as_fd());
    assert!(
        libc::WIFEXITED(st) && libc::WEXITSTATUS(st) == 0,
        "want Err(EPERM) from a process that is not a session leader; wait status {st:#x}"
    );
}
