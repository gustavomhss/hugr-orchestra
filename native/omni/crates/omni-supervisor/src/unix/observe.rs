//! Explicit, read-only process observation. The control owner lends the worker a session number and
//! checks it against its tree record again before it replies.

use std::collections::HashSet;
use std::sync::mpsc::{Receiver, sync_channel};
use std::thread::{Builder, JoinHandle};
use std::time::{Duration, Instant};

use omni_proto::{Ack, Msg, ProcEntry};

use super::procs::{self, Inventory};
use super::sweep::{live_entries, root_seen};
use super::trees::Trees;

const POLL: Duration = Duration::from_millis(15);
const MAX_MEMBERS: usize = 256;
const MAX_NAME_BYTES: usize = 1024;

#[derive(Default)]
pub(super) struct Observation(Option<Pending>);

struct Pending {
    req: u64,
    id: u64,
    pid: i32,
    footprint: bool,
    worker: JoinHandle<()>,
    result: Receiver<Option<Sample>>,
}

struct Sample {
    root_seen: bool,
    list: Vec<ProcEntry>,
    footprint: Option<(u64, String)>,
}

impl Observation {
    pub(super) fn pending(&self) -> bool {
        self.0.is_some()
    }

    pub(super) fn next_wake(&self, now: Instant) -> Option<Instant> {
        self.pending().then_some(now + POLL)
    }

    /// Starts one worker, or returns an immediate reply if an inventory cannot or need not be taken.
    pub(super) fn start(&mut self, req: u64, id: u64, trees: &Trees) -> Option<Msg> {
        self.start_with(req, id, trees, false)
    }

    pub(super) fn start_with(&mut self, req: u64, id: u64, trees: &Trees, footprint: bool) -> Option<Msg> {
        let Some(t) = trees.map.get(&id).filter(|t| !t.released) else {
            return Some(ack(req, id, Ack::Unknown));
        };
        if t.gone {
            return Some(empty_with(req, id, footprint));
        }
        if self.pending() {
            return Some(ack(req, id, Ack::Error));
        }
        let pid = t.pid;
        let known = match footprint {
            true => t.known.clone(),
            false => Vec::new(),
        };
        let (send, result) = sync_channel(1);
        let worker = Builder::new().name("omni-observe".into()).spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(2);
            let _ = send.try_send(scan(pid, footprint, &known, deadline));
        });
        let Ok(worker) = worker else {
            return Some(ack(req, id, Ack::Error));
        };
        self.0 = Some(Pending {
            req,
            id,
            pid,
            worker,
            footprint,
            result,
        });
        None
    }

    pub(super) fn poll(&mut self, trees: &Trees) -> Option<Msg> {
        // Hold admission until the worker finishes. Neither the event loop nor shutdown joins it.
        let p = self.0.take_if(|p| p.worker.is_finished())?;
        let sample = p.result.try_recv().ok().flatten();
        Some(complete_with(p.req, p.id, p.pid, trees, sample, p.footprint))
    }
}

fn scan(pid: i32, footprint: bool, known: &[(i32, i32)], deadline: Instant) -> Option<Sample> {
    // Keep SIGCHLD on the control thread even if the scan stalls.
    if !block_sigchld() || !isolate_fds() {
        return None;
    }
    // The client gives up at 2s. Stop walking pids then, so the observe slot is not held by a dead waiter.
    let inventory = procs::scan_until(&HashSet::from([pid]), true, Some(deadline))?;
    let mut sample = project(pid, &inventory)?;
    if footprint {
        sample.footprint = super::footprint::sample(pid, &inventory, known);
    }
    Some(sample)
}

fn project(pid: i32, inventory: &Inventory) -> Option<Sample> {
    let members = inventory.members.get(&pid).map(Vec::as_slice).unwrap_or_default();
    // Refuse the entire sample if a complete reply would exceed the control owner's bound.
    if members.len() > MAX_MEMBERS
        || members
            .iter()
            .any(|m| m.name.as_ref().is_some_and(|name| name.len() > MAX_NAME_BYTES))
    {
        return None;
    }
    Some(Sample {
        root_seen: root_seen(pid, members, &inventory.exiting),
        list: live_entries(members),
        footprint: None,
    })
}

#[cfg(test)]
fn complete(req: u64, id: u64, pid: i32, trees: &Trees, sample: Option<Sample>) -> Msg {
    complete_with(req, id, pid, trees, sample, false)
}

fn complete_with(req: u64, id: u64, pid: i32, trees: &Trees, sample: Option<Sample>, footprint: bool) -> Msg {
    let Some(t) = trees.map.get(&id).filter(|t| !t.released && t.pid == pid) else {
        return ack(req, id, Ack::Unknown);
    };
    // Once gone the root may be reaped and its PID reused during the scan.
    if t.gone {
        return empty_with(req, id, footprint);
    }
    match sample {
        Some(sample) if (sample.root_seen || t.exit.is_some()) && footprint => {
            let (footprint, identity) = sample
                .footprint
                .map_or((None, None), |(bytes, id)| (Some(bytes), Some(id)));
            Msg::ObservedTree {
                req,
                id,
                list: sample.list,
                footprint,
                identity,
            }
        }
        Some(sample) if sample.root_seen || t.exit.is_some() => Msg::Processes {
            req,
            id,
            list: sample.list,
        },
        _ => ack(req, id, Ack::Error),
    }
}

fn ack(req: u64, id: u64, result: Ack) -> Msg {
    Msg::Ack { req, id, result }
}

fn empty(req: u64, id: u64) -> Msg {
    Msg::Processes {
        req,
        id,
        list: Vec::new(),
    }
}

fn empty_with(req: u64, id: u64, footprint: bool) -> Msg {
    if footprint {
        return Msg::ObservedTree {
            req,
            id,
            list: Vec::new(),
            footprint: None,
            identity: None,
        };
    }
    empty(req, id)
}

fn block_sigchld() -> bool {
    // SAFETY: sigset_t is plain old data. The calls use a live mask and change only this thread.
    unsafe {
        let mut mask: libc::sigset_t = std::mem::zeroed();
        libc::sigemptyset(&raw mut mask) == 0
            && libc::sigaddset(&raw mut mask, libc::SIGCHLD) == 0
            && libc::pthread_sigmask(libc::SIG_BLOCK, &raw const mask, std::ptr::null_mut()) == 0
    }
}

#[cfg(target_os = "linux")]
fn isolate_fds() -> bool {
    // SAFETY: close_range takes only integers. UNSHARE makes the caller's table private before
    // closing its entries, so the scan neither holds nor competes for any control descriptor.
    unsafe {
        libc::syscall(
            libc::SYS_close_range,
            0u32,
            libc::c_uint::MAX,
            libc::CLOSE_RANGE_UNSHARE,
        ) == 0
    }
}

#[cfg(target_os = "macos")]
fn isolate_fds() -> bool {
    // The macOS scan uses proc APIs without opening any descriptors.
    true
}

#[cfg(test)]
mod tests;
