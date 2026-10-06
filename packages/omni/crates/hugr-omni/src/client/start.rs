//! Starting things: the supervisor generation (lazily, and again after a death), its binary, and one
//! tree (the `Spawn` request with its pipes).

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use omni_proto::{FailCode, Msg, Slot};

use super::channel::{Answer, Gen, Want};
use super::{HostStdio, Pipe, Spawned, Tree, lock, millis, sys};
use crate::error::{Error, ErrorCode};
use crate::spawn::{Mode, Spec};
use crate::types::Stdin;

#[cfg(unix)]
pub(super) const EXE: &str = "hugr-omni-supervisor";
#[cfg(windows)]
pub(super) const EXE: &str = "hugr-omni-supervisor.exe";

/// Holds the current generation and runs at most one start at a time (R2). Callers that arrive while a
/// start is running wait for it (at most `wait`) and share its outcome, success or failure; a later
/// caller after a failure starts a fresh attempt.
pub(super) struct Registry {
    wait: Duration,
    st: Mutex<Reg>,
}

struct Reg {
    num: u64,
    live: Option<Arc<Gen>>,
    starting: Option<Arc<Attempt>>,
}

/// One start in progress; `done` is its outcome (a failure as its message).
#[derive(Default)]
struct Attempt {
    done: Mutex<Option<Result<Arc<Gen>, String>>>,
    cv: Condvar,
}

impl Registry {
    pub(super) const fn new(wait: Duration) -> Registry {
        let reg = Reg {
            num: 0,
            live: None,
            starting: None,
        };
        Registry {
            wait,
            st: Mutex::new(reg),
        }
    }

    /// The live generation, or a new one from `open(number)`. `open` runs without the lock held.
    pub(super) fn get(&self, open: impl FnOnce(u64) -> Result<Arc<Gen>, Error>) -> Result<Arc<Gen>, Error> {
        let (num, attempt) = {
            let mut reg = lock(&self.st);
            if let Some(sup) = reg.live.as_ref().filter(|g| g.alive()) {
                return Ok(sup.clone());
            }
            if let Some(running) = &reg.starting {
                let running = running.clone();
                drop(reg);
                return running.join(self.wait);
            }
            reg.num += 1;
            let attempt = Arc::new(Attempt::default());
            reg.starting = Some(attempt.clone());
            (reg.num, attempt)
        };
        let outcome = open(num);
        {
            let mut reg = lock(&self.st);
            reg.starting = None;
            if let Ok(sup) = &outcome {
                reg.live = Some(sup.clone());
            }
        }
        *lock(&attempt.done) = Some(outcome.as_ref().map(Arc::clone).map_err(ToString::to_string));
        attempt.cv.notify_all();
        outcome
    }
}

impl Attempt {
    fn join(&self, wait: Duration) -> Result<Arc<Gen>, Error> {
        let done = lock(&self.done);
        let (done, _) = self
            .cv
            .wait_timeout_while(done, wait, |d| d.is_none())
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match done.as_ref() {
            Some(Ok(sup)) => Ok(sup.clone()),
            Some(Err(first)) => Err(Error::supervisor_start_shared(first)),
            None => Err(Error::supervisor_start_timed_out(wait)),
        }
    }
}

/// One `Spawn` round trip on `sup`: creates the pipes, hands the child's ends over, and returns the
/// host's ends with the tree (rolled back if the host cannot take its terminal ends).
pub(super) fn spawn_on(sup: &Arc<Gen>, spec: &Spec) -> Result<Spawned, Error> {
    sup.home()?;
    let pty = match spec.mode {
        Mode::Pty(size) => Some((size.cols, size.rows)),
        Mode::Pipe => None,
    };
    let piped = pty.is_none() && spec.stdin == Stdin::Pipe;
    let merged = pty.is_none() && spec.merge_stderr;
    let (host, handles, fds) = match pty {
        Some(_) => ([None, None, None], [0; 3], Vec::new()),
        None => {
            let created = pipes(piped, merged);
            let (host, child) = created.map_err(|e| Error::host_ends("cannot create the child's pipes", &e))?;
            let given = sup.chan().hand_over(child);
            let (handles, fds) = given.map_err(|e| Error::host_ends("cannot pass the pipes to the supervisor", &e))?;
            (host, handles, fds)
        }
    };
    let frame = |req| {
        Msg::Spawn(omni_proto::Spawn {
            req,
            program: bytes(spec.program.as_os_str()),
            argv: spec.argv.iter().map(|a| bytes(a)).collect(),
            env: spec.env.iter().map(|(k, v)| (bytes(k), bytes(v))).collect(),
            cwd: bytes(spec.cwd.as_os_str()),
            pty,
            stdin: if piped { Slot::Pipe } else { Slot::Null },
            stderr: if merged { Slot::Merge } else { Slot::Pipe },
            grace_ms: millis(spec.grace),
            handles,
        })
    };
    let answer = sup
        .call(Want::Spawn { pty: pty.is_some() }, 0, frame, fds)
        .inspect_err(|_| {
            // An error with the generation alive means nothing was sent (too big, admission): take the ends back.
            if sup.alive() {
                sup.chan().reclaim(handles);
            }
        });
    let program = spec.program.display().to_string();
    let (id, pid, ends, life) = match answer? {
        Answer::Spawned { id, pid, ends, life } => (id, pid, ends, life),
        Answer::Failed { code, errno, msg } => return Err(failed(code, errno, &msg, &program)),
        _ => {
            return Err(Error::supervisor_refused(
                "Spawn",
                &program,
                "it sent an unexpected reply",
            ));
        }
    };
    let tree = Tree::new(sup.clone(), id, life, cfg!(unix) && pty.is_some());
    let stdio = match (ends, host) {
        (Some(ends), _) => sup.chan().pty(ends),
        (None, [stdin, Some(stdout), stderr]) => Ok(HostStdio::Pipes { stdin, stdout, stderr }),
        (None, _) => Err(std::io::Error::other("the supervisor sent no terminal ends")),
    };
    match stdio {
        Ok(stdio) => Ok(Spawned { tree, pid, stdio }),
        Err(e) => {
            // The tree exists in the supervisor: end it (dropping it then sends Release).
            tree.stop_detached(Duration::ZERO);
            Err(Error::host_ends(
                "cannot take the terminal ends of the started program",
                &e,
            ))
        }
    }
}

/// The host's and the child's ends, in stdin, stdout, stderr order (stdout is always a pipe).
type Ends3 = [Option<Pipe>; 3];

fn pipes(piped: bool, merged: bool) -> std::io::Result<(Ends3, Ends3)> {
    let (in_host, in_child) = match piped {
        true => sys::pipe().map(|(r, w)| (Some(w), Some(r)))?,
        false => (None, None),
    };
    let (out_r, out_w) = sys::pipe()?;
    let (err_host, err_child) = match merged {
        true => (None, None),
        false => sys::pipe().map(|(r, w)| (Some(r), Some(w)))?,
    };
    Ok(([in_host, Some(out_r), err_host], [in_child, Some(out_w), err_child]))
}

/// OS strings as protocol bytes: raw on Unix, WTF-8 on Windows (std's encoding of `OsStr`).
fn bytes(s: &OsStr) -> Vec<u8> {
    s.as_encoded_bytes().to_vec()
}

/// The error for a `SpawnFailed` reply about `program`.
pub(super) fn failed(code: FailCode, errno: i32, msg: &str, program: &str) -> Error {
    let code = match code {
        FailCode::NotFound => ErrorCode::NotFound,
        FailCode::NotExecutable => ErrorCode::NotExecutable,
        FailCode::BadCwd => ErrorCode::InvalidCwd,
        FailCode::Invalid => ErrorCode::InvalidArgument,
        FailCode::Io => ErrorCode::Io,
    };
    Error::spawn_refused(code, program, msg, errno)
}

/// `HUGR_OMNI_SUPERVISOR`, then next to the native module, then next to the current executable.
pub(super) fn locate() -> Result<PathBuf, Error> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf));
    pick(std::env::var_os("HUGR_OMNI_SUPERVISOR"), &[sys::module_dir(), exe_dir])
}

pub(super) fn pick(env: Option<OsString>, dirs: &[Option<PathBuf>]) -> Result<PathBuf, Error> {
    if let Some(path) = env.filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    let tried: Vec<PathBuf> = dirs.iter().flatten().map(|d| d.join(EXE)).collect();
    match tried.iter().find(|p| p.is_file()) {
        Some(found) => Ok(found.clone()),
        None => Err(Error::supervisor_not_found(&tried)),
    }
}
