//! Starting a terminal root (ADR-0005 §2, R9). `posix_spawn` cannot make a controlling terminal, so the
//! supervisor forks (the child runs only async-signal-safe calls). The child resets every signal and the
//! mask, calls `setsid`, takes the terminal (`pty_unix::make_controlling`, W12), `chdir`s, closes every
//! other descriptor and then **waits on the go pipe** before `execve`, so a program that prints and exits at
//! once cannot lose output before the host reader runs. One byte on the go pipe = `Go`; EOF (the supervisor
//! dropped it: Stop, Release, host death) = `_exit(127)` without exec. Any failure in the child is written
//! as (stage, errno) to the close-on-exec error pipe, which the loop watches after `Go`: EOF = exec
//! succeeded.

use std::io;
use std::os::fd::{AsRawFd, OwnedFd, RawFd};

use omni_proto::FailCode;

use super::spawn::{Fail, Prepared, exec_code};
use super::sys;
use crate::pty_unix;

const STAGE_SIGNALS: u8 = 1;
const STAGE_SETSID: u8 = 2;
const STAGE_TERMINAL: u8 = 3;
const STAGE_CWD: u8 = 4;
const STAGE_EXEC: u8 = 5;

/// A forked terminal root waiting before exec: the go pipe (write end) and the error pipe (read end).
pub(super) struct Held {
    go: OwnedFd,
    err: OwnedFd,
}

/// Forks a held terminal root in a new session. Returns its pid, the terminal master and the held state.
pub(super) fn spawn_pty(p: &Prepared, cols: u16, rows: u16) -> Result<(i32, OwnedFd, Held), Fail> {
    let io_fail =
        |what: &str, e: io::Error| Fail::new(FailCode::Io, e.raw_os_error().unwrap_or(0), format!("{what}: {e}"));
    let pair = pty_unix::open(cols, rows).map_err(|e| io_fail("terminal", e))?;
    let (err_r, err_w) = sys::pipe().map_err(|e| io_fail("pipe", e))?;
    let (go_r, go_w) = sys::pipe().map_err(|e| io_fail("pipe", e))?;
    let (argv, envp) = p.ptrs();
    let plan = Plan {
        slave: pair.slave.as_raw_fd(),
        go: go_r.as_raw_fd(),
        err: err_w.as_raw_fd(),
        cwd: p.cwd.as_ptr(),
        path: p.program.as_ptr(),
        argv: argv.as_ptr(),
        envp: envp.as_ptr(),
    };
    // SAFETY: the child runs only `child`, which makes async-signal-safe calls and never returns, so the fork
    // is sound whatever other thread exists (the diagnostics thread exists only after host death anyway).
    let pid = unsafe { libc::fork() };
    if pid == 0 {
        // SAFETY: we are the child of that fork; every pointer in `plan` is valid in this copy.
        unsafe { child(&plan) }
    }
    if pid < 0 {
        return Err(io_fail("fork", io::Error::last_os_error()));
    }
    Ok((pid, pair.master, Held { go: go_w, err: err_r }))
}

impl Held {
    /// `Go`: lets the root exec. Returns the error pipe to watch for the exec result.
    /// EPIPE means the child already died before `Go`: its report is on the error pipe, which is the answer.
    pub(super) fn go(self) -> io::Result<OwnedFd> {
        let b = 1u8;
        // SAFETY: one byte from a live local into a pipe we own; a fresh pipe has room for it.
        let r = sys::cvt(unsafe { libc::write(self.go.as_raw_fd(), (&raw const b).cast(), 1) } as libc::c_int);
        match r {
            Err(e) if e.raw_os_error() != Some(libc::EPIPE) => Err(e),
            _ => Ok(self.err), // dropping `go` closes the write end
        }
    }
}

/// Reads the exec result once the error pipe is readable: EOF = the root exec'd.
pub(super) fn exec_result(err: &OwnedFd) -> Result<(), Fail> {
    let mut buf = [0u8; 5];
    let n = loop {
        // SAFETY: `buf` has 5 writable bytes.
        let n = unsafe { libc::read(err.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) };
        if n >= 0 {
            break n.unsigned_abs();
        }
        if sys::errno() != libc::EINTR {
            let e = io::Error::last_os_error();
            return Err(Fail::new(
                FailCode::Io,
                e.raw_os_error().unwrap_or(0),
                format!("exec report: {e}"),
            ));
        }
    };
    match (n, buf) {
        (0, _) => Ok(()),
        (5, [stage, a, b, c, d]) => {
            let errno = i32::from_le_bytes([a, b, c, d]);
            let os = io::Error::from_raw_os_error(errno);
            let (code, what) = match stage {
                STAGE_CWD => (FailCode::BadCwd, "chdir"),
                STAGE_EXEC => (exec_code(errno), "execve"),
                STAGE_SIGNALS => (FailCode::Io, "signal reset"),
                STAGE_SETSID => (FailCode::Io, "setsid"),
                _ => (FailCode::Io, "controlling terminal"),
            };
            Err(Fail::new(code, errno, format!("terminal root: {what} failed: {os}")))
        }
        _ => Err(Fail::new(
            FailCode::Io,
            0,
            format!("terminal root: short exec report ({n} bytes)"),
        )),
    }
}

/// Everything the child needs, prepared before the fork (the child allocates nothing).
struct Plan {
    slave: RawFd,
    go: RawFd,
    err: RawFd,
    cwd: *const libc::c_char,
    path: *const libc::c_char,
    argv: *const *mut libc::c_char,
    envp: *const *mut libc::c_char,
}

#[cfg(target_os = "linux")]
const NSIG: libc::c_int = 65;
#[cfg(target_os = "macos")]
const NSIG: libc::c_int = 32;

/// The forked child: never returns.
///
/// # Safety
/// Only in the child of `fork`, with `plan` built by `spawn_pty`.
unsafe fn child(plan: &Plan) -> ! {
    let die = |stage: u8| -> ! {
        // SAFETY: errno_location points at this thread's errno.
        let e = unsafe { *sys::errno_location() }.to_le_bytes();
        let msg = [stage, e[0], e[1], e[2], e[3]];
        // SAFETY: 5 bytes from a live local into our error pipe (atomic: below PIPE_BUF); then exit at once.
        unsafe {
            libc::write(plan.err, msg.as_ptr().cast(), msg.len());
            libc::_exit(127)
        }
    };
    // SAFETY: async-signal-safe calls on valid local objects and the descriptors/strings of `plan`.
    unsafe {
        let mut set: libc::sigset_t = std::mem::zeroed();
        if libc::sigemptyset(&raw mut set) != 0
            || libc::sigprocmask(libc::SIG_SETMASK, &raw const set, std::ptr::null_mut()) != 0
        {
            die(STAGE_SIGNALS);
        }
        let dfl: libc::sigaction = std::mem::zeroed(); // SIG_DFL, empty mask, no flags
        for sig in 1..NSIG {
            // Numbers the libc reserves or that cannot be caught fail with EINVAL: nothing to reset there.
            let _ = libc::sigaction(sig, &raw const dfl, std::ptr::null_mut());
        }
        if libc::setsid() < 0 {
            die(STAGE_SETSID);
        }
        if let Err(e) = pty_unix::make_controlling(plan.slave) {
            *sys::errno_location() = e;
            die(STAGE_TERMINAL);
        }
        if libc::chdir(plan.cwd) < 0 {
            die(STAGE_CWD);
        }
        close_others(plan.err, plan.go);
        let mut b = 0u8;
        loop {
            let n = libc::read(plan.go, (&raw mut b).cast(), 1);
            if n == 1 {
                break;
            }
            if n < 0 && *sys::errno_location() == libc::EINTR {
                continue;
            }
            libc::_exit(127); // EOF: the supervisor gave up on this root before Go
        }
        libc::execve(plan.path, plan.argv.cast(), plan.envp.cast());
        die(STAGE_EXEC)
    }
}

/// Closes every descriptor >= 3 except `a` and `b` (both close-on-exec), so the held child keeps nothing of
/// the supervisor: no channel, no other tree's terminal or go pipe, not its own go pipe's write end.
///
/// # Safety
/// Only in the forked child (it closes descriptors that Rust objects of the parent copy still "own").
unsafe fn close_others(a: RawFd, b: RawFd) {
    let (lo, hi) = (a.min(b), a.max(b));
    #[cfg(target_os = "linux")]
    {
        let ranges = [(3, lo - 1), (lo + 1, hi - 1), (hi + 1, libc::c_int::MAX)];
        let mut ok = true;
        for (first, last) in ranges {
            if first <= last {
                // SAFETY: close_range takes plain integers.
                ok &=
                    unsafe { libc::syscall(libc::SYS_close_range, first as libc::c_uint, last as libc::c_uint, 0u32) }
                        == 0;
            }
        }
        if ok {
            return;
        }
    }
    #[cfg(target_os = "macos")]
    {
        // SAFETY: proc_fdinfo is plain old data; the call writes at most the buffer's size.
        let mut buf: [libc::proc_fdinfo; 256] = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of_val(&buf) as libc::c_int;
        // SAFETY: as above; no allocation, async-signal-safe syscall wrapper.
        let n = unsafe { libc::proc_pidinfo(libc::getpid(), libc::PROC_PIDLISTFDS, 0, buf.as_mut_ptr().cast(), size) };
        if n > 0 && n < size {
            let count = n.unsigned_abs() as usize / std::mem::size_of::<libc::proc_fdinfo>();
            for f in buf.iter().take(count) {
                if f.proc_fd >= 3 && f.proc_fd != a && f.proc_fd != b {
                    // SAFETY: closing a descriptor of this (child) process.
                    unsafe { libc::close(f.proc_fd) };
                }
            }
            return;
        }
    }
    // Fallback (Linux < 5.9, or more descriptors than the macOS buffer): every number up to the limit.
    // SAFETY: getdtablesize has no preconditions.
    let max = unsafe { libc::getdtablesize() }.min(1 << 20);
    for fd in 3..max {
        if fd != lo && fd != hi {
            // SAFETY: closing a descriptor of this (child) process; EBADF for unused numbers is expected.
            unsafe { libc::close(fd) };
        }
    }
}
