//! H1 (WP-H): when a JS environment goes away (a `Worker` terminated, or the host's own teardown), every tree it
//! started is stopped, bounded, and nothing it leaves behind can panic.
//!
//! - **Who owns what:** each environment keeps a list of the children it spawned (`Owned`, weak: the list never
//!   keeps a child alive). Its cleanup hook (`napi_add_env_cleanup_hook`) force-stops those still running and waits
//!   for them at most `BOUND`, on this binding's own thread; it never calls into JS.
//! - **The GC rule is unchanged:** a collected `Child` still never kills its tree (`child::keep`); only the end of
//!   its whole environment does, as the end of the host process does through the supervisor (ADR-0005 §9).
//! - **No panic in a finalizer:** the environment's data is released without deleting its JS reference (`release`),
//!   since a dying environment may refuse that call (Bun runs finalizers with the termination pending); the
//!   engine frees what the environment held anyway.

use std::sync::mpsc;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};
use std::time::{Duration, Instant};

use crate::child::Kid;
use crate::exec;

/// The longest an environment's teardown waits for its trees: a forced stop is one round trip to the supervisor.
const BOUND: Duration = Duration::from_secs(5);

/// The children one JS environment spawned.
#[derive(Default)]
pub(crate) struct Owned(Mutex<Vec<Weak<Kid>>>);

impl Owned {
    /// Records a child of this environment (and forgets the ones already gone).
    pub(crate) fn add(&self, kid: &Arc<Kid>) {
        let mut kids = lock(&self.0);
        kids.retain(|k| k.strong_count() > 0);
        kids.push(Arc::downgrade(kid));
    }

    /// The environment is going away: force-stops every tree still held, and returns once they are all gone or
    /// `BOUND` has passed. Runs on the JS thread, which is ending; the stops run on the binding's thread.
    pub(crate) fn stop_all(&self) {
        let kids: Vec<Arc<Kid>> = lock(&self.0).drain(..).filter_map(|k| k.upgrade()).collect();
        let (done, all_done) = mpsc::channel();
        let count = kids.len();
        for kid in kids {
            let done = done.clone();
            exec::spawn(async move {
                let _ = kid.stop(Some(Duration::ZERO)).await;
                let _ = done.send(());
            });
        }
        let until = Instant::now() + BOUND;
        for _ in 0..count {
            if all_done
                .recv_timeout(until.saturating_duration_since(Instant::now()))
                .is_err()
            {
                return;
            }
        }
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}
