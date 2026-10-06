//! Unix: the supervisor process from before it exists until it is reaped, and ending it by identity
//! (ADR-0005 R5). The reaper thread and the observation resources are made before the process, so a
//! started supervisor always has both, and its `Child` is never dropped unreaped.
//!
//! Ending a stuck supervisor never relies on the pid number alone: a host may ignore SIGCHLD or reap with
//! `waitpid(-1)` (both supported), so our child can be reaped by someone else and its number reused. What
//! is promised per OS is GUARANTEES.md, row "A stuck supervisor".
//! - Linux: a pidfd, opened right after the spawn and kept for the generation's life, is signalled with
//!   `pidfd_send_signal`; it can never name another process. It is armed only once checked to name a live
//!   child of ours. Without a checked pidfd (old kernel, or the number already reused) nothing is ever
//!   signalled: a stuck supervisor is abandoned, and the generation's error says so.
//! - macOS: a NOTE_EXIT watch on a kqueue made before the spawn; the start time is recorded only for a live
//!   child of ours. The watch is polled right before the kill (fired: gone, never signal); then the start
//!   time must still match, and only then is it signalled. An error of the watch means "unknown", never
//!   "exited": the identity check still decides.

use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::process::Child;
use std::sync::{Arc, mpsc};
use std::thread;

/// The reaper thread and the observation resources, ready before the supervisor is started.
pub(super) struct Keeper {
    hand: mpsc::SyncSender<Child>,
    prepared: Prepared,
}

/// Made before the supervisor exists. macOS: the kqueue that will watch its exit.
#[cfg(not(target_os = "linux"))]
pub(super) struct Prepared {
    pub exits: OwnedFd,
}

/// Made before the supervisor exists. Linux: nothing (the pidfd needs the pid).
#[cfg(target_os = "linux")]
pub(super) struct Prepared;

/// What can still end the supervisor: its identity, shared with the close timer.
#[derive(Clone)]
pub(super) struct Watch(Arc<Ident>);

/// What a kill did.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Kill {
    Sent,
    /// The process is gone (its number may name another process now): nothing was signalled.
    Gone,
    /// Its identity cannot be checked on this system: nothing was signalled, it is left running.
    Abandoned,
}

impl Keeper {
    pub(super) fn new(thread: thread::Builder) -> io::Result<Keeper> {
        Keeper::with(thread, Prepared::new()?)
    }

    /// Starts the reaper thread from `thread` (it waits for `adopt`, or ends if the keeper is dropped).
    pub(super) fn with(thread: thread::Builder, prepared: Prepared) -> io::Result<Keeper> {
        let (hand, take) = mpsc::sync_channel::<Child>(1);
        thread.spawn(move || {
            if let Ok(mut child) = take.recv() {
                let _ = child.wait();
            }
        })?;
        Ok(Keeper { hand, prepared })
    }

    /// Records the started supervisor's identity, then hands it to the reaper.
    pub(super) fn adopt(self, child: Child) -> Watch {
        let ident = Ident::adopt(self.prepared, child.id());
        if let Err(mpsc::SendError(mut child)) = self.hand.send(child) {
            // The reaper is gone (it only ends after a hand-over): never drop the child unreaped. It was
            // just started and is still ours, so its number is still its own.
            let _ = child.kill();
            let _ = child.wait();
        }
        Watch(Arc::new(ident))
    }
}

impl Watch {
    pub(super) fn kill(&self) -> Kill {
        self.0.kill()
    }

    /// Whether a stuck supervisor can be ended at all on this system.
    pub(super) fn can_end(&self) -> bool {
        self.0.can_end()
    }
}

impl From<Ident> for Watch {
    fn from(ident: Ident) -> Watch {
        Watch(Arc::new(ident))
    }
}

#[cfg(target_os = "linux")]
impl Prepared {
    pub(super) fn new() -> io::Result<Prepared> {
        Ok(Prepared)
    }
}

/// The supervisor's identity: its pidfd (`None` without pidfd support). `pid` is for messages only.
#[cfg(target_os = "linux")]
pub(super) struct Ident {
    pub pid: libc::pid_t,
    pub pidfd: Option<OwnedFd>,
}

#[cfg(target_os = "linux")]
impl Ident {
    /// Pinned, then checked: the pidfd fixes one process for good; `/proc/<pid>/stat`, read after it, must
    /// show a live child of ours; then the pinned process must still be alive, so the number still named
    /// it when the stat was read. Otherwise (the supervisor exited, was reaped by someone else and its
    /// number reused before `pidfd_open`) the kill is never armed.
    pub(super) fn adopt(_: Prepared, pid: u32) -> Ident {
        let pid = libc::pid_t::try_from(pid).unwrap_or(-1);
        // SAFETY: pidfd_open(pid, 0) only creates a descriptor (CLOEXEC) for the process now numbered `pid`.
        let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
        let pidfd = libc::c_int::try_from(fd).ok().filter(|fd| *fd >= 0).map(|fd| {
            // SAFETY: the kernel just returned this descriptor for us; nothing else owns it.
            unsafe { OwnedFd::from_raw_fd(fd) }
        });
        let pidfd = pidfd.filter(|fd| our_live_child(pid) && signal(fd, 0) == 0);
        Ident { pid, pidfd }
    }

    pub(super) fn kill(&self) -> Kill {
        let Some(pidfd) = &self.pidfd else {
            return Kill::Abandoned;
        };
        match signal(pidfd, libc::SIGKILL) {
            0 => Kill::Sent,
            _ if io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) => Kill::Gone,
            _ => Kill::Abandoned,
        }
    }

    fn can_end(&self) -> bool {
        self.pidfd.is_some()
    }
}

/// `pidfd_send_signal(pidfd, sig)`: 0, or -1 with errno (signal 0 only checks that the process exists).
#[cfg(target_os = "linux")]
fn signal(pidfd: &OwnedFd, sig: libc::c_int) -> libc::c_long {
    // SAFETY: signals exactly the process the pidfd names (never a reused pid); no memory is passed.
    unsafe { libc::syscall(libc::SYS_pidfd_send_signal, pidfd.as_raw_fd(), sig, 0, 0) }
}

/// `/proc/<pid>/stat` names a process that is not a zombie and whose parent is this process.
#[cfg(target_os = "linux")]
fn our_live_child(pid: libc::pid_t) -> bool {
    let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
        return false;
    };
    // "pid (comm) state ppid ...": the name may hold spaces and parentheses, so cut at the last ')'.
    let after = stat.rfind(')').and_then(|end| stat.get(end + 1..)).unwrap_or_default();
    let mut fields = after.split_whitespace();
    let (state, ppid) = (fields.next(), fields.next().and_then(|p| p.parse::<u32>().ok()));
    !matches!(state, None | Some("Z" | "X" | "x")) && ppid == Some(std::process::id())
}

#[cfg(not(target_os = "linux"))]
impl Prepared {
    pub(super) fn new() -> io::Result<Prepared> {
        // SAFETY: `kqueue` creates a descriptor (or fails with -1); a kqueue is not inherited across fork.
        let kq = unsafe { libc::kqueue() };
        if kq < 0 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: a fresh descriptor that nothing else owns.
        let exits = unsafe { OwnedFd::from_raw_fd(kq) };
        // SAFETY: F_SETFD on our own descriptor changes only its flags (a later child must not inherit it).
        unsafe { libc::fcntl(exits.as_raw_fd(), libc::F_SETFD, libc::FD_CLOEXEC) };
        Ok(Prepared { exits })
    }
}

/// The supervisor's identity: its pid, its start time (`None`: unknown, so never signalled) and the
/// NOTE_EXIT watch on `exits`.
#[cfg(not(target_os = "linux"))]
pub(super) struct Ident {
    pub pid: libc::pid_t,
    pub start: Option<(u64, u64)>,
    pub exits: OwnedFd,
    pub exited: std::sync::atomic::AtomicBool,
}

#[cfg(not(target_os = "linux"))]
impl Ident {
    pub(super) fn adopt(prepared: Prepared, pid: u32) -> Ident {
        let pid = libc::pid_t::try_from(pid).unwrap_or(-1);
        let watch = exit_event(pid);
        // SAFETY: registers one change on our own kqueue; no event is read.
        let r = unsafe {
            libc::kevent(
                prepared.exits.as_raw_fd(),
                &watch,
                1,
                std::ptr::null_mut(),
                0,
                std::ptr::null(),
            )
        };
        // ESRCH: the process is already gone. Any other error leaves the exit unknown (never "exited").
        let gone = r < 0 && io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH);
        // Pinned (the watch is on one process), then checked: the start time is recorded only for a live
        // child of ours, and only if the watched process has not exited since (so the number still named
        // it). Otherwise the kill is never armed.
        let ours = bsd_info(pid).filter(|i| i.pbi_ppid == std::process::id() && i.pbi_status != libc::SZOMB);
        let mut ident = Ident {
            pid,
            start: None,
            exits: prepared.exits,
            exited: gone.into(),
        };
        if gone || ident.exit_fired() {
            ident.exited = true.into();
        } else {
            ident.start = ours.map(|i| (i.pbi_start_tvsec, i.pbi_start_tvusec));
        }
        ident
    }

    pub(super) fn kill(&self) -> Kill {
        use std::sync::atomic::Ordering;
        if self.exited.load(Ordering::Acquire) || self.exit_fired() {
            self.exited.store(true, Ordering::Release);
            return Kill::Gone;
        }
        match (self.start, started(self.pid)) {
            (None, _) => Kill::Abandoned,
            (Some(then), Some(now)) if then == now => {
                // The number still names the process we started (same start time). Residual window: it could
                // exit, be reaped by someone else and its number be reused in the microseconds between this
                // check and the signal; declared in GUARANTEES.md, row "A stuck supervisor".
                // SAFETY: `kill` changes no memory; the target was just checked as our supervisor.
                unsafe { libc::kill(self.pid, libc::SIGKILL) };
                Kill::Sent
            }
            (Some(_), _) => Kill::Gone,
        }
    }

    /// A non-blocking poll of the NOTE_EXIT watch. An error is "unknown": false.
    fn exit_fired(&self) -> bool {
        let zero = libc::timespec { tv_sec: 0, tv_nsec: 0 };
        // SAFETY: an all-zero `kevent` is a valid out-parameter.
        let mut fired: libc::kevent = unsafe { std::mem::zeroed() };
        // SAFETY: no change, room for one event, and a zero timeout: never blocks.
        let n = unsafe { libc::kevent(self.exits.as_raw_fd(), std::ptr::null(), 0, &mut fired, 1, &zero) };
        n == 1 && fired.filter == libc::EVFILT_PROC && fired.fflags & libc::NOTE_EXIT != 0
    }

    fn can_end(&self) -> bool {
        self.start.is_some()
    }
}

#[cfg(not(target_os = "linux"))]
fn exit_event(pid: libc::pid_t) -> libc::kevent {
    libc::kevent {
        ident: libc::uintptr_t::try_from(pid).unwrap_or(0),
        filter: libc::EVFILT_PROC,
        flags: libc::EV_ADD,
        fflags: libc::NOTE_EXIT,
        data: 0,
        udata: std::ptr::null_mut(),
    }
}

/// When `pid` started (`None`: no such process, or unknown).
#[cfg(not(target_os = "linux"))]
pub(super) fn started(pid: libc::pid_t) -> Option<(u64, u64)> {
    bsd_info(pid).map(|i| (i.pbi_start_tvsec, i.pbi_start_tvusec))
}

/// `pid`'s BSD info: start time, parent, status (`None`: no such process, or unknown).
#[cfg(not(target_os = "linux"))]
fn bsd_info(pid: libc::pid_t) -> Option<libc::proc_bsdinfo> {
    // SAFETY: an all-zero `proc_bsdinfo` is a valid out-parameter.
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = libc::c_int::try_from(std::mem::size_of_val(&info)).ok()?;
    // SAFETY: asks for `pid`'s BSD info into `info`, which has `size` writable bytes.
    let n = unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDTBSDINFO, 0, (&raw mut info).cast(), size) };
    (n == size).then_some(info)
}
