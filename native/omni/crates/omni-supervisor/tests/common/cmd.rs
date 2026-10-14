//! What the test host runs: a program, its arguments, environment, cwd and stdio slots, as a `Spawn` message
//! for the supervisor or as a `std::process::Command` for the in-host control.

use std::ffi::OsString;
use std::os::unix::ffi::OsStrExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use omni_proto::{Slot, Spawn};

/// What to run, and how.
#[derive(Clone, Debug)]
pub struct Cmd {
    pub program: PathBuf,
    pub argv: Vec<OsString>,
    pub env: Vec<(OsString, OsString)>,
    pub cwd: PathBuf,
    pub stdin: bool,
    pub merge: bool,
    pub grace_ms: u32,
    /// A Windows command-line tail (amendment WP8b): the Unix supervisor refuses it.
    pub verbatim: Option<Vec<u8>>,
}

impl Cmd {
    pub fn new(program: &str, args: &[&str]) -> Cmd {
        let mut argv = vec![OsString::from(program)];
        argv.extend(args.iter().map(OsString::from));
        Cmd {
            program: PathBuf::from(program),
            argv,
            env: std::env::vars_os().collect(),
            cwd: std::env::current_dir().unwrap(),
            stdin: false,
            merge: true,
            grace_ms: 300,
            verbatim: None,
        }
    }

    /// This test binary in a child role (`role.rs`).
    pub fn role(spec: &str) -> Cmd {
        let exe = std::env::current_exe().unwrap();
        let mut c = Cmd::new(
            exe.to_str().unwrap(),
            &["--exact", "role", "--nocapture", "--test-threads=1", "-q"],
        );
        c.env.retain(|(k, _)| k != super::role::VAR);
        c.env.push((super::role::VAR.into(), spec.into()));
        c
    }

    pub fn stdin(mut self) -> Cmd {
        self.stdin = true;
        self
    }

    pub fn separate_stderr(mut self) -> Cmd {
        self.merge = false;
        self
    }

    pub fn grace(mut self, ms: u32) -> Cmd {
        self.grace_ms = ms;
        self
    }

    /// The same command through `std::process` (the in-host control), stdout piped.
    pub fn std(&self) -> Command {
        let mut c = Command::new(&self.program);
        c.args(&self.argv[1..])
            .env_clear()
            .envs(self.env.iter().cloned())
            .current_dir(&self.cwd);
        c.stdin(Stdio::null()).stdout(Stdio::piped());
        c
    }

    pub fn spawn_msg(&self, req: u64) -> Spawn {
        let b = |s: &std::ffi::OsStr| s.as_bytes().to_vec();
        Spawn {
            req,
            program: b(self.program.as_os_str()),
            argv: self.argv.iter().map(|a| b(a)).collect(),
            env: self.env.iter().map(|(k, v)| (b(k), b(v))).collect(),
            cwd: b(self.cwd.as_os_str()),
            pty: None,
            stdin: if self.stdin { Slot::Pipe } else { Slot::Null },
            stderr: if self.merge { Slot::Merge } else { Slot::Pipe },
            grace_ms: self.grace_ms,
            handles: [0; 3],
            verbatim: self.verbatim.clone(),
        }
    }
}
