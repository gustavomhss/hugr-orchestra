//! The host's side of the supervisor (ADR-0005, `docs/protocol.md`): lazy start once per host process,
//! restart by generation after supervisor death, creator-pid check, non-blocking bounded channel,
//! pipe creation and descriptor transfer. W04.
//!
//! SEAM (frozen in W00): `runtime`, `spawn`, `Spawned`, `HostStdio`, `Pipe`, `Tree` and its methods.
//! Bodies and private items belong to W04. Every failure of the supervisor or the channel is `Io`;
//! after one, every pending call of that generation fails and the next `spawn` starts a new supervisor.

mod channel;
mod hold;
#[cfg(unix)]
mod keeper;
mod start;
#[cfg(test)]
mod tests;
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::Duration;

use omni_proto::{Ack, Msg};
pub(crate) use omni_proto::{Exit as RootExit, ProcEntry};

use crate::error::Error;
use crate::spawn::Spec;
use channel::{Answer, Class, Gen, LifeTx, Want};
use hold::{GoEnd, Hold};
use start::{Registry, failed, locate, spawn_on};
#[cfg(unix)]
use unix as sys;
#[cfg(windows)]
use windows as sys;

/// A host-side pipe or terminal end.
#[cfg(unix)]
pub(crate) type Pipe = std::os::fd::OwnedFd;
/// A host-side pipe or terminal end.
#[cfg(windows)]
pub(crate) type Pipe = std::os::windows::io::OwnedHandle;

/// The host's ends of the child's stdio.
#[derive(Debug)]
pub(crate) enum HostStdio {
    /// `stdin` only with `Stdin::Pipe`; `stderr` is `None` with `merge_stderr`.
    Pipes {
        stdin: Option<Pipe>,
        stdout: Pipe,
        stderr: Option<Pipe>,
    },
    /// Terminal output and input (on Unix both are the master, duplicated).
    Pty { output: Pipe, input: Pipe },
}

/// A started tree.
#[derive(Debug)]
pub(crate) struct Spawned {
    pub tree: Tree,
    pub pid: u32,
    pub stdio: HostStdio,
}

/// The deadline of every request and of the supervisor's start (a `Stop` gets its grace on top); past it
/// the supervisor counts as stuck, its generation dies, and a process that does not exit is killed.
const REPLY_WITHIN: Duration = Duration::from_secs(10);

/// The current generation of this host process. A caller waits at most this for a start another
/// caller is running (a start takes at most `REPLY_WITHIN` once the binary is executed).
static CURRENT: Registry = Registry::new(Duration::from_secs(20));

/// The library's own tokio runtime (ADR-0004), started lazily and never the caller's: every background task
/// of the library (channel reader, output pumps, deadlines) runs here, so it works under Node, Python, a
/// user's tokio runtime or none. Built without tokio's process and signal features (INV-16).
pub(crate) fn runtime() -> Result<&'static tokio::runtime::Runtime, Error> {
    static RT: OnceLock<(u32, tokio::runtime::Runtime)> = OnceLock::new();
    static INIT: Mutex<()> = Mutex::new(());
    if let Some((home, rt)) = RT.get() {
        return check_home(*home).map(|()| rt);
    }
    let _once = lock(&INIT);
    if let Some((home, rt)) = RT.get() {
        return check_home(*home).map(|()| rt);
    }
    let rt = tokio::runtime::Builder::new_multi_thread()
        .thread_name("hugr-omni")
        .enable_io()
        .enable_time()
        .build()
        .map_err(|e| Error::runtime_unavailable(&e))?;
    Ok(&RT.get_or_init(|| (std::process::id(), rt)).1)
}

/// Starts `spec` through the supervisor (starting the supervisor first if needed). Blocks the calling
/// thread for one round trip (like `std::process::Command::spawn`), bounded: a stalled supervisor yields
/// `Io`, never a hang. Startup failures map to `NotFound` / `NotExecutable` / `InvalidCwd` / `InvalidArgument` (an
/// argument that cannot be passed safely, e.g. to a batch file) / `Io`.
/// A Unix PTY root is held before exec until `Tree::go`: the caller starts its reader on the terminal
/// output first, then calls `go`, so `spawn_pty()` still reports exec failures synchronously.
pub(crate) fn spawn(spec: &Spec) -> Result<Spawned, Error> {
    let rt = runtime()?;
    let sup = CURRENT.get(|num| sys::launch(rt, num))?;
    spawn_on(&sup, spec)
}

/// One tree of one supervisor generation. Dropping it sends `Release` without blocking; the supervisor
/// keeps its cleanup duty (the tree is still stopped on host death).
#[derive(Debug)]
pub(crate) struct Tree {
    sup: Arc<Gen>,
    id: u64,
    life: LifeTx,
    hold: Hold,
}

impl Tree {
    /// Unix PTY roots: lets the held root exec, once the host's reader runs, and returns when exec
    /// succeeded or failed (the second bounded round trip of a PTY spawn). A no-op elsewhere.
    pub(crate) fn go(&self) -> Result<(), Error> {
        self.sup.home()?;
        match self.hold.go(self.sup.bound() * 2, || self.send_go())? {
            GoEnd::Ok => Ok(()),
            GoEnd::Failed(code, errno, msg) => Err(failed(code, errno, &msg, "the terminal program")),
            GoEnd::Refused(ack) => Err(self.refused("Go", &Answer::Ack(ack))),
            GoEnd::Gone => Err(self.sup.gone()),
        }
    }

    /// Resolves at root exit; every call returns the same value.
    pub(crate) async fn exited(&self) -> Result<RootExit, Error> {
        self.sup.home()?;
        let mut rx = self.life.subscribe();
        let life = match rx.wait_for(|l| l.exit.is_some() || l.lost).await {
            Ok(life) => *life,
            Err(_) => *self.life.borrow(),
        };
        life.exit.ok_or_else(|| self.lost())
    }

    /// One deadline for the whole tree: graceful now, forced at `grace`; resolves once the tree is gone
    /// (at once if it already is). Overlapping calls share the earliest deadline (ADR-0005 R2).
    pub(crate) async fn stop(&self, grace: Duration) -> Result<(), Error> {
        self.sup.home()?;
        let life = *self.life.borrow();
        if life.gone {
            return Ok(());
        }
        if life.lost {
            return Err(self.lost());
        }
        let (id, grace_ms) = (self.id, millis(grace));
        let stop = |req| Msg::Stop { req, id, grace_ms };
        match self.sup.ask(Want::Stop, id, Class::Cleanup, stop).await? {
            Answer::Stopped => Ok(()),
            other => Err(self.refused("Stop", &other)),
        }
    }

    /// `stop` without waiting for the confirmation (for `Drop`); never blocks.
    pub(crate) fn stop_detached(&self, grace: Duration) {
        if !self.sup.at_home() {
            return;
        }
        let life = *self.life.borrow();
        if life.gone || life.lost {
            return;
        }
        let (id, grace_ms) = (self.id, millis(grace));
        let _ = self
            .sup
            .tell(Want::Stop, id, Class::Cleanup, |req| Msg::Stop { req, id, grace_ms });
    }

    /// Resizes the terminal without waiting: `Closed` at once if the root's exit was already seen, else
    /// `Resize` is sent and its `Ack` is not awaited (a resize racing the exit is harmless).
    pub(crate) fn resize(&self, cols: u16, rows: u16) -> Result<(), Error> {
        self.sup.home()?;
        let life = *self.life.borrow();
        if life.exit.is_some() || life.gone {
            return Err(Error::resize_after_exit(cols, rows));
        }
        if life.lost {
            return Err(self.lost());
        }
        let id = self.id;
        let resize = |req| Msg::Resize { req, id, cols, rows };
        self.sup.tell(Want::Resize, id, Class::Normal, resize)
    }

    /// The live processes `stop` would end now; `[]` once gone; `Io` if the inventory is incomplete.
    pub(crate) async fn processes(&self) -> Result<Vec<ProcEntry>, Error> {
        self.sup.home()?;
        let life = *self.life.borrow();
        if life.gone {
            return Ok(Vec::new());
        }
        if life.lost {
            return Err(self.lost());
        }
        let id = self.id;
        match self
            .sup
            .ask(Want::List, id, Class::Normal, |req| Msg::List { req, id })
            .await?
        {
            Answer::Processes(list) => Ok(list),
            other => Err(self.refused("List", &other)),
        }
    }

    fn new(sup: Arc<Gen>, id: u64, life: LifeTx, held: bool) -> Tree {
        Tree {
            sup,
            id,
            life,
            hold: Hold::new(held),
        }
    }

    /// The `Go` round trip. `Err` only when nothing was sent (the generation is alive: every failure
    /// after sending ends it), so the root stays held.
    fn send_go(&self) -> Result<GoEnd, Error> {
        let id = self.id;
        match self.sup.call(Want::Go, id, |req| Msg::Go { req, id }, Vec::new()) {
            Err(e) if self.sup.alive() => Err(e),
            Err(_) => Ok(GoEnd::Gone),
            Ok(Answer::Ack(Ack::Ok)) => Ok(GoEnd::Ok),
            Ok(Answer::Failed { code, errno, msg }) => {
                self.life.send_modify(|l| (l.gone, l.lost) = (true, true));
                Ok(GoEnd::Failed(code, errno, msg))
            }
            Ok(Answer::Ack(ack)) => Ok(GoEnd::Refused(ack)),
            Ok(_) => Ok(GoEnd::Refused(Ack::Error)),
        }
    }

    /// Why no exit will come: the generation died, or the root never started.
    fn lost(&self) -> Error {
        match self.sup.alive() {
            false => self.sup.gone(),
            true => Error::terminal_never_started(),
        }
    }

    fn refused(&self, op: &str, answer: &Answer) -> Error {
        let why = match answer {
            Answer::Ack(Ack::Unknown) => "it does not know this tree",
            Answer::Ack(Ack::Error) => "the operating system's process inventory was incomplete; retry",
            Answer::Ack(Ack::Closed) => "the terminal is closed",
            _ => "it sent an unexpected reply",
        };
        Error::supervisor_refused(op, &format!("tree {}", self.id), why)
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        // A forked copy never commands the supervisor, and touches no lock.
        if !self.sup.at_home() {
            return;
        }
        self.sup.forget(self.id);
        let id = self.id;
        let _ = self
            .sup
            .tell(Want::Release, id, Class::Cleanup, |req| Msg::Release { req, id });
    }
}

/// `Io` in a process forked from the one that started the client (R6, ADR-0005 §9).
fn check_home(home: u32) -> Result<(), Error> {
    let me = std::process::id();
    if me == home {
        Ok(())
    } else {
        Err(Error::forked_client(home, me))
    }
}

fn millis(d: Duration) -> u32 {
    u32::try_from(d.as_millis()).unwrap_or(u32::MAX)
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}
