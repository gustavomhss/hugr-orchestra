//! `Child`, `PipeChild`, `PtyChild` (contract §1, §5, §9, §10). W07.

use std::ops::Deref;
use std::sync::Arc;
use std::time::Duration;

use tokio::runtime::Handle;

use super::life::{self, Life};
use super::{Options, deadline};
use crate::client::{self, HostStdio, Spawned};
use crate::error::Error;
use crate::io::{Lines, Output, Pumps, Source, Stdin};
use crate::spawn::{self, Mode, Request};
use crate::types::{DroppedBytes, Exit, ProcessInfo, PtySize, Reason};

/// A running process and its tree. What pipe and PTY children share.
///
/// Dropping it force-kills the tree at once without blocking; call `stop()` for a graceful end.
#[derive(Debug)]
pub struct Child {
    pid: u32,
    pub(super) inner: Arc<Inner>,
}

/// One child: its tree, its output and its input.
///
/// Hook for W09 (timeout, cancellation, `run`), inside `process` only: `stop_with` stops the tree with a given cause
/// and grace and ends its I/O; `life.wait()` resolves when the root exited; `pumps` is the output to collect. A task
/// that must outlive a borrow of the `Child` clones `Child::inner`; dropping the `Child` still kills the tree at once.
#[derive(Debug)]
pub(super) struct Inner {
    pub(super) life: Life,
    pub(super) pumps: Pumps,
    stdin: Option<Stdin>,
    /// The command's grace, for `stop(None)` and the deadline (`deadline::arm`).
    pub(super) grace: Duration,
}

impl Inner {
    /// Stops the whole tree for `cause` (`Killed`, `Timeout` or `Aborted`) with one deadline `grace`, then ends the
    /// output and settles stdin with `Closed`. An invalid `grace` is refused before anything happens.
    pub(super) async fn stop_with(&self, cause: Reason, grace: Duration) -> Result<Exit, Error> {
        let grace = life::grace(grace)?;
        let stopped = self.life.stop(cause, grace).await;
        if self.life.at_home() {
            self.close_ends();
        }
        stopped
    }

    /// The tree is stopped or being killed: the output ends, and queued and later writes get `Closed`.
    fn close_ends(&self) {
        self.pumps.end();
        if let Some(stdin) = &self.stdin {
            stdin.abandon();
        }
    }
}

impl Child {
    /// The root process id.
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Claims the single output consumer as chunks (contract §4). A second claim, or a claim after the
    /// consumer was dropped, fails with `InvalidArgument`. Dropping the `Output` detaches for good.
    pub fn output(&self) -> Result<Output, Error> {
        self.inner.pumps.output()
    }

    /// Claims the single output consumer as lines (contract §4).
    pub fn lines(&self) -> Result<Lines, Error> {
        self.inner.pumps.lines()
    }

    /// Bytes dropped so far (contract §4).
    pub fn dropped_bytes(&self) -> DroppedBytes {
        self.inner.pumps.dropped()
    }

    /// Writes to stdin or types into the terminal; resolves when the OS accepted the bytes (contract §9).
    pub async fn write(&self, data: impl AsRef<[u8]>) -> Result<(), Error> {
        match &self.inner.stdin {
            Some(stdin) => stdin.write(data.as_ref()).await,
            None => Err(Error::no_stdin_pipe()),
        }
    }

    /// Resolves when the root process exits; every call returns the same `Exit` (contract §5).
    pub async fn wait(&self) -> Result<Exit, Error> {
        self.inner.life.wait().await
    }

    /// Ends the whole tree with one deadline: graceful first, forced after `grace` (default: the command's).
    /// Resolves once the tree is gone; calling it again returns the same `Exit` (contract §5).
    pub async fn stop(&self, grace: Option<Duration>) -> Result<Exit, Error> {
        let grace = grace.unwrap_or(self.inner.grace);
        self.inner.stop_with(Reason::Killed, grace).await
    }

    /// The live processes `stop()` would end right now; `[]` once the tree is gone (contract §5).
    pub async fn processes(&self) -> Result<Vec<ProcessInfo>, Error> {
        self.inner.life.processes().await
    }

    /// Wires a started tree to its output and input; on failure the tree is killed before the error returns. With
    /// an input, a task settles it with `Closed` once the root exited (contract §9).
    fn start(rt: &Handle, spawned: Spawned, text: bool, grace: Duration) -> Result<Child, Error> {
        let Spawned { tree, pid, stdio } = spawned;
        let life = Life::new(tree);
        let (pumps, stdin) = match ends(rt, stdio, text) {
            Ok(ends) => ends,
            Err(e) => {
                life.kill();
                return Err(e);
            }
        };
        let inner = Arc::new(Inner {
            life,
            pumps,
            stdin,
            grace,
        });
        if inner.stdin.is_some() {
            let watched = Arc::clone(&inner);
            rt.spawn(async move {
                let _ = watched.life.wait().await;
                if let Some(stdin) = &watched.stdin {
                    stdin.abandon();
                }
            });
        }
        Ok(Child { pid, inner })
    }
}

impl Drop for Child {
    fn drop(&mut self) {
        // A forked copy touches no lock and commands nothing; its fields just drop.
        if self.inner.life.at_home() {
            self.inner.life.kill();
            self.inner.close_ends();
        }
    }
}

/// Starts draining the output of a started tree and takes its input.
fn ends(rt: &Handle, stdio: HostStdio, text: bool) -> Result<(Pumps, Option<Stdin>), Error> {
    let (source, input) = match stdio {
        HostStdio::Pipes { stdin, stdout, stderr } => (Source::Pipes { stdout, stderr }, stdin),
        HostStdio::Pty { output, input } => (Source::Pty { output }, Some(input)),
    };
    let pumps = Pumps::start(rt, source, text)?;
    match input.map(|sink| Stdin::start(rt, sink)).transpose() {
        Ok(stdin) => Ok((pumps, stdin)),
        Err(e) => {
            pumps.end();
            Err(e)
        }
    }
}

/// A child with pipes (`Command::spawn`).
#[derive(Debug)]
pub struct PipeChild {
    child: Child,
}

impl PipeChild {
    /// Waits for queued writes, then closes stdin; idempotent (contract §9).
    pub async fn close_stdin(&self) -> Result<(), Error> {
        match &self.child.inner.stdin {
            Some(stdin) => stdin.close().await,
            None => Ok(()),
        }
    }
}

impl Deref for PipeChild {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.child
    }
}

/// A child inside a terminal (`Command::spawn_pty`).
#[derive(Debug)]
pub struct PtyChild {
    child: Child,
}

impl PtyChild {
    /// Resizes the terminal; `Closed` after exit, `InvalidArgument` for a zero size (contract §10).
    pub fn resize(&self, size: PtySize) -> Result<(), Error> {
        // The range of contract §3, which `spawn::prepare` checks at the start.
        const MAX_CELLS: u16 = 32767;
        for (field, cells) in [("cols", size.cols), ("rows", size.rows)] {
            if !(1..=MAX_CELLS).contains(&cells) {
                return Err(Error::bad_pty_size(field, cells));
            }
        }
        self.child.inner.life.resize(size.cols, size.rows)
    }
}

impl Deref for PtyChild {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.child
    }
}

/// Starts a pipe child (`InvalidArgument` if `req.mode` is a terminal).
pub(crate) fn spawn_pipe(req: &Request, opts: &Options) -> Result<PipeChild, Error> {
    if let Mode::Pty(_) = req.mode {
        return Err(Error::pty_needs_spawn_pty());
    }
    let spec = spawn::prepare(req)?;
    deadline::refuse_if_cancelled(opts)?;
    let rt = client::runtime()?;
    let spawned = client::spawn(&spec)?;
    let child = Child::start(rt.handle(), spawned, opts.text, spec.grace)?;
    deadline::arm(rt.handle(), &child.inner, req.timeout, opts.cancel.clone());
    Ok(PipeChild { child })
}

/// Starts a terminal child.
pub(crate) fn spawn_pty(req: &Request, opts: &Options) -> Result<PtyChild, Error> {
    let spec = spawn::prepare(req)?;
    deadline::refuse_if_cancelled(opts)?;
    let rt = client::runtime()?;
    let spawned = client::spawn(&spec)?;
    // `start` returns with the terminal's reader running (`io::Pumps::start`); only then may the held Unix root exec
    // (ADR-0005 R9), or a program that prints and exits at once can lose its output on macOS. An exec failure comes
    // back here; dropping `child` then ends the tree and lets the readers go.
    let child = Child::start(rt.handle(), spawned, opts.text, spec.grace)?;
    child.inner.life.go()?;
    deadline::arm(rt.handle(), &child.inner, req.timeout, opts.cancel.clone());
    Ok(PtyChild { child })
}
