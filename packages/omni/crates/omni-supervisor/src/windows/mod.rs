//! The supervisor on Windows (W06): `CreateProcessW` + `JOB_LIST` (own Job, KILL_ON_JOB_CLOSE, no
//! breakaway), std-equivalent argument quoting, `.cmd`/`.bat` through `cmd.exe` or refused, CTRL_BREAK
//! from its own console, Job inventory, host death (ADR-0005 R1, R5, R7).
//!
//! SEAM (frozen in W00): `run`. Everything else belongs to W06.
//!
//! One owner thread holds every tree and answers every request. Helper threads only wait and report:
//! the channel reader and writer (`channel`), the Job completion port (`members`), the diagnostics drain
//! (`diag`: the owner thread never writes to stderr), the host-process watch, and one exit watch per root.

mod channel;
mod cmdline;
mod diag;
mod inventory;
mod job;
mod members;
mod queues;
mod spawn;
mod tree;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::io::{self, Write};
use std::os::windows::io::{AsRawHandle, HandleOrNull, OwnedHandle, RawHandle};
use std::process::ExitCode;
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

use omni_proto::{Ack, Exit, FailCode, INFO_PIDFD_HOST, Msg, Spawn, VERSION};
use windows_sys::Win32::Foundation::{FALSE, TRUE};
use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
use windows_sys::Win32::System::Threading::{INFINITE, OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject};

use crate::Args;
use diag::Diag;
use members::Members;
use queues::{Event, Inbox, Item, MAX_REPLIES, MAX_TREES, Outbox, Refused};
use tree::Tree;

/// How long to wait, after the host died, beyond the longest tree deadline, before exiting 1 with trees not proven
/// gone. The OS can take seconds to tear a busy Job down on a saturated machine (W06b: up to 3.2 s past the deadline
/// on a 2-vCPU runner); the trees die anyway, with the Jobs, when the supervisor exits.
const HOST_DEATH_SLACK: Duration = Duration::from_secs(5);
/// Membership polling while a tree is stopping, and while a root's descendants linger.
const POLL_STOPPING: Duration = Duration::from_millis(10);
const POLL_LINGERING: Duration = Duration::from_millis(100);

/// Serves the host on the named pipe until the host is gone and every tree is gone.
pub(crate) fn run(args: &Args) -> ExitCode {
    let mut sup = match start(args) {
        Ok(sup) => sup,
        Err(e) => {
            // No tree exists yet. Still, a full stderr must not keep this process alive: the line is written
            // on a helper thread, waited for at most a second.
            let (tx, rx) = mpsc::channel();
            let line = format!("hugr-omni-supervisor: {e}");
            let _ = channel::helper("diagnostics", move || {
                let _ = writeln!(io::stderr().lock(), "{line}");
                let _ = tx.send(());
            });
            let _ = rx.recv_timeout(Duration::from_secs(1));
            return ExitCode::FAILURE;
        }
    };
    loop {
        if let Some(code) = sup.step() {
            return code;
        }
    }
}

/// Bootstrap (R7): own console, host-death watch, then the channel, then `Ready`. Nothing here is inherited.
fn start(args: &Args) -> io::Result<Supervisor> {
    own_console();
    let name = args.pipe.as_deref().ok_or_else(|| io::Error::other("missing --pipe"))?;
    // SAFETY: a plain open by pid, not inheritable; checked for null.
    let host = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, FALSE, args.host_pid) };
    // SAFETY: `host` is null or a fresh handle owned by nobody else.
    let host = OwnedHandle::try_from(unsafe { HandleOrNull::from_raw_handle(host) })
        .map_err(|_| io::Error::last_os_error())?;
    let inbox = Arc::new(Inbox::default());
    let out = Arc::new(Outbox::default());
    // Armed before the channel exists, so it is armed before Ready.
    watch(host, &inbox, |_| Event::HostGone)?;
    let members = Members::start(&inbox)?;
    let diag = Arc::new(Diag::default());
    diag.start(io::stderr())?;
    // The pipe's server must be the host: the handle above then names the live host, not a reused pid.
    let pipe = channel::connect(name, args.host_pid)?;
    channel::start(&pipe, &inbox, &out)?;
    let sup = Supervisor::new(inbox, out, members, diag, pipe.as_raw_handle() as usize);
    sup.send(&Msg::Ready {
        version: VERSION,
        pid: std::process::id(),
        info: INFO_PIDFD_HOST, // the host is watched through its process handle
    });
    Ok(sup)
}

/// The supervisor runs on its own console (the host starts it with `CREATE_NO_WINDOW`), so its
/// CTRL_BREAKs never reach the host and nothing here changes the host's console state. Children inherit
/// the ignore-Ctrl+C flag from their creator, so it is cleared here (a terminal child must be
/// interruptible); the supervisor itself ignores every console event.
fn own_console() {
    unsafe extern "system" fn ignore(_event: u32) -> i32 {
        TRUE
    }
    // SAFETY: changes only this process's handler list; `ignore` lives as long as the process.
    unsafe {
        SetConsoleCtrlHandler(None, FALSE);
        SetConsoleCtrlHandler(Some(ignore), TRUE);
    }
}

/// Waits for `handle` on a helper thread, then queues `event(&handle)`.
fn watch(
    handle: OwnedHandle,
    inbox: &Arc<Inbox>,
    event: impl FnOnce(&OwnedHandle) -> Event + Send + 'static,
) -> io::Result<()> {
    let inbox = inbox.clone();
    channel::helper("watch", move || {
        // SAFETY: a valid process handle owned by this thread.
        unsafe { WaitForSingleObject(handle.as_raw_handle(), INFINITE) };
        inbox.event(event(&handle));
    })
}

struct Supervisor {
    inbox: Arc<Inbox>,
    out: Arc<Outbox>,
    members: Arc<Members>,
    diag: Arc<Diag>,
    /// The pipe's value: a transferred handle may never be it.
    channel: usize,
    trees: HashMap<u64, Tree>,
    /// `MAX_TREES`; lowered by tests.
    max_trees: usize,
    /// Consumed by every spawn attempt, so an id is never reused.
    next_id: u64,
    /// `Stop` replies owed (they count against `MAX_REPLIES`).
    stop_waiters: usize,
    /// After host death: when to exit even if trees remain (exiting closes their Jobs).
    host_gone: Option<Instant>,
    next_poll: Instant,
}

impl Supervisor {
    fn new(inbox: Arc<Inbox>, out: Arc<Outbox>, members: Arc<Members>, diag: Arc<Diag>, channel: usize) -> Supervisor {
        Supervisor {
            inbox,
            out,
            members,
            diag,
            channel,
            trees: HashMap::new(),
            max_trees: MAX_TREES,
            next_id: 1,
            stop_waiters: 0,
            host_gone: None,
            next_poll: Instant::now(),
        }
    }

    /// One turn of the loop: due deadlines, then one event or request. `Some` = exit with that code.
    fn step(&mut self) -> Option<ExitCode> {
        let now = Instant::now();
        self.enforce(now);
        if let Some(bound) = self.host_gone {
            if self.trees.values().all(|t| t.gone) {
                return Some(ExitCode::SUCCESS);
            }
            if now >= bound {
                return Some(ExitCode::FAILURE);
            }
        }
        let admit = self.host_gone.is_none() && self.out.len() + self.stop_waiters < MAX_REPLIES;
        let item = self.inbox.next(admit, self.wake(now, admit));
        // The wait can be long: deadlines due by now go first, and the item is handled at the time it arrived.
        let now = Instant::now();
        self.enforce(now);
        match item {
            Some(Item::Request(m)) => self.request(m, now),
            Some(Item::Event(Event::Exited { id, code })) => self.exited(id, code, now),
            Some(Item::Event(Event::Settle { id })) => self.settle(id, now),
            Some(Item::Event(Event::HostGone)) => self.host_died(now),
            None => {}
        }
        None
    }

    /// Queues `msg`; an overflow (impossible by the accounting in `queues`) ends the channel, never blocks.
    fn send(&self, msg: &Msg) {
        match self.out.send(msg) {
            Ok(()) => {}
            Err(Refused::Unencodable) => {
                if let Msg::Processes { req, id, .. } = *msg {
                    // A list too large for one frame is an incomplete inventory.
                    self.send(&Msg::Ack {
                        req,
                        id,
                        result: Ack::Error,
                    });
                } else {
                    self.inbox.event(Event::HostGone);
                }
            }
            Err(Refused::Full) => self.inbox.event(Event::HostGone),
        }
    }

    /// Deadlines first, then (when due) membership: trees that became gone answer their `Stop`s.
    fn enforce(&mut self, now: Instant) {
        let poll = now >= self.next_poll;
        let mut stopped = Vec::new();
        for t in self.trees.values_mut() {
            t.enforce(now);
            if poll && t.polled() {
                stopped.extend(
                    t.settle(&self.members, &self.diag, now)
                        .into_iter()
                        .flatten()
                        .map(|req| (req, t.id)),
                );
            }
        }
        if poll {
            let stopping = self.trees.values().any(|t| t.stop.is_some());
            self.next_poll = now + if stopping { POLL_STOPPING } else { POLL_LINGERING };
        }
        self.answer_stops(stopped);
        // Released and gone: the pid pin, the Job and the member record go now.
        let members = &self.members;
        self.trees.retain(|&id, t| {
            let keep = !(t.gone && t.released);
            if !keep {
                members.forget(id);
            }
            keep
        });
    }

    fn settle(&mut self, id: u64, now: Instant) {
        let Some(t) = self.trees.get_mut(&id) else { return };
        let stopped: Vec<(u64, u64)> = t
            .settle(&self.members, &self.diag, now)
            .into_iter()
            .flatten()
            .map(|req| (req, id))
            .collect();
        self.answer_stops(stopped);
    }

    fn answer_stops(&mut self, stopped: Vec<(u64, u64)>) {
        self.stop_waiters -= stopped.len().min(self.stop_waiters);
        for (req, id) in stopped {
            self.send(&Msg::Stopped { req, id });
        }
    }

    fn wake(&self, now: Instant, admit: bool) -> Option<Instant> {
        let deadlines = self.trees.values().filter_map(Tree::deadline);
        let poll = self.trees.values().any(Tree::polled).then_some(self.next_poll);
        // Requests held back by the reply limit: look again soon, even if no writer progress arrives.
        let held = (!admit && self.host_gone.is_none() && self.inbox.has_requests()).then_some(now + POLL_STOPPING);
        deadlines.chain(poll).chain(held).chain(self.host_gone).min()
    }

    fn request(&mut self, m: Msg, now: Instant) {
        let reply = match m {
            Msg::Spawn(s) => self.spawn(s),
            Msg::Go { req, id } => {
                // Windows holds no root before exec: `Go` is a no-op.
                let result = if self.live(id).is_some() { Ack::Ok } else { Ack::Unknown };
                Msg::Ack { req, id, result }
            }
            Msg::Stop { req, id, grace_ms } => match self.live(id) {
                None => Msg::Ack {
                    req,
                    id,
                    result: Ack::Unknown,
                },
                Some(t) if t.gone => Msg::Stopped { req, id },
                Some(t) => {
                    t.stop(Some(req), grace_ms, now);
                    self.stop_waiters += 1;
                    self.next_poll = now; // a root that already exited may be gone right now
                    return;
                }
            },
            Msg::Resize { req, id, cols, rows } => {
                let result = self.live(id).map_or(Ack::Unknown, |t| t.resize(cols, rows));
                Msg::Ack { req, id, result }
            }
            Msg::List { req, id } => match self.live(id).map(|t| t.list()) {
                None => Msg::Ack {
                    req,
                    id,
                    result: Ack::Unknown,
                },
                Some(Ok(list)) => Msg::Processes { req, id, list },
                Some(Err(_)) => Msg::Ack {
                    req,
                    id,
                    result: Ack::Error,
                },
            },
            Msg::Release { req, id } => {
                let result = self.live(id).map_or(Ack::Unknown, |t| {
                    t.released = true;
                    Ack::Ok
                });
                Msg::Ack { req, id, result }
            }
            // The reader passes requests only.
            _ => return,
        };
        self.send(&reply);
    }

    /// A tree the host still holds (an unknown or released id is `Ack unknown` for every request).
    fn live(&mut self, id: u64) -> Option<&mut Tree> {
        self.trees.get_mut(&id).filter(|t| !t.released)
    }

    fn spawn(&mut self, s: Spawn) -> Msg {
        let req = s.req;
        let failed = |code, errno, msg| Msg::SpawnFailed { req, code, errno, msg };
        if self.trees.len() >= self.max_trees {
            spawn::discard(&s, self.channel as RawHandle);
            let msg = format!(
                "the supervisor holds its limit of {} trees (alive, or not released yet)",
                self.max_trees
            );
            return failed(FailCode::Io, 0, msg);
        }
        let id = self.next_id;
        self.next_id += 1;
        let members = &self.members;
        let root = match spawn::spawn(&s, self.channel as RawHandle, |job| members.watch(id, job)) {
            Ok(root) => root,
            Err(f) => {
                members.forget(id);
                return failed(f.code, f.errno, f.msg);
            }
        };
        let (pty, ends) = root.pty.map_or((None, None), |(p, e)| (Some(p), Some(e)));
        let exit_handle = root.process.try_clone();
        let tree = Tree::new(id, root.pid, root.process, root.job, pty, s.grace_ms);
        // Rollback on failure: dropping `tree` closes its Job, which ends the root.
        let watched = exit_handle.and_then(|h| {
            watch(h, &self.inbox, move |h| Event::Exited {
                id,
                code: tree::exit_code(h),
            })
        });
        if let Err(e) = watched {
            members.forget(id);
            return failed(FailCode::Io, 0, format!("exit watch: {e}"));
        }
        let pid = tree.pid;
        self.trees.insert(id, tree);
        // The host pulls these out with DUPLICATE_CLOSE_SOURCE; they are never touched here again.
        let pty_ends = ends.map_or([0; 2], |e| {
            use std::os::windows::io::IntoRawHandle;
            [e.output.into_raw_handle() as u64, e.input.into_raw_handle() as u64]
        });
        Msg::Spawned { req, id, pid, pty_ends }
    }

    fn exited(&mut self, id: u64, code: u32, now: Instant) {
        let Some(t) = self.trees.get_mut(&id) else { return };
        t.root_exited(code, now);
        if !t.released {
            self.send(&Msg::Exited {
                id,
                exit: Exit::Code(code),
            });
        }
        self.settle(id, now);
    }

    /// Every tree gets a `Stop` with its own grace, counted from now; the supervisor exits once all are
    /// gone, or at the latest deadline plus slack (exiting closes the remaining Jobs, which ends their members).
    fn host_died(&mut self, now: Instant) {
        if self.host_gone.is_some() {
            return;
        }
        self.inbox.close();
        self.out.close();
        let mut last = now;
        for t in self.trees.values_mut().filter(|t| !t.gone) {
            t.stop(None, t.grace_ms, now);
            last = last.max(t.deadline().unwrap_or(now));
        }
        self.host_gone = Some(last + HOST_DEATH_SLACK);
        self.next_poll = now;
    }
}
