//! `Command`: the builder behind `run()` and `spawn()` (contract §1, §3, §11).

use std::ffi::{OsStr, OsString};
use std::path::Path;
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use crate::error::Error;
use crate::process::{self, Options, PipeChild, PtyChild};
use crate::spawn::{Mode, Request};
use crate::types::{PtySize, RunOutput, Stdin};

/// A process to run: program, arguments and options. Nothing is checked until `run()` or `spawn()`,
/// which validate everything before any process exists.
///
/// ```no_run
/// # async fn demo() -> Result<(), hugr_omni::Error> {
/// let out = hugr_omni::Command::new("npm").args(["test"]).cwd("app").run().await?;
/// assert!(out.exit.success());
/// # Ok(())
/// # }
/// ```
#[derive(Debug, Clone)]
pub struct Command {
    req: Request,
    opts: Options,
    pty: Option<PtySize>,
}

impl Command {
    /// A command for `program`: a bare name is looked up on the child's final `PATH` (plus `PATHEXT` on
    /// Windows); a path with a separator resolves against `cwd`. No shell is ever involved.
    pub fn new(program: impl AsRef<OsStr>) -> Command {
        Command {
            req: Request::new(program.as_ref().to_os_string()),
            opts: Options::default(),
            pty: None,
        }
    }

    /// Appends one argument, passed literally.
    pub fn arg(&mut self, arg: impl AsRef<OsStr>) -> &mut Self {
        self.req.args.push(arg.as_ref().to_os_string());
        self
    }

    /// Appends arguments, passed literally.
    pub fn args<I, S>(&mut self, args: I) -> &mut Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.req
            .args
            .extend(args.into_iter().map(|a| a.as_ref().to_os_string()));
        self
    }

    /// Working directory of the child (default: the host's). A relative path resolves against the host's.
    pub fn cwd(&mut self, dir: impl AsRef<Path>) -> &mut Self {
        self.req.cwd = Some(dir.as_ref().to_path_buf());
        self
    }

    /// Sets an environment variable, merged over the inherited environment.
    pub fn env(&mut self, key: impl AsRef<OsStr>, value: impl AsRef<OsStr>) -> &mut Self {
        self.req
            .env
            .push((key.as_ref().to_os_string(), Some(value.as_ref().to_os_string())));
        self
    }

    /// Removes an environment variable from what the child gets.
    pub fn env_remove(&mut self, key: impl AsRef<OsStr>) -> &mut Self {
        self.req.env.push((key.as_ref().to_os_string(), None::<OsString>));
        self
    }

    /// `false` starts from an empty environment: only what `env` set (plus the variables Windows requires).
    pub fn inherit_env(&mut self, yes: bool) -> &mut Self {
        self.req.inherit_env = yes;
        self
    }

    /// Deadline for the whole run; on expiry the tree is stopped and the reason is `Timeout`.
    pub fn timeout(&mut self, timeout: Duration) -> &mut Self {
        self.req.timeout = Some(timeout);
        self
    }

    /// How long the tree gets to wind down when stopped (default 2 s; contract §5).
    pub fn grace(&mut self, grace: Duration) -> &mut Self {
        self.req.grace = grace;
        self
    }

    /// Cancels the run when `token` is cancelled: the tree is stopped and the reason is `Aborted`.
    pub fn cancel_on(&mut self, token: CancellationToken) -> &mut Self {
        self.opts.cancel = Some(token);
        self
    }

    /// `true` (default): output as UTF-8 text (`Data::Text`); `false`: raw bytes (`Data::Bytes`), lossless.
    pub fn text(&mut self, yes: bool) -> &mut Self {
        self.opts.text = yes;
        self
    }

    /// Sends stderr into the stdout pipe at the OS level: one chronological stream (pipe mode).
    pub fn merge_stderr(&mut self, yes: bool) -> &mut Self {
        self.req.merge_stderr = yes;
        self
    }

    /// stdin of a spawned pipe child (default `Stdin::Closed`).
    pub fn stdin(&mut self, stdin: Stdin) -> &mut Self {
        self.req.stdin = stdin;
        self
    }

    /// `run()` only: written to stdin, which is then closed (pipe mode).
    pub fn input(&mut self, data: impl Into<Vec<u8>>) -> &mut Self {
        self.opts.input = Some(data.into());
        self
    }

    /// `run()` only: per-stream limit (default 16 MiB); above it `run()` fails with `OutputLimit`.
    pub fn max_output_bytes(&mut self, bytes: usize) -> &mut Self {
        self.opts.max_output_bytes = bytes;
        self
    }

    /// Runs inside a terminal of `size`: used by `run()` and `spawn_pty()`.
    pub fn pty(&mut self, size: PtySize) -> &mut Self {
        self.pty = Some(size);
        self
    }

    /// Starts the process with pipes. Fails with `InvalidArgument` if `pty()` was set (use `spawn_pty()`).
    pub fn spawn(&self) -> Result<PipeChild, Error> {
        process::spawn_pipe(&self.request(self.pty), &self.opts)
    }

    /// Starts the process inside a terminal (the `pty()` size, or 80 x 24).
    pub fn spawn_pty(&self) -> Result<PtyChild, Error> {
        process::spawn_pty(&self.request(Some(self.pty.unwrap_or_default())), &self.opts)
    }

    /// Runs to completion and returns the exit status with the complete output (contract §6).
    /// A non-zero exit is not an error.
    pub async fn run(&self) -> Result<RunOutput, Error> {
        process::run(&self.request(self.pty), &self.opts).await
    }

    fn request(&self, pty: Option<PtySize>) -> Request {
        let mut req = self.req.clone();
        req.mode = match pty {
            Some(size) => Mode::Pty(size),
            None => Mode::Pipe,
        };
        req
    }
}
