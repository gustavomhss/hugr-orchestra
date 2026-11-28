//! Selective termination of identities captured by the supervisor from its own Job.
//! Requests are confined to identities pinned from the owning Job.

use std::collections::HashSet;
use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrNull, OwnedHandle};

use windows_sys::Win32::Foundation::{FALSE, WAIT_OBJECT_0};
use windows_sys::Win32::System::JobObjects::IsProcessInJob;
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE, TerminateProcess,
    WaitForSingleObject,
};

use super::{inventory, job};

/// Captured from a supervisor-owned Job snapshot, never from a caller's process number.
#[derive(Clone, Copy, Debug)]
pub(super) struct Member {
    pub pid: u32,
    pub birth: u64,
}

use omni_proto::SelectiveStopOutcome;

/// Read a complete bounded snapshot; any uninspectable or exiting member refuses the list.
pub(super) fn list(job: &OwnedHandle) -> io::Result<Vec<Member>> {
    job::bounded_member_pids(job, 256)?
        .into_iter()
        .map(|pid| {
            let job::Probe::Member(handle) = job::probe(job, pid)? else {
                return Err(io::Error::other("Job member changed during control snapshot"));
            };
            // SAFETY: the process handle is valid and has synchronize access.
            if unsafe { WaitForSingleObject(handle.as_raw_handle(), 0) } != windows_sys::Win32::Foundation::WAIT_TIMEOUT
            {
                return Err(io::Error::other("Job member is not known live"));
            }
            Ok(Member {
                pid,
                birth: inventory::created(&handle)?,
            })
        })
        .collect()
}

/// All members are pinned and admitted before the first effect. A failed admission has no effects.
/// An Unknown outcome must be reconciled by observation, never retried automatically.
pub(super) fn stop(job: &OwnedHandle, selected: &[Member]) -> io::Result<Vec<SelectiveStopOutcome>> {
    if selected.is_empty() || selected.len() > 256 {
        return Err(io::Error::other("invalid selective stop size"));
    }
    let mut seen = HashSet::new();
    if selected.iter().any(|member| !seen.insert(member.pid)) {
        return Err(io::Error::other("duplicate selective stop member"));
    }
    let held = selected
        .iter()
        .map(|member| pin(job, member))
        .collect::<io::Result<Vec<_>>>()?;
    // Issue the entire batch before observing any process. Waiting zero keeps the supervisor responsive;
    // an unsignalled handle or a failed termination has an unknown outcome and must be reconciled.
    let requested: Vec<_> = held
        .iter()
        .map(|process| {
            // SAFETY: every handle has PROCESS_TERMINATE and stays open through observation.
            unsafe { TerminateProcess(process.as_raw_handle(), 1) != 0 }
        })
        .collect();
    Ok(held
        .iter()
        .zip(requested)
        .map(|(process, requested)| {
            // SAFETY: the pinned handle has synchronize access and remains open.
            if requested && unsafe { WaitForSingleObject(process.as_raw_handle(), 0) } == WAIT_OBJECT_0 {
                SelectiveStopOutcome::Exited
            } else {
                SelectiveStopOutcome::Unknown
            }
        })
        .collect())
}

fn pin(job: &OwnedHandle, member: &Member) -> io::Result<OwnedHandle> {
    // SAFETY: opens a non-inheritable handle; the result is checked for null.
    let handle = unsafe {
        OpenProcess(
            PROCESS_TERMINATE | PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
            FALSE,
            member.pid,
        )
    };
    // SAFETY: the handle is null or a fresh process handle.
    let handle = OwnedHandle::try_from(unsafe { HandleOrNull::from_raw_handle(handle) })
        .map_err(|_| io::Error::last_os_error())?;
    let mut inside = 0;
    // SAFETY: both handles and the output pointer are valid.
    if unsafe { IsProcessInJob(handle.as_raw_handle(), job.as_raw_handle(), &mut inside) } == 0 {
        return Err(io::Error::last_os_error());
    }
    if inside == 0 || inventory::created(&handle)? != member.birth {
        return Err(io::Error::other("selective stop identity does not belong to the Job"));
    }
    // A wait failure is also refusal, not proof that the process is live.
    // SAFETY: the pinned handle remains open and grants synchronize access.
    if unsafe { WaitForSingleObject(handle.as_raw_handle(), 0) } != windows_sys::Win32::Foundation::WAIT_TIMEOUT {
        return Err(io::Error::other("selective stop member is not known live"));
    }
    Ok(handle)
}

impl super::Supervisor {
    pub(super) fn control_list(&mut self, req: u64, id: u64) -> omni_proto::Msg {
        let result = self.live(id).map(|tree| {
            if tree.gone || tree.stop.is_some() {
                return Err(io::Error::other("tree is not available for control"));
            }
            list(tree.inventory_job()?)
        });
        match result {
            None => omni_proto::Msg::Ack {
                req,
                id,
                result: omni_proto::Ack::Unknown,
            },
            Some(Err(_)) => omni_proto::Msg::Ack {
                req,
                id,
                result: omni_proto::Ack::Error,
            },
            Some(Ok(members)) => omni_proto::Msg::ControlMembers {
                req,
                id,
                members: members
                    .into_iter()
                    .map(|member| omni_proto::ControlMember {
                        pid: member.pid,
                        birth: member.birth,
                    })
                    .collect(),
            },
        }
    }

    pub(super) fn control_stop(
        &mut self,
        req: u64,
        id: u64,
        members: Vec<omni_proto::ControlMember>,
    ) -> omni_proto::Msg {
        let result = self.live(id).map(|tree| {
            if tree.gone || tree.stop.is_some() {
                return Err(io::Error::other("tree is not available for control"));
            }
            let selected: Vec<_> = members
                .into_iter()
                .map(|member| Member {
                    pid: member.pid,
                    birth: member.birth,
                })
                .collect();
            stop(tree.inventory_job()?, &selected)
        });
        match result {
            None => omni_proto::Msg::Ack {
                req,
                id,
                result: omni_proto::Ack::Unknown,
            },
            Some(Err(_)) => omni_proto::Msg::Ack {
                req,
                id,
                result: omni_proto::Ack::Error,
            },
            Some(Ok(outcomes)) => omni_proto::Msg::ControlResults { req, id, outcomes },
        }
    }
}
