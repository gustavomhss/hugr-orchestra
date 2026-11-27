//! Explicit, read-only process observation. The control owner lends the worker a session number and
//! checks it against its tree record again before it replies.

use std::collections::HashSet;
use std::sync::mpsc::{Receiver, sync_channel};
use std::thread::{Builder, JoinHandle};
use std::time::{Duration, Instant};

use omni_proto::{Ack, Msg};

use super::procs::{self, Inventory};
use super::sweep::{live_entries, root_visible};
use super::trees::Trees;

const POLL: Duration = Duration::from_millis(15);

#[derive(Default)]
pub(super) struct Observation(Option<Pending>);

struct Pending {
    req: u64,
    id: u64,
    pid: i32,
    worker: JoinHandle<()>,
    result: Receiver<Option<Inventory>>,
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
        let Some(t) = trees.map.get(&id).filter(|t| !t.released) else {
            return Some(ack(req, id, Ack::Unknown));
        };
        if t.gone {
            return Some(empty(req, id));
        }
        if self.pending() {
            return Some(ack(req, id, Ack::Error));
        }
        let pid = t.pid;
        let (send, result) = sync_channel(1);
        let worker = Builder::new().name("omni-observe".into()).spawn(move || {
            // The control thread gets SIGCHLD even while this scan stalls in a syscall.
            let inventory = block_sigchld()
                .then(|| procs::scan(&HashSet::from([pid]), true))
                .flatten();
            let _ = send.try_send(inventory);
        });
        let Ok(worker) = worker else {
            return Some(ack(req, id, Ack::Error));
        };
        self.0 = Some(Pending {
            req,
            id,
            pid,
            worker,
            result,
        });
        None
    }

    pub(super) fn poll(&mut self, trees: &Trees) -> Option<Msg> {
        // Hold admission until the worker finishes. Neither the event loop nor shutdown joins it.
        let p = self.0.take_if(|p| p.worker.is_finished())?;
        let inventory = p.result.try_recv().ok().flatten();
        Some(complete(p.req, p.id, p.pid, trees, inventory))
    }
}

fn complete(req: u64, id: u64, pid: i32, trees: &Trees, inventory: Option<Inventory>) -> Msg {
    let Some(t) = trees.map.get(&id).filter(|t| !t.released && t.pid == pid) else {
        return ack(req, id, Ack::Unknown);
    };
    // Once gone the root may be reaped and its PID reused during the scan.
    if t.gone {
        return empty(req, id);
    }
    let Some(inventory) = inventory else {
        return ack(req, id, Ack::Error);
    };
    let members = inventory.members.get(&pid).map(Vec::as_slice).unwrap_or_default();
    if !root_visible(t, members, &inventory.exiting) {
        return ack(req, id, Ack::Error);
    }
    Msg::Processes {
        req,
        id,
        list: live_entries(members),
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

fn block_sigchld() -> bool {
    // SAFETY: sigset_t is plain old data. The calls use a live mask and change only this thread.
    unsafe {
        let mut mask: libc::sigset_t = std::mem::zeroed();
        libc::sigemptyset(&raw mut mask) == 0
            && libc::sigaddset(&raw mut mask, libc::SIGCHLD) == 0
            && libc::pthread_sigmask(libc::SIG_BLOCK, &raw const mask, std::ptr::null_mut()) == 0
    }
}

#[cfg(test)]
mod tests {
    use omni_proto::{Exit, ProcEntry};

    use super::{Ack, Duration, Inventory, Msg, Observation, Pending, Trees, ack, complete, empty, sync_channel};
    use crate::unix::procs::{Exiting, Member};
    use crate::unix::trees::Exec;

    const ROOT: i32 = 100;
    const CHILD: i32 = ROOT + 1;

    #[test]
    fn stalled_worker_keeps_its_slot_without_blocking_the_owner() {
        let mut trees = Trees::new(false);
        let id = trees.insert(ROOT, None, 0, Exec::Running);
        let (release, stalled) = sync_channel::<()>(0);
        let (send, result) = sync_channel(1);
        let worker = std::thread::spawn(move || {
            let _ = stalled.recv_timeout(Duration::from_secs(5));
            let _ = send.try_send(None);
        });
        let mut observation = Observation(Some(Pending {
            req: 1,
            id,
            pid: ROOT,
            worker,
            result,
        }));
        assert!(observation.poll(&trees).is_none());
        assert_eq!(observation.start(2, id, &trees), Some(ack(2, id, Ack::Error)));
        assert_eq!(observation.start(3, 0, &trees), Some(ack(3, 0, Ack::Unknown)));
        let gone = trees.insert(CHILD, None, 0, Exec::Running);
        trees.map.entry(gone).and_modify(|t| t.gone = true);
        assert_eq!(observation.start(4, gone, &trees), Some(empty(4, gone)));
        drop(release);
    }

    #[test]
    fn validates_current_ownership_before_publishing_inventory() {
        let mut trees = Trees::new(false);
        let id = trees.insert(ROOT, None, 0, Exec::Running);
        let sample = || {
            let mut inventory = Inventory::default();
            inventory.members.insert(ROOT, vec![member(ROOT, 1, true)]);
            Some(inventory)
        };
        assert_eq!(complete(1, id, CHILD, &trees, sample()), ack(1, id, Ack::Unknown));
        trees.map.entry(id).and_modify(|t| t.gone = true);
        assert_eq!(complete(2, id, ROOT, &trees, sample()), empty(2, id));
        trees.release(3, id, &mut Vec::new());
        assert_eq!(complete(4, id, ROOT, &trees, sample()), ack(4, id, Ack::Unknown));
    }

    #[test]
    fn requires_complete_root_accounting_and_reports_only_live_members() {
        let mut trees = Trees::new(false);
        let id = trees.insert(ROOT, None, 0, Exec::Running);
        assert_eq!(complete(1, id, ROOT, &trees, None), ack(1, id, Ack::Error));
        let mut inventory = Inventory::default();
        inventory.members.insert(ROOT, vec![member(CHILD, ROOT, true)]);
        assert_eq!(complete(2, id, ROOT, &trees, Some(inventory)), ack(2, id, Ack::Error));

        let expected_child = ProcEntry {
            pid: CHILD.cast_unsigned(),
            ppid: None,
            name: Some("fixture".into()),
        };
        let sample = |root: Member| Inventory {
            members: [(ROOT, vec![root, member(CHILD, ROOT, true)])].into(),
            exiting: Vec::new(),
        };
        assert_eq!(
            complete(3, id, ROOT, &trees, Some(sample(member(ROOT, 1, false)))),
            Msg::Processes {
                req: 3,
                id,
                list: vec![expected_child.clone()],
            }
        );
        assert_eq!(
            complete(4, id, ROOT, &trees, Some(sample(member(ROOT, 1, true)))),
            Msg::Processes {
                req: 4,
                id,
                list: vec![
                    ProcEntry {
                        pid: ROOT.cast_unsigned(),
                        ppid: None,
                        name: Some("fixture".into()),
                    },
                    ProcEntry {
                        ppid: Some(ROOT.cast_unsigned()),
                        ..expected_child.clone()
                    },
                ],
            }
        );
        let mut inventory = Inventory {
            members: [(ROOT, vec![member(CHILD, ROOT, true)])].into(),
            exiting: vec![Exiting {
                pid: ROOT,
                pgid: ROOT,
                ppid: 1,
            }],
        };
        assert_eq!(
            complete(
                5,
                id,
                ROOT,
                &trees,
                Some(Inventory {
                    members: inventory.members.clone(),
                    exiting: inventory.exiting.clone(),
                })
            ),
            Msg::Processes {
                req: 5,
                id,
                list: vec![expected_child.clone()],
            }
        );
        inventory.exiting.clear();
        trees.map.entry(id).and_modify(|t| t.exit = Some(Exit::Code(0)));
        assert_eq!(
            complete(6, id, ROOT, &trees, Some(inventory)),
            Msg::Processes {
                req: 6,
                id,
                list: vec![expected_child],
            }
        );
    }

    fn member(pid: i32, ppid: i32, live: bool) -> Member {
        Member {
            pid,
            ppid,
            pgid: ROOT,
            live,
            name: Some("fixture".into()),
        }
    }
}
