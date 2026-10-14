//! The Unix process table: Linux reads `/proc`, macOS asks `ps` (with `-E`, the environment, where macOS shows it).
//! A process's identity is its pid with its start time: `/proc/<pid>/stat` field 22 (clock ticks since boot) on
//! Linux, `ps -o lstart` (to the second, as `YYYYMMDDhhmmss`) on macOS. The marker is only ever taken from the
//! environment, as an exact `HUGR_QA_TASK=<value>` entry: never from argv, never from another variable.

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::Path;

use super::{MARKER, Proc, Usage, tool};

/// Linux: `/proc/<pid>/stat` for parent, group, state and start, `/proc/<pid>/environ` for the marker.
pub fn proc_fs() -> Result<Vec<Proc>, String> {
    let dir = std::fs::read_dir("/proc").map_err(|e| format!("/proc: {e}"))?;
    let mut procs = Vec::new();
    for entry in dir {
        let entry = entry.map_err(|e| format!("/proc: {e}"))?;
        let Some(pid) = entry.file_name().to_str().and_then(|n| n.parse::<u32>().ok()) else {
            continue;
        };
        let stat = match std::fs::read_to_string(entry.path().join("stat")) {
            Ok(stat) => stat,
            Err(e) if gone(&e) => continue,
            Err(e) => return Err(format!("/proc/{pid}/stat: {e}")),
        };
        let Some(mut proc) = parse_stat(pid, &stat)? else {
            continue; // a zombie: dead
        };
        proc.tag = match std::fs::read(entry.path().join("environ")) {
            Ok(env) => marker_in_environ(&env),
            Err(e) if gone(&e) => continue,
            // Another user's process: not one a task of this user started.
            Err(e) if e.kind() == ErrorKind::PermissionDenied => None,
            Err(e) => return Err(format!("/proc/{pid}/environ: {e}")),
        };
        procs.push(proc);
    }
    Ok(procs)
}

/// The process exited while it was being read (ENOENT, or ESRCH = 3).
fn gone(e: &std::io::Error) -> bool {
    e.kind() == ErrorKind::NotFound || e.raw_os_error() == Some(3)
}

/// `<pid> (<comm>) <state> <ppid> <pgrp> ... <starttime (22nd)> ...`; `None` for a zombie or dead state.
pub fn parse_stat(pid: u32, stat: &str) -> Result<Option<Proc>, String> {
    let bad = || format!("/proc/{pid}/stat unreadable: {stat:?}");
    let open = stat.find('(').ok_or_else(bad)?;
    let close = stat.rfind(')').ok_or_else(bad)?;
    let name = stat.get(open + 1..close).ok_or_else(bad)?.to_owned();
    // Fields from the 3rd on: state is [0], ppid [1], pgrp [2], starttime [19].
    let fields: Vec<&str> = stat.get(close + 1..).ok_or_else(bad)?.split_whitespace().collect();
    let (Some(state), Some(ppid), Some(pgid), Some(start)) =
        (fields.first(), fields.get(1), fields.get(2), fields.get(19))
    else {
        return Err(bad());
    };
    if matches!(*state, "Z" | "X" | "x") {
        return Ok(None);
    }
    Ok(Some(Proc {
        pid,
        ppid: ppid.parse().map_err(|_| bad())?,
        pgid: pgid.parse().map_err(|_| bad())?,
        created: start.parse().map_err(|_| bad())?,
        name,
        tag: None,
    }))
}

pub fn marker_in_environ(env: &[u8]) -> Option<String> {
    let prefix = format!("{MARKER}=");
    env.split(|&b| b == 0)
        .find_map(|var| var.strip_prefix(prefix.as_bytes()))
        .map(|value| String::from_utf8_lossy(value).into_owned())
}

/// macOS: `ps -A -E -ww -o pid=,ppid=,pgid=,stat=,lstart=,command=` prints the command line followed by the
/// environment; a second `ps` without `-E`, right after, prints the command line alone. The environment is what
/// follows a process's own command line; when the two do not line up (it exec'd in between), it shows no marker.
pub fn ps() -> Result<Vec<Proc>, String> {
    let out = tool(
        "ps",
        &["-A", "-E", "-ww", "-o", "pid=,ppid=,pgid=,stat=,lstart=,command="],
    )?;
    let args = tool("ps", &["-A", "-ww", "-o", "pid=,command="])?;
    let argv = command_lines(&args);
    let mut procs = Vec::new();
    for line in out.lines().filter(|l| !l.trim().is_empty()) {
        if let Some(proc) = parse_ps_line(line, &argv)? {
            procs.push(proc);
        }
    }
    if procs.is_empty() {
        return Err("ps listed no process".into());
    }
    Ok(procs)
}

/// `ps -o pid=,command=`: each pid's command line.
pub fn command_lines(out: &str) -> HashMap<u32, &str> {
    out.lines()
        .filter_map(|line| {
            let (pid, command) = line.trim_start().split_once(char::is_whitespace)?;
            Some((pid.parse().ok()?, command.trim_start()))
        })
        .collect()
}

/// The marker in a space-joined environment: a whole word `HUGR_QA_TASK=<value>`.
pub fn marker_in_words(env: &str) -> Option<String> {
    let prefix = format!("{MARKER}=");
    env.split_whitespace()
        .find_map(|word| word.strip_prefix(prefix.as_str()))
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// One `ps -E` line, with every pid's command line alone (`argv`); `None` for a zombie.
pub fn parse_ps_line(line: &str, argv: &HashMap<u32, &str>) -> Result<Option<Proc>, String> {
    let bad = || format!("ps line unreadable: {line:?}");
    let mut rest = line.trim_start();
    let mut field = || -> Result<&str, String> {
        let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        let (value, tail) = rest.split_at(end);
        rest = tail.trim_start();
        if value.is_empty() { Err(bad()) } else { Ok(value) }
    };
    let (pid, ppid, pgid, stat) = (field()?, field()?, field()?, field()?);
    let lstart = [field()?, field()?, field()?, field()?, field()?];
    if stat.starts_with('Z') {
        return Ok(None);
    }
    let program = rest.split_whitespace().next().unwrap_or("");
    let pid: u32 = pid.parse().map_err(|_| bad())?;
    let env = argv
        .get(&pid)
        .and_then(|command| rest.strip_prefix(command))
        .filter(|env| env.is_empty() || env.starts_with(char::is_whitespace));
    Ok(Some(Proc {
        pid,
        ppid: ppid.parse().map_err(|_| bad())?,
        pgid: pgid.parse().map_err(|_| bad())?,
        created: started(&lstart).ok_or_else(bad)?,
        name: base_name(program),
        tag: env.and_then(marker_in_words),
    }))
}

/// `ps -o lstart` (`Sun Oct  4 02:31:00 2026`, local time) as `20261004023100`.
pub fn started(lstart: &[&str; 5]) -> Option<u64> {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let [_, month, day, time, year] = lstart;
    let month = MONTHS.iter().position(|m| m == month)? as u64 + 1;
    let hms: Vec<u64> = time.split(':').map(|n| n.parse().ok()).collect::<Option<_>>()?;
    let [h, m, s] = hms.as_slice() else { return None };
    Some(((((year.parse::<u64>().ok()? * 100 + month) * 100 + day.parse::<u64>().ok()?) * 100 + h) * 100 + m) * 100 + s)
}

fn base_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Linux: the entries of `/proc/<pid>/fd` and `VmRSS` of `/proc/<pid>/status`.
pub fn proc_usage(pid: u32) -> Result<Usage, String> {
    let fds = std::fs::read_dir(format!("/proc/{pid}/fd"))
        .map_err(|e| format!("/proc/{pid}/fd: {e}"))?
        .count() as u64;
    let status =
        std::fs::read_to_string(format!("/proc/{pid}/status")).map_err(|e| format!("/proc/{pid}/status: {e}"))?;
    let rss_kb = status
        .lines()
        .find_map(|l| l.strip_prefix("VmRSS:"))
        .and_then(|v| v.split_whitespace().next()?.parse().ok())
        .ok_or_else(|| format!("/proc/{pid}/status has no VmRSS"))?;
    Ok(Usage { fds, rss_kb })
}

/// macOS: `lsof -F f` lists one `f<fd>` line per open descriptor (plus `fcwd`, `ftxt`, ...); `ps -o rss=` in KiB.
pub fn mac_usage(pid: u32) -> Result<Usage, String> {
    let id = pid.to_string();
    let files = tool("lsof", &["-n", "-P", "-p", &id, "-F", "f"])?;
    let fds = files
        .lines()
        .filter_map(|l| l.strip_prefix('f'))
        .filter(|fd| !fd.is_empty() && fd.bytes().all(|b| b.is_ascii_digit()))
        .count() as u64;
    let rss = tool("ps", &["-o", "rss=", "-p", &id])?;
    let rss_kb = rss.trim().parse().map_err(|_| format!("ps rss for {pid}: {rss:?}"))?;
    Ok(Usage { fds, rss_kb })
}
