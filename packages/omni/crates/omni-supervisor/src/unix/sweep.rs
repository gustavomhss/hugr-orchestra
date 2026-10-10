//! The sweep (ADR-0005 §3–§4, R3): one shared process inventory for every session that needs one, then
//! signals and reaping. `Stop` signals the root's group (pinned by the unreaped root) and every live member
//! of the root's session: graceful once (SIGTERM + SIGCONT, plus SIGHUP for a terminal) — for members, by
//! the first complete inventory, retried per member whose signal failed — then SIGKILL on every sweep from
//! the deadline on. An incomplete inventory, or a member signal that fails for want of a descriptor, is
//! retried once with the emergency descriptor reserve released. A root is reaped only when two consecutive
//! complete scans show no live member, so an incomplete inventory can delay `Stopped` but never fake it,
//! and a member forked during one scan by a member that died before the scan reached it is seen by the
//! next. A member being torn down (macOS reports it only as `Exiting`) keeps the session non-empty until
//! it is a zombie or gone: it belongs to a tree when it was one of the tree's members at the previous
//! complete scan, or its group or parent is one of the tree's. `List` answers from the same rule.

use std::collections::HashSet;
use std::time::{Duration, Instant};

use omni_proto::{Ack, Msg, ProcEntry};

use super::procs::{self, Exiting, Inventory, Member};
use super::sys::Reserve;
use super::trees::{Exec, PIN_MAX, Stopping, Tree, Trees, exited_msg, wait_exit};
use super::watch;

/// Sweep interval while a tree is being stopped.
const SWEEP: Duration = Duration::from_millis(10);

impl Trees {
    /// When the loop must sweep next, if any tree needs it.
    pub(super) fn next_wake(&self) -> Option<Instant> {
        self.map.values().any(needs_scan).then_some(self.next_scan)
    }

    pub(super) fn sweep(&mut self, now: Instant, out: &mut Vec<Msg>) {
        if now < self.next_scan {
            return;
        }
        let ids: Vec<u64> = self
            .map
            .iter()
            .filter(|(_, t)| needs_scan(t))
            .map(|(&id, _)| id)
            .collect();
        if ids.is_empty() {
            return;
        }
        let sids: HashSet<i32> = ids.iter().filter_map(|id| Some(self.map.get(id)?.pid)).collect();
        let inventory = self.inventory(&sids, false);
        self.complete = inventory.is_some();
        let mut tx = Signals {
            pidfd: self.pidfd,
            reserve: &mut self.reserve,
        };
        let (mut stopping, mut confirming) = (false, false);
        for id in ids {
            let Some(t) = self.map.get_mut(&id) else { continue };
            let members = inventory
                .as_ref()
                .map(|inv| inv.members.get(&t.pid).map(Vec::as_slice).unwrap_or_default());
            let exiting = inventory.as_ref().map(|inv| inv.exiting.as_slice()).unwrap_or_default();
            let members = members.filter(|m| root_accounted(t, m, exiting));
            let (root, pty) = (t.pid, t.master.is_some());
            if let Some(s) = &mut t.stop {
                stopping = true;
                s.forced |= now >= s.deadline;
                if s.forced {
                    kill_session(root, members, &mut tx);
                } else {
                    graceful(root, pty, s, members, &mut tx);
                }
            }
            // Not empty while a member lives or is still being torn down; remember both for the next scan.
            let empty = members.is_some_and(|m| {
                let dying = dying(t, m, exiting);
                t.known = m
                    .iter()
                    .filter(|m| m.live)
                    .map(|m| (m.pid, m.pgid))
                    .chain(dying.iter().copied())
                    .collect();
                !m.iter().any(|m| m.live) && dying.is_empty()
            });
            let ready = empty && t.exit.is_some() && !matches!(t.exec, Exec::Execing { .. });
            t.empty_scans = if ready { t.empty_scans.saturating_add(1) } else { 0 };
            confirming |= t.empty_scans == 1;
            if t.empty_scans >= 2 && reap(t.pid) {
                t.gone = true;
                t.master = None;
                exited_msg(id, t, out);
                for req in t.stop.take().map(|s| s.waiters).unwrap_or_default() {
                    out.push(Msg::Stopped { req, id });
                }
            }
        }
        self.map.retain(|_, t| !(t.gone && t.released));
        self.reserve.refill();
        self.next_scan = now
            + if stopping || confirming {
                SWEEP
            } else {
                let wait = self.pin_backoff;
                self.pin_backoff = (wait * 2).min(PIN_MAX);
                wait
            };
    }

    /// `List`: the live members `Stop` would reach now; `Ack error` if the inventory is incomplete.
    pub(super) fn list(&mut self, req: u64, id: u64, out: &mut Vec<Msg>) {
        let Some(t) = self.map.get_mut(&id).filter(|t| !t.released) else {
            out.push(Msg::Ack {
                req,
                id,
                result: Ack::Unknown,
            });
            return;
        };
        if t.gone {
            out.push(Msg::Processes {
                req,
                id,
                list: Vec::new(),
            });
            return;
        }
        let pid = t.pid;
        let inventory = self.inventory(&HashSet::from([pid]), true);
        self.reserve.refill();
        let Some(t) = self.map.get_mut(&id) else { return };
        let exiting = inventory.as_ref().map(|inv| inv.exiting.clone()).unwrap_or_default();
        let members = inventory.map(|mut inv| inv.members.remove(&pid).unwrap_or_default());
        let Some(members) = members.filter(|m| root_accounted(t, m, &exiting)) else {
            out.push(Msg::Ack {
                req,
                id,
                result: Ack::Error,
            });
            return;
        };
        let live: Vec<&Member> = members.iter().filter(|m| m.live).collect();
        let pids: HashSet<i32> = live.iter().map(|m| m.pid).collect();
        let list = live
            .iter()
            .map(|m| ProcEntry {
                pid: m.pid.cast_unsigned(),
                ppid: pids.contains(&m.ppid).then_some(m.ppid.cast_unsigned()),
                name: m.name.clone(),
            })
            .collect();
        out.push(Msg::Processes { req, id, list });
    }

    /// Last resort at the supervisor's exit bound: SIGKILL to every tree not confirmed gone. False when the
    /// inventory was incomplete, so members outside the roots' groups may have been missed.
    pub(super) fn kill_all(&mut self) -> bool {
        let sids: HashSet<i32> = self.map.values().filter(|t| !t.gone).map(|t| t.pid).collect();
        let inventory = self.inventory(&sids, false);
        let mut tx = Signals {
            pidfd: self.pidfd,
            reserve: &mut self.reserve,
        };
        for t in self.map.values().filter(|t| !t.gone) {
            let members = inventory
                .as_ref()
                .map(|inv| inv.members.get(&t.pid).map(Vec::as_slice).unwrap_or_default());
            kill_session(t.pid, members, &mut tx);
        }
        inventory.is_some()
    }

    /// One inventory; if it is incomplete (e.g. EMFILE), once more with the descriptor reserve released.
    fn inventory(&mut self, sids: &HashSet<i32>, names: bool) -> Option<Inventory> {
        procs::scan(sids, names).or_else(|| {
            if self.reserve.release() {
                procs::scan(sids, names)
            } else {
                None
            }
        })
    }
}

fn needs_scan(t: &Tree) -> bool {
    !t.gone && (t.exit.is_some() || t.stop.is_some())
}

/// Positive control on every scan: a root that has not exited must show up in its own session, or as being
/// torn down. If it does not, it may have just exited (macOS hides zombies); otherwise the inventory cannot
/// be trusted.
fn root_accounted(t: &mut Tree, members: &[Member], exiting: &[Exiting]) -> bool {
    if t.exit.is_some() || members.iter().any(|m| m.pid == t.pid) || exiting.iter().any(|e| e.pid == t.pid) {
        return true;
    }
    match wait_exit(t.pid) {
        Ok(Some(exit)) => {
            t.exit = Some(exit);
            true
        }
        _ => false,
    }
}

/// The processes being torn down that belong to `t` (pid, pgid): a member at the previous complete scan,
/// or in one of the tree's groups (the root's, or a member's), or a child of the root or of a member.
/// A stranger matched this way only delays the confirmation by its teardown; it is never signalled.
fn dying(t: &Tree, members: &[Member], exiting: &[Exiting]) -> Vec<(i32, i32)> {
    let pids: HashSet<i32> = t
        .known
        .iter()
        .map(|k| k.0)
        .chain(members.iter().map(|m| m.pid))
        .chain([t.pid])
        .collect();
    let groups: HashSet<i32> = t
        .known
        .iter()
        .map(|k| k.1)
        .chain(members.iter().map(|m| m.pgid))
        .chain([t.pid])
        .collect();
    // Declared residue: an orphan already in teardown before the first scan matches nothing here (GUARANTEES.md,
    // "Forced stop after `graceMs`", macOS).
    exiting
        .iter()
        .filter(|e| pids.contains(&e.pid) || groups.contains(&e.pgid) || pids.contains(&e.ppid))
        .map(|e| (e.pid, e.pgid))
        .collect()
}

/// The graceful step: the group once, and every live member of the first complete inventory once (a member
/// whose signal failed is retried). Without a complete inventory the members wait for the next sweep.
fn graceful(root: i32, pty: bool, s: &mut Stopping, members: Option<&[Member]>, tx: &mut Signals<'_>) {
    let sigs: &[i32] = if pty {
        &[libc::SIGHUP, libc::SIGTERM, libc::SIGCONT]
    } else {
        &[libc::SIGTERM, libc::SIGCONT]
    };
    if !s.group_graced {
        s.group_graced = send_all(sigs, |sig| watch::signal_group(root, sig));
    }
    let Some(members) = members else { return };
    let live = |pid: i32| members.iter().any(|m| m.pid == pid && m.live);
    let targets: Vec<i32> = match &s.members_left {
        None => members
            .iter()
            .filter(|m| m.live && m.pid != root)
            .map(|m| m.pid)
            .collect(),
        Some(left) => left.iter().copied().filter(|&p| live(p)).collect(),
    };
    let failed = targets
        .into_iter()
        .filter(|&p| !send_all(sigs, |sig| tx.member(p, root, sig)))
        .collect();
    s.members_left = Some(failed);
}

/// Member signalling with the descriptor reserve at hand: a pidfd and the `/proc` re-check each need a free
/// descriptor, so with the table full the attempt fails with EMFILE; the reserve is then released and the
/// same call (re-check included) tried once more.
struct Signals<'a> {
    pidfd: bool,
    reserve: &'a mut Reserve,
}

impl Signals<'_> {
    fn member(&mut self, pid: i32, root: i32, sig: i32) -> std::io::Result<()> {
        match watch::signal_member(pid, root, sig, self.pidfd) {
            Err(e) if matches!(e.raw_os_error(), Some(libc::EMFILE | libc::ENFILE)) && self.reserve.release() => {
                watch::signal_member(pid, root, sig, self.pidfd)
            }
            r => r,
        }
    }
}

/// Sends every signal even when one fails; true if all were sent.
fn send_all(sigs: &[i32], mut send: impl FnMut(i32) -> std::io::Result<()>) -> bool {
    let mut ok = true;
    for &sig in sigs {
        ok &= send(sig).is_ok();
    }
    ok
}

/// SIGKILL to the root's group and, with a complete inventory, every other live member of its session. A
/// failure (a member we may not signal) is retried by the next sweep; the tree is not confirmed gone while
/// such a member lives.
fn kill_session(root: i32, members: Option<&[Member]>, tx: &mut Signals<'_>) {
    let _ = watch::signal_group(root, libc::SIGKILL);
    for m in members.unwrap_or_default().iter().filter(|m| m.live && m.pid != root) {
        let _ = tx.member(m.pid, root, libc::SIGKILL);
    }
}

/// Reaps the root: from here on its numbers are free and never signalled again.
fn reap(pid: i32) -> bool {
    let mut status = 0;
    loop {
        // SAFETY: `status` is writable; WNOHANG never blocks.
        let r = unsafe { libc::waitpid(pid, &raw mut status, libc::WNOHANG) };
        if r == pid {
            return true;
        }
        match (r, super::sys::errno()) {
            (0, _) => return false,
            (_, libc::EINTR) => continue,
            (_, libc::ECHILD) => return true, // no longer our child: the number is not ours to signal
            _ => return false,
        }
    }
}
