//! `List`: the live processes `Stop` would reach. Every candidate pid is opened and checked to be in the Job
//! before anything is read about it, and its handle is held while parent and name are collected, so a pid
//! reused by an outside process is never listed. "Exited" (left out) and "unknown" (an error, `Ack error`)
//! stay distinct.

use std::collections::HashMap;
use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrInvalid, OwnedHandle};

use omni_proto::ProcEntry;
use windows_sys::Win32::Foundation::{ERROR_NO_MORE_FILES, FILETIME};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Threading::GetProcessTimes;

use super::job::{self, Probe};

/// The Job's live members, minus `exclude` (the root once it exited).
pub(super) fn list(job: &OwnedHandle, exclude: Option<u32>) -> io::Result<Vec<ProcEntry>> {
    let candidates: Vec<u32> = job::member_pids(job)?
        .into_iter()
        .filter(|&p| Some(p) != exclude)
        .collect();
    of(job, &candidates)
}

/// The live members among `candidates`. `ppid` is set only when the parent is listed and was created no
/// later than the child (a parent pid reused by a younger member is not the parent).
pub(super) fn of(job: &OwnedHandle, candidates: &[u32]) -> io::Result<Vec<ProcEntry>> {
    let mut held = HashMap::new();
    for &pid in candidates {
        if let Probe::Member(h) = job::probe(job, pid)?
            && !job::exited(&h)
        {
            held.insert(pid, h);
        }
    }
    let snap = snapshot(&held)?;
    // Liveness is confirmed after the snapshot; a member absent from it exited meanwhile.
    let mut live = HashMap::new();
    for (pid, h) in &held {
        if let Some((ppid, name)) = snap.get(pid).filter(|_| !job::exited(h)) {
            live.insert(*pid, (*ppid, name.clone(), created(h)?));
        }
    }
    Ok(live
        .iter()
        .map(|(&pid, (ppid, name, born))| ProcEntry {
            pid,
            ppid: live.get(ppid).filter(|parent| parent.2 <= *born).map(|_| *ppid),
            name: (!name.is_empty()).then(|| name.clone()),
        })
        .collect())
}

fn created(process: &OwnedHandle) -> io::Result<u64> {
    let (mut c, mut e, mut k, mut u) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    // SAFETY: a process handle with query access and four valid out pointers.
    if unsafe { GetProcessTimes(process.as_raw_handle(), &mut c, &mut e, &mut k, &mut u) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(u64::from(c.dwHighDateTime) << 32 | u64::from(c.dwLowDateTime))
}

/// `pid → (ppid, executable file name)` for the held processes found in one snapshot. Their handles pin
/// their pids, so each entry found is the held process itself.
fn snapshot(held: &HashMap<u32, OwnedHandle>) -> io::Result<HashMap<u32, (u32, String)>> {
    // SAFETY: a plain snapshot request; the result is checked for INVALID_HANDLE_VALUE.
    let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    // SAFETY: `snap` is INVALID_HANDLE_VALUE or a fresh handle owned by nobody else.
    let snap = OwnedHandle::try_from(unsafe { HandleOrInvalid::from_raw_handle(snap) })
        .map_err(|_| io::Error::last_os_error())?;
    let mut found = HashMap::new();
    let mut entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    // SAFETY: `entry` has `dwSize` set, as both calls require.
    let mut ok = unsafe { Process32FirstW(snap.as_raw_handle(), &mut entry) };
    while ok != 0 {
        if held.contains_key(&entry.th32ProcessID) {
            let len = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(entry.szExeFile.get(..len).unwrap_or_default());
            found.insert(entry.th32ProcessID, (entry.th32ParentProcessID, name));
        }
        // SAFETY: as above.
        ok = unsafe { Process32NextW(snap.as_raw_handle(), &mut entry) };
    }
    let err = io::Error::last_os_error();
    if err.raw_os_error() != Some(ERROR_NO_MORE_FILES as i32) {
        return Err(err);
    }
    Ok(found)
}
