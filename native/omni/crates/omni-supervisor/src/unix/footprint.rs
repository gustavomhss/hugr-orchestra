//! Complete macOS process footprint observation.

#[cfg(target_os = "macos")]
use super::procs;
use super::procs::Inventory;
#[cfg(any(test, target_os = "macos"))]
use super::procs::{Exiting, Member};
#[cfg(target_os = "macos")]
use std::collections::HashSet;

/// Return only a complete, stable sum; membership remains usable when this fails.
#[cfg(target_os = "macos")]
pub(super) fn sample(sid: i32, before: &Inventory, known: &[(i32, i32)]) -> Option<(u64, String)> {
    let members = before.members.get(&sid)?;
    if members.is_empty() || members.iter().any(|m| !m.live) || relevant_exiting(sid, known, members, &before.exiting) {
        return None;
    }
    let mut readings = Vec::new();
    for member in members {
        if !procs::in_session(member.pid, sid).ok()? {
            return None;
        }
        let first = usage(member.pid)?;
        if first.1 == 0 || !procs::in_session(member.pid, sid).ok()? {
            return None;
        }
        let second = usage(member.pid)?;
        if first.1 != second.1 || !procs::in_session(member.pid, sid).ok()? {
            return None;
        }
        readings.push((member.pid, first.1, second.0));
    }
    let after = procs::scan(&HashSet::from([sid]), false)?;
    let again = after.members.get(&sid)?;
    if relevant_exiting(sid, known, members, &after.exiting) || relevant_exiting(sid, known, again, &after.exiting) {
        return None;
    }
    if again.len() != members.len() || again.iter().any(|m| !m.live || !readings.iter().any(|r| r.0 == m.pid)) {
        return None;
    }
    readings.sort_unstable_by_key(|r| r.0);
    let identity = readings
        .iter()
        .map(|(pid, start, _)| format!("{pid}:{start:x}"))
        .collect::<Vec<_>>()
        .join(",");
    let mut sum = 0u64;
    for (pid, start, bytes) in readings {
        if !procs::in_session(pid, sid).ok()? || usage(pid)?.1 != start || !procs::in_session(pid, sid).ok()? {
            return None;
        }
        sum = sum.checked_add(bytes)?;
    }
    (sum <= 9_007_199_254_740_991).then_some((sum, identity))
}

#[cfg(target_os = "linux")]
pub(super) fn sample(_sid: i32, _before: &Inventory, _known: &[(i32, i32)]) -> Option<(u64, String)> {
    None
}

// Match the sweep's conservative associations, without treating unrelated host processes as tree members.
#[cfg(any(test, target_os = "macos"))]
fn relevant_exiting(sid: i32, known: &[(i32, i32)], members: &[Member], exiting: &[Exiting]) -> bool {
    exiting.iter().any(|e| {
        e.pid == sid
            || e.pgid == sid
            || e.ppid == sid
            || known
                .iter()
                .any(|&(pid, group)| e.pid == pid || e.pgid == group || e.ppid == pid)
            || members
                .iter()
                .any(|m| e.pid == m.pid || e.pgid == m.pgid || e.ppid == m.pid)
    })
}

#[cfg(target_os = "macos")]
fn usage(pid: i32) -> Option<(u64, u64)> {
    #[repr(C)]
    struct Usage {
        uuid: [u8; 16],
        fields: [u64; 10],
    }
    unsafe extern "C" {
        fn proc_pid_rusage(pid: libc::c_int, flavor: libc::c_int, buffer: *mut std::ffi::c_void) -> libc::c_int;
    }
    let mut info = Usage {
        uuid: [0; 16],
        fields: [0; 10],
    };
    // SAFETY: RUSAGE_INFO_V0 writes its fixed-size struct into this valid writable buffer.
    if unsafe { proc_pid_rusage(pid, 0, (&raw mut info).cast()) } != 0 {
        return None;
    }
    Some((info.fields[7], info.fields[8]))
}

#[cfg(test)]
mod tests {
    use super::{Exiting, Member, relevant_exiting};

    #[test]
    fn exiting_must_be_related_to_the_observed_tree() {
        let members = [Member {
            pid: 101,
            ppid: 100,
            pgid: 102,
            live: true,
            name: None,
        }];
        let known = [(110, 111)];
        let exit = |pid, pgid, ppid| Exiting { pid, pgid, ppid };
        assert!(!relevant_exiting(100, &known, &members, &[exit(200, 201, 202)]));
        for e in [
            exit(100, 201, 202),
            exit(200, 100, 202),
            exit(200, 201, 100),
            exit(110, 201, 202),
            exit(200, 111, 202),
            exit(200, 201, 110),
            exit(101, 201, 202),
            exit(200, 102, 202),
            exit(200, 201, 101),
        ] {
            assert!(relevant_exiting(100, &known, &members, &[e]));
        }
    }
}
