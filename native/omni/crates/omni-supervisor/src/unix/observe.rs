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
        let (pid, known) = (t.pid, footprint.then(|| t.known.clone()).unwrap_or_default());
        let (send, result) = sync_channel(1);
        let worker = Builder::new().name("omni-observe".into()).spawn(move || {
            let _ = send.try_send(scan(pid, footprint, &known));
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

fn scan(pid: i32, footprint: bool, known: &[(i32, i32)]) -> Option<Sample> {
    // Keep SIGCHLD on the control thread even if the scan stalls.
    if !block_sigchld() || !isolate_fds() {
        return None;
    }
    let inventory = procs::scan(&HashSet::from([pid]), true)?;
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
mod tests {
    use omni_proto::{Exit, ProcEntry};

    use super::{
        Ack, Duration, Inventory, MAX_MEMBERS, MAX_NAME_BYTES, Msg, Observation, Pending, Trees, ack, complete, empty,
        project, sync_channel,
    };
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
            footprint: false,
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
        let inventory = Inventory {
            members: [(ROOT, vec![member(ROOT, 1, true)])].into(),
            exiting: Vec::new(),
        };
        let sample = || project(ROOT, &inventory);
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
        assert_eq!(
            complete(2, id, ROOT, &trees, project(ROOT, &inventory)),
            ack(2, id, Ack::Error)
        );

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
            complete(3, id, ROOT, &trees, project(ROOT, &sample(member(ROOT, 1, false)))),
            Msg::Processes {
                req: 3,
                id,
                list: vec![expected_child.clone()],
            }
        );
        assert_eq!(
            complete(4, id, ROOT, &trees, project(ROOT, &sample(member(ROOT, 1, true)))),
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
            complete(5, id, ROOT, &trees, project(ROOT, &inventory)),
            Msg::Processes {
                req: 5,
                id,
                list: vec![expected_child.clone()],
            }
        );
        inventory.exiting.clear();
        trees.map.entry(id).and_modify(|t| t.exit = Some(Exit::Code(0)));
        assert_eq!(
            complete(6, id, ROOT, &trees, project(ROOT, &inventory)),
            Msg::Processes {
                req: 6,
                id,
                list: vec![expected_child],
            }
        );
    }

    #[test]
    fn rejects_oversized_samples_instead_of_truncating() {
        let mut inventory = Inventory {
            members: [(ROOT, vec![member(ROOT, 1, false); MAX_MEMBERS])].into(),
            exiting: Vec::new(),
        };
        assert!(project(ROOT, &inventory).is_some());
        inventory
            .members
            .entry(ROOT)
            .or_default()
            .push(member(CHILD, ROOT, true));
        assert!(project(ROOT, &inventory).is_none());

        let mut root = member(ROOT, 1, true);
        root.name = Some("é".repeat(MAX_NAME_BYTES / 2));
        inventory.members.insert(ROOT, vec![root.clone()]);
        assert!(project(ROOT, &inventory).is_some());
        root.name = Some("é".repeat(MAX_NAME_BYTES / 2 + 1));
        inventory.members.insert(ROOT, vec![root]);
        assert!(project(ROOT, &inventory).is_none());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn worker_fd_table_is_private() -> std::io::Result<()> {
        use std::os::fd::AsRawFd;
        use std::process::Command;

        const PROBE: &str = "HUGR_OMNI_OBSERVE_FD_PROBE";
        if std::env::var_os(PROBE).is_none() {
            // A regression in the close flags can only close descriptors in this disposable probe.
            let output = Command::new(std::env::current_exe()?)
                .args(["--exact", "unix::observe::tests::worker_fd_table_is_private"])
                .env(PROBE, "1")
                .output()?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            assert!(output.status.success() && stdout.contains("1 passed"), "{stdout}");
            return Ok(());
        }
        let (marker, _write) = crate::unix::sys::pipe()?;
        let fd = marker.as_raw_fd();
        // SAFETY: F_GETFD only queries the calling thread's descriptor table.
        let is_open = move || unsafe { libc::fcntl(fd, libc::F_GETFD) } >= 0;
        assert!(is_open());
        let worker = std::thread::spawn(move || super::isolate_fds() && !is_open());
        assert_eq!(worker.join().ok(), Some(true));
        assert!(is_open());
        Ok(())
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
