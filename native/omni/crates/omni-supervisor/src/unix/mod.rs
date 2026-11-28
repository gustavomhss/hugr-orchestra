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
mod exits;
mod footprint;
mod fork;
#[cfg(target_os = "linux")]
mod isolated;
mod member_control;
mod observe;
mod procs;
mod replies;
mod setup;
mod spawn;
mod start_child;
mod sweep;
mod sys;
mod trees;
mod watch;

use std::os::fd::{AsRawFd, OwnedFd};
use std::process::ExitCode;
use std::time::{Duration, Instant};

use omni_proto::{Ack, INFO_OBSERVE, INFO_PIDFD_HOST, INFO_PIDFD_MEMBERS, Msg, VERSION};

use crate::Args;
use chan::{Chan, Closed};
use diag::Diag;
use observe::Observation;
use setup::{drain, signals, take_channel};
use trees::Trees;
use watch::HostWatch;

/// Requests handled per turn before host death, exits and deadlines are looked at again.
const BATCH: usize = 64;
/// After host death, how long past the last forced deadline the supervisor keeps sweeping (SIGKILL every
/// 10 ms, inventory retried) before it gives up and exits 1, saying so on stderr.
const EXIT_SLACK: Duration = Duration::from_secs(5);
/// Reserved reply bytes per deferred request (a `Stopped` or the minimum observation reply).
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

struct Sup {
    chan: Chan,
    watch: HostWatch,
    sigchld: OwnedFd,
    _sigchld_w: OwnedFd,
    trees: Trees,
    #[cfg(target_os = "linux")]
    isolation: Option<isolated::Isolation>,
    observation: Observation,
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
        #[cfg(target_os = "linux")]
        let isolation = isolated::Isolation::load()?;
        #[cfg(target_os = "linux")]
        if isolation.is_some() && !pidfd {
            return Err(std::io::Error::other("isolated member freeze requires pidfd"));
        }
        if watch.gone(false) {
            return Ok(None);
        }
        let mut sup = Sup {
            chan,
            watch,
            sigchld,
            _sigchld_w: sigchld_w,
            trees: Trees::new(pidfd),
            #[cfg(target_os = "linux")]
            isolation,
            observation: Observation::default(),
            out: Vec::new(),
            exit_by: None,
            broken: false,
            diag: Diag::default(),
        };
        let info = INFO_OBSERVE
            | if cfg!(target_os = "macos") {
                omni_proto::INFO_FOOTPRINT
            } else {
                0
            }
            | if sup.watch.evented() { INFO_PIDFD_HOST } else { 0 }
            | if pidfd { INFO_PIDFD_MEMBERS } else { 0 };
        #[cfg(target_os = "linux")]
        let info = info
            | if sup.isolation.is_some() {
                omni_proto::INFO_MEMBER_FREEZE
            } else {
                0
            };
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
            self.out.extend(self.observation.poll(&self.trees));
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
        self.observation = Observation::default();
        self.trees.host_death(now);
        self.exit_by = Some(self.trees.last_deadline().unwrap_or(now) + EXIT_SLACK);
    }

    /// Replies queued plus replies owed: past the mark no request is read (admission resumes when the
    /// host drains; `wait` then polls for writability, so the loop always wakes).
    fn backlogged(&self) -> bool {
        let pending = self.trees.waiters() + usize::from(self.observation.pending());
        self.chan.backlogged(RESERVE_PER_WAITER * pending)
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
            Msg::ControlList { req, id } => member_control::list(trees, req, id, out),
            Msg::ControlFreeze {
                req,
                id,
                member,
                paused,
            } => member_control::freeze(trees, req, id, member, paused, out),
            Msg::ControlStop { req, id, .. } => {
                out.push(Msg::Ack {
                    req,
                    id,
                    result: Ack::Error,
                });
            }
            Msg::List { req, id } => trees.list(req, id, out),
            Msg::Observe { req, id } => out.extend(self.observation.start(req, id, trees)),
            Msg::ObserveFootprint { req, id } => out.extend(self.observation.start_with(req, id, trees, true)),
            Msg::Release { req, id } => trees.release(req, id, out),
            other => return Err(Closed::Proto(format!("unexpected message from the host: {other:?}"))),
        }
        Ok(())
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
        let mut wake = [self.trees.next_wake(), self.exit_by, self.observation.next_wake(now)]
            .into_iter()
            .flatten()
            .min();
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
