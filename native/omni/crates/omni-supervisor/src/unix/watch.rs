//! Watching the host and signalling session members (ADR-0005 R4). The two are feature-detected separately
//! and reported in `Ready.info`:
//! - **Host watch** (bit 0 = event-based): Linux pidfd (`pidfd_open`, kernel >= 5.3), macOS kqueue
//!   `EVFILT_PROC`/`NOTE_EXIT`. Fallback (no pidfd): `getppid()` polled every `PARENT_POLL`, plus channel EOF;
//!   a host that dies while a forked copy keeps the channel open is then noticed up to `PARENT_POLL` late.
//!   `getppid()` is checked on every wakeup in all modes.
//! - **Members** (bit 1 = pidfd): Linux `pidfd_open` + session re-check + `pidfd_send_signal`, so the signal
//!   reaches exactly the process that was re-checked. Fallback (macOS always, Linux without pidfd): session
//!   re-check, then `kill` by number; a member that dies and has its number reused between the two calls
//!   (microseconds, and only after the allocator wrapped around) could receive the signal.

use std::io;
use std::os::fd::{AsRawFd, OwnedFd, RawFd};
use std::time::Duration;

use super::{procs, sys};

/// How often the host is polled through `getppid()` when no event-based watch is available.
pub(super) const PARENT_POLL: Duration = Duration::from_millis(250);

pub(super) struct HostWatch {
    host: i32,
    /// pidfd (Linux) or kqueue (macOS) that becomes readable when the host exits.
    event: Option<OwnedFd>,
    remote: bool,
}

impl HostWatch {
    /// Arms the watch; the caller then checks `gone(false)` once, so a host that died before arming is seen.
    pub(super) fn arm(host: i32) -> HostWatch {
        HostWatch {
            host,
            event: arm_event(host),
            remote: false,
        }
    }

    #[cfg(target_os = "linux")]
    pub(super) fn remote(event: OwnedFd) -> io::Result<HostWatch> {
        if pidfd_ready(&event)? { return Err(io::Error::other("peer already exited")); }
        Ok(HostWatch { host: 0, event: Some(event), remote: true })
    }

    pub(super) fn event_fd(&self) -> Option<RawFd> {
        self.event.as_ref().map(AsRawFd::as_raw_fd)
    }

    /// Bit 0 of `Ready.info`.
    pub(super) fn evented(&self) -> bool {
        self.event.is_some()
    }

    /// The host is gone: its event fired, or we were reparented.
    pub(super) fn gone(&self, event_fired: bool) -> bool {
        // SAFETY: getppid has no preconditions.
        if self.remote {
            #[cfg(target_os = "linux")]
            return event_fired || self.event.as_ref().is_none_or(|fd| pidfd_ready(fd).unwrap_or(true));
            #[cfg(not(target_os = "linux"))]
            return true;
        }
        event_fired || unsafe { libc::getppid() } != self.host
    }
}

#[cfg(target_os = "linux")]
fn arm_event(host: i32) -> Option<OwnedFd> {
    pidfd_open(host).ok()
}

#[cfg(target_os = "macos")]
fn arm_event(host: i32) -> Option<OwnedFd> {
    // SAFETY: kqueue takes no arguments.
    let kq = sys::owned(sys::cvt(unsafe { libc::kqueue() }).ok()?);
    sys::set_cloexec(std::os::fd::AsFd::as_fd(&kq)).ok()?;
    let ev = libc::kevent {
        ident: usize::try_from(host).ok()?,
        filter: libc::EVFILT_PROC,
        flags: libc::EV_ADD | libc::EV_ONESHOT,
        fflags: libc::NOTE_EXIT,
        data: 0,
        udata: std::ptr::null_mut(),
    };
    // SAFETY: one change from `ev`, no event buffer, no timeout.
    let r = unsafe {
        libc::kevent(
            kq.as_raw_fd(),
            &raw const ev,
            1,
            std::ptr::null_mut(),
            0,
            std::ptr::null(),
        )
    };
    sys::cvt(r).ok().map(|_| kq)
}

/// Whether pidfds can open and signal processes here (Linux >= 5.3 and not blocked). Probed on ourselves
/// with signal 0, which delivers nothing.
#[cfg(target_os = "linux")]
pub(super) fn pidfd_available() -> bool {
    let Ok(me) = pidfd_open(std::process::id().cast_signed()) else {
        return false;
    };
    pidfd_send_signal(&me, 0).is_ok()
}

/// macOS has no pidfd.
#[cfg(target_os = "macos")]
pub(super) fn pidfd_available() -> bool {
    false
}

/// Sends `sig` to `pid` if it is a live member of session `sid` right now; a member that is gone is fine.
pub(super) fn signal_member(pid: i32, sid: i32, sig: i32, pidfd: bool) -> io::Result<()> {
    #[cfg(target_os = "linux")]
    if pidfd {
        let Some(fd) = pin_session_member(pid, sid, None)? else {
            return Ok(());
        };
        return gone_is_ok(pidfd_send_signal(&fd, sig));
    }
    let _ = pidfd;
    if !procs::in_session(pid, sid)? {
        return Ok(());
    }
    // SAFETY: kill takes plain integers.
    gone_is_ok(sys::cvt(unsafe { libc::kill(pid, sig) }).map(drop))
}

/// Pins one live session member and checks its birth, if known. `None` means gone or not a match;
/// inspection errors remain errors. This does not make session membership atomic with a later signal.
#[cfg(target_os = "linux")]
pub(super) fn pin_session_member(pid: i32, sid: i32, expected_start: Option<u64>) -> io::Result<Option<OwnedFd>> {
    let fd = match pidfd_open(pid) {
        Ok(fd) => fd,
        Err(e) if e.raw_os_error() == Some(libc::ESRCH) => return Ok(None),
        Err(e) => return Err(e),
    };
    if pidfd_ready(&fd)? {
        return Ok(None);
    }
    let birth = procs::member_birth(pid, sid)?;
    if birth.is_none() || expected_start.is_some_and(|expected| birth != Some(expected)) || pidfd_ready(&fd)? {
        return Ok(None);
    }
    Ok(Some(fd))
}

/// A readable pidfd names an exited process; other poll events are inspection failures.
#[cfg(target_os = "linux")]
fn pidfd_ready(fd: &OwnedFd) -> io::Result<bool> {
    let mut pollfd = libc::pollfd {
        fd: fd.as_raw_fd(),
        events: libc::POLLIN,
        revents: 0,
    };
    // SAFETY: pollfd points to one initialized descriptor and the timeout is nonblocking.
    let result = unsafe { libc::poll(&raw mut pollfd, 1, 0) };
    if result < 0 {
        return Err(io::Error::last_os_error());
    }
    if pollfd.revents & !(libc::POLLIN | libc::POLLHUP) != 0 {
        return Err(io::Error::other("unexpected pidfd poll event"));
    }
    Ok(result > 0)
}

/// `killpg` on a tree's own group, whose number the unreaped root pins.
pub(super) fn signal_group(pgid: i32, sig: i32) -> io::Result<()> {
    // SAFETY: killpg takes plain integers.
    gone_is_ok(sys::cvt(unsafe { libc::killpg(pgid, sig) }).map(drop))
}

fn gone_is_ok(r: io::Result<()>) -> io::Result<()> {
    match r {
        Err(e) if e.raw_os_error() == Some(libc::ESRCH) => Ok(()),
        r => r,
    }
}

#[cfg(target_os = "linux")]
fn pidfd_open(pid: i32) -> io::Result<OwnedFd> {
    // SAFETY: pidfd_open takes a pid and flags; the result is a new close-on-exec descriptor or -1.
    let r = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
    if r < 0 {
        return Err(io::Error::last_os_error());
    }
    let fd = RawFd::try_from(r).map_err(io::Error::other)?;
    Ok(sys::owned(fd))
}

#[cfg(target_os = "linux")]
fn pidfd_send_signal(fd: &OwnedFd, sig: i32) -> io::Result<()> {
    // SAFETY: a valid pidfd, a signal number, no siginfo, no flags.
    let r = unsafe {
        libc::syscall(
            libc::SYS_pidfd_send_signal,
            fd.as_raw_fd(),
            sig,
            std::ptr::null::<libc::siginfo_t>(),
            0,
        )
    };
    if r < 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use std::process::{Command, Stdio};

    use super::{pidfd_ready, pin_session_member, procs};

    #[test]
    fn pin_checks_birth_session_and_exit() {
        let mut child = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id().cast_signed();
        // SAFETY: getsid reads the session of the child created above.
        let sid = unsafe { libc::getsid(pid) };
        assert!(sid > 0);
        let birth = procs::member_birth(pid, sid).unwrap().unwrap();
        let fd = pin_session_member(pid, sid, Some(birth)).unwrap().unwrap();
        assert!(!pidfd_ready(&fd).unwrap());
        assert!(
            pin_session_member(pid, sid, Some(birth.wrapping_add(1)))
                .unwrap()
                .is_none()
        );
        assert!(pin_session_member(pid, -1, Some(birth)).unwrap().is_none());
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(pidfd_ready(&fd).unwrap());
        assert!(pin_session_member(pid, sid, Some(birth)).unwrap().is_none());
    }
}
