//! A terminal child through the public API, with the real supervisor and `omni-fixture` (both from
//! `cargo build --workspace --bins`): a program that prints one line and exits at once shows exactly that line,
//! 300 runs out of 300 (ADR-0005 R9: the held root execs only once the terminal's reader runs; without the hold
//! macOS drops the line now and then), and an exec failure of the held root comes back from `spawn_pty()` itself,
//! with the code a pipe spawn reports. The contract scenarios C-PTY-01..04 prove the rest. Output is compared with
//! the exact text the terminal shows (`\n` becomes `\r\n`), and every wait is bounded. Unix only: ConPTY renders
//! its own escape sequences (W12w's suite covers Windows).
#![cfg(unix)]

use std::future::Future;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::sync::OnceLock;
use std::time::Duration;

use crate::{Command, ErrorCode, Reason};

const LIMIT: Duration = Duration::from_secs(20);

/// `target/<profile>/<name>`: a test binary lives in its `deps`.
fn binary(name: &str) -> PathBuf {
    let exe = std::env::current_exe().expect("current_exe");
    let path = exe
        .parent()
        .and_then(Path::parent)
        .expect("target/<profile>")
        .join(name);
    assert!(
        path.is_file(),
        "{} is missing: cargo build --workspace --bins",
        path.display()
    );
    path
}

/// Once per process: this build's supervisor next to the test binary, where the library looks for it (unless
/// `HUGR_OMNI_SUPERVISOR` names one), copied under a private name and renamed so no run executes a half-written
/// file; then both binaries run once, so a first exec that macOS validates slowly is not timed.
fn use_supervisor() {
    static PLACED: OnceLock<()> = OnceLock::new();
    PLACED.get_or_init(|| {
        let mut warm = vec![binary("omni-fixture")];
        if std::env::var_os("HUGR_OMNI_SUPERVISOR").is_none() {
            let built = binary("hugr-omni-supervisor");
            let placed = std::env::current_exe()
                .expect("current_exe")
                .with_file_name("hugr-omni-supervisor");
            if std::fs::read(&placed).ok() != Some(std::fs::read(&built).expect("read the supervisor")) {
                let staged = placed.with_extension(format!("{}.pty.part", std::process::id()));
                std::fs::copy(&built, &staged).expect("copy the supervisor");
                std::fs::rename(&staged, &placed).expect("place the supervisor");
            }
            warm.push(placed);
        }
        for exe in warm {
            // Without arguments the fixture exits 0 and the supervisor refuses to run: both have run.
            let ran = StdCommand::new(&exe).stdin(std::process::Stdio::null()).output();
            assert!(ran.is_ok(), "{} does not run: {ran:?}", exe.display());
        }
    });
}

/// Runs `fut` on a runtime of the caller's (never the library's), failing after `LIMIT`.
fn block<F: Future>(fut: F) -> F::Output {
    let caller = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .expect("caller runtime");
    caller.block_on(async { tokio::time::timeout(LIMIT, fut).await.expect("timed out") })
}

/// Everything the terminal of `omni-fixture <steps>` shows until the output ends, once its root exited 0.
fn shown(steps: &[String]) -> String {
    let child = Command::new(binary("omni-fixture"))
        .args(steps)
        .spawn_pty()
        .expect("spawn_pty");
    block(async {
        let mut output = child.output().expect("output");
        let mut shown = String::new();
        while let Some(chunk) = output.next().await {
            shown.push_str(&chunk.expect("chunk").data.to_string());
        }
        let exit = child.wait().await.expect("wait");
        assert_eq!((exit.reason, exit.code), (Reason::Exit, Some(0)), "{shown:?}");
        shown
    })
}

#[test]
fn a_program_that_prints_and_exits_at_once_loses_nothing_300_times() {
    use_supervisor();
    let mut lost = Vec::new();
    for i in 0..300 {
        let line = format!("RUN-{i}");
        let shown = shown(&[format!("out={line}\\n")]);
        if shown != format!("{line}\r\n") {
            lost.push((i, shown));
        }
    }
    assert!(lost.is_empty(), "{} of 300 runs lost output: {lost:?}", lost.len());
}

#[test]
fn an_exec_failure_of_the_held_root_comes_back_from_spawn_pty() {
    use_supervisor();
    // Executable by its mode, but not a program: `execve` fails with ENOEXEC after `Go`.
    let path = std::env::temp_dir().join(format!("omni-w12-{}-not-a-program", std::process::id()));
    std::fs::write(&path, "not a program\n").expect("write");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    let pty = Command::new(&path).spawn_pty().map(|c| c.pid());
    let pipe = Command::new(&path).spawn().map(|c| c.pid());
    let _ = std::fs::remove_file(&path);
    let pty = pty.expect_err("spawn_pty of a file that is not a program");
    assert_eq!(pty.code(), ErrorCode::NotExecutable, "{pty}");
    assert_eq!(pipe.map_err(|e| e.code()), Err(ErrorCode::NotExecutable));
}
