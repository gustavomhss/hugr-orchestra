//! The `std` arm: `std::process` the way a caller without hugr-omni writes it. Output is drained by a thread per pipe
//! (as `Command::output` does); a timeout or a cancellation kills the root (`Child::kill`, the only stop std has); the
//! result waits for the pipes to close, as `output()` does. The only addition is that on Unix the root starts its own
//! process group, which changes nothing about what `kill` reaches but lets the oracle find its descendants.

use std::io::{Read, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};

use super::Ctx;
use super::arm::{How, Ran, Seen, Spec};

/// How often the std arm polls `try_wait`: std has no wait with a deadline.
const POLL: Duration = Duration::from_millis(2);

/// The std command for `spec`. Windows: std finds only `.exe` files, so npm is called by its real name, `npm.cmd`.
pub fn command(spec: &Spec, stdin_pipe: bool) -> Command {
    let program = if cfg!(windows) && spec.program == "npm" {
        "npm.cmd"
    } else {
        spec.program.as_str()
    };
    let mut cmd = Command::new(program);
    cmd.args(&spec.args)
        .envs(spec.env.iter().map(|(k, v)| (k, v)))
        .stdin(if stdin_pipe { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = &spec.cwd {
        cmd.current_dir(dir);
    }
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    cmd
}

pub async fn run(spec: Spec, ctx: &Ctx) -> Result<Ran, String> {
    let from = crate::oracle::filetime_now();
    let mut child = command(&spec, spec.input.is_some())
        .spawn()
        .map_err(|e| format!("{}: {e}", spec.program))?;
    ctx.spawned(from, child.id());
    if let (Some(input), Some(mut stdin)) = (spec.input.clone(), child.stdin.take()) {
        std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
        });
    }
    let out = drain(child.stdout.take());
    let err = drain(child.stderr.take());
    let started = Instant::now();
    let mut how = How::Exit;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        let late = |limit: Option<Duration>| limit.is_some_and(|l| started.elapsed() >= l);
        if late(spec.timeout) || late(spec.cancel_after) {
            how = if late(spec.timeout) { How::Timeout } else { How::Aborted };
            let _ = child.kill();
            break child.wait().map_err(|e| e.to_string())?;
        }
        tokio::time::sleep(POLL).await;
    };
    // Like `output()`: the result is complete once both pipes closed, which a surviving descendant can delay.
    let (out, err) = tokio::task::spawn_blocking(move || (out.join(), err.join()))
        .await
        .map_err(|e| e.to_string())?;
    let signal = exit_signal(&status);
    Ok(Ran {
        how: if how == How::Exit && signal { How::Signal } else { how },
        code: status.code().map(i64::from),
        out: out.unwrap_or_default(),
        err: err.unwrap_or_default(),
    })
}

fn drain(pipe: Option<impl Read + Send + 'static>) -> JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut all = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut all);
        }
        all
    })
}

#[cfg(unix)]
fn exit_signal(status: &std::process::ExitStatus) -> bool {
    std::os::unix::process::ExitStatusExt::signal(status).is_some()
}

#[cfg(not(unix))]
fn exit_signal(_: &std::process::ExitStatus) -> bool {
    false
}

pub struct StdProc {
    child: std::process::Child,
    stdin: Option<ChildStdin>,
    rx: UnboundedReceiver<Vec<u8>>,
    /// Pipes still open (stdout, stderr).
    open: u8,
    pub seen: Seen,
}

pub fn spawn(spec: &Spec) -> Result<StdProc, String> {
    let mut child = command(spec, spec.stdin_pipe)
        .spawn()
        .map_err(|e| format!("{}: {e}", spec.program))?;
    let (tx, rx) = unbounded_channel();
    forward(child.stdout.take(), tx.clone());
    forward(child.stderr.take(), tx);
    Ok(StdProc {
        stdin: child.stdin.take(),
        child,
        rx,
        open: 2,
        seen: Seen::default(),
    })
}

/// Sends what `pipe` yields, then an empty buffer at its end.
fn forward(pipe: Option<impl Read + Send + 'static>, tx: UnboundedSender<Vec<u8>>) {
    std::thread::spawn(move || {
        if let Some(mut pipe) = pipe {
            let mut buf = vec![0; 64 * 1024];
            while let Ok(n @ 1..) = pipe.read(&mut buf) {
                if tx.send(buf[..n].to_vec()).is_err() {
                    return;
                }
            }
        }
        let _ = tx.send(Vec::new());
    });
}

impl StdProc {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// One more buffer into `seen`; `false` once both pipes closed.
    pub async fn more(&mut self, until: Instant) -> Result<bool, String> {
        loop {
            if self.open == 0 {
                return Ok(false);
            }
            match tokio::time::timeout_at(until.into(), self.rx.recv()).await {
                Err(_) => return Err("timed out".into()),
                Ok(None) => return Ok(false),
                Ok(Some(data)) if data.is_empty() => self.open -= 1,
                Ok(Some(data)) => {
                    self.seen.push(&String::from_utf8_lossy(&data));
                    return Ok(true);
                }
            }
        }
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("stdin is not a pipe")?;
        stdin
            .write_all(data)
            .and_then(|()| stdin.flush())
            .map_err(|e| e.to_string())
    }

    /// std has one way to stop a child: `kill` (SIGKILL / TerminateProcess) the root.
    pub async fn stop(&mut self) -> Result<(), String> {
        let _ = self.child.kill();
        self.wait(Duration::from_secs(10)).await.map(drop)
    }

    pub async fn wait(&mut self, within: Duration) -> Result<Option<i64>, String> {
        let until = Instant::now() + within;
        loop {
            if let Some(status) = self.child.try_wait().map_err(|e| e.to_string())? {
                return Ok(status.code().map(i64::from));
            }
            if Instant::now() >= until {
                return Err(format!("no exit within {within:?}"));
            }
            tokio::time::sleep(POLL).await;
        }
    }
}
