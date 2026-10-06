//! What the reader threads hand to the single consumer (contract §4): one ordered queue for both streams,
//! a byte budget per stream, and the drops counted as they happen.
//!
//! Every source gets its own blocking reader thread: Windows anonymous pipes cannot be read asynchronously,
//! and one path for every OS keeps the rules in one place. A reader never waits for the consumer: what does
//! not fit the budget of its stream is dropped and counted at once, so a child never blocks on output. The
//! consumer side waits on a `Notify`, which needs no runtime, so it can be polled from any executor.
//!
//! `end()` (the tree is gone) does not cut at once: what the dead tree left in the pipes is still unread at
//! that moment (e.g. a cooperative child's last words on SIGTERM). The readers are already blocked in
//! `read`, so they get it at once; they keep queueing under the usual budgets until end of file, which
//! follows those bytes when nothing else holds the pipes, and for at most `DRAIN` when something outside
//! the tree still does. Then the output is cut: nothing more is queued.

use std::collections::VecDeque;
use std::fs::File;
use std::io::{ErrorKind, Read};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, mpsc};
use std::thread;
use std::time::Duration;

use tokio::sync::Notify;

use super::Pipe;
use crate::error::Error;
use crate::types::{DroppedBytes, Stream};

/// Kept per stream while nobody ever claimed the output, for a later first consumer.
pub(super) const UNATTACHED: usize = 1 << 20;
/// Kept per stream while a consumer is attached.
pub(super) const ATTACHED: usize = 16 << 20;
/// The most one read takes; small reads of one stream are merged into one item up to this size, so the
/// queue's overhead stays proportional to its bytes.
const CHUNK: usize = 64 << 10;
/// A reader thread needs little stack: its buffer is on the heap.
pub(super) const STACK: usize = 256 << 10;
/// After `end()`, how long the pipes may still deliver before the output is cut.
pub(super) const DRAIN: Duration = Duration::from_secs(1);

/// Who reads the output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Claim {
    /// Nobody yet.
    Free,
    /// `output()` or `lines()`.
    Attached,
    /// `collect(max)`: `max + 1` bytes per stream fit, so a drop can only happen above the limit.
    Collecting(usize),
    /// The consumer was dropped or saw the end: nothing is kept any more.
    Detached,
}

impl Claim {
    fn budget(self) -> usize {
        match self {
            Claim::Free => UNATTACHED,
            Claim::Attached => ATTACHED,
            Claim::Collecting(max) => max.saturating_add(1),
            Claim::Detached => 0,
        }
    }
}

/// What a reader saw.
#[derive(Debug)]
pub(super) enum What {
    Data(Vec<u8>),
    /// End of file: every holder closed the pipe.
    Eof,
    /// Reading failed; the stream ends here.
    Failed(Error),
}

/// One event of one stream, in the order the readers saw them.
#[derive(Debug)]
pub(super) struct Item {
    /// 0: stdout or the terminal; 1: stderr.
    pub slot: usize,
    /// Bytes of this stream dropped right before this item.
    pub lost: u64,
    pub what: What,
}

#[derive(Debug)]
struct Slot {
    open: bool,
    queued: usize,
    /// Dropped since the last queued item of this stream.
    lost: u64,
    dropped: u64,
}

#[derive(Debug)]
pub(super) struct State {
    queue: VecDeque<Item>,
    slots: [Slot; 2],
    claim: Claim,
    /// `end()` was called: the pipes drain until end of file or `DRAIN`.
    ended: bool,
    /// The drain is over: nothing more is queued, and a consumer ends at what is queued.
    cut: bool,
    /// The pumps were dropped: the readers stop at their next wake-up.
    closed: bool,
}

impl State {
    /// Every source reached end of file.
    pub(super) fn eof(&self) -> bool {
        self.slots.iter().all(|s| !s.open)
    }

    /// The output is over for a consumer once the queue is empty.
    pub(super) fn over(&self) -> bool {
        self.cut || self.eof()
    }

    pub(super) fn ended(&self) -> bool {
        self.ended
    }

    /// New output is still queued: someone reads it, or may still claim it, and it was not cut.
    fn feeding(&self) -> bool {
        self.claim != Claim::Detached && !self.cut
    }

    pub(super) fn pop(&mut self) -> Option<Item> {
        let item = self.queue.pop_front()?;
        if let What::Data(data) = &item.what {
            self.slots[item.slot].queued -= data.len();
        }
        Some(item)
    }

    pub(super) fn take_all(&mut self) -> VecDeque<Item> {
        for slot in &mut self.slots {
            slot.queued = 0;
        }
        std::mem::take(&mut self.queue)
    }

    /// Bytes dropped per stream since its last queued item: not reported to the consumer yet.
    pub(super) fn pending(&self) -> [u64; 2] {
        [self.slots[0].lost, self.slots[1].lost]
    }

    pub(super) fn dropped(&self) -> DroppedBytes {
        DroppedBytes {
            stdout: self.slots[0].dropped,
            stderr: self.slots[1].dropped,
        }
    }
}

#[derive(Debug)]
pub(super) struct Shared {
    state: Mutex<State>,
    /// Woken (`notify_waiters`) on every change a consumer or `ended()` waits for.
    pub changed: Notify,
    pub text: bool,
    pub streams: [Stream; 2],
}

impl Shared {
    /// `streams[i]` labels slot `i`; `open[i]` is false for a source that does not exist (merged stderr).
    pub(super) fn new(text: bool, streams: [Stream; 2], open: [bool; 2]) -> Shared {
        let slot = |i: usize| Slot {
            open: open[i],
            queued: 0,
            lost: 0,
            dropped: 0,
        };
        Shared {
            state: Mutex::new(State {
                queue: VecDeque::new(),
                slots: [slot(0), slot(1)],
                claim: Claim::Free,
                ended: false,
                cut: false,
                closed: false,
            }),
            changed: Notify::new(),
            text,
            streams,
        }
    }

    pub(super) fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Takes the single consumer.
    pub(super) fn claim(&self, claim: Claim) -> Result<(), Error> {
        let mut st = self.lock();
        if st.claim != Claim::Free {
            return Err(Error::output_claimed());
        }
        st.claim = claim;
        Ok(())
    }

    /// The consumer is gone for good: what waits for it is dropped and counted, and so is everything after.
    /// `held`: raw bytes per stream the consumer took from the queue and never yielded; they count too.
    pub(super) fn detach(&self, held: [u64; 2]) {
        let mut st = self.lock();
        let st = &mut *st;
        for (slot, held) in st.slots.iter_mut().zip(held) {
            slot.dropped += held;
        }
        if st.claim == Claim::Detached {
            return;
        }
        st.claim = Claim::Detached;
        for item in st.queue.drain(..) {
            if let What::Data(data) = item.what {
                st.slots[item.slot].dropped += data.len() as u64;
            }
        }
        for slot in &mut st.slots {
            slot.queued = 0;
            slot.lost = 0;
        }
    }

    /// `end()`; `true` the first time (the caller then cuts the output after `DRAIN`).
    pub(super) fn end(&self) -> bool {
        let first = !std::mem::replace(&mut self.lock().ended, true);
        self.changed.notify_waiters();
        first
    }

    /// Nothing more is queued: every stream still open ends here for a consumer (reporting a gap it has
    /// not reported yet). `close` also stops the readers (the pumps were dropped). Idempotent.
    pub(super) fn cut(&self, close: bool) {
        {
            let mut guard = self.lock();
            let st = &mut *guard;
            if !st.cut && matches!(st.claim, Claim::Free | Claim::Attached) {
                for (slot, s) in st.slots.iter_mut().enumerate().filter(|(_, s)| s.open) {
                    let lost = std::mem::take(&mut s.lost);
                    st.queue.push_back(Item {
                        slot,
                        lost,
                        what: What::Eof,
                    });
                }
            }
            st.ended = true;
            st.cut = true;
            st.closed |= close;
        }
        self.changed.notify_waiters();
    }

    /// Resolves once every source reached end of file, or `end()` was called.
    pub(super) async fn ended(&self) {
        loop {
            let changed = self.changed.notified();
            let done = {
                let st = self.lock();
                st.ended || st.eof()
            };
            if done {
                return;
            }
            changed.await;
        }
    }

    /// Queues what fits the budget of `slot` and counts the rest as dropped. `false`: stop reading.
    pub(super) fn accept(&self, slot: usize, bytes: &[u8]) -> bool {
        let mut guard = self.lock();
        let st = &mut *guard;
        if st.closed {
            return false;
        }
        let budget = if st.feeding() { st.claim.budget() } else { 0 };
        let s = &mut st.slots[slot];
        let take = budget.saturating_sub(s.queued).min(bytes.len());
        let gone = (bytes.len() - take) as u64;
        s.dropped += gone;
        if take > 0 {
            let lost = std::mem::take(&mut s.lost);
            s.queued += take;
            let part = &bytes[..take];
            match st.queue.back_mut() {
                Some(Item {
                    slot: last,
                    what: What::Data(data),
                    ..
                }) if *last == slot && lost == 0 && data.len() + take <= CHUNK => {
                    data.extend_from_slice(part);
                }
                _ => st.queue.push_back(Item {
                    slot,
                    lost,
                    what: What::Data(part.to_vec()),
                }),
            }
        }
        if budget > 0 {
            // Reported on the next item of this stream, for the consumer that is (or may come) there.
            st.slots[slot].lost += gone;
        }
        drop(guard);
        if take > 0 {
            self.changed.notify_waiters();
        }
        true
    }

    /// The source of `slot` ended (`failure`: with a read error).
    pub(super) fn finish(&self, slot: usize, failure: Option<Error>) {
        {
            let mut st = self.lock();
            let s = &mut st.slots[slot];
            s.open = false;
            let lost = std::mem::take(&mut s.lost);
            if st.feeding() {
                let what = failure.map_or(What::Eof, What::Failed);
                st.queue.push_back(Item { slot, lost, what });
            }
        }
        self.changed.notify_waiters();
    }
}

/// Starts the reader of `slot`. A terminal's reader is running when this returns, so the held root may
/// exec (ADR-0005 R9): a terminal drops what nobody read once its session leader exits (macOS).
pub(super) fn read(shared: &Arc<Shared>, slot: usize, source: Pipe, pty: bool) -> Result<(), Error> {
    let shared = Arc::clone(shared);
    let (running, started) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("hugr-omni-out".into())
        .stack_size(STACK)
        .spawn(move || {
            let _ = running.send(());
            pump(&shared, slot, File::from(source), pty);
        })
        .map_err(|e| Error::io_thread("an output reader", &e))?;
    if pty {
        let _ = started.recv();
    }
    Ok(())
}

fn pump(shared: &Shared, slot: usize, mut source: File, pty: bool) {
    let mut buf = vec![0; CHUNK];
    loop {
        match source.read(&mut buf) {
            Ok(0) => break shared.finish(slot, None),
            Ok(n) => {
                if !shared.accept(slot, &buf[..n]) {
                    break;
                }
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => {}
            // Linux reports the end of a terminal's output as EIO once its last holder closed it.
            Err(e) if pty && is_eio(&e) => break shared.finish(slot, None),
            Err(e) => break shared.finish(slot, Some(Error::read_failed(shared.streams[slot], &e))),
        }
    }
}

#[cfg(unix)]
fn is_eio(e: &std::io::Error) -> bool {
    e.raw_os_error() == Some(libc::EIO)
}

#[cfg(windows)]
fn is_eio(_: &std::io::Error) -> bool {
    false
}
