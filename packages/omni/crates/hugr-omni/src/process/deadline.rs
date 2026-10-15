//! Timeout and cancellation: one explicit state machine, every waiter resolved exactly once. W09.
//!
//! SEAM (frozen by the lead before W09): `refuse_if_cancelled` and `arm`, called by `spawn_pipe` and `spawn_pty`.
//! Bodies and every private item belong to W09.
//!
//! `arm` enforces the deadline of every child, `spawn()`'s and `run()`'s alike: the first of the timer and the token
//! stops the whole tree once, with its cause and the command's grace (contract §7, §8). `run()` watches the same
//! deadline through a `Deadline` of its own, only to report it (`run`). The timers run on the library's runtime
//! (`Alarm`), so every future here can be awaited from any executor, and none blocks one.

use std::future::{Future, pending, poll_fn};
use std::pin::{Pin, pin};
use std::sync::{Arc, Weak};
use std::task::{Context, Poll};
use std::time::Duration;

use tokio::runtime::Handle;
use tokio::task::AbortHandle;
use tokio_util::sync::{CancellationToken, WaitForCancellationFutureOwned};

use super::Options;
use super::child::Inner;
use crate::error::Error;
use crate::types::Reason;

/// `ABORTED` when `opts.cancel` is already cancelled, so nothing runs (contract §8). Called after validation and
/// before the spawn.
pub(super) fn refuse_if_cancelled(opts: &Options) -> Result<(), Error> {
    match &opts.cancel {
        Some(token) if token.is_cancelled() => Err(Error::cancelled_before_start()),
        _ => Ok(()),
    }
}

/// Arms the timeout (measured from now, the spawn) and the cancellation of a started child, on the library's
/// runtime `rt`. Whichever fires first stops the whole tree with its cause (`Timeout` or `Aborted`) and the
/// command's grace, through `Inner::stop_with`; neither changes the `Exit` of a root that already exited (§7).
/// Never blocks; the armed work ends once the tree is gone.
pub(super) fn arm(rt: &Handle, inner: &Arc<Inner>, timeout: Option<Duration>, cancel: Option<CancellationToken>) {
    if timeout.is_none() && cancel.is_none() {
        return;
    }
    let deadline = Deadline::start(rt, timeout, cancel);
    rt.spawn(enforce(deadline, Arc::clone(inner)));
}

/// While lingering, how often the armed work checks whether the child was dropped or its tree is gone. The supervisor
/// reports no tree that empties on its own, so this is checked, not awaited.
const LINGER_CHECK: Duration = Duration::from_secs(1);

/// The armed work of one child, in two states:
/// - **watching** (a strong hold): the first of the deadline and the end of the child decides. The child ends when
///   its output is over and its root exited; a `stop()` or the drop of the child brings both about.
/// - **lingering** (a weak hold): the root ended on its own, the output is over, and yet the tree still has members
///   (they hold none of its pipes). The deadline is still theirs; the state also ends, releasing everything, once
///   the child was dropped (its drop kills them), nothing is left of the tree (stopped, or ended on its own), or the
///   supervisor cannot list it any more (lost).
///
/// It stops the tree at most once, and holds nothing once the tree is gone or the child dropped, whether or not the
/// deadline ever fires.
async fn enforce(mut deadline: Deadline, inner: Arc<Inner>) {
    let event = first(deadline.fired(), settled(&inner)).await;
    let (inner, cause) = match event {
        First::A(cause) => (inner, cause),
        First::B(Settled::Over) => return,
        First::B(Settled::Lingering) => {
            let child = Arc::downgrade(&inner);
            drop(inner);
            match linger(&mut deadline, &child).await {
                Some(fired) => fired,
                None => return,
            }
        }
    };
    // A failure here (the supervisor is gone) also reaches every waiter of the child (`wait`, `stop`) on its own.
    let _ = inner.stop_with(cause, inner.grace).await;
}

/// The lingering state: the child and the cause once the deadline fires, or `None` once the child was dropped,
/// nothing is left of its tree, or its supervisor cannot tell. It holds the child only while it checks: a dropped
/// child fails to upgrade, and a stopped tree lists nothing without a round trip. The deadline races each whole
/// check, so it wins over a pending `List` (the check is dropped, and the stop is sent at once).
async fn linger(deadline: &mut Deadline, child: &Weak<Inner>) -> Option<(Arc<Inner>, Reason)> {
    loop {
        match first(deadline.fired(), still_lingering(child)).await {
            First::A(cause) => return Some((child.upgrade()?, cause)),
            First::B(true) => {}
            First::B(false) => return None,
        }
    }
}

/// After `LINGER_CHECK`: whether the child still exists and its tree still has members.
async fn still_lingering(child: &Weak<Inner>) -> bool {
    tokio::time::sleep(LINGER_CHECK).await;
    let Some(inner) = child.upgrade() else {
        return false;
    };
    // `Err`: a lost supervisor (for good) or a broken inventory, which the client does not tell apart; through that
    // supervisor the deadline could stop nothing reliably either way.
    inner.life.processes().await.is_ok_and(|left| !left.is_empty())
}

/// How a child ended before its deadline fired.
enum Settled {
    /// The library stopped or killed the tree, nothing is left of it, or the supervisor cannot tell.
    Over,
    /// The root ended on its own and the output is over, but the tree still has members.
    Lingering,
}

/// Resolves once the output is over and the root exited.
async fn settled(inner: &Inner) -> Settled {
    inner.pumps.ended().await;
    match inner.life.wait().await {
        // The root's own end (or a library act after it): ask once whether anything is left to time (an `Err` ends
        // it, as in `linger`).
        Ok(exit) if matches!(exit.reason, Reason::Exit | Reason::Signal) => match inner.life.processes().await {
            Ok(left) if !left.is_empty() => Settled::Lingering,
            Ok(_) | Err(_) => Settled::Over,
        },
        _ => Settled::Over,
    }
}

/// The first of a timeout and a cancellation, awaitable from any executor. With neither, it never fires.
pub(super) struct Deadline {
    alarm: Option<Alarm>,
    cancel: Option<CancellationToken>,
}

impl Deadline {
    /// The timeout counts from now.
    pub(super) fn start(rt: &Handle, timeout: Option<Duration>, cancel: Option<CancellationToken>) -> Deadline {
        Deadline {
            alarm: timeout.map(|after| Alarm::set(rt, after)),
            cancel,
        }
    }

    /// `Aborted` or `Timeout`, whichever fired first (a cancellation wins a tie).
    pub(super) async fn fired(&mut self) -> Reason {
        let Deadline { alarm, cancel } = self;
        let aborted = async {
            match cancel {
                Some(token) => token.cancelled().await,
                None => pending().await,
            }
        };
        let expired = async {
            match alarm {
                Some(alarm) => alarm.await,
                None => pending().await,
            }
        };
        match first(aborted, expired).await {
            First::A(()) => Reason::Aborted,
            First::B(()) => Reason::Timeout,
        }
    }
}

/// A timer on the library's runtime that any executor can await: the caller's may have no timer. Dropping it
/// cancels the timer.
pub(super) struct Alarm {
    rung: Pin<Box<WaitForCancellationFutureOwned>>,
    timer: AbortHandle,
}

impl Alarm {
    /// Rings `after` from now.
    pub(super) fn set(rt: &Handle, after: Duration) -> Alarm {
        let ring = CancellationToken::new();
        let rung = Box::pin(ring.clone().cancelled_owned());
        // Created here, so the time counts from now and not from the task's first poll.
        let sleep = {
            let _on = rt.enter();
            tokio::time::sleep(after)
        };
        let timer = rt.spawn(async move {
            sleep.await;
            ring.cancel();
        });
        Alarm {
            rung,
            timer: timer.abort_handle(),
        }
    }
}

impl Future for Alarm {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        self.rung.as_mut().poll(cx)
    }
}

impl Drop for Alarm {
    fn drop(&mut self) {
        self.timer.abort();
    }
}

/// Which of two futures finished first.
enum First<A, B> {
    A(A),
    B(B),
}

/// Polls `a`, then `b`, until one is ready (`a` wins a tie).
async fn first<A: Future, B: Future>(a: A, b: B) -> First<A::Output, B::Output> {
    let (mut a, mut b) = (pin!(a), pin!(b));
    poll_fn(|cx| match a.as_mut().poll(cx) {
        Poll::Ready(out) => Poll::Ready(First::A(out)),
        Poll::Pending => b.as_mut().poll(cx).map(First::B),
    })
    .await
}
