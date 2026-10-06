//! Jobs, the kill unit on Windows: one per tree, `KILL_ON_JOB_CLOSE`, never a breakaway flag, held only by
//! the supervisor (so its death ends every tree). Membership, and what a pid names now (`probe`).

use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrNull, OwnedHandle};

use windows_sys::Win32::Foundation::{ERROR_INVALID_PARAMETER, ERROR_MORE_DATA, FALSE, WAIT_OBJECT_0};
use windows_sys::Win32::System::JobObjects::{
    CreateJobObjectW, IsProcessInJob, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    JOBOBJECT_BASIC_PROCESS_ID_LIST, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectBasicAccountingInformation,
    JobObjectBasicProcessIdList, JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
    TerminateJobObject,
};
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, WaitForSingleObject,
};

/// Exit code of every process ended by a forced stop (like std's `Child::kill`).
const KILLED: u32 = 1;

/// A new anonymous, non-inheritable Job whose last handle closing kills every member.
pub(super) fn create() -> io::Result<OwnedHandle> {
    // SAFETY: null attributes (not inheritable) and no name; the result is checked for null.
    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    // SAFETY: `job` is null or a fresh handle owned by nobody else.
    let job =
        OwnedHandle::try_from(unsafe { HandleOrNull::from_raw_handle(job) }).map_err(|_| io::Error::last_os_error())?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    // Only KILL_ON_JOB_CLOSE: never JOB_OBJECT_LIMIT_BREAKAWAY_OK or SILENT_BREAKAWAY_OK.
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    // SAFETY: `limits` is the structure this information class expects, with its exact size.
    let ok = unsafe {
        SetInformationJobObject(
            job.as_raw_handle(),
            JobObjectExtendedLimitInformation,
            (&raw const limits).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(job)
}

/// Live members, or `None` when the Job cannot be queried (unknown is never taken for empty).
pub(super) fn active(job: &OwnedHandle) -> Option<u32> {
    counts(job).map(|(active, _)| active)
}

/// (live members, every process ever associated with the Job, child Jobs included), or `None`.
pub(super) fn counts(job: &OwnedHandle) -> Option<(u32, u32)> {
    let mut info = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
    // SAFETY: `info` is the structure this information class expects, with its exact size.
    let ok = unsafe {
        QueryInformationJobObject(
            job.as_raw_handle(),
            JobObjectBasicAccountingInformation,
            (&raw mut info).cast(),
            size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
            std::ptr::null_mut(),
        )
    };
    (ok != 0).then_some((info.ActiveProcesses, info.TotalProcesses))
}

/// Forced stop: every member, at once.
pub(super) fn terminate(job: &OwnedHandle) {
    // SAFETY: a valid Job handle. A failure leaves the members alive; `Tree::settle` repeats the pass until
    // the Job is empty.
    unsafe { TerminateJobObject(job.as_raw_handle(), KILLED) };
}

/// The pids the Job lists now. An error means "unknown", never "none".
pub(super) fn member_pids(job: &OwnedHandle) -> io::Result<Vec<u32>> {
    let header = size_of::<JOBOBJECT_BASIC_PROCESS_ID_LIST>() - size_of::<usize>();
    let mut room = 64usize;
    // The Job can grow between the size query and the next call: a few retries, then an error.
    for _ in 0..4 {
        // usize-aligned buffer: the header, then `room` process ids.
        let mut buf = vec![0usize; header.div_ceil(size_of::<usize>()) + room];
        let bytes = u32::try_from(buf.len() * size_of::<usize>()).map_err(io::Error::other)?;
        // SAFETY: `buf` is writable for `bytes` bytes and aligned for the structure.
        let ok = unsafe {
            QueryInformationJobObject(
                job.as_raw_handle(),
                JobObjectBasicProcessIdList,
                buf.as_mut_ptr().cast(),
                bytes,
                std::ptr::null_mut(),
            )
        };
        let err = io::Error::last_os_error();
        // SAFETY: the buffer starts with the structure's header (written by the call, or still zeroed).
        let list = unsafe { &*buf.as_ptr().cast::<JOBOBJECT_BASIC_PROCESS_ID_LIST>() };
        let (assigned, listed) = (
            list.NumberOfAssignedProcesses as usize,
            list.NumberOfProcessIdsInList as usize,
        );
        if ok != 0 && listed == assigned {
            let ids = buf.get(header.div_ceil(size_of::<usize>())..).unwrap_or_default();
            return Ok(ids.iter().take(listed).map(|&p| p as u32).collect());
        }
        if ok == 0 && err.raw_os_error() != Some(ERROR_MORE_DATA as i32) {
            return Err(err);
        }
        room = assigned.max(room) + 16;
    }
    Err(io::Error::other("the Job kept growing while it was listed"))
}

/// What a pid names now, as seen from `job`.
pub(super) enum Probe {
    /// No process has this pid: whatever had it is gone.
    Gone,
    /// The pid names a process outside the Job: it was reused, so the member that had it is gone.
    Outside,
    /// A process of the Job, held open (its pid cannot be reused while the handle lives).
    Member(OwnedHandle),
}

/// Opens `pid` and checks it against `job`. Any other failure is an error: unknown, never gone.
pub(super) fn probe(job: &OwnedHandle, pid: u32) -> io::Result<Probe> {
    let Some(h) = open(pid)? else { return Ok(Probe::Gone) };
    let mut inside = 0;
    // SAFETY: valid process and Job handles and a valid out pointer.
    if unsafe { IsProcessInJob(h.as_raw_handle(), job.as_raw_handle(), &mut inside) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(if inside != 0 { Probe::Member(h) } else { Probe::Outside })
}

/// Whatever had `pid` is certainly gone: no process has it, or the one that has it now has exited (a live
/// process keeps its pid, so an exited holder means the original is gone either way).
pub(super) fn certainly_gone(pid: u32) -> bool {
    match open(pid) {
        Ok(None) => true,
        Ok(Some(h)) => exited(&h),
        Err(_) => false,
    }
}

/// Whether the process has exited (its handle is signalled).
pub(super) fn exited(process: &OwnedHandle) -> bool {
    // SAFETY: a valid process handle; a zero timeout only polls.
    unsafe { WaitForSingleObject(process.as_raw_handle(), 0) == WAIT_OBJECT_0 }
}

/// `Ok(None)` when no process has `pid` (`ERROR_INVALID_PARAMETER`).
fn open(pid: u32) -> io::Result<Option<OwnedHandle>> {
    // SAFETY: a plain open by pid, not inheritable; checked for null.
    let h = unsafe { OpenProcess(PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid) };
    // SAFETY: `h` is null or a fresh handle owned by nobody else.
    match OwnedHandle::try_from(unsafe { HandleOrNull::from_raw_handle(h) }) {
        Ok(h) => Ok(Some(h)),
        Err(_) => {
            let e = io::Error::last_os_error();
            if e.raw_os_error() == Some(ERROR_INVALID_PARAMETER as i32) {
                Ok(None)
            } else {
                Err(e)
            }
        }
    }
}
