//! Output pumps with bounded buffering, UTF-8 decoding, lines, stdin, and `run()` collection (W10).
//!
//! SEAM (frozen in W00 and, for the internal part, at W10's dispatch): `Output` and `Lines` (re-exported by
//! `api`), `Pipe`, `Source`, `Pumps` and its methods, `Collected`, `Stdin` and its methods. Bodies and every
//! private item belong to W10. `process` (W07/W09) and `pty` (W12) are the callers.
//!
//! Rules every caller can rely on (contract §4, §6, §9):
//! - the pumps start draining at once and never stop until every source reached end of file, or at most 1 s
//!   after `end()` (the drain of what the pipes still hold), so a child never blocks on output;
//! - one consumer at a time: `output()` or `lines()` claims it; a second claim, or a claim after the consumer
//!   was dropped, is `InvalidArgument`; dropping it detaches for good;
//! - while a consumer is attached up to 16 MiB per stream wait for it; otherwise up to 1 MiB per stream is
//!   kept; anything beyond is dropped, counted in `dropped()`, and reported in order (`lost_before`);
//! - nothing the child wrote before end of file is lost.

mod collect;
mod out;
mod queue;
mod stdin;
#[cfg(test)]
mod tests;

use std::sync::Arc;
use std::time::Duration;

pub use out::{Lines, Output};

use crate::error::Error;
use crate::types::{Data, DroppedBytes, Stream};
use queue::{Claim, DRAIN, Shared};
use stdin::Writer;

/// A host-side pipe or terminal end (the same type `client` hands out).
#[cfg(unix)]
pub(crate) type Pipe = std::os::fd::OwnedFd;
/// A host-side pipe or terminal end (the same type `client` hands out).
#[cfg(windows)]
pub(crate) type Pipe = std::os::windows::io::OwnedHandle;

/// Where a child's output comes from.
#[derive(Debug)]
pub(crate) enum Source {
    /// stdout, and stderr unless it was merged into stdout.
    Pipes { stdout: Pipe, stderr: Option<Pipe> },
    /// Everything the terminal shows (`Stream::Pty`).
    Pty { output: Pipe },
}

/// The output side of one child.
#[derive(Debug)]
pub(crate) struct Pumps {
    shared: Arc<Shared>,
    rt: tokio::runtime::Handle,
}

impl Pumps {
    /// Starts draining `source` at once on `rt` (the library's own runtime). `text` selects `Data::Text`
    /// (UTF-8 decoded across chunks, restarting at every gap) or `Data::Bytes`.
    pub(crate) fn start(rt: &tokio::runtime::Handle, source: Source, text: bool) -> Result<Pumps, Error> {
        let (streams, first, second, pty) = match source {
            Source::Pipes { stdout, stderr } => ([Stream::Stdout, Stream::Stderr], stdout, stderr, false),
            Source::Pty { output } => ([Stream::Pty, Stream::Stderr], output, None, true),
        };
        let shared = Arc::new(Shared::new(text, streams, [true, second.is_some()]));
        let pumps = Pumps { shared, rt: rt.clone() };
        queue::read(&pumps.shared, 0, first, pty)?;
        if let Some(stderr) = second {
            queue::read(&pumps.shared, 1, stderr, false)?;
        }
        Ok(pumps)
    }

    /// Claims the single consumer, as chunks.
    pub(crate) fn output(&self) -> Result<Output, Error> {
        self.shared.claim(Claim::Attached)?;
        Ok(Output::new(Arc::clone(&self.shared)))
    }

    /// Claims the single consumer, as lines (always text).
    pub(crate) fn lines(&self) -> Result<Lines, Error> {
        self.shared.claim(Claim::Attached)?;
        Ok(Lines::new(Arc::clone(&self.shared)))
    }

    /// Bytes dropped so far, per stream (terminal output counts as stdout).
    pub(crate) fn dropped(&self) -> DroppedBytes {
        self.shared.lock().dropped()
    }

    /// Resolves once every source reached end of file (every holder of the pipes closed them), or once
    /// `end()` was called. Never requires a consumer.
    pub(crate) async fn ended(&self) {
        self.shared.ended().await;
    }

    /// Stops reading (the tree is gone, contract §5), without losing what the pipes already hold: the
    /// readers keep queueing it under the usual budgets until end of file, which follows it once every holder
    /// is gone, and for at most 1 s (`DRAIN`) when something outside the tree still holds a pipe. Then a
    /// consumer gets what is buffered, then the end. Idempotent.
    pub(crate) fn end(&self) {
        if self.shared.end() {
            let shared = Arc::downgrade(&self.shared);
            self.rt.spawn(async move {
                tokio::time::sleep(DRAIN).await;
                if let Some(shared) = shared.upgrade() {
                    shared.cut(false);
                }
            });
        }
    }

    /// For `run()`: claims the consumer when called (not at the first poll, so `start` then `collect` leaves
    /// no window in which output beyond the unattached budget is dropped), then the future keeps every byte,
    /// up to `max` per stream. It resolves once the output ended, or as soon as a stream went over `max` (then
    /// `over_limit` names it and each stream holds its first `max` bytes; the caller stops the tree), or at a
    /// read failure or a drop (then `failed` holds the error and each stream what was kept before it).
    /// `within` bounds the wait after `end()`. `Err` only when the consumer was already claimed.
    pub(crate) fn collect(
        &self,
        max: usize,
        within: Duration,
    ) -> impl Future<Output = Result<Collected, Error>> + Send + '_ {
        let claim = collect::claim(&self.shared, max);
        collect::collect(&self.shared, &self.rt, max, within, claim)
    }
}

/// Dropping the pumps ends the output and lets the readers go: each closes its end at its next wake-up (a
/// reader blocked on a pipe that something outside the tree still holds leaves when that holder writes or
/// closes it).
impl Drop for Pumps {
    fn drop(&mut self) {
        self.shared.cut(true);
    }
}

/// What `run()` collected.
#[derive(Debug)]
pub(crate) struct Collected {
    pub stdout: Data,
    /// Empty for a terminal and with `merge_stderr`.
    pub stderr: Data,
    /// The stream that went over the limit, if any.
    pub over_limit: Option<Stream>,
    /// A read failure, or output dropped before the collection began: the output above is incomplete
    /// (contract §8: `run()` rejects with it in `error.result`).
    pub failed: Option<Error>,
}

/// The input side of one child: a pipe to its stdin, or the terminal's input.
#[derive(Debug)]
pub(crate) struct Stdin {
    writer: Arc<Writer>,
}

impl Stdin {
    /// Takes ownership of the host's end of the child's input.
    pub(crate) fn start(rt: &tokio::runtime::Handle, sink: Pipe) -> Result<Stdin, Error> {
        let _ = rt; // the writer is a thread of its own
        Ok(Stdin {
            writer: Writer::start(sink)?,
        })
    }

    /// Resolves when the OS accepted all of `data` (backpressure). Writes apply in call order, never
    /// interleaved. `Closed` after `close()`, after `abandon()`, or when the child closed its end.
    pub(crate) async fn write(&self, data: &[u8]) -> Result<(), Error> {
        self.writer.write(data).await
    }

    /// Waits for queued writes, then closes; idempotent.
    pub(crate) async fn close(&self) -> Result<(), Error> {
        self.writer.close().await
    }

    /// The child exited or the tree was stopped: queued and later writes settle with `Closed`. Idempotent.
    pub(crate) fn abandon(&self) {
        self.writer.abandon();
    }
}

/// Dropping stdin abandons it: the writer thread leaves and closes the child's end.
impl Drop for Stdin {
    fn drop(&mut self) {
        self.writer.abandon();
    }
}
