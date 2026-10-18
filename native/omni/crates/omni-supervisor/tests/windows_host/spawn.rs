//! What a test asks the supervisor to start (`Spec`), the `Spawn` built for it with fresh pipes for its stdio
//! slots (`Prepared`), and the tree it becomes (`Tree`).

use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::os::windows::io::OwnedHandle;
use std::path::{Path, PathBuf};

use omni_proto::{FailCode, Msg, Slot, Spawn};

use super::Host;
use super::kid::CHILD;
use super::os::{Lines, Proc, pipe};

/// What a test asks the supervisor to start (the fields of `Spawn`).
pub struct Spec {
    /// Absolute path of the file to run.
    pub program: PathBuf,
    /// `argv[0]`, then the arguments.
    pub argv: Vec<OsString>,
    /// The complete environment.
    pub env: Vec<(OsString, OsString)>,
    /// Working directory.
    pub cwd: PathBuf,
    /// `Null` or `Pipe`.
    pub stdin: Slot,
    /// `Pipe` or `Merge`.
    pub stderr: Slot,
    /// Grace on host death.
    pub grace_ms: u32,
    /// The verbatim command-line tail (amendment WP8b); `argv` is then `argv[0]` alone.
    pub verbatim: Option<OsString>,
}

impl Spec {
    /// `program args...` with this process's environment and cwd, stdin null, stderr piped.
    pub fn program(program: &Path, args: &[&str]) -> Spec {
        Spec {
            program: program.into(),
            argv: std::iter::once(program.as_os_str())
                .chain(args.iter().map(OsStr::new))
                .map(Into::into)
                .collect(),
            env: std::env::vars_os().collect(),
            cwd: std::env::current_dir().unwrap(),
            stdin: Slot::Null,
            stderr: Slot::Pipe,
            grace_ms: 1000,
            verbatim: None,
        }
    }

    /// The child program (`windows_child.rs`) in mode `args`.
    pub fn child(args: &[&str]) -> Spec {
        let all: Vec<&str> = CHILD.iter().chain(args).copied().collect();
        Spec::program(&std::env::current_exe().unwrap(), &all)
    }
}

/// A started tree, seen from the host.
pub struct Tree {
    /// Tree id.
    pub id: u64,
    /// Root pid.
    pub pid: u32,
    /// The root, seen by the OS.
    pub root: Proc,
    /// stdout (with stderr when merged).
    pub stdout: Lines,
    /// stderr, when piped.
    pub stderr: Option<Lines>,
    /// stdin, when piped.
    pub stdin: Option<File>,
}

/// A `Spawn` ready to send (its stdio handles already given to the supervisor) and the host's ends.
pub struct Prepared {
    /// Its request id.
    pub req: u64,
    /// The message.
    pub msg: Msg,
    stdout: OwnedHandle,
    stderr: Option<Lines>,
    stdin: Option<File>,
}

impl Host {
    /// The `Spawn` for `spec`, with fresh pipes for its stdio slots.
    pub fn prepare(&mut self, spec: Spec) -> Prepared {
        let (out_r, out_w) = pipe();
        let (stdin, in_h) = match spec.stdin {
            Slot::Pipe => {
                let (r, w) = pipe();
                (Some(File::from(w)), self.give(r))
            }
            _ => (None, 0),
        };
        let (stderr, err_h) = match spec.stderr {
            Slot::Pipe => {
                let (r, w) = pipe();
                (Some(Lines::new(File::from(r))), self.give(w))
            }
            _ => (None, 0),
        };
        let handles = [in_h, self.give(out_w), err_h];
        let bytes = |s: &OsStr| s.as_encoded_bytes().to_vec();
        let req = self.req();
        let msg = Msg::Spawn(Spawn {
            req,
            program: bytes(spec.program.as_os_str()),
            argv: spec.argv.iter().map(|a| bytes(a)).collect(),
            env: spec.env.iter().map(|(k, v)| (bytes(k), bytes(v))).collect(),
            cwd: bytes(spec.cwd.as_os_str()),
            pty: None,
            stdin: spec.stdin,
            stderr: spec.stderr,
            grace_ms: spec.grace_ms,
            handles,
            verbatim: spec.verbatim.as_deref().map(bytes),
        });
        Prepared {
            req,
            msg,
            stdout: out_r,
            stderr,
            stdin,
        }
    }

    /// Spawns `spec` with fresh pipes for its stdio slots.
    pub fn spawn(&mut self, spec: Spec) -> Result<Tree, (FailCode, String)> {
        let p = self.prepare(spec);
        self.send(&p.msg);
        match self.reply(p.req) {
            Msg::Spawned {
                id,
                pid,
                pty_ends: [0, 0],
                ..
            } => {
                let (root, stdout) = (Proc::open(pid), Lines::new(File::from(p.stdout)));
                Ok(Tree {
                    id,
                    pid,
                    root,
                    stdout,
                    stderr: p.stderr,
                    stdin: p.stdin,
                })
            }
            Msg::SpawnFailed { code, msg, .. } => Err((code, msg)),
            other => panic!("unexpected reply to Spawn: {other:?}"),
        }
    }
}
