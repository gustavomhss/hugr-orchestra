//! Diagnostics for the host's stderr, never written by the control thread. A small bounded queue (when it is
//! full the newest line is dropped, and drops are counted and reported later) is drained by its own thread with
//! fallible writes, so a full or broken stderr can neither hold back a deadline nor panic.

use std::collections::VecDeque;
use std::io::{self, Write};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};

use super::channel;

/// Lines waiting for the drain thread.
pub(super) const CAPACITY: usize = 32;

#[derive(Default)]
struct Queue {
    lines: VecDeque<String>,
    dropped: u64,
}

#[derive(Default)]
pub(super) struct Diag {
    q: Mutex<Queue>,
    cv: Condvar,
}

impl Diag {
    fn lock(&self) -> MutexGuard<'_, Queue> {
        self.q.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Queues one line; never blocks.
    pub(super) fn report(&self, line: String) {
        let mut q = self.lock();
        if q.lines.len() >= CAPACITY {
            q.dropped += 1;
            return;
        }
        q.lines.push_back(line);
        self.cv.notify_one();
    }

    /// Drains the queue into `sink` on a helper thread; write errors are ignored.
    pub(super) fn start(self: &Arc<Self>, mut sink: impl Write + Send + 'static) -> io::Result<()> {
        let diag = self.clone();
        channel::helper("diagnostics", move || {
            loop {
                let (line, dropped) = diag.next();
                let _ = writeln!(sink, "hugr-omni-supervisor: {line}");
                if dropped > 0 {
                    let _ = writeln!(
                        sink,
                        "hugr-omni-supervisor: {dropped} more diagnostic line(s) were dropped"
                    );
                }
                let _ = sink.flush();
            }
        })
    }

    /// The next line, and the drops counted since the last one.
    fn next(&self) -> (String, u64) {
        let mut q = self.lock();
        loop {
            if let Some(line) = q.lines.pop_front() {
                return (line, std::mem::take(&mut q.dropped));
            }
            q = self.cv.wait(q).unwrap_or_else(PoisonError::into_inner);
        }
    }

    /// The lines still queued.
    #[cfg(test)]
    pub(super) fn queued(&self) -> Vec<String> {
        self.lock().lines.iter().cloned().collect()
    }
}
