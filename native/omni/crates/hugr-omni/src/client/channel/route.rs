//! The reader, writer and deadline tasks of one generation, and the routing of every supervisor message to
//! its waiter. Anything the protocol does not allow is a violation that ends the generation (R6).

use std::collections::VecDeque;
use std::convert::Infallible;
use std::io;
use std::sync::Arc;
use std::time::Instant;

use omni_proto::{Exit, Msg, VERSION, decode};
use tokio::sync::watch;

use super::{Answer, Gen, Life, LifeTx, State, Waiter, Want, deliver};
use crate::client::{Pipe, lock};

const READ_CHUNK: usize = 64 * 1024;

/// A reply to deliver and a tree change to publish, both outside the state lock.
type Routed = (Option<(Waiter, Answer)>, Option<Event>);

enum Event {
    Exited(LifeTx, u64, Exit),
    Gone(LifeTx),
}

impl Gen {
    /// Flushes what `send` queued when the channel was full.
    pub(super) async fn write_loop(self: Arc<Self>) {
        loop {
            self.wake.notified().await;
            if let Err(why) = self.flush().await {
                self.die(why);
                return;
            }
        }
    }

    async fn flush(&self) -> Result<(), String> {
        loop {
            let blocked = {
                let mut st = lock(&self.st);
                let Some(out) = st.out.front_mut() else { return Ok(()) };
                let rest = out.bytes.get(out.sent..).unwrap_or_default();
                match self.chan.try_send(rest, &out.fds) {
                    Ok(n) => {
                        out.sent += n;
                        if n > 0 {
                            out.fds.clear();
                        }
                        if out.sent >= out.bytes.len() {
                            st.out.pop_front();
                        }
                        false
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => true,
                    Err(e) => return Err(format!("writing to its channel failed: {e}")),
                }
            };
            if blocked {
                let ready = self.chan.writable().await;
                ready.map_err(|e| format!("its channel failed: {e}"))?;
            }
        }
    }

    /// Reads frames until the channel ends or breaks the protocol, then ends the generation.
    pub(super) async fn read_loop(self: Arc<Self>) {
        let why = match self.read().await {
            Err(why) => why,
            Ok(never) => match never {},
        };
        self.die(why);
    }

    async fn read(&self) -> Result<Infallible, String> {
        let accepted = self.chan.accept().await;
        accepted.map_err(|e| format!("its channel did not connect: {e}"))?;
        let mut chunk = vec![0; READ_CHUNK];
        let (mut buf, mut fds) = (Vec::new(), VecDeque::new());
        loop {
            let n = self.chan.recv(&mut chunk, &mut fds).await;
            let n = n.map_err(|e| format!("reading its channel failed: {e}"))?;
            if n == 0 {
                return Err(match buf.is_empty() {
                    true => "it closed the channel (the process ended)".into(),
                    false => "it closed the channel in the middle of a frame".into(),
                });
            }
            buf.extend_from_slice(chunk.get(..n).unwrap_or_default());
            let mut used = 0;
            while let Some((msg, len)) =
                decode(buf.get(used..).unwrap_or_default()).map_err(|e| format!("it sent a malformed frame ({e})"))?
            {
                used += len;
                self.dispatch(msg, &mut fds)?;
            }
            buf.drain(..used.min(buf.len()));
            // A descriptor rides on the first byte of its frame: only a partial frame may own one.
            if fds.len() > usize::from(!buf.is_empty()) {
                return Err("it sent a descriptor that no frame accounts for".into());
            }
        }
    }

    fn dispatch(&self, msg: Msg, fds: &mut VecDeque<Pipe>) -> Result<(), String> {
        let (reply, event) = {
            let mut st = lock(&self.st);
            self.route(&mut st, msg, fds)?
        };
        match event {
            Some(Event::Exited(life, id, exit)) => {
                let mut twice = false;
                life.send_modify(|l| {
                    twice = l.exit.is_some();
                    l.exit = Some(exit);
                });
                if twice {
                    return Err(format!("it reported the exit of tree {id} twice"));
                }
            }
            Some(Event::Gone(life)) => life.send_modify(|l| l.gone = true),
            None => {}
        }
        if let Some((to, answer)) = reply {
            deliver(to, Ok(answer));
        }
        Ok(())
    }

    /// Matches one message against the state (under the lock).
    fn route(&self, st: &mut State, msg: Msg, fds: &mut VecDeque<Pipe>) -> Result<Routed, String> {
        if !st.ready {
            return match msg {
                Msg::Ready { version: VERSION, .. } => {
                    st.ready = true;
                    if let Some(hello) = st.hello.take() {
                        let _ = hello.try_send(());
                    }
                    Ok((None, None))
                }
                Msg::Ready { version, .. } => Err(format!(
                    "it speaks protocol version {version} and this library speaks {VERSION}; install both \
                     from the same release"
                )),
                other => Err(format!("its first message was {} instead of Ready", kind(&other))),
            };
        }
        let (req, answer, event) = match msg {
            Msg::Exited { id, exit } => {
                let event = st.trees.get(&id).map(|life| Event::Exited(life.clone(), id, exit));
                return Ok((None, event));
            }
            Msg::Spawned { req, id, pid, pty_ends } => {
                let want = check(st, req, |w| matches!(w, Want::Spawn { .. }), None)?;
                let ends = self.chan.ends(pty_ends, fds)?;
                if want != (Want::Spawn { pty: ends.is_some() }) {
                    return Err(format!(
                        "it answered a Spawn request with the wrong terminal ends {pty_ends:?}"
                    ));
                }
                if st.trees.contains_key(&id) {
                    return Err(format!("it reused tree id {id}"));
                }
                let life = Arc::new(watch::Sender::new(Life::default()));
                st.trees.insert(id, life.clone());
                (req, Answer::Spawned { id, pid, ends, life }, None)
            }
            Msg::SpawnFailed { req, code, errno, msg } => {
                check(st, req, |w| matches!(w, Want::Spawn { .. } | Want::Go), None)?;
                (req, Answer::Failed { code, errno, msg }, None)
            }
            Msg::Ack { req, id, result } => {
                check(st, req, |w| !matches!(w, Want::Spawn { .. }), Some(id))?;
                (req, Answer::Ack(result), None)
            }
            Msg::Stopped { req, id } => {
                check(st, req, |w| w == Want::Stop, Some(id))?;
                (req, Answer::Stopped, st.trees.get(&id).map(|l| Event::Gone(l.clone())))
            }
            Msg::Processes { req, id, list } => {
                check(st, req, |w| w == Want::List, Some(id))?;
                (req, Answer::Processes(list), None)
            }
            Msg::Ready { .. } => return Err("it sent Ready twice".into()),
            other => return Err(format!("it sent {}, which only a host may send", kind(&other))),
        };
        // Removed only once valid: on a violation the waiter stays, and `die` answers it with the reason.
        let p = st.pending.remove(&req);
        if let Some((at, _)) = p.as_ref().and_then(|p| p.due) {
            st.dues.remove(&(at, req));
        }
        Ok((p.map(|p| (p.to, answer)), event))
    }

    /// Watches the deadlines of non-blocking requests: the first one missed ends the generation. With none
    /// pending it still wakes every `bound`: every new deadline is at least `bound` away, so adding one
    /// never needs to wake this task (only an earlier one than it sleeps until does).
    pub(super) async fn watch_loop(self: Arc<Self>) {
        loop {
            let now = Instant::now();
            let (first, until) = {
                let mut st = lock(&self.st);
                let first = st.dues.first().copied();
                let until = first.map_or(now + self.bound, |(at, _)| at);
                st.armed = Some(until);
                (first, until)
            };
            if until > now {
                // Woken early by a sooner deadline, or at `until`: either way, look again.
                let _ = tokio::time::timeout(until - now, self.sooner.notified()).await;
                continue;
            }
            let Some((at, req)) = first else { continue };
            let missed = {
                let mut st = lock(&self.st);
                st.dues.remove(&(at, req));
                st.pending.get(&req).and_then(|p| Some((p.want, p.due?.1)))
            };
            if let Some((want, budget)) = missed {
                let ms = budget.as_millis();
                self.die(format!("it did not answer a {} request within {ms} ms", want.name()));
                return;
            }
        }
    }
}

/// The kind of the waiting request `req`, if it `fits` and, for tree requests, its tree is `id`.
fn check(st: &State, req: u64, fits: impl Fn(Want) -> bool, id: Option<u64>) -> Result<Want, String> {
    let p = st.pending.get(&req);
    let p = p.ok_or_else(|| format!("it answered request {req}, which is not waiting"))?;
    if !fits(p.want) {
        let want = p.want.name();
        return Err(format!(
            "it answered a {want} request (req {req}) with the wrong message"
        ));
    }
    match id {
        Some(id) if id != p.id => Err(format!("it answered for tree {id} a request about tree {}", p.id)),
        _ => Ok(p.want),
    }
}

fn kind(msg: &Msg) -> &'static str {
    match msg {
        Msg::Spawn(_) => "Spawn",
        Msg::Go { .. } => "Go",
        Msg::Stop { .. } => "Stop",
        Msg::Resize { .. } => "Resize",
        Msg::List { .. } => "List",
        Msg::Release { .. } => "Release",
        Msg::Ready { .. } => "Ready",
        Msg::Spawned { .. } => "Spawned",
        Msg::SpawnFailed { .. } => "SpawnFailed",
        Msg::Exited { .. } => "Exited",
        Msg::Stopped { .. } => "Stopped",
        Msg::Processes { .. } => "Processes",
        Msg::Ack { .. } => "Ack",
    }
}
