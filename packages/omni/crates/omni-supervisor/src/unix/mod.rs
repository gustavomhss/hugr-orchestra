//! The supervisor on Linux and macOS (W05): one control thread, one event loop; `posix_spawn` + SETSID for pipe
//! roots, `fork` for PTY roots (via `pty_unix`), sessions as the kill unit, the process inventory,
//! pidfd/kqueue, reaping and pinning, `Stop`, host death (ADR-0005 R1, R3, R4, R5, R8, R10).
//!
//! SEAM (frozen in W00): `run`. Everything else belongs to W05.
//!
//! Each turn of the loop handles, in order: host death, exec results, root exits, the sweep (deadlines,
//! signals, reaping), then at most `BATCH` requests, then replies. So host death and deadlines are never
//! queued behind a flood of requests (R1), and a host that does not read its replies stops being read.
//! The control thread never writes to stderr (`diag`).

mod chan;
mod diag;
mod fork;
mod procs;
mod spawn;
mod sweep;
mod sys;
mod trees;
mod watch;

use std::os::fd::{AsFd, AsRawFd, OwnedFd};
use std::process::ExitCode;
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::{Duration, Instant};

use omni_proto::{Ack, FailCode, INFO_PIDFD_HOST, INFO_PIDFD_MEMBERS, Msg, Slot, Spawn, VERSION};

use crate::Args;
use chan::{Chan, Closed};
use diag::Diag;
use spawn::{Fail, Prepared};
use trees::{Exec, MAX_TREES, Trees};
use watch::HostWatch;

/// Requests handled per turn before host death, exits and deadlines are looked at again.
const BATCH: usize = 64;
/// After host death, how long past the last forced deadline the supervisor keeps sweeping (SIGKILL every
/// 10 ms, inventory retried) before it gives up and exits 1, saying so on stderr.
const EXIT_SLACK: Duration = Duration::from_secs(5);
/// Reply bytes reserved for each `Stop` still waiting for its `Stopped` (21 bytes, rounded up).
const RESERVE_PER_WAITER: usize = 32;

/// Serves the host on fd 0 until the host is gone and every tree is gone.
pub(crate) fn run(args: &Args) -> ExitCode {
    match Sup::start(args) {
        Ok(Some(mut sup)) => {
            let code = sup.serve();
            sup.diag.finish();
            code
        }
        Ok(None) => ExitCode::SUCCESS, // the host was gone before Ready: nothing was ever started
        Err(e) => {
            let mut diag = Diag::default();
            diag.report(format!("hugr-omni-supervisor: cannot start: {e}"));
            diag.finish();
            ExitCode::FAILURE
        }
    }
}

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

struct Sup {
    chan: Chan,
    watch: HostWatch,
    sigchld: OwnedFd,
    _sigchld_w: OwnedFd,
    trees: Trees,
    out: Vec<Msg>,
    /// Set at host death: exit by then even if a tree cannot be confirmed gone.
    exit_by: Option<Instant>,
    /// Host death came from a protocol error (exit code 1 instead of 0).
    broken: bool,
    diag: Diag,
}

impl Sup {
    fn start(args: &Args) -> std::io::Result<Option<Sup>> {
        sys::fill_stdio()?;
        sys::close_inherited()?;
        let chan = Chan::new(take_channel()?)?;
        let (sigchld, sigchld_w) = signals()?;
        let host = i32::try_from(args.host_pid).map_err(std::io::Error::other)?;
        let watch = HostWatch::arm(host);
        let pidfd = watch::pidfd_available();
        if watch.gone(false) {
            return Ok(None);
        }
        let mut sup = Sup {
            chan,
            watch,
            sigchld,
            _sigchld_w: sigchld_w,
            trees: Trees::new(pidfd),
            out: Vec::new(),
            exit_by: None,
            broken: false,
            diag: Diag::default(),
        };
        let info = if sup.watch.evented() { INFO_PIDFD_HOST } else { 0 } | if pidfd { INFO_PIDFD_MEMBERS } else { 0 };
        let pid = std::process::id();
        sup.out.push(Msg::Ready {
            version: VERSION,
            pid,
            info,
        });
        sup.emit();
        Ok(Some(sup))
    }

    fn serve(&mut self) -> ExitCode {
        loop {
            if let Some(code) = self.finished() {
                return code;
            }
            let ready = self.wait();
            let now = Instant::now();
            if self.exit_by.is_none() && self.watch.gone(ready.host) {
                self.host_death(now, false);
            }
            for id in ready.execs {
                self.trees.exec_ready(id, &mut self.out);
            }
            if ready.sigchld {
                drain(&self.sigchld);
                self.trees.observe_exits(&mut self.out);
            }
            self.trees.sweep(now, &mut self.out);
            if self.exit_by.is_none()
                && !self.backlogged()
                && let Err(closed) = self.requests(ready.chan)
            {
                self.channel_closed(closed, Instant::now());
            }
            self.emit();
        }
    }

    /// Exit once the host is gone and every tree is gone (0), or at the bound (1, reported on stderr).
    fn finished(&mut self) -> Option<ExitCode> {
        let bound = self.exit_by?;
        if self.trees.all_gone() {
            return Some(if self.broken {
                ExitCode::FAILURE
            } else {
                ExitCode::SUCCESS
            });
        }
        if Instant::now() >= bound {
            let complete = self.trees.kill_all();
            let why = if complete && self.trees.complete {
                "their members did not die"
            } else {
                "the process inventory is incomplete, so members outside the roots' groups may be missed"
            };
            let left = self.trees.active();
            self.diag.report(format!(
                "hugr-omni-supervisor: the host is gone; exiting with {left} tree(s) not confirmed gone ({why})"
            ));
            return Some(ExitCode::FAILURE);
        }
        None
    }

    /// The channel ended: host death. A protocol error is worth one line on the host's stderr.
    fn channel_closed(&mut self, closed: Closed, now: Instant) {
        let broken = match closed {
            Closed::Gone => false,
            Closed::Proto(why) => {
                self.diag.report(format!(
                    "hugr-omni-supervisor: protocol error from the host ({why}); stopping every tree"
                ));
                true
            }
        };
        self.host_death(now, broken);
    }

    fn host_death(&mut self, now: Instant, broken: bool) {
        if self.exit_by.is_some() {
            return;
        }
        self.broken = broken;
        self.chan.shut();
        self.out.clear();
        self.trees.host_death(now);
        self.exit_by = Some(self.trees.last_deadline().unwrap_or(now) + EXIT_SLACK);
    }

    /// Replies queued plus replies owed: past the mark no request is read (admission resumes when the
    /// host drains; `wait` then polls for writability, so the loop always wakes).
    fn backlogged(&self) -> bool {
        self.chan.backlogged(RESERVE_PER_WAITER * self.trees.waiters())
    }

    /// Reads once (only when no complete frame is buffered, so the buffer stays bounded by one frame plus one
    /// read) and handles up to `BATCH` frames; `wait` returns at once while complete frames remain.
    fn requests(&mut self, readable: bool) -> Result<(), Closed> {
        if readable && !self.chan.has_frame() {
            self.chan.read()?;
        }
        for _ in 0..BATCH {
            let Some(msg) = self.chan.next()? else { break };
            self.handle(msg)?;
            if self.backlogged() {
                break;
            }
        }
        Ok(())
    }

    fn handle(&mut self, msg: Msg) -> Result<(), Closed> {
        let (trees, out) = (&mut self.trees, &mut self.out);
        match msg {
            Msg::Spawn(s) => self.spawn(s)?,
            Msg::Go { req, id } => trees.go(req, id, out),
            // The grace starts when the request is handled, not when the loop last woke.
            Msg::Stop { req, id, grace_ms } => trees.stop(Some(req), id, grace_ms, Instant::now(), out),
            Msg::Resize { req, id, cols, rows } => trees.resize(req, id, (cols, rows), out),
            Msg::List { req, id } => trees.list(req, id, out),
            Msg::Release { req, id } => trees.release(req, id, out),
            other => return Err(Closed::Proto(format!("unexpected message from the host: {other:?}"))),
        }
        Ok(())
    }

    fn spawn(&mut self, s: Spawn) -> Result<(), Closed> {
        let pipes = usize::from(s.stdin == Slot::Pipe) + 1 + usize::from(s.stderr == Slot::Pipe);
        let fds = self.chan.take_fds(if s.pty.is_some() { 0 } else { pipes })?;
        let req = s.req;
        let started = if !self.trees.admits() {
            let msg = format!("the supervisor already holds {MAX_TREES} trees (live or not yet released)");
            Err(Fail::new(FailCode::Io, 0, msg))
        } else {
            Prepared::new(&s).and_then(|p| match s.pty {
                None => {
                    let mut it = fds.iter().map(AsFd::as_fd);
                    let stdin = if s.stdin == Slot::Pipe { it.next() } else { None };
                    let (stdout, stderr) = (it.next(), it.next());
                    let stdout = stdout.ok_or_else(|| Fail::new(FailCode::Invalid, 0, "no stdout".into()))?;
                    let pid = spawn::spawn_pipe(&p, stdin, stdout, stderr.unwrap_or(stdout))?;
                    Ok((pid, None, Exec::Running))
                }
                Some((cols, rows)) => {
                    let (pid, master, held) = fork::spawn_pty(&p, cols, rows)?;
                    Ok((pid, Some(master), Exec::Held(held)))
                }
            })
        };
        drop(fds); // the child holds its own copies now
        let (pid, master, exec) = match started {
            Ok(child) => child,
            Err(f) => return self.fail(req, f),
        };
        // Registered before anything that can notice host death, so the child always gets its stop.
        let id = self.trees.insert(pid, master, s.grace_ms, exec);
        let host_end = match self.trees.master(id).map(OwnedFd::try_clone).transpose() {
            Ok(end) => end,
            Err(e) => {
                self.trees.stop(None, id, 0, Instant::now(), &mut Vec::new());
                self.trees.release(0, id, &mut Vec::new());
                let errno = e.raw_os_error().unwrap_or(0);
                return self.fail(req, Fail::new(FailCode::Io, errno, format!("dup: {e}")));
            }
        };
        // Replies to earlier requests go first: queued, not flushed (only the end of the turn flushes).
        self.queue_out();
        let pty_ends = [u64::from(host_end.is_some()), 0];
        let msg = Msg::Spawned {
            req,
            id,
            pid: pid.cast_unsigned(),
            pty_ends,
        };
        self.chan.send(&msg, host_end).map_err(|e| Closed::Proto(e.0))
    }

    fn fail(&mut self, req: u64, f: Fail) -> Result<(), Closed> {
        let msg = Msg::SpawnFailed {
            req,
            code: f.code,
            errno: f.errno,
            msg: f.msg,
        };
        self.chan.send(&msg, None).map_err(|e| Closed::Proto(e.0))
    }

    /// Queues pending messages and sends what fits.
    fn emit(&mut self) {
        self.queue_out();
        if self.exit_by.is_none()
            && let Err(closed) = self.chan.flush()
        {
            self.channel_closed(closed, Instant::now());
        }
    }

    /// Moves pending messages to the channel queue without sending (so it cannot notice host death). A list
    /// too large for one frame becomes `Ack error`.
    fn queue_out(&mut self) {
        if self.exit_by.is_some() {
            self.out.clear();
            return;
        }
        for msg in self.out.drain(..) {
            if self.chan.send(&msg, None).is_err()
                && let Msg::Processes { req, id, .. } = msg
            {
                // An Ack always encodes; every other message is far below the frame limit.
                let _ = self.chan.send(
                    &Msg::Ack {
                        req,
                        id,
                        result: Ack::Error,
                    },
                    None,
                );
            }
        }
    }

    /// One `poll`: what became ready. It does not block while complete requests wait in the buffer.
    fn wait(&self) -> Ready {
        let alive = self.exit_by.is_none();
        let more = alive && !self.backlogged() && self.chan.has_frame();
        let mut fds = vec![pollfd(self.sigchld.as_raw_fd(), libc::POLLIN)];
        if alive {
            let mut events = if self.backlogged() { 0 } else { libc::POLLIN };
            if self.chan.wants_write() {
                events |= libc::POLLOUT;
            }
            fds.push(pollfd(self.chan.raw(), events));
            fds.push(pollfd(self.watch.event_fd().unwrap_or(-1), libc::POLLIN));
        }
        let execs = self.trees.exec_fds();
        fds.extend(execs.iter().map(|&(_, fd)| pollfd(fd, libc::POLLIN)));

        let now = Instant::now();
        let mut wake = [self.trees.next_wake(), self.exit_by].into_iter().flatten().min();
        if alive && !self.watch.evented() {
            wake = Some(wake.map_or(now + watch::PARENT_POLL, |w| w.min(now + watch::PARENT_POLL)));
        }
        let timeout = match (more, wake) {
            (true, _) => 0,
            (false, None) => -1,
            // Rounded up: a wait shorter than 1 ms must not become a busy loop of zero timeouts.
            (false, Some(w)) => {
                i32::try_from(w.saturating_duration_since(now).as_micros().div_ceil(1000)).unwrap_or(i32::MAX)
            }
        };
        let nfds = libc::nfds_t::try_from(fds.len()).unwrap_or(0);
        // SAFETY: `fds` is a live array of `nfds` pollfd entries; negative fds are ignored by poll.
        let n = unsafe { libc::poll(fds.as_mut_ptr(), nfds, timeout) };
        let hit = |i: usize| n > 0 && fds.get(i).is_some_and(|p| p.revents != 0);
        let base = if alive { 3 } else { 1 };
        Ready {
            sigchld: hit(0),
            chan: alive && hit(1),
            host: alive && hit(2),
            execs: execs
                .iter()
                .enumerate()
                .filter(|&(i, _)| hit(base + i))
                .map(|(_, &(id, _))| id)
                .collect(),
        }
    }
}

struct Ready {
    sigchld: bool,
    chan: bool,
    host: bool,
    execs: Vec<u64>,
}

fn pollfd(fd: libc::c_int, events: libc::c_short) -> libc::pollfd {
    libc::pollfd { fd, events, revents: 0 }
}

/// fd 0 must be the host's socket.
fn take_channel() -> std::io::Result<OwnedFd> {
    // SAFETY: stat is plain old data; fstat fills it.
    let mut st: libc::stat = unsafe { std::mem::zeroed() };
    // SAFETY: `st` is writable storage for the result.
    sys::cvt(unsafe { libc::fstat(0, &raw mut st) })?;
    if st.st_mode & libc::S_IFMT != libc::S_IFSOCK {
        return Err(std::io::Error::other("fd 0 is not the host's socket"));
    }
    Ok(sys::owned(0))
}

/// Empty mask; SIGPIPE, SIGINT and SIGHUP ignored (the host's terminal is not ours); SIGCHLD wakes the loop
/// through a self-pipe and replaces any inherited SIG_IGN, which would auto-reap roots and lose the pin.
fn signals() -> std::io::Result<(OwnedFd, OwnedFd)> {
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
        for sig in [libc::SIGPIPE, libc::SIGINT, libc::SIGHUP] {
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
fn drain(fd: &OwnedFd) {
    let mut buf = [0u8; 64];
    // SAFETY: `buf` has 64 writable bytes; the pipe is non-blocking, so the loop ends at EAGAIN.
    while unsafe { libc::read(fd.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) } > 0 {}
}
