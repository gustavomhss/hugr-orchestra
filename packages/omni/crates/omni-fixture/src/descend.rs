//! Descendants: the fixture starts itself (same binary, no shell) for `tree`, `hold` and `escape`.

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::out::Out;

/// How long an escaped descendant lives: it is outside the tree on purpose, so nothing else ends it.
pub const ESCAPEE_LIFETIME: Duration = Duration::from_secs(60);

/// This program, appending to `log` first when a pid log is active (`pidlog`).
fn me(log: Option<&Path>) -> Result<Command, String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    let mut cmd = Command::new(exe);
    if let Some(log) = log {
        cmd.arg(format!("pidlog={}", log.display()));
    }
    Ok(cmd)
}

fn start(cmd: &mut Command, what: &str) -> Result<std::process::Child, String> {
    cmd.spawn().map_err(|e| format!("{what}: {e}"))
}

/// Starts level `k` of a chain of `n` (inheriting stdio); it prints `PID <k> <pid>` and starts level `k+1`.
pub fn level(k: u32, n: u32, resist: bool, log: Option<&Path>) -> Result<(), String> {
    if k > n {
        return Ok(());
    }
    let value = if resist {
        format!("_level={k}:{n}:resist")
    } else {
        format!("_level={k}:{n}")
    };
    start(me(log)?.arg(value), "tree").map(drop)
}

/// Starts a descendant that keeps stdout and stderr open for `ms`, printing nothing.
pub fn hold(ms: u64, log: Option<&Path>) -> Result<(), String> {
    start(me(log)?.arg(format!("sleep={ms}")).stdin(Stdio::null()), "hold").map(drop)
}

/// Unix: the descendant calls `setsid` and prints `ESCAPED <pid>` itself. Windows: it is started with
/// `CREATE_BREAKAWAY_FROM_JOB`; this process prints `ESCAPED <pid>`, or `ESCAPE-REFUSED` if the OS refused.
pub fn escape(out: &mut Out, log: Option<&Path>) -> Result<(), String> {
    let mut cmd = me(log)?;
    cmd.arg("_escaped");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(windows_sys::Win32::System::Threading::CREATE_BREAKAWAY_FROM_JOB);
        match cmd.spawn() {
            Ok(child) => out.write(
                crate::out::Stream::Stdout,
                format!("ESCAPED {}\n", child.id()).as_bytes(),
            ),
            Err(_) => out.write(crate::out::Stream::Stdout, b"ESCAPE-REFUSED\n"),
        }
        Ok(())
    }
    #[cfg(unix)]
    {
        let _ = out;
        start(&mut cmd, "escape").map(drop)
    }
}

/// Copies this executable to `path` (creating its directory), keeping it executable.
pub fn copy_self(path: &Path) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("copy-self {}: {e}", dir.display()))?;
    }
    std::fs::copy(&exe, path)
        .map(drop)
        .map_err(|e| format!("copy-self {}: {e}", path.display()))
}
