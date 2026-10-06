//! From the core's futures to JS promises.
//!
//! One thread (`hugr-omni-node`) polls the futures of the binding. It is not a runtime (ADR-0004 Q4: the core owns the
//! one tokio runtime): the futures are the core's, need no runtime, and are woken by the core's own runtime and reader
//! threads; this thread only polls them when woken. Each result reaches JS through a napi `JsDeferred`, whose
//! threadsafe function settles the promise on the JS thread. The JS thread polls a promise's future once, at the call
//! (which never waits, except for `run()`'s spawn), and never waits for this thread.

use std::cell::RefCell;
use std::future::{Future, poll_fn};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::pin::Pin;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::task::{Context, Poll, Wake, Waker};
use std::time::{Duration, Instant};

use napi::bindgen_prelude::{Object, ToNapiValue};
use napi::{Env, JsDeferred};

use crate::error;

type Job = Pin<Box<dyn Future<Output = ()> + Send>>;
type Resolver<D> = Box<dyn FnOnce(Env) -> napi::Result<D> + Send>;

/// The executor thread's queue: a task is sent here each time it is woken.
static QUEUE: OnceLock<Sender<Arc<Task>>> = OnceLock::new();

thread_local! {
    /// The wake-ups `sleep` registered (the executor thread only): when, and whom.
    static TIMERS: RefCell<Vec<(Instant, Waker)>> = const { RefCell::new(Vec::new()) };
}

/// Starts the executor thread (once per process; `setup` calls it when `index.js` loads), so that `spawn` never fails.
pub(crate) fn start() -> std::io::Result<()> {
    static STARTING: Mutex<()> = Mutex::new(());
    let _once = STARTING.lock().unwrap_or_else(PoisonError::into_inner);
    if QUEUE.get().is_none() {
        let (queue, tasks) = mpsc::channel();
        std::thread::Builder::new()
            .name("hugr-omni-node".to_owned())
            .spawn(move || run(tasks))?;
        let _ = QUEUE.set(queue);
    }
    Ok(())
}

/// Polls `job` on the executor thread until it is done.
pub(crate) fn spawn(job: impl Future<Output = ()> + Send + 'static) {
    if let Some(task) = Task::new(job) {
        task.wake();
    }
}

/// Resolves once `after` has passed. Only for futures polled by the executor thread (the GC keeper).
pub(crate) fn sleep(after: Duration) -> impl Future<Output = ()> {
    let at = Instant::now() + after;
    poll_fn(move |cx| {
        if Instant::now() >= at {
            return Poll::Ready(());
        }
        TIMERS.with_borrow_mut(|timers| timers.push((at, cx.waker().clone())));
        Poll::Pending
    })
}

/// A promise settled by `work`: with `to_js` of its value, or with the `OmniError` of its error.
///
/// `work` is polled once right here, on the calling (JS) thread, before the executor thread takes over: what it does
/// at once happens at the call and in call order, as with any JS API (`run()` has started its process when it returns,
/// so a signal aborted after the call cancels a launched run, contract §8).
pub(crate) fn promise<'env, V, D, W>(env: &'env Env, work: W, to_js: fn(V) -> D) -> napi::Result<Object<'env>>
where
    V: Send + 'static,
    D: ToNapiValue + 'static,
    W: Future<Output = Result<V, hugr_omni::Error>> + Send + 'static,
{
    let (deferred, promise) = env.create_deferred::<D, Resolver<D>>()?;
    let mut settle = Settle(Some(deferred));
    let job = async move {
        let done = work.await;
        if let Some(deferred) = settle.0.take() {
            deferred.resolve(Box::new(move |env| match done {
                Ok(value) => Ok(to_js(value)),
                Err(e) => Err(error::omni(&env, &e)),
            }));
        }
    };
    if let Some(task) = Task::new(job) {
        poll(&task);
    }
    Ok(promise)
}

/// A promise that is settled whatever happens to its job: an unsettled `JsDeferred` would hold the event loop forever.
struct Settle<D: ToNapiValue>(Option<JsDeferred<D, Resolver<D>>>);

impl<D: ToNapiValue> Drop for Settle<D> {
    fn drop(&mut self) {
        if let Some(deferred) = self.0.take() {
            deferred.reject(napi::Error::from_reason(
                "hugr-omni: the operation ended without a result",
            ));
        }
    }
}

/// One spawned future; waking it queues it for the executor thread.
struct Task {
    job: Mutex<Option<Job>>,
    queue: Sender<Arc<Task>>,
}

impl Task {
    /// `None` only before `setup` started the executor thread, which `index.js` does before anything else; the job is
    /// then dropped (a promise in it is settled by `Settle`).
    fn new(job: impl Future<Output = ()> + Send + 'static) -> Option<Arc<Task>> {
        let queue = QUEUE.get()?.clone();
        let job = Mutex::new(Some(Box::pin(job) as Job));
        Some(Arc::new(Task { job, queue }))
    }
}

impl Wake for Task {
    fn wake(self: Arc<Self>) {
        self.wake_by_ref();
    }

    fn wake_by_ref(self: &Arc<Self>) {
        let _ = self.queue.send(Arc::clone(self)); // the executor thread never stops, so this does not fail
    }
}

/// The executor thread: polls each woken task, and fires the timers that are due.
fn run(tasks: Receiver<Arc<Task>>) {
    loop {
        let due = TIMERS.with_borrow(|timers| timers.iter().map(|(at, _)| *at).min());
        let woken = match due {
            None => tasks.recv().ok(),
            Some(at) => match tasks.recv_timeout(at.saturating_duration_since(Instant::now())) {
                Ok(task) => Some(task),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => return,
            },
        };
        let now = Instant::now();
        TIMERS.with_borrow_mut(|timers| {
            timers.retain(|(at, waker)| {
                let fired = *at <= now;
                if fired {
                    waker.wake_by_ref();
                }
                !fired
            });
        });
        match (woken, due) {
            (Some(task), _) => poll(&task),
            (None, None) => return, // every sender is gone (never, `QUEUE` keeps one)
            (None, Some(_)) => {}
        }
    }
}

/// Polls a task once; a job that is done, or that panicked, is dropped (its promise is then settled by `Settle`).
fn poll(task: &Arc<Task>) {
    let waker = Waker::from(Arc::clone(task));
    let mut slot = task.job.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(job) = slot.as_mut() {
        let polled = catch_unwind(AssertUnwindSafe(|| job.as_mut().poll(&mut Context::from_waker(&waker))));
        if !matches!(polled, Ok(Poll::Pending)) {
            *slot = None;
        }
    }
}
