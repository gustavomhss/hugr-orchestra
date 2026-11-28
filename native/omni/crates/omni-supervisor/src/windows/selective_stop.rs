//! Selective termination of identities captured by the supervisor from its own Job.
//! This is an internal primitive; no protocol request accepts these identities yet.

use std::collections::HashSet;
use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrNull, OwnedHandle};

use windows_sys::Win32::Foundation::{FALSE, WAIT_OBJECT_0};
use windows_sys::Win32::System::JobObjects::IsProcessInJob;
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE, TerminateProcess,
    WaitForSingleObject,
};

use super::inventory;

/// Captured from a supervisor-owned Job snapshot, never from a caller's process number.
#[derive(Clone, Copy, Debug)]
pub(super) struct Member {
    pub pid: u32,
    pub birth: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Outcome {
    Exited,
    Unknown,
}

/// All members are pinned and admitted before the first effect. A failed admission has no effects.
/// An Unknown outcome must be reconciled by observation, never retried automatically.
pub(super) fn stop(job: &OwnedHandle, selected: &[Member]) -> io::Result<Vec<Outcome>> {
    if selected.is_empty() || selected.len() > 256 {
        return Err(io::Error::other("invalid selective stop size"));
    }
    let mut seen = HashSet::new();
    if selected.iter().any(|member| !seen.insert(member.pid)) {
        return Err(io::Error::other("duplicate selective stop member"));
    }
    let held = selected.iter().map(|member| pin(job, member)).collect::<io::Result<Vec<_>>>()?;
    Ok(held
        .iter()
        .map(|process| {
            // SAFETY: the handle was opened with PROCESS_TERMINATE and remains held throughout this call.
            if unsafe { TerminateProcess(process.as_raw_handle(), 1) } == 0 {
                return Outcome::Unknown;
            }
            // TerminateProcess is asynchronous; an unsignalled handle is not proof of exit.
            if unsafe { WaitForSingleObject(process.as_raw_handle(), 0) } == WAIT_OBJECT_0 {
                return Outcome::Exited;
            }
            Outcome::Unknown
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
    if unsafe { WaitForSingleObject(handle.as_raw_handle(), 0) } != windows_sys::Win32::Foundation::WAIT_TIMEOUT {
        return Err(io::Error::other("selective stop member is not known live"));
    }
    Ok(handle)
}
