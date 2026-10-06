//! Whose is a live process: decided from what the OS showed during the run, on positive evidence only. A process is
//! **proven** a task's when an identity or a relation observed by the oracle ties it to the task; it is
//! **incomplete** when it points at the task's roots through a link nobody observed (the root had exited and its pid
//! could have been reused): counted apart and never killed; otherwise it is **not ours**: neither counted nor killed.

use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::{Probe, Proc, STAMP, Victim};

/// What one check found for one task.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct Found {
    /// The task's live processes, proven: counted (K1) and killed.
    pub proven: Vec<u32>,
    /// Live processes tied to the task's roots by an unobserved link: counted apart, never killed.
    pub incomplete: Vec<u32>,
    /// Windows, last check of a batch: live processes proven to descend from omni's supervisor during the batch
    /// whose task cannot be told (`run()` does not tell a root's pid): counted (K1) and killed.
    pub batch: Vec<u32>,
}

/// The processes that are neither ever counted: the host (the process using the library), the asking process, and
/// the host's supervisor (its child named `hugr-omni-supervisor`).
#[derive(Debug, Clone, Copy)]
pub struct Who {
    pub host: u32,
    pub me: u32,
}

pub fn supervisor(snap: &[Proc], host: u32) -> Option<&Proc> {
    snap.iter()
        .find(|p| p.ppid == host && p.name.starts_with("hugr-omni-sup"))
}

/// Unix, one snapshot: proven = the task's marker in the environment (the only evidence that a process is the task's,
/// its roots included: a pid alone is not); the group of a marked process; a child of a proven process. Incomplete =
/// in the group named by one of the task's root pids, with no proven member to vouch for it, unless that group's
/// leader is alive and marked as another task's (a pid reused by another root). The host's and the asker's groups are
/// never taken.
pub fn unix(snap: &[Proc], probe: &Probe, who: Who) -> Found {
    let sup = supervisor(snap, who.host).map(|p| p.pid);
    let own: BTreeSet<u32> = snap
        .iter()
        .filter(|p| p.pid == who.host || p.pid == who.me)
        .map(|p| p.pgid)
        .chain([0, 1])
        .collect();
    let marked = |p: &Proc| p.tag.as_deref() == Some(probe.tag.as_str());
    let groups: BTreeSet<u32> = snap
        .iter()
        .filter(|p| marked(p))
        .map(|p| p.pgid)
        .filter(|g| !own.contains(g))
        .collect();
    let mut proven: BTreeSet<u32> = snap
        .iter()
        .filter(|p| marked(p) || groups.contains(&p.pgid))
        .map(|p| p.pid)
        .collect();
    children(snap, &mut proven, &BTreeSet::new());
    let others = |g: u32| {
        snap.iter()
            .any(|p| p.pid == g && p.tag.as_deref().is_some_and(|t| t != probe.tag))
    };
    let root_group = |g: u32| probe.roots.iter().any(|r| r.pid == g) && !own.contains(&g) && !others(g);
    let mut incomplete: BTreeSet<u32> = snap
        .iter()
        .filter(|p| root_group(p.pgid) && !proven.contains(&p.pid))
        .map(|p| p.pid)
        .collect();
    children(snap, &mut incomplete, &proven);
    finish(proven, incomplete, BTreeSet::new(), who, sup)
}

/// Adds to `set` (repeatedly) every process not in `except` whose parent is in it. The snapshot is not atomic, so a parent's pid may already belong
/// to a newer process: a child only counts when its parent is listed and was not created after it.
fn children(snap: &[Proc], set: &mut BTreeSet<u32>, except: &BTreeSet<u32>) {
    let born = |pid: u32| snap.iter().find(|p| p.pid == pid).map(|p| p.created);
    loop {
        let more: Vec<u32> = snap
            .iter()
            .filter(|p| set.contains(&p.ppid) && !set.contains(&p.pid) && !except.contains(&p.pid))
            .filter(|p| born(p.ppid).is_some_and(|parent| parent <= p.created))
            .map(|p| p.pid)
            .collect();
        if more.is_empty() {
            return;
        }
        set.extend(more);
    }
}

/// The kill evidence of each of `pids` as `snap` shows it (`Victim::via`): up its parents (a parent listed, never
/// younger than its child), each one also in `pids`, to a process that is `strong` evidence itself, or one step onto
/// an `anchor` (Windows: the runner or its supervisor). A walk that ends anywhere else has no evidence to kill on.
pub fn victims(
    snap: &[Proc],
    pids: &[u32],
    strong: &dyn Fn(&Proc) -> bool,
    anchor: &dyn Fn(&Proc) -> bool,
) -> Vec<Victim> {
    let parent = |p: &Proc| snap.iter().find(|q| q.pid == p.ppid && q.created <= p.created);
    let via = |p: &Proc| {
        let (mut cur, mut via) = (p, Vec::new());
        while via.len() <= snap.len() {
            if strong(cur) {
                return Some(via);
            }
            let up = parent(cur)?;
            via.push(up.clone());
            if anchor(up) {
                return Some(via);
            }
            if !pids.contains(&up.pid) && !strong(up) {
                return None;
            }
            cur = up;
        }
        None
    };
    snap.iter()
        .filter(|p| pids.contains(&p.pid))
        .map(|p| Victim {
            proc: p.clone(),
            via: via(p),
        })
        .collect()
}

fn finish(proven: BTreeSet<u32>, incomplete: BTreeSet<u32>, batch: BTreeSet<u32>, who: Who, sup: Option<u32>) -> Found {
    let keep = |set: BTreeSet<u32>| -> Vec<u32> {
        set.into_iter()
            .filter(|&p| p != who.host && p != who.me && Some(p) != sup)
            .collect()
    };
    Found {
        proven: keep(proven),
        incomplete: keep(incomplete),
        batch: keep(batch),
    }
}

/// A process identity: Windows reuses a pid at once, never a (pid, creation time) pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Id {
    pub pid: u32,
    pub created: u64,
}

impl Id {
    fn of(p: &Proc) -> Id {
        Id {
            pid: p.pid,
            created: p.created,
        }
    }
}

#[derive(Debug, Clone)]
struct Seen {
    ppid: u32,
    /// Its parent, once the two were seen alive in one snapshot (the parent no younger than it).
    parent: Option<Id>,
    /// The start of the last snapshot that listed it alive.
    last_seen: u64,
}

/// Windows: every process created since the host was about to be spawned, as observed snapshot after snapshot; the
/// host's identity, pinned the first time it is seen (the orchestrator holds the runner's handle then, so that pid is
/// the runner's); and the host and the supervisors seen as its children alongside it (what a runner's leftovers are
/// traced to once it has ended). A later process that merely has the host's pid is never the host.
#[derive(Debug, Default)]
pub struct History {
    seen: HashMap<Id, Seen>,
    by_pid: HashMap<u32, Vec<Id>>,
    host: Option<Id>,
    anchors: HashSet<Id>,
}

impl History {
    /// Records `snap`, taken from `at` on, keeping the processes created from `start` on.
    pub fn record(&mut self, snap: &[Proc], start: u64, at: u64, host: u32) {
        if self.host.is_none() {
            self.host = snap.iter().find(|p| p.pid == host).map(Id::of);
        }
        // Anchors only through the pinned identity, seen alive in this very snapshot.
        if let Some(pinned) = self.host.filter(|h| snap.iter().any(|p| Id::of(p) == *h)) {
            self.anchors.insert(pinned);
            let sup = supervisor(snap, host).filter(|s| s.created >= pinned.created);
            self.anchors.extend(sup.map(Id::of));
        }
        let alive: HashMap<u32, &Proc> = snap.iter().map(|p| (p.pid, p)).collect();
        for p in snap.iter().filter(|p| p.created >= start) {
            let parent = alive.get(&p.ppid).filter(|q| q.created <= p.created).map(|q| Id::of(q));
            let id = Id::of(p);
            let seen = self.seen.entry(id).or_insert_with(|| Seen {
                ppid: p.ppid,
                parent: None,
                last_seen: at,
            });
            seen.parent = seen.parent.or(parent);
            seen.last_seen = seen.last_seen.max(at);
            let ids = self.by_pid.entry(p.pid).or_default();
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }

    /// The pinned host, or a supervisor seen as its child: what a batch or a runner's leftovers are proven through.
    pub fn is_anchor(&self, p: &Proc) -> bool {
        self.anchors.contains(&Id::of(p))
    }

    /// A supervisor of the pinned host (an anchor that is not the host itself).
    fn is_supervisor(&self, id: Id) -> bool {
        Some(id) != self.host && self.anchors.contains(&id)
    }

    /// `id`'s parent: seen with it, or else the process recorded under its parent pid that was alive when `id` was
    /// created (created before it, listed alive after it was born), which no reuse of the pid can fake.
    fn parent(&self, id: Id) -> Option<Id> {
        let seen = self.seen.get(&id)?;
        seen.parent.or_else(|| {
            self.by_pid.get(&seen.ppid)?.iter().copied().find(|cand| {
                cand.created <= id.created && self.seen.get(cand).is_some_and(|s| id.created <= s.last_seen)
            })
        })
    }
}

#[derive(Debug, PartialEq)]
enum Owner {
    Task,
    Batch,
    Incomplete,
    Nobody,
}

/// Windows, one snapshot (already recorded in `hist`): each live process created during the batch is walked up the
/// parent links the history observed. A *root* is a process seen as the host's or its supervisor's child; the walk
/// ends there. Proven = the root is one of the task's (its pid, created within its spawn window). Batch (only on the
/// `last` check) = an omni root (the supervisor's child) that is no root a check of this batch named. Incomplete =
/// the walk ends at a link nobody observed, whose parent pid is one of the task's roots. Anything else is not ours.
pub fn windows(snap: &[Proc], hist: &History, probe: &Probe, last: Option<(u64, &BTreeSet<u32>)>, who: Who) -> Found {
    let host = hist.host;
    let sup = supervisor(snap, who.host)
        .map(Id::of)
        .filter(|s| hist.is_supervisor(*s));
    let since = last
        .map_or(probe.since, |(batch_since, _)| batch_since.min(probe.since))
        .saturating_sub(STAMP);
    let own = probe.since.saturating_sub(STAMP);
    let (mut proven, mut incomplete, mut batch) = (BTreeSet::new(), BTreeSet::new(), BTreeSet::new());
    for p in snap.iter().filter(|p| p.created >= since) {
        let mut cur = Id::of(p);
        let mut owner = Owner::Nobody;
        for _ in 0..=hist.seen.len() {
            let Some(seen) = hist.seen.get(&cur) else { break };
            match hist.parent(cur) {
                Some(par) if Some(par) == host || hist.is_supervisor(par) => {
                    owner = if probe.roots.iter().any(|r| r.is(cur.pid, cur.created)) {
                        Owner::Task
                    } else if hist.is_supervisor(par) && last.is_some_and(|(_, named)| !named.contains(&cur.pid)) {
                        Owner::Batch
                    } else {
                        Owner::Nobody
                    };
                    break;
                }
                Some(par) => cur = par,
                None => {
                    if probe.roots.iter().any(|r| r.pid == seen.ppid) {
                        owner = Owner::Incomplete;
                    }
                    break;
                }
            }
        }
        match owner {
            Owner::Task if p.created >= own => proven.insert(p.pid),
            Owner::Incomplete if p.created >= own => incomplete.insert(p.pid),
            Owner::Batch => batch.insert(p.pid),
            _ => false,
        };
    }
    finish(proven, incomplete, batch, who, sup.map(|s| s.pid))
}

/// After a runner ended, any way: what it left. Unix: a marker starting with `prefix` (every task of the runner has
/// one), the group of such a process (never the asker's), their children. Windows: processes created during the run
/// whose observed parent links lead to the runner or to a supervisor seen as its child. Proven only: these are killed.
pub fn leftovers(snap: &[Proc], hist: &History, prefix: &str, who: Who, windows: bool) -> Vec<u32> {
    let mut found = BTreeSet::new();
    if windows {
        for p in snap {
            let mut cur = Id::of(p);
            for _ in 0..=hist.seen.len() {
                match hist.parent(cur) {
                    Some(par) if hist.anchors.contains(&par) => {
                        found.insert(p.pid);
                        break;
                    }
                    Some(par) => cur = par,
                    None => break,
                }
            }
        }
    } else {
        let own: BTreeSet<u32> = snap
            .iter()
            .filter(|p| p.pid == who.me || p.pid == who.host)
            .map(|p| p.pgid)
            .chain([0, 1])
            .collect();
        let marked = |p: &Proc| p.tag.as_deref().is_some_and(|t| t.starts_with(prefix));
        let groups: BTreeSet<u32> = snap
            .iter()
            .filter(|p| marked(p) && !own.contains(&p.pgid))
            .map(|p| p.pgid)
            .collect();
        found.extend(
            snap.iter()
                .filter(|p| marked(p) || groups.contains(&p.pgid))
                .map(|p| p.pid),
        );
        children(snap, &mut found, &BTreeSet::new());
    }
    let sup = supervisor(snap, who.host).map(|p| p.pid);
    found
        .into_iter()
        .filter(|&p| p != who.host && p != who.me && Some(p) != sup)
        .collect()
}

#[cfg(test)]
pub(super) fn children_for_test(snap: &[Proc], set: &mut BTreeSet<u32>) {
    children(snap, set, &BTreeSet::new());
}
