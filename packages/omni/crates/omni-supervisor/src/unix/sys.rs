//! Checked syscall helpers. Every descriptor the supervisor creates is close-on-exec: atomically on Linux;
//! on macOS by `fcntl` right after, which cannot race a fork: only the control thread forks or spawns (the
//! diagnostics thread never does).

use std::io;
use std::os::fd::{AsRawFd, BorrowedFd, FromRawFd, OwnedFd, RawFd};

/// `-1` becomes the OS error.
pub(super) fn cvt(r: libc::c_int) -> io::Result<libc::c_int> {
    if r == -1 {
        Err(io::Error::last_os_error())
    } else {
        Ok(r)
    }
}

/// The calling thread's `errno`.
pub(super) fn errno() -> i32 {
    io::Error::last_os_error().raw_os_error().unwrap_or(0)
}

/// Where `errno` lives, for code that must save and restore it (the signal handler, the forked child).
#[cfg(target_os = "linux")]
pub(super) fn errno_location() -> *mut libc::c_int {
    // SAFETY: returns the address of this thread's errno; no preconditions, async-signal-safe.
    unsafe { libc::__errno_location() }
}

/// Where `errno` lives, for code that must save and restore it (the signal handler, the forked child).
#[cfg(target_os = "macos")]
pub(super) fn errno_location() -> *mut libc::c_int {
    // SAFETY: returns the address of this thread's errno; no preconditions, async-signal-safe.
    unsafe { libc::__error() }
}

/// Takes ownership of a descriptor a syscall just returned.
pub(super) fn owned(fd: RawFd) -> OwnedFd {
    // SAFETY: callers pass a descriptor they just created and that nothing else owns.
    unsafe { OwnedFd::from_raw_fd(fd) }
}

pub(super) fn set_cloexec(fd: BorrowedFd<'_>) -> io::Result<()> {
    // SAFETY: F_SETFD on a descriptor we borrow; no memory is passed.
    cvt(unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_SETFD, libc::FD_CLOEXEC) }).map(drop)
}

pub(super) fn set_nonblock(fd: BorrowedFd<'_>) -> io::Result<()> {
    // SAFETY: F_GETFL/F_SETFL on a descriptor we borrow; no memory is passed.
    let flags = cvt(unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_GETFL) })?;
    // SAFETY: as above.
    cvt(unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) }).map(drop)
}

/// A close-on-exec pipe: (read end, write end).
pub(super) fn pipe() -> io::Result<(OwnedFd, OwnedFd)> {
    let mut p = [-1; 2];
    #[cfg(target_os = "linux")]
    {
        // SAFETY: `p` has room for the two descriptors the call writes.
        cvt(unsafe { libc::pipe2(p.as_mut_ptr(), libc::O_CLOEXEC) })?;
        Ok((owned(p[0]), owned(p[1])))
    }
    #[cfg(target_os = "macos")]
    {
        // SAFETY: `p` has room for the two descriptors the call writes.
        cvt(unsafe { libc::pipe(p.as_mut_ptr()) })?;
        let (r, w) = (owned(p[0]), owned(p[1]));
        set_cloexec(std::os::fd::AsFd::as_fd(&r))?;
        set_cloexec(std::os::fd::AsFd::as_fd(&w))?;
        Ok((r, w))
    }
}

/// Opens `/dev/null` on every one of fds 0..=2 that is closed, so that no descriptor the supervisor creates
/// later can land on a stdio number (a child's `dup2` onto its own number would keep it close-on-exec).
pub(super) fn fill_stdio() -> io::Result<()> {
    for fd in 0..3 {
        // SAFETY: F_GETFD only queries the descriptor table.
        if unsafe { libc::fcntl(fd, libc::F_GETFD) } == -1 {
            // SAFETY: a static NUL-terminated path; the lowest free number is `fd`, since the lower ones are open.
            let got = cvt(unsafe { libc::open(c"/dev/null".as_ptr(), libc::O_RDWR) })?;
            if got != fd {
                return Err(io::Error::other(format!("/dev/null landed on fd {got}, wanted {fd}")));
            }
        }
    }
    Ok(())
}

/// Closes every descriptor >= 3: nothing the host leaked to the supervisor survives (ADR-0005 §2).
pub(super) fn close_inherited() -> io::Result<()> {
    #[cfg(target_os = "linux")]
    {
        // SAFETY: close_range takes plain integers; it closes descriptors this process owns and nothing
        // in the supervisor holds a descriptor >= 3 yet.
        let r = unsafe { libc::syscall(libc::SYS_close_range, 3u32, u32::MAX, 0u32) };
        if r == 0 {
            return Ok(());
        }
        // Kernels before 5.9: list /proc/self/fd, then close (the listing's own descriptor gets EBADF).
        let fds: Vec<RawFd> = std::fs::read_dir("/proc/self/fd")?
            .filter_map(|e| e.ok()?.file_name().to_str()?.parse().ok())
            .filter(|&fd| fd >= 3)
            .collect();
        for fd in fds {
            close_raw(fd)?;
        }
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        for fd in open_fds()? {
            if fd >= 3 {
                close_raw(fd)?;
            }
        }
        Ok(())
    }
}

/// Closes a raw number this process owns but holds no `OwnedFd` for; EBADF (already closed) is fine.
fn close_raw(fd: RawFd) -> io::Result<()> {
    // SAFETY: the descriptor is not owned by any Rust object (called only from `close_inherited`).
    match cvt(unsafe { libc::close(fd) }) {
        Err(e) if e.raw_os_error() == Some(libc::EBADF) => Ok(()),
        r => r.map(drop),
    }
}

/// This process's open descriptors (macOS: PROC_PIDLISTFDS).
#[cfg(target_os = "macos")]
pub(super) fn open_fds() -> io::Result<Vec<RawFd>> {
    const SZ: usize = std::mem::size_of::<libc::proc_fdinfo>();
    let mut cap = 64usize;
    loop {
        // SAFETY: proc_fdinfo is plain old data, so all-zero is a valid value.
        let mut buf: Vec<libc::proc_fdinfo> = vec![unsafe { std::mem::zeroed() }; cap];
        let bytes = i32::try_from(cap * SZ).map_err(io::Error::other)?;
        // SAFETY: the buffer holds `bytes` writable bytes; the call writes at most that many.
        let n = unsafe { libc::proc_pidinfo(libc::getpid(), libc::PROC_PIDLISTFDS, 0, buf.as_mut_ptr().cast(), bytes) };
        if n <= 0 {
            return Err(io::Error::last_os_error());
        }
        let got = usize::try_from(n).map_err(io::Error::other)? / SZ;
        if got < cap {
            return Ok(buf.iter().take(got).map(|f| f.proc_fd).collect());
        }
        cap *= 4;
    }
}

/// Descriptors held from startup (the null device) so that an inventory, and the pidfds of the signals after
/// it, still work when the supervisor's descriptor table is full: released before a retry, refilled when a
/// slot is free again (Codex r1: EMFILE must not leave a member unreachable).
pub(super) struct Reserve(Vec<OwnedFd>);

impl Reserve {
    const SIZE: usize = 3;

    pub(super) fn new() -> Reserve {
        let mut r = Reserve(Vec::new());
        r.refill();
        r
    }

    /// Frees the reserved slots; false if there were none.
    pub(super) fn release(&mut self) -> bool {
        let had = !self.0.is_empty();
        self.0.clear();
        had
    }

    /// Takes the slots back while the table has room (a failure just leaves the reserve short for now).
    pub(super) fn refill(&mut self) {
        while self.0.len() < Self::SIZE {
            // SAFETY: a static NUL-terminated path; the result is a new descriptor we own, or -1.
            match cvt(unsafe { libc::open(c"/dev/null".as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC) }) {
                Ok(fd) => self.0.push(owned(fd)),
                Err(_) => break,
            }
        }
    }
}
