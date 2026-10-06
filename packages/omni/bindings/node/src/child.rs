//! `spawn()` and the native half of a `Child` (contract §4, §5, §9, §10), which `index.js` wraps.
//!
//! Who keeps the core's child alive: the JS object (`NativeChild`), every pending call on it, and a consumer of its
//! output (`NativeStream`), each through an `Arc`. Dropping the core's child force-kills its tree, so the GC must never
//! be what drops it: a collected `NativeChild` hands its share to the keeper (`keep`), which lets go only once the
//! tree is gone (Lead decision, PLAN Appendix E).

use std::ops::Deref;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use napi::Env;
use napi::bindgen_prelude::{Either, Object};
use napi_derive::napi;

use hugr_omni::{Child, Chunk, Line, Lines, Output, PipeChild, PtyChild, PtySize, binding};

use crate::convert::{self, Bytes, Cancel, ChunkJs, DroppedJs, Js, LineJs};
use crate::{error, exec};

/// How often the keeper asks whether a collected child's tree is gone (at most).
const RECHECK: Duration = Duration::from_secs(1);

/// The core's child: with pipes, or inside a terminal.
enum Kid {
    Pipe(PipeChild),
    Pty(PtyChild),
}

impl Deref for Kid {
    type Target = Child;
    fn deref(&self) -> &Child {
        match self {
            Kid::Pipe(child) => child,
            Kid::Pty(child) => child,
        }
    }
}

/// Starts a child: throws (synchronously) what the core refuses or fails to start (contract §3, §8).
#[napi]
pub fn spawn(
    env: Env,
    command: Js<'_, String>,
    args: Js<'_, Vec<Js<'_, String>>>,
    options: Option<Js<'_, Object<'_>>>,
    cancel: Option<&Cancel>,
) -> napi::Result<NativeChild> {
    let (cmd, pty) = convert::command(&env, command, args, options, cancel)?;
    let kid = match pty {
        true => cmd.spawn_pty().map(Kid::Pty),
        false => cmd.spawn().map(Kid::Pipe),
    };
    let kid = kid.map_err(|e| error::omni(&env, &e))?;
    Ok(NativeChild { kid: Arc::new(kid) })
}

/// The native half of a JS `Child`.
#[napi]
pub struct NativeChild {
    kid: Arc<Kid>,
}

#[napi]
impl NativeChild {
    /// The root's pid.
    #[napi(getter)]
    pub fn pid(&self) -> u32 {
        self.kid.pid()
    }

    /// Whether it runs inside a terminal (`PtyChild`).
    #[napi(getter)]
    pub fn is_pty(&self) -> bool {
        matches!(*self.kid, Kid::Pty(_))
    }

    /// Claims the single output consumer, as chunks or as lines; throws `INVALID_ARGUMENT` on a second claim.
    #[napi]
    pub fn claim(&self, env: Env, lines: bool) -> napi::Result<NativeStream> {
        let reader = match lines {
            true => self.kid.lines().map(Reader::Lines),
            false => self.kid.output().map(Reader::Chunks),
        };
        let reader = reader.map_err(|e| error::omni(&env, &e))?;
        Ok(NativeStream {
            kid: Arc::clone(&self.kid),
            reader: Arc::new(Mutex::new(Some(reader))),
        })
    }

    /// Bytes dropped so far because nobody was reading.
    #[napi]
    pub fn dropped_bytes(&self) -> DroppedJs {
        convert::dropped(self.kid.dropped_bytes())
    }

    /// Resolves once the OS accepted `data`.
    #[napi]
    pub fn write<'env>(&self, env: &'env Env, data: Bytes<'_>) -> napi::Result<Object<'env>> {
        let (kid, data) = (Arc::clone(&self.kid), convert::bytes(env, "data", data)?);
        exec::promise(env, async move { kid.write(data).await }, |()| ())
    }

    /// Waits for queued writes, then closes stdin (pipe children; `index.js` offers it on nothing else).
    #[napi]
    pub fn close_stdin<'env>(&self, env: &'env Env) -> napi::Result<Object<'env>> {
        let kid = Arc::clone(&self.kid);
        let close = async move {
            match &*kid {
                Kid::Pipe(child) => child.close_stdin().await,
                Kid::Pty(_) => Ok(()),
            }
        };
        exec::promise(env, close, |()| ())
    }

    /// Resizes the terminal (terminal children; `index.js` offers it on nothing else).
    #[napi]
    pub fn resize(&self, env: Env, cols: Js<'_, f64>, rows: Js<'_, f64>) -> napi::Result<()> {
        let Kid::Pty(child) = &*self.kid else {
            return Ok(());
        };
        let cols = convert::one(&env, "cols", cols, "a number of cells")?;
        let rows = convert::one(&env, "rows", rows, "a number of cells")?;
        let resize = || {
            let (cols, rows) = (binding::pty_side("cols", cols)?, binding::pty_side("rows", rows)?);
            child.resize(PtySize { cols, rows })
        };
        resize().map_err(|e| error::omni(&env, &e))
    }

    /// Resolves at the root's exit. `index.js` calls it once, at spawn, and hands out that promise: while it is
    /// pending its threadsafe function holds the event loop, so a Child keeps the host alive until its root exits.
    #[napi]
    pub fn exited<'env>(&self, env: &'env Env) -> napi::Result<Object<'env>> {
        let kid = Arc::clone(&self.kid);
        exec::promise(env, async move { kid.wait().await }, convert::exit)
    }

    /// Ends the whole tree with one deadline (`graceMs`, default the command's).
    #[napi]
    pub fn stop<'env>(&self, env: &'env Env, grace_ms: Option<Js<'_, f64>>) -> napi::Result<Object<'env>> {
        let kid = Arc::clone(&self.kid);
        let grace_ms = convert::opt(env, "graceMs", grace_ms, "a number of milliseconds")?;
        let stop = async move {
            let grace = grace_ms.map(|ms| binding::millis("graceMs", ms)).transpose()?;
            kid.stop(grace).await
        };
        exec::promise(env, stop, convert::exit)
    }

    /// The live processes `stop()` would end now.
    #[napi]
    pub fn processes<'env>(&self, env: &'env Env) -> napi::Result<Object<'env>> {
        let kid = Arc::clone(&self.kid);
        exec::promise(env, async move { kid.processes().await }, convert::processes)
    }
}

/// The JS object was collected: its tree is left alone, never killed.
impl Drop for NativeChild {
    fn drop(&mut self) {
        keep(Arc::clone(&self.kid));
    }
}

/// Holds a collected child until its tree is gone: the root exited and `processes()` is empty, asked at most once a
/// second; only then is the core's child dropped (which then ends nothing). Its output: a consumer still reading holds
/// the child itself (`NativeStream`); without one, nobody can read it, and it ends within the core's drain.
///
/// An error ends the keeping too, by the rule of the core's own lingering check (`process/deadline.rs`, lead decision
/// on W13 r1): the client does not tell a lost supervisor from a failed inventory, and through a lost one nothing can
/// be stopped, so the drop kills nothing; holding on would keep the child, its dead generation and its I/O for the
/// life of the host (INV-08).
fn keep(kid: Arc<Kid>) {
    exec::spawn(async move {
        if kid.wait().await.is_err() {
            return;
        }
        while let Ok(left) = kid.processes().await {
            if left.is_empty() {
                return;
            }
            exec::sleep(RECHECK).await;
        }
    });
}

/// The core's output consumer.
enum Reader {
    Chunks(Output),
    Lines(Lines),
}

enum Item {
    Chunk(Chunk),
    Line(Line),
}

/// The claimed output consumer of a child. `index.js` iterates it with one `next()` at a time; leaving the loop
/// calls `detach`, which drops the core's consumer: detached for good (contract §4).
#[napi]
pub struct NativeStream {
    kid: Arc<Kid>,
    reader: Arc<Mutex<Option<Reader>>>,
}

#[napi]
impl NativeStream {
    /// The next chunk or line; `null` at the end (and after `detach`).
    #[napi]
    pub fn next<'env>(&self, env: &'env Env) -> napi::Result<Object<'env>> {
        let (slot, kid) = (Arc::clone(&self.reader), Arc::clone(&self.kid));
        let next = async move {
            let _holds = kid; // the child lives while its output is read
            let Some(mut reader) = lock(&slot).take() else {
                return Ok(None);
            };
            let item = match &mut reader {
                Reader::Chunks(output) => output.next().await.map(|r| r.map(Item::Chunk)),
                Reader::Lines(lines) => lines.next().await.map(|r| r.map(Item::Line)),
            };
            if item.is_some() {
                *lock(&slot) = Some(reader); // at the end it is dropped: nothing is left to read
            }
            item.transpose()
        };
        exec::promise(env, next, item)
    }

    /// Leaves the loop for good.
    #[napi]
    pub fn detach(&self) {
        lock(&self.reader).take();
    }
}

fn item(item: Option<Item>) -> Option<Either<ChunkJs, LineJs>> {
    item.map(|item| match item {
        Item::Chunk(chunk) => Either::A(convert::chunk(chunk)),
        Item::Line(line) => Either::B(convert::line(line)),
    })
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}
