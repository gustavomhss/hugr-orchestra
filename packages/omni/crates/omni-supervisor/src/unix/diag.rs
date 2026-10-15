//! Diagnostics off the control thread (Codex r2, as W06 does on Windows). A full stderr pipe must not block
//! host death or the exit, and a closed one must not panic, so the control thread never writes to stderr:
//! `report` queues a line (bounded; when full the newest is dropped and counted) for a drain thread that
//! writes with fallible calls. The drain thread starts with the first report, with every signal blocked;
//! reports come only from a start failure, a protocol error (host death) or the exit bound, so it never
//! exists while a root is being forked or spawned. It creates no descriptor and never forks.

use std::io::Write;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};
use std::time::Duration;

/// Lines that may wait for the drain.
const QUEUE: usize = 16;
/// How long the exit waits for the drain before it happens anyway.
const DRAIN_BOUND: Duration = Duration::from_millis(500);

#[derive(Default)]
pub(super) struct Diag {
    queue: Option<SyncSender<String>>,
    drained: Option<Receiver<()>>,
    dropped: Arc<AtomicUsize>,
    tried: bool,
}

impl Diag {
    /// Queues one line for stderr; never blocks, never fails.
    pub(super) fn report(&mut self, line: String) {
        if !self.tried {
            self.tried = true;
            self.start();
        }
        let sent = self.queue.as_ref().is_some_and(|q| q.try_send(line).is_ok());
        if !sent {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Closes the queue and waits for the drain at most `DRAIN_BOUND`; the caller exits either way.
    pub(super) fn finish(&mut self) {
        self.queue = None;
        if let Some(drained) = self.drained.take() {
            let _ = drained.recv_timeout(DRAIN_BOUND);
        }
    }

    fn start(&mut self) {
        let (queue, lines) = sync_channel::<String>(QUEUE);
        let (done, drained) = sync_channel::<()>(1);
        let dropped = Arc::clone(&self.dropped);
        let drain = move || {
            for line in lines {
                let _ = writeln!(std::io::stderr().lock(), "{line}");
            }
            let n = dropped.load(Ordering::Relaxed);
            if n > 0 {
                let _ = writeln!(
                    std::io::stderr().lock(),
                    "hugr-omni-supervisor: {n} diagnostic line(s) dropped"
                );
            }
            let _ = done.send(());
        };
        if with_signals_blocked(|| std::thread::Builder::new().name("diag".into()).spawn(drain)).is_ok() {
            self.queue = Some(queue);
            self.drained = Some(drained);
        }
    }
}

/// Runs `f` (a thread spawn: the new thread inherits the mask) with every signal blocked, then restores
/// the control thread's mask; SIGCHLD arriving meanwhile stays pending and wakes the loop afterwards.
fn with_signals_blocked<T>(f: impl FnOnce() -> std::io::Result<T>) -> std::io::Result<T> {
    // SAFETY: sigset_t is plain old data; sigfillset/pthread_sigmask fill it.
    let (mut all, mut old): (libc::sigset_t, libc::sigset_t) = unsafe { (std::mem::zeroed(), std::mem::zeroed()) };
    // SAFETY: `all` and `old` are live locals of the expected type.
    let r = unsafe {
        libc::sigfillset(&raw mut all);
        libc::pthread_sigmask(libc::SIG_BLOCK, &raw const all, &raw mut old)
    };
    if r != 0 {
        return Err(std::io::Error::from_raw_os_error(r));
    }
    let out = f();
    // SAFETY: restores the mask saved above.
    let r = unsafe { libc::pthread_sigmask(libc::SIG_SETMASK, &raw const old, std::ptr::null_mut()) };
    if r != 0 {
        return Err(std::io::Error::from_raw_os_error(r));
    }
    out
}
