//! Trees and the requests about them. A tree is one root that leads its own session (pid = pgid = sid).
//! Its exit is observed with `waitid(WNOWAIT)`, so the zombie root keeps the number pinned; it is reaped only
//! when a complete scan finds no live member in its session (`sweep`), whatever `Release` said (ADR-0005 §4).
//! From then on the tree is *gone* and none of its numbers is signalled again.

use std::collections::HashMap;
use std::os::fd::{AsFd, AsRawFd, OwnedFd, RawFd};
use std::time::{Duration, Instant};

use omni_proto::{Ack, Exit, FailCode, Msg};

use super::fork::{self, Held};
use super::sys::Reserve;

/// At most this many trees held, live or not yet released (ADR-0005 R1 admission limit, `docs/protocol.md`).
pub(super) const MAX_TREES: usize = 4096;

/// Where a root is between `Spawn` and exec.
pub(super) enum Exec {
    /// Exec'd: its exit is reported with `Exited`.
    Running,
    /// A terminal root waiting for `Go`.
    Held(Held),
    /// `Go` released it; its exec result arrives on this pipe and answers request `req`.
    Execing { req: u64, err: OwnedFd },
    /// Never exec'd (exec failed, or stopped/released before `Go`): no `Exited` is ever sent.
    Abandoned,
}

pub(super) struct Stopping {
    /// Every `Stop` request waiting for `Stopped` (none for a host-death stop).
    pub waiters: Vec<u64>,
    /// The earliest deadline of every overlapping `Stop`.
    pub deadline: Instant,
    pub forced: bool,
    /// The root's group got the graceful signals.
    pub group_graced: bool,
    /// `None` until one complete inventory got the graceful signals; then the members whose signal failed
    /// and is retried (the graceful step never waits on an incomplete inventory, nor moves the deadline).
    pub members_left: Option<Vec<i32>>,
}

pub(super) struct Tree {
    pub pid: i32,
    pub master: Option<OwnedFd>,
    pub grace_ms: u32,
    pub exec: Exec,
    pub exit: Option<Exit>,
    pub exited_sent: bool,
    pub stop: Option<Stopping>,
    pub released: bool,
    pub gone: bool,
    /// Consecutive complete scans that found the session empty; reaping needs two.
    pub empty_scans: u8,
    /// (pid, pgid) of the members live or being torn down at the last complete scan.
    pub known: Vec<(i32, i32)>,
}

pub(super) struct Trees {
    pub map: HashMap<u64, Tree>,
    next_id: u64,
    /// Members are signalled through pidfds (`Ready.info` bit 1).
    pub pidfd: bool,
    pub next_scan: Instant,
    pub pin_backoff: Duration,
    /// Set at host death: every tree, including one inserted later, is stopped with its grace from here.
    host_dead: Option<Instant>,
    pub reserve: Reserve,
    /// The last sweep's inventory was complete (for the exit report).
    pub complete: bool,
    /// The admission limit: `MAX_TREES` (smaller in unit tests).
    cap: usize,
}

/// First wait between scans of a tree whose root exited while members live; doubles up to `PIN_MAX`.
pub(super) const PIN_MIN: Duration = Duration::from_millis(100);
pub(super) const PIN_MAX: Duration = Duration::from_secs(1);

impl Trees {
    pub(super) fn new(pidfd: bool) -> Trees {
        Trees {
            map: HashMap::new(),
            next_id: 1,
            pidfd,
            next_scan: Instant::now(),
            pin_backoff: PIN_MIN,
            host_dead: None,
            reserve: Reserve::new(),
            complete: true,
            cap: MAX_TREES,
        }
    }

    /// Another tree may be admitted: every record held counts, a gone tree too until its `Release` drops it.
    pub(super) fn admits(&self) -> bool {
        self.map.len() < self.cap
    }

    /// Trees not yet confirmed gone.
    pub(super) fn active(&self) -> usize {
        self.map.values().filter(|t| !t.gone).count()
    }

    /// `Stop`s waiting for their `Stopped`: replies owed, counted against admission.
    pub(super) fn waiters(&self) -> usize {
        self.map
            .values()
            .filter_map(|t| t.stop.as_ref())
            .map(|s| s.waiters.len())
            .sum()
    }

    pub(super) fn all_gone(&self) -> bool {
        self.map.values().all(|t| t.gone)
    }

    pub(super) fn insert(&mut self, pid: i32, master: Option<OwnedFd>, grace_ms: u32, exec: Exec) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let tree = Tree {
            pid,
            master,
            grace_ms,
            exec,
            exit: None,
            exited_sent: false,
            stop: None,
            released: false,
            gone: false,
            empty_scans: 0,
            known: Vec::new(),
        };
        self.map.insert(id, tree);
        if let Some(dead) = self.host_dead {
            self.stop(None, id, grace_ms, dead, &mut Vec::new());
        }
        id
    }

    pub(super) fn master(&self, id: u64) -> Option<&OwnedFd> {
        self.map.get(&id)?.master.as_ref()
    }

    /// The tree a request may address: unknown and released ids get `Ack unknown`.
    fn addressable(&mut self, req: u64, id: u64, out: &mut Vec<Msg>) -> Option<&mut Tree> {
        match self.map.get_mut(&id) {
            Some(t) if !t.released => Some(t),
            _ => {
                out.push(Msg::Ack {
                    req,
                    id,
                    result: Ack::Unknown,
                });
                None
            }
        }
    }

    /// Records root exits (without reaping) and sends `Exited` for roots that exec'd.
    pub(super) fn observe_exits(&mut self, out: &mut Vec<Msg>) {
        let mut changed = false;
        for (&id, t) in &mut self.map {
            if t.exit.is_none() && !t.gone {
                // A failure leaves the exit unrecorded; the next SIGCHLD or sweep asks again.
                if let Ok(Some(exit)) = wait_exit(t.pid) {
                    t.exit = Some(exit);
                    changed = true;
                }
            }
            exited_msg(id, t, out);
        }
        if changed {
            self.scan_now();
        }
    }

    pub(super) fn scan_now(&mut self) {
        self.next_scan = Instant::now();
        self.pin_backoff = PIN_MIN;
    }

    /// Error pipes of roots whose exec result is pending.
    pub(super) fn exec_fds(&self) -> Vec<(u64, RawFd)> {
        let fd = |t: &Tree| match &t.exec {
            Exec::Execing { err, .. } => Some(err.as_raw_fd()),
            _ => None,
        };
        self.map.iter().filter_map(|(&id, t)| Some((id, fd(t)?))).collect()
    }

    /// The exec result of a released terminal root is readable: answer its `Go`.
    pub(super) fn exec_ready(&mut self, id: u64, out: &mut Vec<Msg>) {
        let Some(t) = self.map.get_mut(&id) else { return };
        let Exec::Execing { req, err } = std::mem::replace(&mut t.exec, Exec::Abandoned) else {
            return;
        };
        match fork::exec_result(&err) {
            Ok(()) => {
                t.exec = Exec::Running;
                out.push(Msg::Ack {
                    req,
                    id,
                    result: Ack::Ok,
                });
            }
            Err(f) => out.push(Msg::SpawnFailed {
                req,
                code: f.code,
                errno: f.errno,
                msg: f.msg,
            }),
        }
        self.observe_exits(out); // an exit seen before the result is reported now, after the reply
    }

    pub(super) fn go(&mut self, req: u64, id: u64, out: &mut Vec<Msg>) {
        let Some(t) = self.addressable(req, id, out) else {
            return;
        };
        match std::mem::replace(&mut t.exec, Exec::Abandoned) {
            Exec::Held(held) => match held.go() {
                Ok(err) => t.exec = Exec::Execing { req, err },
                Err(e) => {
                    let msg = format!("terminal root: releasing it failed: {e}");
                    out.push(Msg::SpawnFailed {
                        req,
                        code: FailCode::Io,
                        errno: e.raw_os_error().unwrap_or(0),
                        msg,
                    });
                }
            },
            Exec::Running => {
                t.exec = Exec::Running;
                out.push(Msg::Ack {
                    req,
                    id,
                    result: Ack::Ok,
                }); // a pipe root, or a repeated Go
            }
            Exec::Execing { req: first, err } => {
                t.exec = Exec::Execing { req: first, err };
                out.push(Msg::Ack {
                    req,
                    id,
                    result: Ack::Error,
                }); // a second Go while the first is pending
            }
            Exec::Abandoned => {
                let msg = "the terminal root was stopped, released or failed before it could exec".to_owned();
                out.push(Msg::SpawnFailed {
                    req,
                    code: FailCode::Io,
                    errno: 0,
                    msg,
                });
            }
        }
    }

    /// `Stop` (`req` None: host death). One deadline for the whole session; the earliest one wins.
    pub(super) fn stop(&mut self, req: Option<u64>, id: u64, grace_ms: u32, now: Instant, out: &mut Vec<Msg>) {
        let t = match req {
            Some(req) => match self.addressable(req, id, out) {
                Some(t) => t,
                None => return,
            },
            None => match self.map.get_mut(&id) {
                Some(t) => t,
                None => return,
            },
        };
        if t.gone {
            out.extend(req.map(|req| Msg::Stopped { req, id }));
            return;
        }
        // A held root reads EOF on its go pipe and exits without exec; after host death nobody awaits a result.
        let abandon = match &t.exec {
            Exec::Held(_) => true,
            Exec::Execing { .. } => req.is_none(),
            Exec::Running | Exec::Abandoned => false,
        };
        if abandon {
            t.exec = Exec::Abandoned;
        }
        let deadline = now + Duration::from_millis(u64::from(grace_ms));
        match &mut t.stop {
            Some(s) => {
                s.waiters.extend(req);
                s.deadline = s.deadline.min(deadline);
            }
            None => {
                t.stop = Some(Stopping {
                    waiters: req.into_iter().collect(),
                    deadline,
                    forced: false,
                    group_graced: false,
                    members_left: None,
                });
            }
        }
        self.scan_now();
    }

    pub(super) fn release(&mut self, req: u64, id: u64, out: &mut Vec<Msg>) {
        let Some(t) = self.addressable(req, id, out) else {
            return;
        };
        t.released = true;
        if matches!(t.exec, Exec::Held(_)) {
            t.exec = Exec::Abandoned;
        }
        out.push(Msg::Ack {
            req,
            id,
            result: Ack::Ok,
        });
        self.map.retain(|_, t| !(t.gone && t.released));
    }

    pub(super) fn resize(&mut self, req: u64, id: u64, size: (u16, u16), out: &mut Vec<Msg>) {
        let Some(t) = self.addressable(req, id, out) else {
            return;
        };
        let result = match &t.master {
            None => Ack::Error,
            Some(_) if t.gone || t.exit.is_some() => Ack::Closed,
            Some(m) => match crate::pty_unix::resize(m.as_fd(), size.0, size.1) {
                Ok(()) => Ack::Ok,
                Err(_) => Ack::Error,
            },
        };
        out.push(Msg::Ack { req, id, result });
    }

    /// Host death: every tree not gone gets a `Stop` with its own grace, from one shared instant.
    pub(super) fn host_death(&mut self, now: Instant) {
        self.host_dead = Some(now);
        let ids: Vec<(u64, u32)> = self
            .map
            .iter()
            .filter(|(_, t)| !t.gone)
            .map(|(&id, t)| (id, t.grace_ms))
            .collect();
        let mut ignored = Vec::new();
        for (id, grace) in ids {
            self.stop(None, id, grace, now, &mut ignored);
        }
    }

    /// The latest forced deadline of a host-death stop (for the supervisor's own exit bound).
    pub(super) fn last_deadline(&self) -> Option<Instant> {
        self.map.values().filter_map(|t| Some(t.stop.as_ref()?.deadline)).max()
    }
}

/// Sends `Exited` once, for a root that exec'd and whose exit is recorded.
pub(super) fn exited_msg(id: u64, t: &mut Tree, out: &mut Vec<Msg>) {
    if let (Some(exit), Exec::Running, false) = (t.exit, &t.exec, t.exited_sent) {
        t.exited_sent = true;
        out.push(Msg::Exited { id, exit });
    }
}

/// `waitid(WEXITED | WNOHANG | WNOWAIT)`: the root's exit, leaving it a zombie that pins its numbers. Only
/// `CLD_EXITED`/`CLD_KILLED`/`CLD_DUMPED` count: macOS also reports a merely stopped child here.
pub(super) fn wait_exit(pid: i32) -> std::io::Result<Option<Exit>> {
    // SAFETY: siginfo_t is plain old data; all-zero is valid and means "no child changed state".
    let mut si: libc::siginfo_t = unsafe { std::mem::zeroed() };
    let id = libc::id_t::try_from(pid).map_err(std::io::Error::other)?;
    // SAFETY: `si` is writable storage for the result.
    let r = unsafe {
        libc::waitid(
            libc::P_PID,
            id,
            &raw mut si,
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    super::sys::cvt(r)?;
    // SAFETY: waitid filled `si` (or left it zeroed); these accessors read its plain fields.
    let (who, status) = unsafe { (si.si_pid(), si.si_status()) };
    if who != pid {
        return Ok(None);
    }
    Ok(match si.si_code {
        libc::CLD_EXITED => Some(Exit::Code(status.cast_unsigned() & 0xff)),
        libc::CLD_KILLED | libc::CLD_DUMPED => Some(Exit::Signal(status)),
        _ => None,
    })
}

#[cfg(test)]
mod tests {
    use super::{Exec, Trees};

    /// Gone trees that the host never released still count (Codex r3: they grew past the limit); one
    /// `Release` makes room again.
    #[test]
    fn admission_counts_gone_trees_until_they_are_released() {
        let mut trees = Trees::new(false);
        trees.cap = 3;
        // Numbers no process has: nothing here signals or waits.
        let ids: Vec<u64> = (0..3)
            .map(|i| trees.insert(i32::MAX - i, None, 0, Exec::Running))
            .collect();
        assert!(!trees.admits());
        for t in trees.map.values_mut() {
            t.gone = true;
        }
        assert_eq!(trees.active(), 0);
        assert!(!trees.admits(), "gone but not released still holds a slot");
        trees.release(1, ids[0], &mut Vec::new());
        assert!(trees.admits());
    }
}
