//! `run()`: spawn + collect, with the completion rules of contract §6. W09 (collection is `io`, W10).
//!
//! One state machine drives a run, one event at a time: `Phase` is where the run is, `Outcome` what it comes to.
//!
//! | Phase | Event | Next |
//! |---|---|---|
//! | Running | root exited | Draining: the grace window opens (Stopping at once if the output is over) |
//! | Draining | output over, or the grace window over | Stopping |
//! | Running, Draining | output over the limit or lost, input failed | Stopping, outcome `Broken` |
//! | Running, Draining | the root's exit lost (the supervisor is gone) | Stopping (the stop fails too) |
//! | any | deadline fired | outcome `Timeout` / `Aborted` (the stop is `arm`'s, see below) |
//! | Stopping | the tree is gone / the stop failed | Stopped / Unstopped |
//! | Stopped, Unstopped | output over | done |
//!
//! - Every run ends with one stop of its tree (§8: `run()` returns only after the tree is stopped), even when
//!   nothing is left of it; a root that already exited keeps its `Exit`.
//! - A failure of the supervisor is an event like the others, never an early return: the stop still ends the output
//!   (`Inner::stop_with` does, whatever the supervisor answers), the output is still collected within the drain,
//!   and the run rejects with the failure (`IO`), carrying what it collected whenever the root's `Exit` is known.
//! - Once the root exited, the grace window (`grace` from the exit) is its descendants' grace, all of it: a stop
//!   then gets only what is left of the window, so what is left of the tree when the window ends is stopped at once
//!   (forced), and `run()` ends about `grace` after the root's exit (C-IO-04), never after a second grace. A stop
//!   while the root runs gets the whole grace, like `stop()`.
//! - The output is always awaited, never dropped; after the stop it ends within the drain.
//! - The deadline is enforced by `deadline::arm`, which `spawn_pipe` arms with the same timeout and token for this
//!   child. The run only reports it, and decides the timeout when it finishes, against its own absolute deadline:
//!   taken before the spawn, so never later than `arm`'s. A run that finishes at or after it timed out (§6: "at any
//!   point before run() completes"), whatever order its events came in, even when `arm` already stopped the tree
//!   and the run's own timer has not rung yet; that timer only wakes the run.
//! - The run is polled on the caller's executor and never blocks it: every wait is a future that needs no runtime,
//!   and the timers run on the library's runtime (`deadline::Alarm`).

use std::future::{Future, poll_fn, ready};
use std::pin::{Pin, pin};
use std::task::{Context, Poll};
use std::time::{Duration, Instant};

use tokio::runtime::Handle;

use super::child::Inner;
use super::deadline::{Alarm, Deadline};
use super::{Child, Options, PipeChild, spawn_pipe, spawn_pty};
use crate::client;
use crate::error::{Error, ErrorCode};
use crate::io::Collected;
use crate::spawn::{Mode, Request};
use crate::types::{Exit, Reason, RunOutput, Stdin};

/// How long the output may take to end once the tree is gone (the pumps' own drain; §8: "+ 1 s").
const DRAIN: Duration = Duration::from_secs(1);

/// Runs to completion (contract §6).
pub(crate) async fn run(req: &Request, opts: &Options) -> Result<RunOutput, Error> {
    if let (Mode::Pty(_), Some(_)) = (req.mode, &opts.input) {
        return Err(Error::pty_run_input());
    }
    let started = Instant::now();
    let mut launch = req.clone();
    launch.stdin = match opts.input {
        Some(_) => Stdin::Pipe,
        None => Stdin::Closed,
    };
    match req.mode {
        Mode::Pipe => {
            let child = spawn_pipe(&launch, opts)?;
            drive(&child, feed(&child, opts.input.as_deref()), started, req, opts).await
        }
        Mode::Pty(_) => {
            let child = spawn_pty(&launch, opts)?;
            drive(&child, ready(None), started, req, opts).await
        }
    }
}

/// Writes `input`, then closes stdin (§6). A child that exits or closes its stdin first is normal: only another
/// failure is returned.
async fn feed(child: &PipeChild, input: Option<&[u8]>) -> Option<Error> {
    let input = input?;
    let fed = match child.write(input).await {
        Ok(()) => child.close_stdin().await,
        failed => failed,
    };
    fed.err().filter(|e| e.code() != ErrorCode::Closed)
}

/// The machine of one started run.
async fn drive(
    child: &Child,
    feed: impl Future<Output = Option<Error>>,
    started: Instant,
    req: &Request,
    opts: &Options,
) -> Result<RunOutput, Error> {
    let inner = &*child.inner;
    // Claimed now, right after the spawn: nothing beyond the unattached budget is dropped before it.
    let mut output = pin!(inner.pumps.collect(opts.max_output_bytes, DRAIN));
    let rt = client::runtime()?.handle();
    let timeout = req.timeout.map(|t| t.saturating_sub(started.elapsed()));
    let mut deadline = Deadline::start(rt, timeout, opts.cancel.clone());
    let (mut exited, mut fired) = (Some(pin!(inner.life.wait())), Some(pin!(deadline.fired())));
    let (mut output, mut fed) = (Some(output.as_mut()), Some(pin!(feed)));
    let mut run = Run {
        inner,
        rt,
        grace: req.grace,
        max: opts.max_output_bytes,
        due: req.timeout.and_then(|t| started.checked_add(t)),
        phase: Phase::Running,
        outcome: Outcome::Normal,
        exit: None,
        output: None,
    };
    loop {
        let event = poll_fn(|cx| run.next(cx, &mut exited, &mut fired, &mut output, &mut fed)).await;
        if let Some(result) = run.on(event)? {
            return Ok(result);
        }
    }
}

/// Polls `source` if it has not delivered yet. Once it delivered, it is gone and never polled again.
fn once<F: Future>(source: &mut Option<Pin<&mut F>>, cx: &mut Context<'_>) -> Option<F::Output> {
    let Poll::Ready(out) = source.as_mut()?.as_mut().poll(cx) else {
        return None;
    };
    *source = None;
    Some(out)
}

type Stopping<'a> = Pin<Box<dyn Future<Output = Result<Exit, Error>> + Send + 'a>>;

/// Where a run is.
enum Phase<'a> {
    /// The root runs.
    Running,
    /// The root exited at `since`: its descendants have until the alarm (the grace) to close the pipes.
    Draining { alarm: Alarm, since: Instant },
    /// The tree is being stopped.
    Stopping(Stopping<'a>),
    /// The tree is gone, and this was the root's `Exit`; the output ends within the drain.
    Stopped(Exit),
    /// The stop failed (the supervisor is gone or refused it); the output still ends within the drain.
    Unstopped(Error),
}

/// What a run comes to (§6, §8). The first cause wins, except that a resolved run always carries its complete
/// output: a break overrides a timeout.
enum Outcome {
    /// The root's result.
    Normal,
    /// The deadline expired (also after the root exited): resolves with `reason: Timeout`.
    Timeout,
    /// Cancelled after the start: rejects with `ABORTED`.
    Aborted,
    /// The output went over the limit or was lost, or the input failed: rejects with this error.
    Broken(Error),
}

impl Outcome {
    fn fire(&mut self, cause: Reason) {
        if let Outcome::Normal = self {
            *self = match cause {
                Reason::Aborted => Outcome::Aborted,
                _ => Outcome::Timeout,
            };
        }
    }

    fn break_with(&mut self, error: Error) {
        if let Outcome::Normal | Outcome::Timeout = self {
            *self = Outcome::Broken(error);
        }
    }

    /// The result of a run whose tree is gone, decided now: the root's status with the run's reason and the complete
    /// output, or the error with what was collected as its result. A run that finishes at or after its deadline `due`
    /// timed out (§6), however late its timer's event came; a cause that came first stays.
    fn settle(self, due: Option<Instant>, mut exit: Exit, output: Collected) -> Result<RunOutput, Error> {
        let outcome = match self {
            Outcome::Normal if due.is_some_and(|due| Instant::now() >= due) => Outcome::Timeout,
            outcome => outcome,
        };
        match outcome {
            Outcome::Timeout => exit.reason = Reason::Timeout,
            Outcome::Aborted => exit.reason = Reason::Aborted,
            Outcome::Normal | Outcome::Broken(_) => {}
        }
        let result = RunOutput {
            exit,
            stdout: output.stdout,
            stderr: output.stderr,
        };
        match outcome {
            Outcome::Normal | Outcome::Timeout => Ok(result),
            Outcome::Aborted => Err(Error::run_cancelled().with_result(result)),
            Outcome::Broken(error) => Err(error.with_result(result)),
        }
    }
}

/// One thing that happened to a run.
enum Event {
    Exited(Result<Exit, Error>),
    Fired(Reason),
    Output(Result<Collected, Error>),
    Fed(Option<Error>),
    GraceOver,
    Stopped(Result<Exit, Error>),
}

struct Run<'a> {
    inner: &'a Inner,
    rt: &'a Handle,
    grace: Duration,
    max: usize,
    /// The run's deadline, counted from before the spawn (`None` without a timeout).
    due: Option<Instant>,
    phase: Phase<'a>,
    outcome: Outcome,
    exit: Option<Exit>,
    output: Option<Collected>,
}

impl<'a> Run<'a> {
    /// The next event. Each source delivers once (`once`); the phase's own (the grace window, the stop) once per
    /// phase, as each of their events leaves the phase.
    fn next(
        &mut self,
        cx: &mut Context<'_>,
        exited: &mut Option<Pin<&mut impl Future<Output = Result<Exit, Error>>>>,
        fired: &mut Option<Pin<&mut impl Future<Output = Reason>>>,
        output: &mut Option<Pin<&mut impl Future<Output = Result<Collected, Error>>>>,
        fed: &mut Option<Pin<&mut impl Future<Output = Option<Error>>>>,
    ) -> Poll<Event> {
        if let Some(exit) = once(exited, cx) {
            return Poll::Ready(Event::Exited(exit));
        }
        if let Some(cause) = once(fired, cx) {
            return Poll::Ready(Event::Fired(cause));
        }
        if let Some(collected) = once(output, cx) {
            return Poll::Ready(Event::Output(collected));
        }
        if let Some(failed) = once(fed, cx) {
            return Poll::Ready(Event::Fed(failed));
        }
        match &mut self.phase {
            Phase::Draining { alarm, .. } => Pin::new(alarm).poll(cx).map(|()| Event::GraceOver),
            Phase::Stopping(stop) => stop.as_mut().poll(cx).map(Event::Stopped),
            Phase::Running | Phase::Stopped(_) | Phase::Unstopped(_) => Poll::Pending,
        }
    }

    /// Applies `event`; the result once the run is over.
    fn on(&mut self, event: Event) -> Result<Option<RunOutput>, Error> {
        match event {
            // The root's exit will never be known (the supervisor is gone): the stop then fails too, and reports it
            // once it ended the output.
            Event::Exited(Err(_)) => self.stop(Reason::Killed),
            Event::Exited(Ok(exit)) => {
                self.exit = Some(exit);
                if let Phase::Running = self.phase {
                    let since = Instant::now();
                    let alarm = Alarm::set(self.rt, self.grace);
                    self.phase = Phase::Draining { alarm, since };
                    if self.output.is_some() {
                        self.stop(Reason::Killed);
                    }
                }
            }
            // `arm` stops the tree; the run only records it.
            Event::Fired(cause) => self.outcome.fire(cause),
            Event::Output(collected) => {
                // `Err` only when the consumer was claimed already, which a run's own child never is.
                let mut collected = collected?;
                let broken = match collected.over_limit {
                    Some(stream) => Some(Error::output_limit(stream, self.max)),
                    None => collected.failed.take(),
                };
                self.output = Some(collected);
                match broken {
                    Some(error) => {
                        self.outcome.break_with(error);
                        self.stop(Reason::Killed);
                    }
                    None if matches!(self.phase, Phase::Draining { .. }) => self.stop(Reason::Killed),
                    None => {}
                }
            }
            Event::Fed(None) => {}
            Event::Fed(Some(error)) => {
                self.outcome.break_with(error);
                self.stop(Reason::Killed);
            }
            Event::GraceOver => self.stop(Reason::Killed),
            Event::Stopped(Ok(exit)) => self.phase = Phase::Stopped(exit),
            Event::Stopped(Err(error)) => self.phase = Phase::Unstopped(error),
        }
        self.finish()
    }

    /// Starts the one stop of the tree, unless it is under way or done. `cause` counts only while the root runs. Its
    /// grace: the whole of it while the root runs, what is left of the window once it exited (none when it is over).
    fn stop(&mut self, cause: Reason) {
        let grace = match &self.phase {
            Phase::Running => self.grace,
            Phase::Draining { since, .. } => self.grace.saturating_sub(since.elapsed()),
            Phase::Stopping(_) | Phase::Stopped(_) | Phase::Unstopped(_) => return,
        };
        self.phase = Phase::Stopping(Box::pin(self.inner.stop_with(cause, grace)));
    }

    /// Once the stop is over and the output too: the run's result (`Outcome::settle`); or, if the stop failed, that
    /// failure, with what was collected as its result whenever the root's `Exit` is known.
    fn finish(&mut self) -> Result<Option<RunOutput>, Error> {
        let Some(output) = self.output.take() else {
            return Ok(None);
        };
        match std::mem::replace(&mut self.phase, Phase::Running) {
            Phase::Stopped(exit) => {
                let outcome = std::mem::replace(&mut self.outcome, Outcome::Normal);
                outcome.settle(self.due, exit, output).map(Some)
            }
            Phase::Unstopped(error) => Err(match self.exit.take() {
                Some(exit) => error.with_result(RunOutput {
                    exit,
                    stdout: output.stdout,
                    stderr: output.stderr,
                }),
                None => error,
            }),
            not_over => {
                self.phase = not_over;
                self.output = Some(output);
                Ok(None)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    //! The finish rule (§6), as a pure function: a run that finishes at or after its deadline timed out, whatever
    //! order its events came in; a cause that came first stays.

    use super::*;
    use crate::types::{Data, Stream};

    /// A run whose root exited 0 by itself, ending now with `outcome`, its deadline `due`.
    fn finished(outcome: Outcome, due: Option<Instant>) -> Result<RunOutput, Error> {
        let exit = Exit {
            code: Some(0),
            signal: None,
            reason: Reason::Exit,
        };
        let output = Collected {
            stdout: Data::Text("out".into()),
            stderr: Data::Text(String::new()),
            over_limit: None,
            failed: None,
        };
        outcome.settle(due, exit, output)
    }

    #[test]
    fn a_run_that_finishes_at_its_deadline_timed_out_whatever_came_first() {
        let passed = Some(Instant::now());
        let ahead = Instant::now().checked_add(Duration::from_secs(3600));
        let late = finished(Outcome::Normal, passed).expect("a timed-out run resolves");
        let exit = &late.exit;
        assert_eq!(
            (exit.reason, exit.code, exit.success()),
            (Reason::Timeout, Some(0), false)
        );
        assert_eq!(late.stdout, Data::Text("out".into()));

        for due in [ahead, None] {
            let in_time = finished(Outcome::Normal, due).expect("resolves");
            assert!(in_time.exit.success(), "{due:?}: {:?}", in_time.exit);
        }
        let timed_out = finished(Outcome::Timeout, ahead).expect("resolves");
        assert_eq!(timed_out.exit.reason, Reason::Timeout);

        let aborted = finished(Outcome::Aborted, passed).expect_err("cancelled first");
        assert_eq!(aborted.code(), ErrorCode::Aborted);
        assert_eq!(aborted.result().map(|r| r.exit.reason), Some(Reason::Aborted));
        let broken = Outcome::Broken(Error::output_limit(Stream::Stdout, 1));
        assert_eq!(
            finished(broken, passed).expect_err("over the limit first").code(),
            ErrorCode::OutputLimit
        );
    }
}
