//! Running a tool with a deadline: a tool that does not answer in time is killed and reported as an error, never
//! waited on (a hang of the harness's own tools must end up in the report, not stall it).

use std::io::Read;
use std::process::{Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

pub struct Ran {
    pub status: ExitStatus,
    pub stdout: String,
    pub stderr: String,
}

/// Runs `cmd` (stdin closed, stdout and stderr captured) for at most `within`.
pub fn run(cmd: &mut Command, within: Duration) -> Result<Ran, String> {
    let name = format!("{:?}", cmd.get_program());
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{name}: {e}"))?;
    let (out, err) = (drain(child.stdout.take()), drain(child.stderr.take()));
    let deadline = Instant::now() + within;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| format!("{name}: {e}"))? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{name} did not finish within {within:?}"));
        }
        std::thread::sleep(Duration::from_millis(5));
    };
    // A descendant of the tool could keep its pipes open: what came within a second is what it said.
    let take = |rx: mpsc::Receiver<Vec<u8>>| {
        let bytes = rx.recv_timeout(Duration::from_secs(1)).unwrap_or_default();
        String::from_utf8_lossy(&bytes).into_owned()
    };
    Ok(Ran {
        status,
        stdout: take(out),
        stderr: take(err),
    })
}

/// `program args` within `within`; its stdout, or an error carrying its stderr when it fails.
pub fn stdout(program: &str, args: &[&str], within: Duration) -> Result<String, String> {
    let ran = run(Command::new(program).args(args), within)?;
    if ran.status.success() {
        Ok(ran.stdout)
    } else {
        Err(format!("{program} {args:?}: {} {}", ran.status, ran.stderr.trim()))
    }
}

fn drain(pipe: Option<impl Read + Send + 'static>) -> mpsc::Receiver<Vec<u8>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut all = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut all);
        }
        let _ = tx.send(all);
    });
    rx
}
