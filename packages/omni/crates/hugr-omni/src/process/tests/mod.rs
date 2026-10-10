//! W07: the pure `Exit` (`exit`); a tree's life against the real supervisor and `omni-fixture` (`tree`, driving
//! `Life`, the tree without its I/O; the contract scenarios prove the same items through the public API); and drop
//! through the public API (`scope`: C-SCOPE-01 has no contract scenario). Both binaries come from
//! `cargo build --workspace --bins`. Liveness always comes from the OS, never from the library, and every wait is
//! bounded: a stop that does not finish fails, it never hangs.

mod agent_loop;
mod big;
mod deadline;
mod exit;
mod host;
mod scope;
mod tree;

use std::future::Future;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use super::life::Life;
use crate::client::{self, HostStdio, Spawned};
use crate::spawn::{self, Request};

/// The bound of every wait.
const LIMIT: Duration = Duration::from_secs(20);

/// `target/<profile>`: a test binary lives in its `deps`.
fn target_dir() -> PathBuf {
    let exe = std::env::current_exe().expect("current_exe");
    exe.parent()
        .and_then(Path::parent)
        .expect("target/<profile>")
        .to_path_buf()
}

fn binary(name: &str) -> PathBuf {
    let path = target_dir().join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    assert!(
        path.is_file(),
        "{} is missing: cargo build --workspace --bins",
        path.display()
    );
    path
}

/// The fixture's file name, as `processes()` reports it.
fn fixture_name() -> String {
    format!("omni-fixture{}", std::env::consts::EXE_SUFFIX)
}

/// Once per process: puts this target dir's supervisor next to the test binary, where the library looks for one
/// (unless `HUGR_OMNI_SUPERVISOR` names one), and runs it and the fixture once. Setting the variable instead would
/// need `unsafe`, which `process` does not allow.
/// - The copy is made only when the build changed, under a private name, then renamed: no run ever executes a
///   half-written file.
/// - Warm-up, not synchronization: macOS validates a new executable on its first exec (15 s measured for a fresh
///   copy of the supervisor), which must not eat into the client's bounds.
fn use_supervisor() {
    static PLACED: OnceLock<()> = OnceLock::new();
    PLACED.get_or_init(|| {
        let mut warm = vec![binary("omni-fixture")];
        if std::env::var_os("HUGR_OMNI_SUPERVISOR").is_none() {
            let built = binary("hugr-omni-supervisor");
            let file = built.file_name().expect("file name").to_owned();
            let placed = std::env::current_exe().expect("current_exe").with_file_name(&file);
            let same = std::fs::read(&placed).ok() == Some(std::fs::read(&built).expect("read the supervisor"));
            if !same {
                let staged = placed.with_extension(format!("{}.part", std::process::id()));
                std::fs::copy(&built, &staged).unwrap_or_else(|e| panic!("copy to {}: {e}", staged.display()));
                if let Err(e) = std::fs::rename(&staged, &placed) {
                    let _ = std::fs::remove_file(&staged);
                    // Windows refuses to replace a binary that another run is executing; that copy is this build.
                    assert!(placed.is_file(), "rename to {}: {e}", placed.display());
                }
            }
            warm.push(placed);
        }
        for exe in warm {
            // Without arguments the fixture exits 0 and the supervisor refuses to run (exit 2): both have run.
            let ran = Command::new(&exe).stdin(std::process::Stdio::null()).output();
            assert!(ran.is_ok(), "{} does not run: {ran:?}", exe.display());
        }
    });
}

/// A pid log for one test: every fixture process started with `pidlog=<it>` appends its pid as it starts.
fn log_path(test: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("omni-w07-{}-{test}.log", std::process::id()));
    let _ = std::fs::remove_file(&path);
    path
}

fn pidlog(log: &Path) -> String {
    format!("pidlog={}", log.display())
}

/// A started fixture tree. Its stdio ends are held, unread (the fixture's few marker lines fit any pipe buffer), and
/// dropping it kills the tree, so a failing test leaves nothing running.
struct Started {
    life: Life,
    log: PathBuf,
    _stdio: HostStdio,
}

impl Started {
    /// `omni-fixture <steps>`, logging pids to `log` when the steps say so (`pidlog`).
    fn new(log: PathBuf, steps: &[&str]) -> Started {
        use_supervisor();
        let mut req = Request::new(binary("omni-fixture").into_os_string());
        req.args = steps.iter().map(Into::into).collect();
        let spec = spawn::prepare(&req).expect("prepare");
        let Spawned { tree, stdio, .. } = client::spawn(&spec).expect("spawn");
        Started {
            life: Life::new(tree),
            log,
            _stdio: stdio,
        }
    }

    /// The pids of the log once it holds `n` complete lines: the order the processes started in (in a `tree`, the
    /// root first, then each level, so line `i` is the parent of line `i + 1`).
    fn pids(&self, n: usize) -> Vec<u32> {
        let deadline = Instant::now() + LIMIT;
        loop {
            let text = std::fs::read_to_string(&self.log).unwrap_or_default();
            let pids: Vec<u32> = text
                .split_inclusive('\n')
                .filter_map(|line| line.strip_suffix('\n')?.trim().parse().ok())
                .collect();
            if pids.len() >= n {
                assert_eq!(pids.len(), n, "more processes than expected: {pids:?}");
                return pids;
            }
            assert!(Instant::now() < deadline, "{n} pids never came: {pids:?}");
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}

impl Drop for Started {
    fn drop(&mut self) {
        self.life.kill();
        let _ = std::fs::remove_file(&self.log);
    }
}

/// Runs `fut` on a runtime of its own (a caller's, never the library's), failing after `LIMIT`.
fn block<F: Future>(fut: F) -> F::Output {
    let caller = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .expect("caller runtime");
    caller.block_on(async { tokio::time::timeout(LIMIT, fut).await.expect("timed out") })
}

/// What the OS says: alive, or not (gone, or a zombie). Fails the test when the OS cannot tell.
fn alive(pid: u32) -> bool {
    match std::env::consts::OS {
        "linux" => proc_stat(pid),
        "windows" => tasklist(pid),
        _ => ps(pid),
    }
}

/// Linux: `/proc/<pid>/stat` is `<pid> (<comm>) <state> ...`.
fn proc_stat(pid: u32) -> bool {
    match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        // ENOENT, or ESRCH (3): it exited while the file was being read.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(3) => false,
        Err(e) => panic!("/proc/{pid}/stat: {e}"),
        Ok(stat) => match stat
            .rsplit_once(')')
            .and_then(|(_, rest)| rest.trim_start().chars().next())
        {
            Some(state) => !matches!(state, 'Z' | 'X'),
            None => panic!("/proc/{pid}/stat unreadable: {stat:?}"),
        },
    }
}

/// macOS: `ps -o stat= -p <pid>` prints the state, or nothing and exits 1 when there is no such process.
fn ps(pid: u32) -> bool {
    let out = Command::new("ps")
        .args(["-o", "stat=", "-p", &pid.to_string()])
        .output()
        .expect("ps");
    let stat = String::from_utf8_lossy(&out.stdout).trim().to_owned();
    match (out.status.code(), stat.as_str()) {
        (Some(1), "") => false,
        (Some(0), s) if !s.is_empty() => !s.starts_with('Z'),
        _ => panic!("ps for {pid}: {out:?}"),
    }
}

/// Windows: `tasklist` lists `"<image>","<pid>",...`, or only an INFO line when no process has that pid. Windows
/// hands a freed pid out again within moments (to `tasklist` itself, among others), so a pid only counts as alive
/// while it is still an `omni-fixture`: every pid these tests check is one.
fn tasklist(pid: u32) -> bool {
    let out = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
        .expect("tasklist");
    let text = String::from_utf8_lossy(&out.stdout);
    if text.contains(&format!("\"{pid}\"")) {
        text.trim_start()
            .to_ascii_lowercase()
            .starts_with("\"omni-fixture.exe\"")
    } else if out.status.success() && text.contains("INFO:") {
        false
    } else {
        panic!("tasklist for {pid}: {out:?}")
    }
}

/// Every pid is dead per the OS within `within` (zero: right now).
fn assert_dead(pids: &[u32], within: Duration) {
    assert_dead_of(pids, within, None);
}

/// `assert_dead` for pids logged to `log` while other tests run fixtures too: on Windows, a pid only counts while
/// its command line still names `log` (a freed pid goes at once to another test's `omni-fixture`).
fn assert_dead_logged(pids: &[u32], within: Duration, log: &Path) {
    assert_dead_of(pids, within, Some(log));
}

fn assert_dead_of(pids: &[u32], within: Duration, log: Option<&Path>) {
    let deadline = Instant::now() + within;
    loop {
        let mut living: Vec<u32> = pids.iter().copied().filter(|&p| alive(p)).collect();
        if let Some(log) = log.filter(|_| !living.is_empty() && std::env::consts::OS == "windows") {
            let name = log
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            living.retain(|&p| command_line(p).contains(&name));
        }
        if living.is_empty() {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "alive per the OS: {living:?} (of {pids:?}){}",
            describe(&living)
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Windows: who holds each pid now (a reused pid shows another command line), for the failure message.
fn describe(pids: &[u32]) -> String {
    if std::env::consts::OS != "windows" {
        return String::new();
    }
    let filter = pids
        .iter()
        .map(|p| format!("ProcessId={p}"))
        .collect::<Vec<_>>()
        .join(" or ");
    let query = format!(
        "Get-CimInstance Win32_Process -Filter '{filter}' | Format-List ProcessId,ParentProcessId,CreationDate,CommandLine"
    );
    match Command::new("powershell")
        .args(["-NoProfile", "-Command", &query])
        .output()
    {
        Ok(out) => format!("\n{}", String::from_utf8_lossy(&out.stdout).trim()),
        Err(e) => format!("\n(powershell: {e})"),
    }
}

/// Windows: the command line of `pid` now, empty when no process has it.
fn command_line(pid: u32) -> String {
    let query = format!("(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine");
    Command::new("powershell")
        .args(["-NoProfile", "-Command", &query])
        .output()
        .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
        .unwrap_or_default()
}
