//! H1 (WP-H): when a JS environment goes away (a `Worker` terminated, or the host's own teardown), every tree it
//! started is stopped, bounded, and nothing it leaves behind can panic.
//!
//! - **Who owns what:** each environment records its spawned children and pending runs (`Owned`, weak: the lists
//!   never keep a child alive). Its cleanup hook (`napi_add_env_cleanup_hook`) requests forced stops and waits against
//!   one aggregate `BOUND`, on this binding's own thread; it never calls into JS. A failed or timed-out stop is not
//!   proof that every OS process was reaped.
//! - **The GC rule is unchanged:** a collected `Child` still never kills its tree (`child::keep`); only the end of
//!   its whole environment does, as the end of the host process does through the supervisor (ADR-0005 §9).
//! - **No panic in a finalizer:** the environment's data is released without deleting its JS reference (`release`),
//!   since a dying environment may refuse that call (Bun runs finalizers with the termination pending); the
//!   engine frees what the environment held anyway.

use std::sync::mpsc;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};
use std::time::{Duration, Instant};

use hugr_omni::binding::RunHandle;

use crate::child::Kid;
use crate::exec;

/// The longest an environment's teardown waits for its trees: a forced stop is one round trip to the supervisor.
const BOUND: Duration = Duration::from_secs(5);

/// The children and runs one JS environment started.
#[derive(Default)]
pub(crate) struct Owned(Mutex<Trees>);

#[derive(Default)]
struct Trees {
    kids: Vec<Weak<Kid>>,
    runs: Vec<RunHandle>,
}

impl Owned {
    /// Records a child of this environment (and forgets the ones already gone).
    pub(crate) fn add(&self, kid: &Arc<Kid>) {
        let mut trees = lock(&self.0);
        trees.kids.retain(|k| k.strong_count() > 0);
        trees.kids.push(Arc::downgrade(kid));
    }

    /// Records an acquired run child; only entries whose shared state disappeared can be pruned.
    pub(crate) fn add_run(&self, run: RunHandle) {
        let mut trees = lock(&self.0);
        trees.runs.retain(RunHandle::is_alive);
        trees.runs.push(run);
    }

    /// The environment is going away: waits for its forced stops or the shared `BOUND`. Runs on the JS thread,
    /// which is ending; the stops run on the binding's thread. Reaching the bound does not prove OS reaping.
    pub(crate) fn stop_all(&self) {
        let (kids, runs) = {
            let mut trees = lock(&self.0);
            let kids: Vec<Arc<Kid>> = trees.kids.drain(..).filter_map(|k| k.upgrade()).collect();
            (kids, std::mem::take(&mut trees.runs))
        };
        let (done, all_done) = mpsc::channel();
        let count = kids.len() + runs.len();
        let until = Instant::now() + BOUND;
        for kid in kids {
            let done = done.clone();
            exec::spawn(async move {
                let _ = kid.stop(Some(Duration::ZERO)).await;
                let _ = done.send(());
            });
        }
        for run in runs {
            let done = done.clone();
            exec::spawn(async move {
                let _ = run.force_stop().await;
                let _ = done.send(());
            });
        }
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
