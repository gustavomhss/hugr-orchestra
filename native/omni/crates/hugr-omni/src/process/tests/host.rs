//! The processes around a child dying, each run in a process of its own: this test binary run again in a role.
//!
//! C-HOST-01, a Rust host: however the host process ends — `main` returns, `process::exit`, an uncaught panic,
//! SIGINT to its process group (Ctrl-C), SIGTERM, a hard kill (SIGKILL; TerminateProcess on Windows) — the
//! supervisor stops the child's whole tree, members that ignore the graceful request included (GUARANTEES: "host
//! process dies"). The host installs nothing: a signal ends it the default way, and the tree is never ended by a
//! destructor of the host (the child is leaked), only by the supervisor (ADR-0005 §7, §9).
//!
//! The supervisor dying during a `run()` (Unix): the run still ends its output within the drain and rejects with
//! `IO`, carrying what it collected and the root's `Exit` it already knew.

use std::io::Write;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::time::{Duration, Instant};

use super::deadline::logged;
use super::{LIMIT, alive, assert_dead, binary, log_path, pidlog, use_supervisor};
use crate::Command;

/// Selects the host role and how the host ends.
const ROLE: &str = "HUGR_OMNI_W09_HOST";
/// The pid log of the host's tree.
const LOG: &str = "HUGR_OMNI_W09_HOST_LOG";
/// The tree's grace: the supervisor stops it with this grace when the host dies.
const GRACE: Duration = Duration::from_millis(300);
/// The exit code of `exit`, so that a host that ended some other way is told apart.
const EXIT_CODE: i32 = 7;

/// The host of the tests below: spawns a resisting 3-process tree and leaks the child, then holds still until the
/// test lets it go (a line on stdin, or its end), and only then ends as `ROLE` says. A no-op in a normal run.
#[test]
fn host_role() {
    let (Ok(mode), Some(log)) = (std::env::var(ROLE), std::env::var_os(LOG)) else {
        return;
    };
    use_supervisor();
    let child = Command::new(binary("omni-fixture"))
        .args([pidlog(Path::new(&log)).as_str(), "ignore-term", "tree=2:resist", "hang"])
        .grace(GRACE)
        .spawn()
        .expect("spawn");
    logged(Path::new(&log), 3);
    std::mem::forget(child);
    let _ = std::io::stdin().read_line(&mut String::new());
    match mode.as_str() {
        "return" => {}
        "exit" => std::process::exit(EXIT_CODE),
        "panic" => panic!("the host panics with a live child"),
        _ => loop {
            std::thread::park();
        },
    }
}

/// How the test ends the host, and how the host must have ended.
enum End {
    /// The host ends on its own, with this exit code.
    Itself(i32),
    /// The test kills it hard (`std::process::Child::kill`).
    Killed,
    /// The test sends this signal (to the host's process group with `group`), and the host dies of it.
    #[cfg(unix)]
    Signal { name: &'static str, num: i32, group: bool },
}

/// Starts the host in `mode` (its pid log named after `test`), checks its tree is up while it holds still, lets it
/// go and ends it per `end`, checks it ended that way, then that its tree is gone per the OS within the grace and
/// the supervisor's reaction time.
fn host_ends(test: &str, mode: &str, end: End) {
    use_supervisor();
    let log = log_path(&format!("w09-host-{test}"));
    let mut host = role("host_role");
    host.env(ROLE, mode).env(LOG, &log).stdin(Stdio::piped());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut host, 0);
    let mut host = Role(host.spawn().expect("start the host"));
    let tree = logged(&log, 3);
    assert!(
        tree.iter().all(|&pid| alive(pid)),
        "{mode}: the tree is not up: {tree:?}"
    );
    host.go();
    match &end {
        End::Itself(_) => {}
        End::Killed => host.0.kill().expect("kill the host"),
        #[cfg(unix)]
        End::Signal { name, group, .. } => {
            let target = if *group {
                format!("-{}", host.0.id())
            } else {
                host.0.id().to_string()
            };
            send(name, &target);
        }
    }
    let status = exited(&mut host.0);
    match end {
        End::Itself(code) => assert_eq!(status.code(), Some(code), "{mode}: {status:?}"),
        End::Killed => {
            // std kills with SIGKILL on Unix and `TerminateProcess(_, 1)` on Windows.
            #[cfg(unix)]
            assert_eq!(
                std::os::unix::process::ExitStatusExt::signal(&status),
                Some(9),
                "{mode}: {status:?}"
            );
            #[cfg(windows)]
            assert_eq!(status.code(), Some(1), "{mode}: {status:?}");
        }
        #[cfg(unix)]
        End::Signal { num, .. } => {
            let signal = std::os::unix::process::ExitStatusExt::signal(&status);
            assert_eq!(
                signal,
                Some(num),
                "{mode}: the host did not die of the signal: {status:?}"
            );
        }
    }
    assert_dead(&tree, GRACE + Duration::from_secs(3));
    let _ = std::fs::remove_file(&log);
}

/// This test binary, to run only the role test `name` of this module.
fn role(name: &str) -> std::process::Command {
    let mut role = std::process::Command::new(std::env::current_exe().expect("current_exe"));
    role.args([
        &format!("process::tests::host::{name}"),
        "--exact",
        "--nocapture",
        "--test-threads=1",
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    role
}

/// A role's process. Dropping it kills it, so a failing check leaves no parked host behind (its supervisor then ends
/// the tree).
struct Role(std::process::Child);

impl Role {
    /// Lets a held host go on to its end.
    fn go(&mut self) {
        if let Some(mut stdin) = self.0.stdin.take() {
            let _ = stdin.write_all(b"go\n");
        }
    }
}

impl Drop for Role {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

/// The role's status once it ended, failing after `LIMIT`.
fn exited(role: &mut std::process::Child) -> ExitStatus {
    let deadline = Instant::now() + LIMIT;
    loop {
        if let Some(status) = role.try_wait().expect("try_wait") {
            return status;
        }
        assert!(Instant::now() < deadline, "the role did not end");
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// `kill -s <signal> -- <target>` (a pid, or `-<pgid>`).
#[cfg(unix)]
fn send(signal: &str, target: &str) {
    let sent = std::process::Command::new("kill")
        .args(["-s", signal, "--", target])
        .status()
        .expect("run kill");
    assert!(sent.success(), "kill -s {signal} {target}: {sent:?}");
}

#[test]
fn the_host_returns_from_main() {
    host_ends("return", "return", End::Itself(0));
}

#[test]
fn the_host_calls_process_exit() {
    host_ends("exit", "exit", End::Itself(EXIT_CODE));
}

#[test]
fn the_host_panics() {
    // libtest reports the uncaught panic of the test and exits 101.
    host_ends("panic", "panic", End::Itself(101));
}

#[test]
fn the_host_is_killed_hard() {
    host_ends("kill", "wait", End::Killed);
}

#[cfg(unix)]
#[test]
fn the_host_gets_ctrl_c() {
    // SIGINT to the host's process group, as a terminal sends it: the supervisor and the trees are not in it.
    host_ends(
        "sigint",
        "wait",
        End::Signal {
            name: "INT",
            num: 2,
            group: true,
        },
    );
}

#[cfg(unix)]
#[test]
fn the_host_gets_sigterm() {
    host_ends(
        "sigterm",
        "wait",
        End::Signal {
            name: "TERM",
            num: 15,
            group: false,
        },
    );
}

#[cfg(unix)]
mod lost;
