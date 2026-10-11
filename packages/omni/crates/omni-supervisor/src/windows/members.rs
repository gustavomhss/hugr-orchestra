//! Every process that ever joined a tree's Job, so that a tree is reported gone only once each one is proven
//! gone (ADR-0005 R3). Two reasons a count or a poll is not enough: the Job's live count drops a moment
//! before a terminated process is signalled, and a process can start and end between two polls. So members
//! are recorded as they start, from the Job's completion port (`JOB_OBJECT_MSG_NEW_PROCESS`), plus every pid
//! a poll lists; once the Job is empty, a marker posted to the port flushes the notifications still queued,
//! and then each recorded pid is probed. The proof is bounded by `Tree::settle` (1 s after the Job emptied).

use std::collections::{HashMap, HashSet};
use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrNull, OwnedHandle};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
use windows_sys::Win32::System::IO::{
    CreateIoCompletionPort, GetQueuedCompletionStatus, OVERLAPPED, PostQueuedCompletionStatus,
};
use windows_sys::Win32::System::JobObjects::{
    JOBOBJECT_ASSOCIATE_COMPLETION_PORT, JobObjectAssociateCompletionPortInformation, SetInformationJobObject,
};
use windows_sys::Win32::System::Threading::INFINITE;

use super::channel;
use super::job::{self, Probe};
use super::queues::{Event, Inbox};

/// winnt.h message ids (their constants live in a windows-sys feature this crate does not enable).
const MSG_ACTIVE_PROCESS_ZERO: u32 = 4;
const MSG_NEW_PROCESS: u32 = 6;
/// Completion key of a flush marker (tree ids never reach it); the tree id travels as the "overlapped" value.
const MARKER: usize = usize::MAX;
/// A record is swept of pids already gone each time it doubles past this, so it stays near the live count.
const SWEEP_FROM: usize = 256;

#[derive(Default, PartialEq)]
enum Flush {
    #[default]
    NotPosted,
    Posted,
    Seen,
}

#[derive(Default)]
struct Record {
    pids: HashSet<u32>,
    /// NEW_PROCESS notifications received, kept across sweeps: reconciled with the Job's `TotalProcesses`.
    notified: u64,
    sweep_at: usize,
    flush: Flush,
}

/// The outcome of a proof attempt, with the reason when it is not `Gone`.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Proof {
    /// Every member ever recorded is gone.
    Gone,
    /// Not yet: a member is still exiting, or the flush is in flight.
    Pending(String),
    /// Something could not be checked; never taken for gone by itself.
    Unknown(String),
}

pub(super) struct Members {
    port: OwnedHandle,
    records: Mutex<HashMap<u64, Record>>,
    /// A pid whose probe reports Unknown (stands in for a member that denies SYNCHRONIZE).
    #[cfg(test)]
    blind: Mutex<Option<u32>>,
    /// Drops the next NEW_PROCESS notification (stands in for one Windows did not deliver).
    #[cfg(test)]
    suppress: std::sync::atomic::AtomicBool,
}

impl Members {
    /// The port and its reader thread, which also wakes the owner (`Event::Settle`) when a Job empties or
    /// a flush marker returns.
    pub(super) fn start(inbox: &Arc<Inbox>) -> io::Result<Arc<Members>> {
        // SAFETY: a new port, not associated with any file; checked for null.
        let port = unsafe { CreateIoCompletionPort(INVALID_HANDLE_VALUE, std::ptr::null_mut(), 0, 1) };
        // SAFETY: `port` is null or a fresh handle owned by nobody else.
        let port = OwnedHandle::try_from(unsafe { HandleOrNull::from_raw_handle(port) })
            .map_err(|_| io::Error::last_os_error())?;
        let members = Arc::new(Members {
            port,
            records: Mutex::default(),
            #[cfg(test)]
            blind: Mutex::default(),
            #[cfg(test)]
            suppress: std::sync::atomic::AtomicBool::new(false),
        });
        let (m, inbox) = (members.clone(), inbox.clone());
        channel::helper("job-port", move || m.serve(&inbox))?;
        Ok(members)
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<u64, Record>> {
        self.records.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Records tree `id`'s Job from now on: call before any process exists in it.
    pub(super) fn watch(&self, id: u64, job: &OwnedHandle) -> io::Result<()> {
        self.lock().insert(id, Record::default());
        let info = JOBOBJECT_ASSOCIATE_COMPLETION_PORT {
            CompletionKey: id as usize as *mut core::ffi::c_void,
            CompletionPort: self.port.as_raw_handle(),
        };
        // SAFETY: the structure this information class expects, with its exact size.
        let ok = unsafe {
            SetInformationJobObject(
                job.as_raw_handle(),
                JobObjectAssociateCompletionPortInformation,
                (&raw const info).cast(),
                size_of::<JOBOBJECT_ASSOCIATE_COMPLETION_PORT>() as u32,
            )
        };
        if ok == 0 {
            self.forget(id);
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    pub(super) fn forget(&self, id: u64) {
        self.lock().remove(&id);
    }

    /// The pids recorded for `id`.
    #[cfg(test)]
    pub(super) fn recorded(&self, id: u64) -> HashSet<u32> {
        self.lock().get(&id).map(|r| r.pids.clone()).unwrap_or_default()
    }

    /// Records `pid` for `id` as the port would.
    #[cfg(test)]
    pub(super) fn insert(&self, id: u64, pid: u32) {
        if let Some(r) = self.lock().get_mut(&id) {
            r.pids.insert(pid);
        }
    }

    /// The next NEW_PROCESS notification is lost.
    #[cfg(test)]
    pub(super) fn suppress_next(&self) {
        self.suppress.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    /// From now on the probe of `pid` reports Unknown.
    #[cfg(test)]
    pub(super) fn blind(&self, pid: u32) {
        *self.blind.lock().unwrap_or_else(PoisonError::into_inner) = Some(pid);
    }

    /// Call only once the Job is empty. First flushes the port (everything queued before the marker was
    /// posted while members existed), then reconciles the notifications received with the Job's own count of
    /// processes (a lost notification makes the proof Unknown), then probes every pid recorded, and every pid
    /// the Job still lists.
    pub(super) fn prove(&self, id: u64, job: &OwnedHandle) -> Proof {
        {
            let mut records = self.lock();
            let Some(rec) = records.get_mut(&id) else {
                return Proof::Unknown("the tree has no member record".into());
            };
            match rec.flush {
                Flush::Seen => {}
                Flush::Posted => return Proof::Pending("the completion port is not flushed yet".into()),
                Flush::NotPosted => {
                    // SAFETY: a valid port; the packet carries plain integers, no OVERLAPPED is dereferenced.
                    let posted = unsafe {
                        PostQueuedCompletionStatus(
                            self.port.as_raw_handle(),
                            0,
                            MARKER,
                            id as usize as *const OVERLAPPED,
                        )
                    };
                    if posted == 0 {
                        return Proof::Unknown(format!("flush marker: {}", io::Error::last_os_error()));
                    }
                    rec.flush = Flush::Posted;
                    return Proof::Pending("the completion port is not flushed yet".into());
                }
            }
        }
        let Some((_, total)) = job::counts(job) else {
            return Proof::Unknown("the Job's accounting cannot be read".into());
        };
        let notified = self.lock().get(&id).map_or(0, |r| r.notified);
        if notified != u64::from(total) {
            return Proof::Unknown(format!(
                "lost job notification: {notified} of the Job's {total} processes were reported"
            ));
        }
        let listed = match job::member_pids(job) {
            Ok(listed) => listed,
            Err(e) => return Proof::Unknown(format!("the Job's members cannot be listed: {e}")),
        };
        let pids: Vec<u32> = {
            let mut records = self.lock();
            let Some(rec) = records.get_mut(&id) else {
                return Proof::Unknown("the tree has no member record".into());
            };
            rec.pids.extend(listed);
            rec.pids.iter().copied().collect()
        };
        let mut gone = Vec::new();
        for pid in pids {
            #[cfg(test)]
            if *self.blind.lock().unwrap_or_else(PoisonError::into_inner) == Some(pid) {
                return Proof::Unknown(format!("pid {pid} cannot be inspected (test)"));
            }
            match job::probe(job, pid) {
                Ok(Probe::Gone | Probe::Outside) => gone.push(pid),
                Ok(Probe::Member(h)) if job::exited(&h) => gone.push(pid),
                Ok(Probe::Member(_)) => return Proof::Pending(format!("pid {pid} is still exiting")),
                Err(e) => return Proof::Unknown(format!("pid {pid} cannot be inspected: {e}")),
            }
        }
        if let Some(rec) = self.lock().get_mut(&id) {
            rec.pids.retain(|p| !gone.contains(p));
        }
        Proof::Gone
    }

    /// The port's reader. Notifications for a tree that is not recorded (never, or no longer) are ignored.
    fn serve(&self, inbox: &Inbox) {
        loop {
            let (mut msg, mut key, mut value) = (0u32, 0usize, std::ptr::null_mut::<OVERLAPPED>());
            // SAFETY: a valid port and valid out pointers; job and marker packets carry plain integers.
            let ok = unsafe {
                GetQueuedCompletionStatus(self.port.as_raw_handle(), &mut msg, &mut key, &mut value, INFINITE)
            };
            if ok == 0 {
                return; // the port is gone: proofs stay pending, and `Tree::settle`'s bound answers the Stops
            }
            let (id, pid) = if key == MARKER {
                (value as usize as u64, 0)
            } else {
                (key as u64, value as usize as u32)
            };
            let mut records = self.lock();
            let Some(rec) = records.get_mut(&id) else { continue };
            match (key == MARKER, msg) {
                (true, _) => rec.flush = Flush::Seen,
                (false, MSG_NEW_PROCESS) => {
                    #[cfg(test)]
                    if self.suppress.swap(false, std::sync::atomic::Ordering::SeqCst) {
                        continue;
                    }
                    rec.notified += 1;
                    rec.pids.insert(pid);
                    if rec.pids.len() > rec.sweep_at.max(SWEEP_FROM) {
                        rec.pids.retain(|&p| !job::certainly_gone(p));
                        rec.sweep_at = 2 * rec.pids.len();
                    }
                    continue;
                }
                (false, MSG_ACTIVE_PROCESS_ZERO) => {}
                _ => continue,
            }
            drop(records);
            inbox.event(Event::Settle { id });
        }
    }
}
