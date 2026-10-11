//! The supervisor dies during a `run()`, in the grace window after the root exited.

use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;

use super::*;
use crate::process::tests::deadline::{eventually, pids_in, pipeless_member};
use crate::types::Reason;
use crate::{CancellationToken, ErrorCode};

/// Selects the role (its pid log).
const LOST: &str = "HUGR_OMNI_W09_LOST_LOG";
/// The run's grace, and so its window after the root's exit.
const WINDOW: Duration = Duration::from_secs(3);

/// The run, in a process and so with a supervisor of its own. The root starts a descendant that leaves its
/// session (`escape`) but keeps the output open, prints, and exits; its session is then empty, so the supervisor
/// reports the exit and reaps the root, while the run is in its window. Only once the client has that report is
/// the supervisor killed. The run must still end its output and reject with `IO`, carrying the root's `Exit` and
/// the output. A no-op in a normal run.
#[test]
fn lost_role() {
    let Some(log) = std::env::var_os(LOST).map(PathBuf::from) else {
        return;
    };
    use_supervisor();
    let fixture = binary("omni-fixture");
    let mut cmd = Command::new(&fixture);
    cmd.args([pidlog(&log).as_str(), "escape", "out=ROOT\\n", "exit=0"])
        .grace(WINDOW);
    let kill = async {
        let deadline = Instant::now() + LIMIT;
        let pids = loop {
            let pids = pids_in(&log);
            // Reaped, not only a zombie: the supervisor reports an exit (`Exited`) before it reaps the root.
            if pids.len() == 2 && gone(pids[0]) {
                break pids;
            }
            assert!(Instant::now() < deadline, "the root was never reaped: {pids:?}");
            tokio::time::sleep(Duration::from_millis(10)).await;
        };
        // A round trip through the same supervisor after that report: its channel is ordered, so once the reply
        // is in, the client has recorded the root's exit.
        let probe = Command::new(&fixture).arg("exit=0").spawn().expect("spawn the probe");
        probe.wait().await.expect("the probe's exit");
        send("KILL", &own_supervisor().to_string());
        pids[1]
    };
    let started = Instant::now();
    let (ran, escapee) = super::super::block(async { tokio::join!(cmd.run(), kill) });
    let took = started.elapsed();
    // Out of the tree by design, it would live on for a minute: end it here.
    send("KILL", &escapee.to_string());
    let e = ran.expect_err("a run whose supervisor died");
    assert_eq!(e.code(), ErrorCode::Io, "{e}");
    let result = e.result().expect("the run's result: the root's exit was known");
    assert_eq!(
        (result.exit.code, result.exit.reason),
        (Some(0), Reason::Exit),
        "{result:?}"
    );
    let stdout = result.stdout.to_string();
    assert!(stdout.lines().any(|line| line == "ROOT"), "{stdout:?}");
    assert!(took < WINDOW + Duration::from_secs(2), "the run did not end: {took:?}");
}

/// Not even a zombie any more, per the OS.
fn gone(pid: u32) -> bool {
    processes().iter().all(|&(listed, ..)| listed != pid)
}

/// The armed work of a held child lingers (a member left without the pipes, no timeout, a token that never
/// fires), then the supervisor is killed: the armed work must let go of everything within `LIMIT`, the child
/// still held. A no-op in a normal run.
#[test]
fn lingering_role() {
    let Some(log) = std::env::var_os(LOST).map(PathBuf::from) else {
        return;
    };
    let token = CancellationToken::new();
    let child = pipeless_member(&log, "hang")
        .cancel_on(token.clone())
        .spawn()
        .expect("spawn");
    let member = logged(&log, 1)[0];
    super::super::block(child.wait()).expect("wait");
    let inner = Arc::clone(&child.inner);
    // Held by the child and by us, and weakly by the armed work: it lingers.
    eventually("the armed work lingers", || {
        Arc::strong_count(&inner) == 2 && Arc::weak_count(&inner) == 1
    });
    send("KILL", &own_supervisor().to_string());
    // A dead supervisor leaves Unix trees running, unprotected (GUARANTEES): end the member here.
    send("KILL", &member.to_string());
    eventually("the armed work let go once the supervisor was lost", || {
        Arc::weak_count(&inner) == 0
    });
    assert!(!token.is_cancelled());
    drop(child);
}

#[test]
fn run_keeps_what_it_collected_when_the_supervisor_dies() {
    passes_alone("lost_role");
}

#[test]
fn lingering_ends_when_the_supervisor_is_lost() {
    passes_alone("lingering_role");
}

/// The role test `name` passes in a process (and so with a supervisor) of its own.
fn passes_alone(name: &str) {
    use_supervisor();
    let log = log_path(&format!("w09-{name}"));
    let mut run = role(&format!("lost::{name}"));
    run.env(LOST, &log).stderr(Stdio::piped());
    let mut run = Role(run.spawn().expect("start the role's process"));
    let status = exited(&mut run.0);
    let mut why = String::new();
    if let Some(mut stderr) = run.0.stderr.take() {
        let _ = stderr.read_to_string(&mut why);
    }
    assert!(status.success(), "{name}: {status:?}\n{why}");
    let _ = std::fs::remove_file(&log);
}

/// This process's supervisor, as the OS lists it: its only child named `hugr-omni-supervisor`.
fn own_supervisor() -> u32 {
    let me = std::process::id();
    let mine: Vec<u32> = processes()
        .into_iter()
        .filter(|(_, ppid, name)| *ppid == me && name.starts_with("hugr-omni-super"))
        .map(|(pid, ..)| pid)
        .collect();
    assert_eq!(mine.len(), 1, "this process's supervisors: {mine:?}");
    mine[0]
}

/// Every process: pid, parent pid, and name (Linux truncates it to 15 bytes).
#[cfg(target_os = "linux")]
fn processes() -> Vec<(u32, u32, String)> {
    let entries = std::fs::read_dir("/proc").expect("/proc");
    entries
        .filter_map(|entry| {
            let pid: u32 = entry.ok()?.file_name().to_str()?.parse().ok()?;
            // `<pid> (<name>) <state> <ppid> ...`
            let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
            let (name, rest) = stat.split_once(" (")?.1.rsplit_once(") ")?;
            let ppid = rest.split(' ').nth(1)?.parse().ok()?;
            Some((pid, ppid, name.to_owned()))
        })
        .collect()
}

/// Every process: pid, parent pid, and name (`ps` gives the path).
#[cfg(not(target_os = "linux"))]
fn processes() -> Vec<(u32, u32, String)> {
    let out = std::process::Command::new("ps")
        .args(["-A", "-o", "pid=,ppid=,comm="])
        .output()
        .expect("ps");
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let (pid, ppid) = (fields.next()?.parse().ok()?, fields.next()?.parse().ok()?);
            let path = fields.collect::<Vec<_>>().join(" ");
            let name = Path::new(&path).file_name()?.to_string_lossy().into_owned();
            Some((pid, ppid, name))
        })
        .collect()
}
