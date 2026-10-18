//! What the runner asks the OS, never the library: is a pid alive, and a fresh `${TMP}`.

use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

use super::Fail;

/// The scenario's OS name (`std::env::consts::OS`: `linux`, `macos`, `windows`).
pub const OS: &str = std::env::consts::OS;

/// What the OS says about a pid. Only a confirmed absence or a zombie/dead state is `Dead`; anything the oracle
/// cannot establish is `Unknown`, which fails the suite (never counted as dead or alive).
#[derive(Debug, PartialEq)]
pub enum Life {
    Alive,
    Dead,
    Unknown(String),
}

pub fn life(pid: u32) -> Life {
    if cfg!(target_os = "linux") {
        proc_stat(pid)
    } else if cfg!(windows) {
        tasklist(pid)
    } else {
        ps(pid)
    }
}

/// Linux: `/proc/<pid>/stat` is `<pid> (<comm>) <state> ...`; no such file means no such process.
fn proc_stat(pid: u32) -> Life {
    let text = match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(text) => text,
        // ENOENT: no such process; ESRCH (3): it exited while its stat file was being read. Both confirm absence.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(3) => return Life::Dead,
        Err(e) => return Life::Unknown(format!("/proc/{pid}/stat: {e}")),
    };
    let parsed = text.split_once(' ').zip(text.rsplit_once(')'));
    match parsed.map(|((id, _), (_, rest))| (id, rest.trim_start().chars().next())) {
        Some((id, Some('Z' | 'X'))) if id == pid.to_string() => Life::Dead,
        Some((id, Some(state))) if id == pid.to_string() && "RSDTtWPIK".contains(state) => Life::Alive,
        _ => Life::Unknown(format!("/proc/{pid}/stat unreadable: {text:?}")),
    }
}

/// macOS (and other Unix): `ps -o pid=,stat= -p <pid>` prints `<pid> <stat>`, or nothing and exits 1 when there is
/// no such process.
fn ps(pid: u32) -> Life {
    let out = match Command::new("ps")
        .args(["-o", "pid=,stat=", "-p", &pid.to_string()])
        .output()
    {
        Ok(out) => out,
        Err(e) => return Life::Unknown(format!("ps: {e}")),
    };
    let (stdout, stderr) = (
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr),
    );
    let fields: Vec<&str> = stdout.split_whitespace().collect();
    match (out.status.code(), fields.as_slice()) {
        (Some(1), []) if stderr.trim().is_empty() => Life::Dead,
        (Some(0), [id, stat]) if *id == pid.to_string() && stat.starts_with('Z') => Life::Dead,
        (Some(0), [id, _]) if *id == pid.to_string() => Life::Alive,
        _ => Life::Unknown(format!("ps for {pid}: {:?} {stdout:?} {stderr:?}", out.status)),
    }
}

/// Windows: `tasklist /FI "PID eq <pid>" /NH /FO CSV` lists `"<image>","<pid>",...`, or only an INFO line when no
/// process has that pid (an exited process is not listed, even while handles to it are open).
fn tasklist(pid: u32) -> Life {
    let filter = format!("PID eq {pid}");
    let out = match Command::new("tasklist")
        .args(["/FI", &filter, "/NH", "/FO", "CSV"])
        .output()
    {
        Ok(out) => out,
        Err(e) => return Life::Unknown(format!("tasklist: {e}")),
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    if !out.status.success() {
        return Life::Unknown(format!("tasklist for {pid}: {:?} {stdout:?}", out.status));
    }
    // Every CSV row must carry a pid field; a row without one is unparsable output.
    let pids: Option<Vec<&str>> = stdout
        .lines()
        .map(str::trim)
        .filter(|l| l.starts_with('"'))
        .map(|l| l.split("\",\"").nth(1))
        .collect();
    match pids {
        Some(pids) if pids.contains(&pid.to_string().as_str()) => Life::Alive,
        Some(pids) if pids.is_empty() && stdout.contains("INFO:") => Life::Dead,
        _ => Life::Unknown(format!("tasklist for {pid}: unexpected output {stdout:?}")),
    }
}

/// The `os` step: every pid is alive (or dead) per the OS, now or within `within`. A mismatch is the product's; an
/// oracle that cannot tell is the harness's.
pub async fn expect(pids: Vec<u32>, alive: bool, within: Duration) -> Result<(), Fail> {
    let deadline = Instant::now() + within;
    let wanted = if alive { Life::Alive } else { Life::Dead };
    loop {
        let probe = pids.clone();
        let lives: Vec<(u32, Life)> =
            tokio::task::spawn_blocking(move || probe.into_iter().map(|p| (p, life(p))).collect())
                .await
                .map_err(|e| e.to_string())?;
        if let Some((pid, Life::Unknown(why))) = lives.iter().find(|(_, l)| matches!(l, Life::Unknown(_))) {
            return Err(Fail::Harness(format!(
                "the OS cannot tell whether {pid} is alive: {why}"
            )));
        }
        let wrong: Vec<u32> = lives
            .into_iter()
            .filter(|(_, l)| *l != wanted)
            .map(|(p, _)| p)
            .collect();
        if wrong.is_empty() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            let state = if alive { "alive" } else { "dead" };
            return Err(Fail::Product(format!(
                "expected {state} per the OS, but not: {wrong:?}"
            )));
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

/// A fresh, canonical directory for one scenario (macOS: `/private/var/...`; Windows: no `\\?\` prefix), so
/// a child's `cwd` prints exactly `${TMP}`.
pub fn tmp(seq: usize) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("omni-contract-{}-{seq}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create ${TMP}");
    let canon = std::fs::canonicalize(&dir).expect("canonicalize ${TMP}");
    match canon.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(plain) => PathBuf::from(plain),
        None => canon,
    }
}
