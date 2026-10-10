//! The owner thread's two queues, both bounded (ADR-0005 R1).
//!
//! - Inbox: requests, at most `MAX_REQUESTS` (the reader blocks when it is full, so a flooding host is held
//!   back by its own pipe), and events, which never block and are always taken first. Events are bounded by
//!   construction: `HostGone` is kept once, and each tree record (at most `MAX_TREES`) yields one `Exited`
//!   and at most two `Settle`.
//! - Outbox: encoded frames for the writer thread, counted until written. A request is admitted only while
//!   fewer than `MAX_REPLIES` frames and `Stop` waiters are owed, and each tree adds at most one unsolicited
//!   `Exited`; `CAPACITY` reserves that room for cleanup, so it is never reached. Reaching it anyway ends
//!   the channel (host death); a send never blocks.

use std::collections::VecDeque;
use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Instant;

use omni_proto::Msg;

/// Decoded requests waiting for the owner thread.
const MAX_REQUESTS: usize = 64;
/// Replies owed (frames not yet written + `Stop` waiters) at or above which no request is admitted.
pub(super) const MAX_REPLIES: usize = 1024;
/// Tree records (alive, or gone but not released); a `Spawn` beyond it is refused (`docs/protocol.md`).
pub(super) const MAX_TREES: usize = 4096;
/// Request replies, one `Exited` per tree, and `Ready`.
const CAPACITY: usize = MAX_REPLIES + MAX_TREES + 1;

/// What the owner thread is told, ahead of any request.
#[derive(Debug)]
pub(super) enum Event {
    /// Channel EOF, a channel error, a malformed frame, an outbox overflow, or the host process ended.
    HostGone,
    /// A root exited.
    Exited { id: u64, code: u32 },
    /// A tree's Job emptied, or its flush marker came back: try to prove it gone now.
    Settle { id: u64 },
}

#[derive(Debug)]
pub(super) enum Item {
    Event(Event),
    Request(Msg),
}

#[derive(Default)]
struct Queues {
    events: VecDeque<Event>,
    host_gone: bool,
    requests: VecDeque<Msg>,
    closed: bool,
    /// The writer drained frames since the owner last looked: admission may have changed.
    progress: bool,
    waiting: bool,
}

/// Everything the owner thread waits for.
#[derive(Default)]
pub(super) struct Inbox {
    q: Mutex<Queues>,
    owner: Condvar,
    reader: Condvar,
}

impl Inbox {
    fn lock(&self) -> MutexGuard<'_, Queues> {
        self.q.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) fn event(&self, event: Event) {
        let mut q = self.lock();
        if matches!(event, Event::HostGone) {
            if q.host_gone {
                return;
            }
            q.host_gone = true;
        }
        q.events.push_back(event);
        self.owner.notify_one();
    }

    /// Blocks while the inbox is full; `false` once the host is gone.
    pub(super) fn request(&self, msg: Msg) -> bool {
        let mut q = self.lock();
        while q.requests.len() >= MAX_REQUESTS && !q.closed {
            q = self.reader.wait(q).unwrap_or_else(PoisonError::into_inner);
        }
        if q.closed {
            return false;
        }
        q.requests.push_back(msg);
        self.owner.notify_one();
        true
    }

    /// The writer drained frames: wakes the owner so it recomputes admission.
    pub(super) fn progress(&self) {
        self.lock().progress = true;
        self.owner.notify_one();
    }

    /// The next event, else (if `admit`) the next request, waiting until `until`. `None` on timeout, or when
    /// the writer made progress (the caller recomputes `admit`).
    pub(super) fn next(&self, admit: bool, until: Option<Instant>) -> Option<Item> {
        let mut q = self.lock();
        loop {
            if let Some(e) = q.events.pop_front() {
                return Some(Item::Event(e));
            }
            if admit && let Some(m) = q.requests.pop_front() {
                self.reader.notify_one();
                return Some(Item::Request(m));
            }
            if q.progress {
                q.progress = false;
                return None;
            }
            q.waiting = true;
            q = match until {
                None => self.owner.wait(q).unwrap_or_else(PoisonError::into_inner),
                Some(t) => {
                    let Some(left) = t.checked_duration_since(Instant::now()).filter(|d| !d.is_zero()) else {
                        q.waiting = false;
                        return None;
                    };
                    self.owner
                        .wait_timeout(q, left)
                        .unwrap_or_else(PoisonError::into_inner)
                        .0
                }
            };
            q.waiting = false;
        }
    }

    /// Whether requests are waiting.
    pub(super) fn has_requests(&self) -> bool {
        !self.lock().requests.is_empty()
    }

    /// Whether the owner is blocked in `next` (tests synchronize on it).
    #[cfg(test)]
    pub(super) fn owner_waiting(&self) -> bool {
        self.lock().waiting
    }

    /// The host is gone: pending requests are dropped and the reader is released.
    pub(super) fn close(&self) {
        let mut q = self.lock();
        q.closed = true;
        q.requests.clear();
        self.reader.notify_all();
    }
}

/// Why a frame was not queued.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Refused {
    /// The message cannot be encoded (e.g. a process list over the frame limit).
    Unencodable,
    /// `CAPACITY` reached: the accounting above was broken; the channel ends.
    Full,
}

#[derive(Default)]
struct OutQ {
    frames: VecDeque<Vec<u8>>,
    in_flight: usize,
    closed: bool,
}

/// Encoded frames for the writer thread.
#[derive(Default)]
pub(super) struct Outbox {
    q: Mutex<OutQ>,
    cv: Condvar,
}

impl Outbox {
    fn lock(&self) -> MutexGuard<'_, OutQ> {
        self.q.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Queues `msg`, never blocking. After `close` frames are dropped.
    pub(super) fn send(&self, msg: &Msg) -> Result<(), Refused> {
        let mut frame = Vec::new();
        omni_proto::encode(msg, &mut frame).map_err(|_| Refused::Unencodable)?;
        let mut q = self.lock();
        if q.closed {
            return Ok(());
        }
        if q.frames.len() + q.in_flight >= CAPACITY {
            return Err(Refused::Full);
        }
        q.frames.push_back(frame);
        self.cv.notify_one();
        Ok(())
    }

    /// Frames not yet written, including the batch being written.
    pub(super) fn len(&self) -> usize {
        let q = self.lock();
        q.frames.len() + q.in_flight
    }

    pub(super) fn close(&self) {
        let mut q = self.lock();
        q.closed = true;
        q.frames.clear();
        self.cv.notify_all();
    }

    /// Every queued frame as one write (still counted until `written`); `None` once closed.
    pub(super) fn take(&self) -> Option<Vec<u8>> {
        let mut q = self.lock();
        loop {
            if q.closed {
                return None;
            }
            if !q.frames.is_empty() {
                q.in_flight = q.frames.len();
                return Some(q.frames.drain(..).flatten().collect());
            }
            q = self.cv.wait(q).unwrap_or_else(PoisonError::into_inner);
        }
    }

    /// The batch from `take` was written.
    pub(super) fn written(&self) {
        self.lock().in_flight = 0;
    }
}
