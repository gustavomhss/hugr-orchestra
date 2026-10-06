//! From a request to a launch spec: validation, program resolution and the final environment (W03).
//!
//! SEAM (frozen in W00): `Request`, `Mode`, `Spec` and `prepare`. Bodies and private items belong to W03.
//! Everything here is pure: no process is started and nothing is executed (contract §3).

mod env;
mod path;
mod resolve;
#[cfg(unix)]
mod sys;
#[cfg(test)]
mod tests;
mod validate;

use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

use crate::error::Error;
use crate::types::{PtySize, Stdin};

/// Default `grace` (contract §5).
pub(crate) const DEFAULT_GRACE: Duration = Duration::from_millis(2000);

/// Whose rules a pure function applies. A parameter, so the Windows rules (PATHEXT, case-insensitive names) are
/// tested on every OS.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Os {
    Unix,
    Windows,
}

/// The rules of the OS this library runs on.
const HOST: Os = if cfg!(windows) { Os::Windows } else { Os::Unix };

/// Pipes or a terminal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Mode {
    Pipe,
    Pty(PtySize),
}

/// What the user asked for, unchecked (built by `api::Command`).
#[derive(Debug, Clone)]
pub(crate) struct Request {
    pub program: OsString,
    pub args: Vec<OsString>,
    pub cwd: Option<PathBuf>,
    /// In call order; `None` removes the variable.
    pub env: Vec<(OsString, Option<OsString>)>,
    pub inherit_env: bool,
    pub mode: Mode,
    pub stdin: Stdin,
    pub merge_stderr: bool,
    pub grace: Duration,
    /// Validated here, enforced by `process`.
    pub timeout: Option<Duration>,
}

impl Request {
    pub(crate) fn new(program: OsString) -> Request {
        Request {
            program,
            args: Vec::new(),
            cwd: None,
            env: Vec::new(),
            inherit_env: true,
            mode: Mode::Pipe,
            stdin: Stdin::Closed,
            merge_stderr: false,
            grace: DEFAULT_GRACE,
            timeout: None,
        }
    }
}

/// A validated, resolved launch, ready for the supervisor.
#[derive(Debug, Clone)]
pub(crate) struct Spec {
    /// Absolute path of the file to execute (on Windows a `.cmd`/`.bat` stays as resolved; the supervisor
    /// runs it through `cmd.exe` with batch-safe quoting, C-SPAWN-02).
    pub program: PathBuf,
    /// `argv[0]` is the program as the user wrote it; the rest are the arguments, literal.
    pub argv: Vec<OsString>,
    /// The complete final environment of the child.
    pub env: Vec<(OsString, OsString)>,
    /// Absolute working directory.
    pub cwd: PathBuf,
    pub mode: Mode,
    pub stdin: Stdin,
    pub merge_stderr: bool,
    pub grace: Duration,
}

/// Validates `req` per contract §3 (InvalidArgument / InvalidCwd), builds the final environment and resolves the program
/// against the child's final PATH (NotFound / NotExecutable). Never starts or executes anything.
pub(crate) fn prepare(req: &Request) -> Result<Spec, Error> {
    validate::check(req, HOST)?;
    let env = env::build(req);
    let cwd = validate::cwd(req)?;
    let program = resolve::program(&req.program, &env, &cwd)?;
    Ok(Spec {
        program,
        argv: std::iter::once(req.program.clone())
            .chain(req.args.iter().cloned())
            .collect(),
        env,
        cwd,
        mode: req.mode,
        stdin: req.stdin,
        merge_stderr: req.merge_stderr,
        grace: req.grace,
    })
}
