//! Startup plumbing for the control thread: the host's channel on fd 0, the signal dispositions and the
//! SIGCHLD self-pipe that wakes the loop.

use std::os::fd::{AsFd, AsRawFd, OwnedFd};
use std::sync::atomic::{AtomicI32, Ordering};

use super::sys;

/// Write end of the SIGCHLD self-pipe, for the handler.
static SIGCHLD_PIPE: AtomicI32 = AtomicI32::new(-1);

extern "C" fn on_sigchld(_: libc::c_int) {
    let errno = sys::errno_location();
    // SAFETY: async-signal-safe: save errno, write one byte to a non-blocking pipe (a full pipe already holds
    // a wakeup), restore errno.
    unsafe {
        let saved = *errno;
        let b = 0u8;
        libc::write(SIGCHLD_PIPE.load(Ordering::Relaxed), (&raw const b).cast(), 1);
        *errno = saved;
    }
}

/// fd 0 must be the host's socket.
pub(super) fn take_channel() -> std::io::Result<OwnedFd> {
    // SAFETY: stat is plain old data; fstat fills it.
    let mut st: libc::stat = unsafe { std::mem::zeroed() };
    // SAFETY: `st` is writable storage for the result.
    sys::cvt(unsafe { libc::fstat(0, &raw mut st) })?;
    if st.st_mode & libc::S_IFMT != libc::S_IFSOCK {
        return Err(std::io::Error::other("fd 0 is not the host's socket"));
    }
    Ok(sys::owned(0))
}

/// Empty mask; SIGPIPE, SIGINT, SIGHUP and SIGTERM ignored (the host's terminal is not ours, and a host that is itself
/// a tree of an outer supervisor must still be alive to stop its own trees when the outer graceful step reaches the
/// whole session; the forced step still ends it); SIGCHLD wakes the loop
/// through a self-pipe and replaces any inherited SIG_IGN, which would auto-reap roots and lose the pin.
pub(super) fn signals() -> std::io::Result<(OwnedFd, OwnedFd)> {
    let (r, w) = sys::pipe()?;
    sys::set_nonblock(r.as_fd())?;
    sys::set_nonblock(w.as_fd())?;
    SIGCHLD_PIPE.store(w.as_raw_fd(), Ordering::Relaxed);
    // SAFETY: zeroed sigset_t/sigaction are valid (empty set, SIG_DFL); every pointer is to a live local.
    unsafe {
        let mut none: libc::sigset_t = std::mem::zeroed();
        sys::cvt(libc::sigemptyset(&raw mut none))?;
        sys::cvt(libc::sigprocmask(
            libc::SIG_SETMASK,
            &raw const none,
            std::ptr::null_mut(),
        ))?;
        let mut ign: libc::sigaction = std::mem::zeroed();
        ign.sa_sigaction = libc::SIG_IGN;
        for sig in [libc::SIGPIPE, libc::SIGINT, libc::SIGHUP, libc::SIGTERM] {
            sys::cvt(libc::sigaction(sig, &raw const ign, std::ptr::null_mut()))?;
        }
        let mut chld: libc::sigaction = std::mem::zeroed();
        chld.sa_sigaction = on_sigchld as extern "C" fn(libc::c_int) as libc::sighandler_t;
        chld.sa_flags = libc::SA_RESTART | libc::SA_NOCLDSTOP;
        sys::cvt(libc::sigaction(libc::SIGCHLD, &raw const chld, std::ptr::null_mut()))?;
    }
    Ok((r, w))
}

/// Empties the self-pipe (non-blocking).
pub(super) fn drain(fd: &OwnedFd) {
    let mut buf = [0u8; 64];
    // SAFETY: `buf` has 64 writable bytes; the pipe is non-blocking, so the loop ends at EAGAIN.
    while unsafe { libc::read(fd.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) } > 0 {}
}
