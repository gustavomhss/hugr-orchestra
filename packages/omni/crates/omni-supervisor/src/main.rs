//! `hugr-omni-supervisor`: started lazily by the hugr-omni host, once per host process; creates, contains,
//! stops and reaps every managed child (ADR-0005, `docs/protocol.md`).
//!
//! Command line (frozen in W00): `hugr-omni-supervisor --host-pid <pid> [--pipe <name>]`.
//! Unix: the channel is the socket on fd 0. Windows: the channel is the named pipe `<name>`, created by
//! the host, which checks the connecting client's pid. Exit code 0 after a clean shutdown (host gone,
//! every tree gone), 2 for a bad command line, 1 for anything else.

// W00 scaffold: seams are declared before their callers exist. The lead removes this when B2 lands.
#![allow(dead_code)]

#[cfg(unix)]
mod pty_unix;
#[cfg(windows)]
mod pty_windows;
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

use std::io::Write;
use std::process::ExitCode;

/// The parsed command line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Args {
    /// The host process to watch; its death stops every tree.
    pub host_pid: u32,
    /// Windows: the named pipe to connect to.
    pub pipe: Option<String>,
}

fn parse(mut it: impl Iterator<Item = String>) -> Result<Args, String> {
    let (mut host_pid, mut pipe) = (None, None);
    while let Some(flag) = it.next() {
        let value = it.next().ok_or_else(|| format!("{flag} needs a value"))?;
        match flag.as_str() {
            "--host-pid" => host_pid = Some(value.parse::<u32>().map_err(|_| format!("bad --host-pid {value}"))?),
            "--pipe" => pipe = Some(value),
            _ => return Err(format!("unknown argument {flag}")),
        }
    }
    let host_pid = host_pid.ok_or("missing --host-pid")?;
    if cfg!(windows) && pipe.is_none() {
        return Err("missing --pipe".into());
    }
    Ok(Args { host_pid, pipe })
}

fn main() -> ExitCode {
    let args = match parse(std::env::args().skip(1)) {
        Ok(args) => args,
        Err(e) => {
            // Never `eprintln!`: a closed or full stderr must not panic or block the supervisor.
            let _ = writeln!(
                std::io::stderr().lock(),
                "hugr-omni-supervisor: {e}. It is started by the hugr-omni library, not by hand."
            );
            return ExitCode::from(2);
        }
    };
    #[cfg(unix)]
    return unix::run(&args);
    #[cfg(windows)]
    return windows::run(&args);
}
