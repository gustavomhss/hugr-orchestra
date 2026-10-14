//! The Windows process table, from `Win32_Process` (CIM) through Windows PowerShell, which every Windows has. A
//! process's identity is its pid with its creation time.

use super::{Proc, Usage, tool};

const SNAPSHOT: &str = "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate,Name | \
    ForEach-Object { '{0} {1} {2} {3}' -f $_.ProcessId, $_.ParentProcessId, \
    $(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 }), $_.Name }";

fn powershell(script: &str) -> Result<String, String> {
    tool(
        "powershell.exe",
        &["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    )
}

/// Every process: `<pid> <ppid> <creation FILETIME> <name>`. An exited process is not listed.
pub fn cim() -> Result<Vec<Proc>, String> {
    let out = powershell(SNAPSHOT)?;
    let procs = out
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(parse_line)
        .collect::<Result<Vec<_>, _>>()?;
    if procs.is_empty() {
        return Err("Win32_Process listed no process".into());
    }
    Ok(procs)
}

pub fn parse_line(line: &str) -> Result<Proc, String> {
    let bad = || format!("Win32_Process line unreadable: {line:?}");
    let mut fields = line.trim().splitn(4, ' ');
    let mut next = || fields.next().ok_or_else(bad);
    let (pid, ppid, created) = (next()?, next()?, next()?);
    let name = fields.next().unwrap_or("").to_owned();
    Ok(Proc {
        pid: pid.parse().map_err(|_| bad())?,
        ppid: ppid.parse().map_err(|_| bad())?,
        pgid: 0,
        created: created.parse().map_err(|_| bad())?,
        name,
        tag: None,
    })
}

/// Kills each victim whose identity holds, and returns the pids killed. For each, one process handle is opened (the
/// `Handle` property caches it), its creation time is checked against the observed one (`Win32_Process` keeps
/// microseconds and `GetProcessTimes` 100 ns, so they agree within 10 units), and the kill goes through that same
/// handle, which keeps the pid from being reused in between. A process that is gone or reused is left alone.
pub fn kill_confirmed(victims: &[Proc]) -> Result<Vec<u32>, String> {
    let out = powershell(&kill_script(victims))?;
    Ok(out
        .lines()
        .filter_map(|l| l.trim().strip_prefix("KILLED ")?.parse().ok())
        .collect())
}

pub fn kill_script(victims: &[Proc]) -> String {
    let pairs: Vec<String> = victims.iter().map(|v| format!("{},{}", v.pid, v.created)).collect();
    format!(
        "$v = @({}); for ($i = 0; $i -lt $v.Count; $i += 2) {{ try {{ \
         $p = [System.Diagnostics.Process]::GetProcessById([int]$v[$i]); $null = $p.Handle; \
         if ([Math]::Abs($p.StartTime.ToFileTimeUtc() - [long]$v[$i + 1]) -lt 10) {{ $p.Kill(); \"KILLED $($v[$i])\" }} \
         else {{ \"REUSED $($v[$i])\" }} }} catch {{ \"GONE $($v[$i])\" }} }}",
        pairs.join(",")
    )
}

/// The process's handle count and working set.
pub fn usage(pid: u32) -> Result<Usage, String> {
    let out = powershell(&format!(
        "$p = Get-Process -Id {pid}; '{{0}} {{1}}' -f $p.HandleCount, $p.WorkingSet64"
    ))?;
    let bad = || format!("Get-Process {pid}: {out:?}");
    let mut fields = out.split_whitespace().map(str::parse::<u64>);
    match (fields.next(), fields.next()) {
        (Some(Ok(fds)), Some(Ok(bytes))) => Ok(Usage {
            fds,
            rss_kb: bytes / 1024,
        }),
        _ => Err(bad()),
    }
}
