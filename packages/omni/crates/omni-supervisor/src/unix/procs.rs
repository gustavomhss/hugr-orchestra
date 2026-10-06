//! The OS process inventory (ADR-0005 R3): the members of given sessions, from one scan of every process
//! (Linux `/proc`, macOS `proc_listallpids` + `getsid` + `proc_pidinfo`). A process that vanishes during the
//! scan is dead; any other failure to inspect one makes the whole scan incomplete (`None`), never empty.
//! Every fact about one member comes from one process identity: Linux reads it from one `stat` (and
//! re-reads `starttime` around the name lookup), macOS re-checks the session after its other lookups, so a
//! number recycled in between is never reported with the facts of another process.
//!
//! A process being torn down is not gone (lead r4). Linux shows it in `/proc` with its session until it is
//! a zombie. macOS does not: `getsid` and `proc_pidinfo` fail for it from the moment it starts exiting, tens
//! to hundreds of milliseconds before it is a zombie, so the scan reports it separately (`Exiting`, from
//! the kernel process table, `sysctl(KERN_PROC_PID)`, with its group and parent) and the sweep decides
//! whether it belongs to a tree.

use std::collections::{HashMap, HashSet};
use std::io;
#[cfg(target_os = "macos")]
use std::os::unix::ffi::OsStrExt;

/// One process of a scanned session.
#[derive(Debug, Clone)]
pub(super) struct Member {
    pub pid: i32,
    pub ppid: i32,
    pub pgid: i32,
    /// False for a zombie: it can no longer act and is not a signal target.
    pub live: bool,
    /// Executable file name (only when asked for).
    pub name: Option<String>,
}

/// A process being torn down whose session the OS no longer reports (macOS only).
#[derive(Debug, Clone)]
// Constructed only on macOS; Linux reports exiting processes with their session in /proc.
#[cfg_attr(target_os = "linux", allow(dead_code))]
pub(super) struct Exiting {
    pub pid: i32,
    pub pgid: i32,
    pub ppid: i32,
}

/// One scan: the members of each session asked for, and every process being torn down.
#[derive(Debug, Default)]
pub(super) struct Inventory {
    pub members: HashMap<i32, Vec<Member>>,
    pub exiting: Vec<Exiting>,
}

/// What one process turned out to be.
enum Seen {
    Member(i32, Member),
    #[cfg(target_os = "macos")]
    Exiting(Exiting),
    Other,
}

/// Members of each session in `sids` (keyed by session id) and the exiting processes; `None` when the
/// inventory is incomplete.
pub(super) fn scan(sids: &HashSet<i32>, names: bool) -> Option<Inventory> {
    let mut inv = Inventory::default();
    if sids.is_empty() {
        return Some(inv);
    }
    for pid in all_pids()? {
        match inspect(pid, sids, names).ok()? {
            Seen::Member(sid, member) => inv.members.entry(sid).or_default().push(member),
            #[cfg(target_os = "macos")]
            Seen::Exiting(e) => inv.exiting.push(e),
            Seen::Other => {}
        }
    }
    Some(inv)
}

/// Whether `pid` is, right now, a live member of session `sid` (the re-check before a signal).
#[cfg(target_os = "linux")]
pub(super) fn in_session(pid: i32, sid: i32) -> io::Result<bool> {
    Ok(stat(pid)?.is_some_and(|st| st.sid == sid && live(&st)))
}

/// Whether `pid` is, right now, a live member of session `sid` (the re-check before a signal).
#[cfg(target_os = "macos")]
pub(super) fn in_session(pid: i32, sid: i32) -> io::Result<bool> {
    // SAFETY: getsid takes a plain integer.
    let s = unsafe { libc::getsid(pid) };
    match s {
        -1 if super::sys::errno() == libc::ESRCH => Ok(false), // gone, or a zombie (macOS reports ESRCH)
        -1 => Err(io::Error::last_os_error()),
        s => Ok(s == sid),
    }
}

// ---------------------------------------------------------------------------------------------- Linux

#[cfg(target_os = "linux")]
fn all_pids() -> Option<Vec<i32>> {
    let mut pids = Vec::new();
    for entry in std::fs::read_dir("/proc").ok()? {
        if let Some(pid) = entry.ok()?.file_name().to_str().and_then(|s| s.parse().ok()) {
            pids.push(pid);
        }
    }
    Some(pids)
}

#[cfg(target_os = "linux")]
struct Stat {
    state: u8,
    ppid: i32,
    pgid: i32,
    sid: i32,
    threads: u64,
    start: u64,
    comm: String,
}

/// `/proc/<pid>/stat`; `Ok(None)` when the process is gone.
#[cfg(target_os = "linux")]
fn stat(pid: i32) -> io::Result<Option<Stat>> {
    let raw = match std::fs::read(format!("/proc/{pid}/stat")) {
        Ok(raw) => raw,
        Err(e) if e.kind() == io::ErrorKind::NotFound || e.raw_os_error() == Some(libc::ESRCH) => return Ok(None),
        Err(e) => return Err(e),
    };
    let bad = || io::Error::new(io::ErrorKind::InvalidData, format!("unparsable /proc/{pid}/stat"));
    // "pid (comm) S ppid pgrp session ...": comm may hold spaces and parentheses, so split at the last ')'.
    let open = raw.iter().position(|&b| b == b'(').ok_or_else(bad)?;
    let close = raw.iter().rposition(|&b| b == b')').ok_or_else(bad)?;
    let comm = String::from_utf8_lossy(raw.get(open + 1..close).ok_or_else(bad)?).into_owned();
    let rest = std::str::from_utf8(raw.get(close + 1..).ok_or_else(bad)?).map_err(|_| bad())?;
    let mut it = rest.split_ascii_whitespace();
    let state = it.next().and_then(|s| s.bytes().next()).ok_or_else(bad)?;
    let ppid = it.next().and_then(|s| s.parse().ok()).ok_or_else(bad)?;
    let pgid = it.next().and_then(|s| s.parse().ok()).ok_or_else(bad)?;
    let sid = it.next().and_then(|s| s.parse().ok()).ok_or_else(bad)?;
    // Fields 7..=19 are skipped; 20 is num_threads, 22 starttime (proc(5)).
    let mut it = it.skip(13);
    let threads = it.next().and_then(|s| s.parse().ok()).ok_or_else(bad)?;
    let start = it.nth(1).and_then(|s| s.parse().ok()).ok_or_else(bad)?;
    Ok(Some(Stat {
        state,
        ppid,
        pgid,
        sid,
        threads,
        start,
        comm,
    }))
}

#[cfg(target_os = "linux")]
fn inspect(pid: i32, sids: &HashSet<i32>, names: bool) -> io::Result<Seen> {
    let Some(st) = stat(pid)? else { return Ok(Seen::Other) };
    if !sids.contains(&st.sid) {
        return Ok(Seen::Other);
    }
    let (sid, ppid, pgid, live) = (st.sid, st.ppid, st.pgid, live(&st));
    let name = if names {
        let exe = exe_name(pid);
        // The name must belong to the process just inspected, not to a successor holding its number.
        match stat(pid)? {
            Some(again) if again.start == st.start => Some(exe.unwrap_or(st.comm)),
            _ => return Ok(Seen::Other), // it died meanwhile: not a live member
        }
    } else {
        None
    };
    let member = Member {
        pid,
        ppid,
        pgid,
        live,
        name,
    };
    Ok(Seen::Member(sid, member))
}

/// Not dead and not a zombie. A zombie thread-group leader whose other threads still run is live (its
/// num_threads still counts them).
#[cfg(target_os = "linux")]
fn live(st: &Stat) -> bool {
    match st.state {
        b'Z' => st.threads > 1,
        b'X' | b'x' => false,
        _ => true,
    }
}

#[cfg(target_os = "linux")]
fn exe_name(pid: i32) -> Option<String> {
    let path = std::fs::read_link(format!("/proc/{pid}/exe")).ok()?;
    let name = path.file_name()?.to_string_lossy().into_owned();
    Some(name.strip_suffix(" (deleted)").map(str::to_owned).unwrap_or(name))
}

// ---------------------------------------------------------------------------------------------- macOS

#[cfg(target_os = "macos")]
fn all_pids() -> Option<Vec<i32>> {
    // SAFETY: a null buffer asks for the current count.
    let hint = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    let mut cap = usize::try_from(hint).ok().filter(|&n| n > 0)? * 2;
    loop {
        let mut pids = vec![0i32; cap];
        let bytes = i32::try_from(cap * 4).ok()?;
        // SAFETY: the buffer holds `bytes` writable bytes.
        let n = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), bytes) };
        let n = usize::try_from(n).ok().filter(|&n| n > 0)?;
        if n < cap {
            pids.truncate(n);
            return Some(pids);
        }
        cap *= 2; // the list may have been cut: retry with room to spare
    }
}

#[cfg(target_os = "macos")]
fn inspect(pid: i32, sids: &HashSet<i32>, names: bool) -> io::Result<Seen> {
    if pid <= 0 {
        return Ok(Seen::Other);
    }
    // SAFETY: getsid takes a plain integer. macOS answers ESRCH for a zombie and for a process being torn
    // down; the kernel process table tells them apart.
    let sid = unsafe { libc::getsid(pid) };
    if sid == -1 {
        return if super::sys::errno() == libc::ESRCH {
            exiting(pid)
        } else {
            Err(io::Error::last_os_error())
        };
    }
    if !sids.contains(&sid) {
        return Ok(Seen::Other);
    }
    // SAFETY: proc_bsdshortinfo is plain old data; all-zero is valid.
    let mut info: libc::proc_bsdshortinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of_val(&info) as libc::c_int;
    // SAFETY: `info` has `size` writable bytes.
    let n = unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDT_SHORTBSDINFO, 0, (&raw mut info).cast(), size) };
    if n != size {
        return if super::sys::errno() == libc::ESRCH {
            exiting(pid)
        } else {
            Err(io::Error::last_os_error())
        };
    }
    let name = names.then(|| exe_name(pid).unwrap_or_else(|| comm(&info.pbsi_comm)));
    // The facts above must belong to the member: if the number changed hands meanwhile, it left the session.
    if !in_session(pid, sid)? {
        return exiting(pid); // it started exiting meanwhile, or left the session (then it is not exiting)
    }
    let ppid = i32::try_from(info.pbsi_ppid).unwrap_or(0);
    let pgid = i32::try_from(info.pbsi_pgid).unwrap_or(0);
    let live = info.pbsi_status != libc::SZOMB;
    Ok(Seen::Member(
        sid,
        Member {
            pid,
            ppid,
            pgid,
            live,
            name,
        },
    ))
}

/// A process `getsid`/`proc_pidinfo` no longer report: `Exiting` while the kernel still lists it and it is
/// not a zombie; otherwise it is gone (or a zombie) and none of our business.
#[cfg(target_os = "macos")]
fn exiting(pid: i32) -> io::Result<Seen> {
    Ok(match kinfo(pid)? {
        Some(k) if u32::from(k.stat) != libc::SZOMB => Seen::Exiting(Exiting {
            pid,
            pgid: k.pgid,
            ppid: k.ppid,
        }),
        _ => Seen::Other,
    })
}

#[cfg(target_os = "macos")]
struct Kinfo {
    stat: u8,
    ppid: i32,
    pgid: i32,
}

/// `sysctl(KERN_PROC_PID)`: the kernel process table, which lists a process until it is reaped, exiting or
/// zombie. `struct kinfo_proc` (<sys/sysctl.h>, 648 bytes on LP64; the libc crate does not declare it):
/// kp_proc.p_stat at 36, kp_proc.p_pid at 40, kp_eproc.e_ppid at 560, kp_eproc.e_pgid at 564.
#[cfg(target_os = "macos")]
fn kinfo(pid: i32) -> io::Result<Option<Kinfo>> {
    const SIZE: usize = 648;
    let mut mib = [libc::CTL_KERN, libc::KERN_PROC, libc::KERN_PROC_PID, pid];
    let mut buf = [0u8; SIZE];
    let mut len: libc::size_t = SIZE;
    // SAFETY: `mib` holds 4 names and `buf` `len` writable bytes.
    let r = unsafe {
        libc::sysctl(
            mib.as_mut_ptr(),
            4,
            buf.as_mut_ptr().cast(),
            &raw mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    super::sys::cvt(r)?;
    if len == 0 {
        return Ok(None); // no such process
    }
    let int = |at: usize| {
        buf.get(at..at + 4)
            .and_then(|b| b.try_into().ok())
            .map(i32::from_ne_bytes)
    };
    let stat = buf.get(36).copied();
    match (len == SIZE, int(40), stat, int(560), int(564)) {
        (true, Some(p), Some(stat), Some(ppid), Some(pgid)) if p == pid => Ok(Some(Kinfo { stat, ppid, pgid })),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("unexpected kinfo_proc for {pid}"),
        )),
    }
}

#[cfg(target_os = "macos")]
fn exe_name(pid: i32) -> Option<String> {
    let mut buf = vec![0u8; 4 * 1024];
    // SAFETY: `buf` has the given number of writable bytes.
    let n = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    buf.truncate(usize::try_from(n).ok().filter(|&n| n > 0)?);
    let path = std::path::Path::new(std::ffi::OsStr::from_bytes(&buf));
    Some(path.file_name()?.to_string_lossy().into_owned())
}

#[cfg(target_os = "macos")]
fn comm(raw: &[libc::c_char]) -> String {
    let bytes: Vec<u8> = raw.iter().take_while(|&&c| c != 0).map(|&c| c as u8).collect();
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    /// The hand-written `kinfo_proc` offsets agree with the kernel on this machine (x86_64 and arm64 share
    /// the LP64 layout): our own entry has our pid, group and parent, and a running state.
    #[test]
    fn kinfo_offsets_match_this_kernel() {
        let me = std::process::id().cast_signed();
        let k = super::kinfo(me).unwrap().unwrap();
        // SAFETY: getpgrp and getppid have no preconditions.
        let (pgid, ppid) = unsafe { (libc::getpgrp(), libc::getppid()) };
        assert_eq!((k.pgid, k.ppid), (pgid, ppid));
        assert!(matches!(k.stat, 2 | 3), "SRUN or SSLEEP, got {}", k.stat);
        assert!(super::kinfo(99_999_999).unwrap().is_none(), "no such process");
    }
}
