//! Actual role/actor custody, independent OS observations, and restore-before-stop cleanup.

use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::CancellationToken;
use crate::client::inventory_probe::{Limit, Receipt, Watch, restore_record};
use crate::process::PipeChild;
use crate::process::child::Inner;

use super::super::deadline::{eventually, logged};
use super::super::{LIMIT, alive, assert_dead, binary, use_supervisor};

pub(super) const TIMEOUT: Duration = Duration::from_secs(6);
pub(super) const MIB: u64 = 1 << 20;

pub(super) fn run_role(case: &str) {
    use_supervisor();
    let directory = std::env::temp_dir().join(format!("omni-n2-{}-{case}", std::process::id()));
    let _ = std::fs::remove_dir_all(&directory);
    std::fs::create_dir(&directory).expect("private role directory");
    let child = Command::new(std::env::current_exe().expect("test binary"))
        .args([
            "--exact",
            "process::tests::inventory::role",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("OMNI_N2_CASE", case)
        .env("OMNI_N2_DIR", &directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("isolated role");
    let mut role = Role {
        child,
        directory,
        finished: false,
    };
    let until = Instant::now() + Duration::from_secs(50);
    let status = loop {
        if let Some(status) = role.child.try_wait().expect("role status") {
            break status;
        }
        assert!(Instant::now() < until, "N2 role {case} exceeded its bounded waits");
        std::thread::sleep(Duration::from_millis(10));
    };
    let mut out = String::new();
    let mut err = String::new();
    role.child
        .stdout
        .take()
        .expect("role stdout")
        .read_to_string(&mut out)
        .expect("read stdout");
    role.child
        .stderr
        .take()
        .expect("role stderr")
        .read_to_string(&mut err)
        .expect("read stderr");
    let cleanup = role.finish();
    assert!(status.success(), "N2 role {case}: {status}\n{out}\n{err}");
    cleanup.expect("successful role must also complete cleanup");
}

struct Role {
    child: std::process::Child,
    directory: PathBuf,
    finished: bool,
}

impl Role {
    fn finish(&mut self) -> Result<(), String> {
        let restored =
            restore_record(&self.directory.join("nofile")).map_err(|e| format!("restore before role cleanup: {e}"));
        let stopped = kill_role(&mut self.child);
        let removed = if restored.is_ok() && stopped.is_ok() {
            std::fs::remove_dir_all(&self.directory).map_err(|e| format!("remove own role directory: {e}"))
        } else {
            Ok(())
        };
        let result = restored.and(stopped).and(removed);
        self.finished = result.is_ok();
        result
    }
}

impl Drop for Role {
    fn drop(&mut self) {
        if !self.finished
            && let Err(error) = self.finish()
        {
            eprintln!("N2 outer role cleanup failed: {error}");
        }
    }
}

fn kill_role(child: &mut std::process::Child) -> Result<(), String> {
    if child.try_wait().map_err(|e| e.to_string())?.is_some() {
        return Ok(());
    }
    child.kill().map_err(|e| format!("kill own role: {e}"))?;
    let until = Instant::now() + LIMIT;
    while child.try_wait().map_err(|e| e.to_string())?.is_none() {
        if Instant::now() >= until {
            return Err("own role did not exit after kill".to_owned());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    Ok(())
}

pub(super) struct Scenario {
    child: Option<PipeChild>,
    pub(super) inner: Arc<Inner>,
    watch: Watch,
    pub(super) directory: PathBuf,
    pub(super) pids: Vec<u32>,
    pub(super) started: Instant,
    supervisor: u32,
    limit: Option<Limit>,
}

impl Scenario {
    pub(super) fn new(
        mode: &str,
        cap: Option<u64>,
        timeout: Option<Duration>,
        cancel: Option<CancellationToken>,
    ) -> Self {
        use_supervisor();
        let directory = PathBuf::from(std::env::var_os("OMNI_N2_DIR").expect("private role directory"));
        let mut cmd = crate::Command::new(std::env::current_exe().expect("actor binary"));
        cmd.args([
            "--exact",
            "process::tests::inventory::actor::root",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("OMNI_N2_ACTOR_DIR", &directory)
        .env("OMNI_N2_ACTOR_MODE", mode)
        .env("OMNI_N2_FIXTURE", binary("omni-fixture"))
        .grace(Duration::from_millis(100));
        if let Some(cap) = cap {
            cmd.max_rss_bytes(cap);
        }
        if let Some(timeout) = timeout {
            cmd.timeout(timeout);
        }
        if let Some(cancel) = cancel {
            cmd.cancel_on(cancel);
        }
        let child = cmd.spawn().expect("real supervised actor root");
        let started = Instant::now();
        let inner = Arc::clone(&child.inner);
        let watch = inner.life.inventory_probe().expect("install per-tree observer");
        let root = logged(&directory.join("root-ready"), 1)[0];
        let descendant = logged(&directory.join("descendant.pids"), 1)[0];
        assert_eq!(root, child.pid());
        assert_ne!(root, descendant);
        assert!(alive(root) && alive(descendant), "both real processes acquired");
        let supervisor = own_supervisor();
        println!("N2 acquired root={root} descendant={descendant} supervisor={supervisor}");
        Self {
            child: Some(child),
            inner,
            watch,
            directory,
            pids: vec![root, descendant],
            started,
            supervisor,
            limit: None,
        }
    }

    pub(super) fn child(&self) -> &PipeChild {
        self.child.as_ref().expect("child retained until the OS assertions")
    }

    pub(super) fn gate(&self, name: &str) {
        std::fs::write(self.directory.join(name), "go\n").expect("release real actor/fixture gate");
    }

    pub(super) fn fault(&mut self) {
        self.limit = Some(
            self.watch
                .restrict(self.supervisor, &self.directory.join("nofile"))
                .expect("restrict only own supervisor"),
        );
    }

    pub(super) fn incomplete(&self) {
        let until = Instant::now() + LIMIT;
        loop {
            match self
                .watch
                .receipts
                .recv_timeout(until.saturating_duration_since(Instant::now()))
                .expect("actual watcher AckError")
            {
                Receipt::Incomplete => {
                    println!("N2 actual watcher AckError consumed; return held for restore");
                    return;
                }
                Receipt::Listed(_) => {}
            }
        }
    }

    pub(super) fn listed(&self) {
        match self
            .watch
            .receipts
            .recv_timeout(LIMIT)
            .expect("actual watcher successful List")
        {
            Receipt::Listed(pids) => assert!(pids.contains(&self.pids[1]), "actual descendant missing from {pids:?}"),
            Receipt::Incomplete => panic!("inventory failed before the controlled fault"),
        }
    }

    pub(super) fn recover(&mut self) {
        self.limit
            .as_mut()
            .expect("active own-supervisor restriction")
            .restore()
            .expect("restore before releasing watcher");
        self.limit = None;
        println!("N2 own supervisor nofile restored before watcher return");
    }

    pub(super) fn place_timeout_fault(&self) {
        // The clock is the stimulus here: inject midway through the ORIGINAL deadline, not an acquisition sleep.
        std::thread::sleep(Duration::from_secs(3).saturating_sub(self.started.elapsed()));
        assert!(
            self.started.elapsed() < TIMEOUT - Duration::from_secs(1),
            "fixture missed original-deadline fault window"
        );
    }

    pub(super) fn lingering(&self) {
        eventually(
            "actual deadline entered weak lingering after a successful inventory",
            || Arc::strong_count(&self.inner) == 2 && Arc::weak_count(&self.inner) == 1,
        );
    }

    pub(super) fn no_weak(&self) {
        let held = if self.child.is_some() { 2 } else { 1 };
        eventually("watch released weak custody and retained no strong state", || {
            Arc::weak_count(&self.inner) == 0 && Arc::strong_count(&self.inner) == held
        });
    }

    pub(super) fn drop_child(&mut self) {
        assert!(self.limit.is_none(), "restore before dropping child");
        drop(self.child.take());
    }

    pub(super) fn rss(&self) -> u64 {
        self.pids
            .iter()
            .map(|pid| {
                let status = std::fs::read_to_string(format!("/proc/{pid}/status")).expect("real OS RSS");
                status
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("VmRSS:")
                            .and_then(|s| s.split_whitespace().next())
                            .and_then(|s| s.parse::<u64>().ok())
                    })
                    .expect("VmRSS kB")
                    * 1024
            })
            .sum()
    }

    pub(super) fn assert_dead(&self, within: Duration) {
        assert_dead(&self.pids, within);
    }

    pub(super) fn finish(&mut self) -> Result<(), String> {
        let restored = self.limit.take().map_or(Ok(()), |mut limit| {
            limit
                .restore()
                .map_err(|e| format!("restore before child cleanup: {e}"))
        });
        let stopped = self.child.take().map_or(Ok(()), |child| stop_child(&child));
        restored.and(stopped)
    }
}

impl Drop for Scenario {
    fn drop(&mut self) {
        if let Err(error) = self.finish() {
            eprintln!("N2 scenario cleanup failed: {error}");
        }
    }
}

fn stop_child(child: &PipeChild) -> Result<(), String> {
    let caller = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .map_err(|e| e.to_string())?;
    caller.block_on(async {
        tokio::time::timeout(LIMIT, child.stop(Some(Duration::ZERO)))
            .await
            .map_err(|_| "child cleanup stop exceeded its bound".to_owned())?
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
}

fn own_supervisor() -> u32 {
    let parent = std::process::id();
    let pids: Vec<u32> = std::fs::read_dir("/proc")
        .expect("OS process table")
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let pid = entry.file_name().to_str()?.parse::<u32>().ok()?;
            let stat = std::fs::read_to_string(entry.path().join("stat")).ok()?;
            let (head, tail) = stat.rsplit_once(')')?;
            let ppid = tail.split_whitespace().nth(1)?.parse::<u32>().ok()?;
            (ppid == parent && head.contains("hugr-omni-super")).then_some(pid)
        })
        .collect();
    assert_eq!(pids.len(), 1, "only this isolated role's own supervisor: {pids:?}");
    pids[0]
}
