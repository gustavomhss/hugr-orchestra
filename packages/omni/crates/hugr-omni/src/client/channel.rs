//! One supervisor generation: request admission, waiters, deadlines, and death (ADR-0005 R1, R2, R6). The
//! reader, writer and deadline tasks and the routing of replies are in `route`; the platform channel is
//! `sys::Chan`.
//!
//! Linearization: a request is registered under its `req` and written under one lock, so its reply can
//! never arrive before its waiter exists, and frames never interleave. Every waiter gets exactly one
//! answer: its reply, or `Io` when the generation dies. Waiters are woken outside the lock.
//!
//! Deadlines: every request has one, counted from when it is written or queued (`request` never blocks).
//! A blocking `call` times itself; every other request is in `State::dues`, watched by one task. A missed
//! deadline means the supervisor is stuck: the generation dies, so no waiter can wait forever.

mod route;

use std::collections::{BTreeSet, HashMap, VecDeque};
use std::io;
use std::mem;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};

use omni_proto::{Ack, Exit, FailCode, Msg, ProcEntry, encode};
use tokio::runtime::Runtime;
use tokio::sync::{Notify, oneshot, watch};
use tokio::task::AbortHandle;

use super::sys::{Chan, Ends};
use super::{Pipe, lock};
use crate::error::Error;

/// Normal requests (spawn, go, resize, list) are admitted while fewer requests than this are waiting.
pub(super) const ADMIT_NORMAL: usize = 1024;
/// Cleanup requests (stop, release) may fill the queue up to this; past it the supervisor is not draining
/// its channel, and the generation is declared dead (which makes a live supervisor stop every tree).
pub(super) const ADMIT_ALL: usize = 8192;

/// What a request expects back (validated against every reply).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum Want {
    Spawn { pty: bool },
    Go,
    Stop,
    Resize,
    List,
    Release,
}

impl Want {
    fn name(self) -> &'static str {
        match self {
            Want::Spawn { .. } => "Spawn",
            Want::Go => "Go",
            Want::Stop => "Stop",
            Want::Resize => "Resize",
            Want::List => "List",
            Want::Release => "Release",
        }
    }
}

/// Admission class: cleanup keeps reserved capacity when normal requests fill their share (R1).
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Class {
    Normal,
    Cleanup,
}

/// What the host knows about one tree, published to every waiter of `exited`.
#[derive(Clone, Copy, Debug, Default)]
pub(super) struct Life {
    pub exit: Option<Exit>,
    /// The supervisor confirmed the tree gone (`Stopped`), or its root never started.
    pub gone: bool,
    /// No exit will ever be reported (the generation died, or the root never started).
    pub lost: bool,
}

pub(super) type LifeTx = Arc<watch::Sender<Life>>;

pub(super) enum Answer {
    Spawned {
        id: u64,
        pid: u32,
        ends: Option<Ends>,
        life: LifeTx,
    },
    Failed {
        code: FailCode,
        errno: i32,
        msg: String,
    },
    Ack(Ack),
    Stopped,
    Processes(Vec<ProcEntry>),
}

type Reply = Result<Answer, Error>;

enum Waiter {
    Sync(mpsc::SyncSender<Reply>),
    Async(oneshot::Sender<Reply>),
    Ignore,
}

struct Pending {
    want: Want,
    id: u64,
    to: Waiter,
    /// When the answer is due, and the budget it was given (not for blocking calls, which time themselves).
    due: Option<(Instant, Duration)>,
}

/// A frame not fully written yet; its descriptors travel with its first byte.
struct Out {
    bytes: Vec<u8>,
    sent: usize,
    fds: Vec<Pipe>,
}

#[derive(Default)]
struct State {
    dead: Option<String>,
    ready: bool,
    hello: Option<mpsc::SyncSender<()>>,
    pending: HashMap<u64, Pending>,
    /// Deadlines of the pending non-blocking requests, earliest first.
    dues: BTreeSet<(Instant, u64)>,
    /// The deadline the watch task sleeps until (`None`: it waits for one).
    armed: Option<Instant>,
    trees: HashMap<u64, LifeTx>,
    out: VecDeque<Out>,
    tasks: Vec<AbortHandle>,
}

pub(super) struct Gen {
    pub num: u64,
    home: u32,
    bound: Duration,
    chan: Chan,
    next: AtomicU64,
    /// Wakes the writer task (a frame was queued).
    wake: Notify,
    /// Wakes the watch task (a deadline earlier than the armed one was added).
    sooner: Notify,
    st: Mutex<State>,
}

impl std::fmt::Debug for Gen {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Gen").field("num", &self.num).finish_non_exhaustive()
    }
}

impl Gen {
    /// The internal constructor: `make` builds the connected channel inside the runtime's context; then
    /// this waits (at most `bound`) for the supervisor's `Ready`. `bound` is also the deadline of every
    /// request of this generation (a `Stop` gets its grace on top).
    pub(super) fn start(
        rt: &Runtime,
        num: u64,
        bound: Duration,
        make: impl FnOnce() -> io::Result<Chan>,
    ) -> Result<Arc<Gen>, Error> {
        let chan = {
            let _ctx = rt.enter();
            make().map_err(|e| Error::supervisor_not_started("its channel", &e))?
        };
        let (hello, ready) = mpsc::sync_channel(1);
        let st = State {
            hello: Some(hello),
            ..State::default()
        };
        let sup = Arc::new(Gen {
            num,
            home: std::process::id(),
            bound,
            chan,
            next: AtomicU64::new(1),
            wake: Notify::new(),
            sooner: Notify::new(),
            st: Mutex::new(st),
        });
        let tasks = [
            rt.spawn(sup.clone().read_loop()).abort_handle(),
            rt.spawn(sup.clone().write_loop()).abort_handle(),
            rt.spawn(sup.clone().watch_loop()).abort_handle(),
        ];
        {
            let mut st = lock(&sup.st);
            st.tasks.extend(tasks);
            if st.dead.is_some() {
                st.tasks.iter().for_each(AbortHandle::abort);
            }
        }
        if ready.recv_timeout(bound).is_err() {
            sup.die(format!("it did not say Ready within {} ms", bound.as_millis()));
        }
        if sup.alive() { Ok(sup) } else { Err(sup.gone()) }
    }

    pub(super) fn alive(&self) -> bool {
        lock(&self.st).dead.is_none()
    }

    pub(super) fn chan(&self) -> &Chan {
        &self.chan
    }

    /// The deadline of this generation's requests.
    pub(super) fn bound(&self) -> Duration {
        self.bound
    }

    /// True in the process that started this generation; false in a forked copy (R6).
    pub(super) fn at_home(&self) -> bool {
        std::process::id() == self.home
    }

    pub(super) fn home(&self) -> Result<(), Error> {
        super::check_home(self.home)
    }

    /// The `Io` error every call gets once this generation is dead.
    pub(super) fn gone(&self) -> Error {
        let st = lock(&self.st);
        let why = st.dead.as_deref().unwrap_or("it is shutting down");
        match st.ready {
            true => Error::supervisor_gone(self.num, why),
            false => Error::supervisor_did_not_start(self.num, why),
        }
    }

    /// A blocking round trip, bounded by `bound` from when the request is written or queued: past it the
    /// supervisor counts as stuck and the generation dies.
    pub(super) fn call(&self, want: Want, id: u64, msg: impl FnOnce(u64) -> Msg, fds: Vec<Pipe>) -> Reply {
        let (tx, rx) = mpsc::sync_channel(1);
        self.request(want, id, Class::Normal, Waiter::Sync(tx), msg, fds)?;
        match rx.recv_timeout(self.bound) {
            Ok(reply) => reply,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let ms = self.bound.as_millis();
                self.die(format!("it did not answer a {} request within {ms} ms", want.name()));
                Err(self.gone())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(self.gone()),
        }
    }

    /// A request whose reply is awaited without blocking any thread (its deadline is watched).
    pub(super) async fn ask(&self, want: Want, id: u64, class: Class, msg: impl FnOnce(u64) -> Msg) -> Reply {
        let (tx, rx) = oneshot::channel();
        self.request(want, id, class, Waiter::Async(tx), msg, Vec::new())?;
        rx.await.unwrap_or_else(|_| Err(self.gone()))
    }

    /// A request whose reply is matched, validated and dropped (its deadline is watched).
    pub(super) fn tell(&self, want: Want, id: u64, class: Class, msg: impl FnOnce(u64) -> Msg) -> Result<(), Error> {
        self.request(want, id, class, Waiter::Ignore, msg, Vec::new())
    }

    /// The host dropped its handle: a later `Exited` for `id` is ignored.
    pub(super) fn forget(&self, id: u64) {
        lock(&self.st).trees.remove(&id);
    }

    /// Registers and writes (or queues) one request; never blocks. An error with the generation still
    /// alive means nothing was sent: every failure after registration ends the generation.
    fn request(
        &self,
        want: Want,
        id: u64,
        class: Class,
        to: Waiter,
        msg: impl FnOnce(u64) -> Msg,
        fds: Vec<Pipe>,
    ) -> Result<(), Error> {
        self.home()?;
        let req = self.next.fetch_add(1, Ordering::Relaxed);
        let msg = msg(req);
        let budget = match &msg {
            Msg::Stop { grace_ms, .. } => self.bound + Duration::from_millis(u64::from(*grace_ms)),
            _ => self.bound,
        };
        let mut bytes = Vec::new();
        encode(&msg, &mut bytes).map_err(|e| Error::request_too_big(&e))?;
        let failed = {
            let mut st = lock(&self.st);
            if st.dead.is_some() {
                drop(st);
                return Err(self.gone());
            }
            let n = st.pending.len();
            if class == Class::Normal && n >= ADMIT_NORMAL {
                return Err(Error::supervisor_saturated(n, ADMIT_NORMAL));
            }
            if n >= ADMIT_ALL {
                Some(format!("it stopped draining its channel ({n} requests waiting)"))
            } else {
                let due = (!matches!(to, Waiter::Sync(_))).then(|| (Instant::now() + budget, budget));
                if let Some((at, _)) = due {
                    st.dues.insert((at, req));
                    if st.armed.is_none_or(|armed| at < armed) {
                        self.sooner.notify_one();
                    }
                }
                st.pending.insert(req, Pending { want, id, to, due });
                self.send(&mut st, Out { bytes, sent: 0, fds }).err()
            }
        };
        match failed {
            None => Ok(()),
            Some(why) => {
                self.die(why);
                Err(self.gone())
            }
        }
    }

    /// Writes at once when nothing is queued; never blocks (a full channel queues the rest for the
    /// writer task).
    fn send(&self, st: &mut State, mut out: Out) -> Result<(), String> {
        if st.out.is_empty() {
            match self.chan.try_send(&out.bytes, &out.fds) {
                Ok(n) if n >= out.bytes.len() => return Ok(()),
                Ok(n) => {
                    out.sent = n;
                    if n > 0 {
                        out.fds.clear();
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                Err(e) => return Err(format!("writing to its channel failed: {e}")),
            }
        }
        st.out.push_back(out);
        self.wake.notify_one();
        Ok(())
    }

    /// Ends this generation: every waiter gets `Io`, the channel closes (a live supervisor then stops
    /// every tree, as on host death; one that does not exit within `bound` is killed by identity, or, where
    /// its identity cannot be checked, left running and named in the error), and later calls fail at once.
    /// Never blocks.
    pub(super) fn die(&self, why: String) {
        let why = match self.chan.can_end() {
            true => why,
            false => format!(
                "{why}; should it not exit, it is abandoned: its identity cannot be checked here (no pidfd on \
                 Linux, no start time on macOS), so ending it could hit another process"
            ),
        };
        let (pending, trees, tasks, hello) = {
            let mut st = lock(&self.st);
            if st.dead.is_some() {
                return;
            }
            st.dead = Some(why);
            st.out.clear();
            st.dues.clear();
            let tasks = mem::take(&mut st.tasks);
            (
                mem::take(&mut st.pending),
                mem::take(&mut st.trees),
                tasks,
                st.hello.take(),
            )
        };
        self.chan.close(self.bound);
        tasks.iter().for_each(AbortHandle::abort);
        drop(hello);
        for p in pending.into_values() {
            deliver(p.to, Err(self.gone()));
        }
        for life in trees.values() {
            life.send_modify(|l| l.lost = true);
        }
    }
}

fn deliver(to: Waiter, reply: Reply) {
    match to {
        Waiter::Sync(tx) => _ = tx.try_send(reply),
        Waiter::Async(tx) => _ = tx.send(reply),
        Waiter::Ignore => {}
    }
}
