//! The `Go` of a held Unix PTY root (ADR-0005 R9), in three states: held; in flight, where every later
//! caller waits for the same outcome; done, where every caller gets that outcome. A request refused before
//! it was sent leaves the root held, so a later `go` still releases it.

use std::sync::{Condvar, Mutex, PoisonError};
use std::time::Duration;

use omni_proto::{Ack, FailCode};

use super::lock;
use crate::error::Error;

/// How a `Go` ended.
#[derive(Clone, Debug)]
pub(super) enum GoEnd {
    Ok,
    /// The root could not exec (`SpawnFailed`).
    Failed(FailCode, i32, String),
    /// The supervisor answered with another `Ack`.
    Refused(Ack),
    /// The generation died before an answer.
    Gone,
}

#[derive(Debug)]
enum Go {
    Held,
    Sending,
    Done(GoEnd),
}

#[derive(Debug)]
pub(super) struct Hold {
    go: Mutex<Go>,
    changed: Condvar,
}

impl Hold {
    /// `held`: a Unix PTY root waiting for `Go`; anything else is done already.
    pub(super) fn new(held: bool) -> Hold {
        let go = if held { Go::Held } else { Go::Done(GoEnd::Ok) };
        Hold {
            go: Mutex::new(go),
            changed: Condvar::new(),
        }
    }

    /// The outcome of the one `Go`: the first caller of a held root runs `send`; callers meanwhile wait (at
    /// most `wait`) for its outcome. `send` returning `Err` means nothing was sent: the root stays held and
    /// that caller gets the error.
    pub(super) fn go(&self, wait: Duration, send: impl FnOnce() -> Result<GoEnd, Error>) -> Result<GoEnd, Error> {
        let mut go = lock(&self.go);
        if matches!(*go, Go::Sending) {
            go = self
                .changed
                .wait_timeout_while(go, wait, |g| matches!(g, Go::Sending))
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
        match &*go {
            Go::Done(end) => return Ok(end.clone()),
            Go::Sending => {
                return Err(Error::supervisor_refused(
                    "Go",
                    "a terminal",
                    "another Go did not finish",
                ));
            }
            Go::Held => *go = Go::Sending,
        }
        drop(go);
        let sent = send();
        *lock(&self.go) = match &sent {
            Ok(end) => Go::Done(end.clone()),
            Err(_) => Go::Held,
        };
        self.changed.notify_all();
        sent
    }
}
