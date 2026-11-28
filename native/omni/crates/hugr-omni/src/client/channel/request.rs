//! Request admission, transmission and waiting.

use std::io;
use std::sync::atomic::Ordering;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use omni_proto::{Msg, encode};
use tokio::sync::oneshot;

use super::{ADMIT_ALL, ADMIT_NORMAL, Class, Gen, Out, Pending, Pipe, Reply, State, Waiter, Want, lock};
use crate::error::Error;

impl Gen {
    /// A blocking round trip, bounded by `bound` from when the request is written or queued: past it the
    /// supervisor counts as stuck and the generation dies.
    pub(in crate::client) fn call(&self, want: Want, id: u64, msg: impl FnOnce(u64) -> Msg, fds: Vec<Pipe>) -> Reply {
        let (tx, rx) = mpsc::sync_channel(1);
        self.request(want, id, Class::Normal, Waiter::Sync(tx), msg, fds)?;
        match rx.recv_timeout(self.bound) {
            Ok(reply) => reply,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let ms = self.bound.as_millis();
                self.die(format!("it did not answer a {} request within {ms} ms", want.name()));
                Err(self.gone())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(self.gone()),
        }
    }

    /// A request whose reply is awaited without blocking any thread (its deadline is watched).
    pub(in crate::client) async fn ask(&self, want: Want, id: u64, class: Class, msg: impl FnOnce(u64) -> Msg) -> Reply {
        let (tx, rx) = oneshot::channel();
        self.request(want, id, class, Waiter::Async(tx), msg, Vec::new())?;
        rx.await.unwrap_or_else(|_| Err(self.gone()))
    }

    /// A request whose reply is matched, validated and dropped (its deadline is watched).
    pub(in crate::client) fn tell(&self, want: Want, id: u64, class: Class, msg: impl FnOnce(u64) -> Msg) -> Result<(), Error> {
        self.request(want, id, class, Waiter::Ignore, msg, Vec::new())
    }

    /// Registers and writes (or queues) one request; never blocks. An error with the generation still
    /// alive means nothing was sent: every failure after registration ends the generation.
    fn request(
        &self,
        want: Want,
        id: u64,
        class: Class,
        to: Waiter,
        msg: impl FnOnce(u64) -> Msg,
        fds: Vec<Pipe>,
    ) -> Result<(), Error> {
        self.home()?;
        let req = self.next.fetch_add(1, Ordering::Relaxed);
        let msg = msg(req);
        let budget = match &msg {
            Msg::Stop { grace_ms, .. } => self.bound + Duration::from_millis(u64::from(*grace_ms)),
            _ => self.bound,
        };
        let mut bytes = Vec::new();
        encode(&msg, &mut bytes).map_err(|e| Error::request_too_big(&e))?;
        let failed = {
            let mut st = lock(&self.st);
            if st.dead.is_some() {
                drop(st);
                return Err(self.gone());
            }
            if matches!(want, Want::ObserveList | Want::ObserveFootprint) {
                if !st.observes {
                    return Err(Error::observation_unavailable());
                }
                if st
                    .pending
                    .values()
                    .any(|pending| matches!(pending.want, Want::ObserveList | Want::ObserveFootprint))
                {
                    return Err(Error::observation_pending());
                }
            }
            let n = st.pending.len();
            if class == Class::Normal && n >= ADMIT_NORMAL {
                return Err(Error::supervisor_saturated(n, ADMIT_NORMAL));
            }
            if n >= ADMIT_ALL {
                Some(format!("it stopped draining its channel ({n} requests waiting)"))
            } else {
                let due = (!matches!(to, Waiter::Sync(_))).then(|| (Instant::now() + budget, budget));
                if let Some((at, _)) = due {
                    st.dues.insert((at, req));
                    if st.armed.is_none_or(|armed| at < armed) {
                        self.sooner.notify_one();
                    }
                }
                st.pending.insert(req, Pending { want, id, to, due });
                self.send(&mut st, Out { bytes, sent: 0, fds }).err()
            }
        };
        match failed {
            None => Ok(()),
            Some(why) => {
                self.die(why);
                Err(self.gone())
            }
        }
    }

    /// Writes at once when nothing is queued; never blocks (a full channel queues the rest for the
    /// writer task).
    fn send(&self, st: &mut State, mut out: Out) -> Result<(), String> {
        if st.out.is_empty() {
            match self.chan.try_send(&out.bytes, &out.fds) {
                Ok(n) if n >= out.bytes.len() => return Ok(()),
                Ok(n) => {
                    out.sent = n;
                    if n > 0 {
                        out.fds.clear();
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                Err(e) => return Err(format!("writing to its channel failed: {e}")),
            }
        }
        st.out.push_back(out);
        self.wake.notify_one();
        Ok(())
    }

}
