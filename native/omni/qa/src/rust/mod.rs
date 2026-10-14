//! The Rust runner, `omni-qa runner <workload> <arm>`: the workloads through `hugr_omni` (arm `omni`) or
//! `std::process` (arm `std`), one JSON record per task on stdout, then `{"kind":"end"}`. This process is the host
//! that K7 watches.

mod agent;
mod arm;
mod ask;
mod misbehave;
mod perf;
mod stdlib;
mod suites;
mod term;

use std::future::Future;
use std::pin::Pin;
use std::process::ExitCode;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub use arm::{Arm, Proc, Spec};
use ask::Oracle;

use crate::oracle::{self, Probe, Root};
use crate::record::Record;
use crate::setup::Setup;

pub fn main(args: &[String]) -> ExitCode {
    let (Some(workload), Some(arm)) = (args.first(), args.get(1).and_then(|a| Arm::parse(a))) else {
        eprintln!("usage: omni-qa runner <QA-A|QA-B|QA-C|QA-D|QA-E|K4|K6> <omni|std>");
        return ExitCode::from(3);
    };
    let setup = match Setup::from_env() {
        Ok(setup) => Arc::new(setup),
        Err(e) => {
            eprintln!("omni-qa runner: {e}");
            return ExitCode::from(3);
        }
    };
    let rt = match tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("omni-qa runner: no runtime: {e}");
            return ExitCode::from(3);
        }
    };
    let mut runner = Runner::new(setup, arm);
    let done = rt.block_on(async {
        match workload.as_str() {
            "QA-A" => suites::tests(&mut runner).await,
            "QA-B" => suites::dev_server(&mut runner).await,
            "QA-C" => term::shells(&mut runner).await,
            "QA-D" => misbehave::all(&mut runner).await,
            "QA-E" => agent::agent_loop(&mut runner).await,
            "K4" => perf::spawn_overhead(&runner).await,
            "K6" => perf::soak(&mut runner).await,
            other => Err(format!("no workload {other}")),
        }
    });
    // Tasks that hung were abandoned, not joined: the runtime must not wait for them.
    rt.shutdown_timeout(Duration::from_secs(2));
    match done {
        Ok(()) => {
            Record::end().emit();
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("omni-qa runner {workload}: {e}");
            ExitCode::from(3)
        }
    }
}

/// One task's context: its marker (in the environment of everything it starts), the roots it started, and its start.
#[derive(Clone)]
pub struct Ctx {
    pub tag: String,
    pub setup: Arc<Setup>,
    roots: Arc<Mutex<Vec<Root>>>,
    since: u64,
}

impl Ctx {
    /// A spec for `program` with the task's environment.
    pub fn spec(&self, program: &str, args: &[&str]) -> Spec {
        Spec {
            program: program.into(),
            args: args.iter().map(|a| (*a).to_owned()).collect(),
            env: self.setup.task_env(&self.tag),
            ..Spec::default()
        }
    }

    /// The fixture, with the task's environment.
    pub fn fixture(&self, args: &[&str]) -> Spec {
        self.spec(&self.setup.fixture.to_string_lossy(), args)
    }

    /// Records a root the task started: its pid, with the spawn call's window (`from`, read before the call, to now),
    /// which binds the pid to this root's identity (`oracle::Root`).
    pub fn spawned(&self, from: u64, pid: u32) {
        let to = oracle::filetime_now();
        if let Ok(mut roots) = self.roots.lock() {
            roots.push(Root { pid, from, to });
        }
    }

    fn probe(&self) -> Probe {
        Probe {
            tag: self.tag.clone(),
            roots: self.roots.lock().map(|r| r.clone()).unwrap_or_default(),
            since: self.since,
        }
    }
}

/// What a task measured besides K1/K2, which the runner takes itself.
#[derive(Default)]
pub struct Outcome {
    /// K3: `stop` took this long, with this grace.
    pub stop: Option<(Duration, Duration)>,
    /// K5: output bytes missing or wrong.
    pub lost: u64,
    /// The task does not apply here (only for what the OS lacks).
    pub skip: Option<String>,
    /// The child, kept until the OS has been asked about its tree: dropping an omni `Child` kills its tree, which
    /// would hide a `stop()` that left it running.
    pub keep: Option<Proc>,
}

pub type Body = Pin<Box<dyn Future<Output = Result<Outcome, String>> + Send>>;

/// A task ready to run: its name, its context, how long it may take before it counts as hung (K2), and its body.
pub struct Task {
    pub name: String,
    pub ctx: Ctx,
    pub bound: Duration,
    pub body: Body,
}

pub struct Runner {
    pub setup: Arc<Setup>,
    pub arm: Arm,
    pub oracle: Arc<Oracle>,
    next: u32,
    injected: bool,
}

impl Runner {
    fn new(setup: Arc<Setup>, arm: Arm) -> Runner {
        Runner {
            setup,
            arm,
            oracle: Oracle::start(),
            next: 0,
            injected: false,
        }
    }

    /// A fresh task context.
    pub fn ctx(&mut self) -> Ctx {
        self.next += 1;
        Ctx {
            tag: format!("{}-{}-{}-", self.setup.run, self.arm.name(), self.next),
            setup: self.setup.clone(),
            roots: Arc::default(),
            since: oracle::filetime_now(),
        }
    }

    /// Runs one task (`batch` of one).
    pub async fn task(&mut self, workload: &str, task: Task) -> Result<(), String> {
        self.batch(workload, vec![task]).await
    }

    /// Runs `tasks` at once. Each, as soon as it returns or runs out of its bound (K2), is checked by the oracle (K1:
    /// a snapshot taken after that moment, so a short-lived leftover cannot outlive the batch unseen), which kills
    /// what it proves the task's. Then a record per task, in order.
    ///
    /// On Windows the omni arm runs them one at a time: there a root of `run()` is known only as the supervisor's
    /// child, which no concurrent task could be told apart from, so each such task is a batch of its own and is
    /// checked at once.
    pub async fn batch(&mut self, workload: &str, tasks: Vec<Task>) -> Result<(), String> {
        if cfg!(windows) && self.arm == Arm::Omni && tasks.len() > 1 {
            for task in tasks {
                Box::pin(self.batch(workload, vec![task])).await?;
            }
            return Ok(());
        }
        if self.setup.inject
            && self.arm == Arm::Omni
            && !self.injected
            && let Some(task) = tasks.first()
        {
            self.injected = true;
            inject_orphan(&task.ctx)?;
        }
        let batch_since = tasks.iter().map(|t| t.ctx.since).min().unwrap_or(0);
        let left = Arc::new(AtomicUsize::new(tasks.len()));
        self.oracle.arm(true);
        let running: Vec<_> = tasks
            .into_iter()
            .map(|t| tokio::spawn(checked(t, self.oracle.clone(), left.clone(), batch_since)))
            .collect();
        let mut done = Vec::new();
        for handle in running {
            done.push(handle.await.map_err(|e| format!("a task's wrapper failed: {e}"))?);
        }
        self.oracle.arm(false);
        for (name, result, hung, took, found) in done {
            let mut record = Record {
                kind: "task".into(),
                workload: workload.into(),
                name,
                arm: self.arm.name().into(),
                ms: millis(took),
                hung,
                ..Record::default()
            };
            match found {
                Ok(found) => {
                    record.orphans = count(found.proven.len() + found.batch.len());
                    record.incomplete = count(found.incomplete.len());
                }
                Err(e) => {
                    record.unobserved = true;
                    record.fail = Some(format!("K1 not observed: {e}"));
                }
            }
            match result {
                Ok(outcome) => {
                    record.stop_ms = outcome.stop.map(|(s, _)| millis(s));
                    record.grace_ms = outcome.stop.map(|(_, g)| millis(g));
                    record.lost = outcome.lost;
                    record.skip = outcome.skip;
                    // Only now, with every task of the batch checked, may a kept child go (its drop kills its tree).
                    drop(outcome.keep);
                }
                Err(e) => record.fail = Some(record.fail.map_or(e.clone(), |f| format!("{e}; {f}"))),
            }
            record.emit();
        }
        Ok(())
    }
}

type Checked = (
    String,
    Result<Outcome, String>,
    bool,
    Duration,
    Result<oracle::Found, String>,
);

/// One task of a batch: its body (on a task of its own, which keeps running if it hangs), bounded; then its check.
async fn checked(t: Task, oracle: Arc<Oracle>, left: Arc<AtomicUsize>, batch_since: u64) -> Checked {
    let t0 = Instant::now();
    let mut body = tokio::spawn(t.body);
    let (result, hung) = match tokio::time::timeout(t.bound, &mut body).await {
        Ok(Ok(result)) => (result, false),
        Ok(Err(join)) => (Err(format!("the task panicked: {join}")), false),
        Err(_) => (Err(format!("no return within {:?}", t.bound)), true),
    };
    let took = t0.elapsed();
    let last = left.fetch_sub(1, Ordering::SeqCst) == 1;
    let found = oracle.check(&t.ctx.probe(), last, batch_since).await;
    body.abort();
    (t.name, result, hung, took, found)
}

fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

pub fn millis(d: Duration) -> u64 {
    u64::try_from(d.as_millis()).unwrap_or(u64::MAX)
}

/// What this runner may spend (`HUGR_QA_BOUND_MS`, set by `qa/run`), less a margin to report a hang itself.
pub fn own_bound() -> Duration {
    let given = std::env::var("HUGR_QA_BOUND_MS")
        .ok()
        .and_then(|ms| ms.parse().ok())
        .map_or(Duration::from_secs(600), Duration::from_millis);
    given
        .saturating_sub(Duration::from_secs(10))
        .max(Duration::from_secs(5))
}

/// A record of a task that did not return within `bound` (K2), for the measurements that are not batches (K4, K6).
pub fn hung(workload: &str, name: &str, bound: Duration) -> Record {
    Record {
        kind: "task".into(),
        workload: workload.into(),
        name: name.into(),
        arm: Arm::Omni.name().into(),
        ms: millis(bound),
        hung: true,
        fail: Some(format!("no result within {bound:?}")),
        ..Record::default()
    }
}

/// `--inject-orphan`: a process the task starts and never ends, with the task's marker and in its own group, as a
/// leaky caller would leave one. K1 must count it.
fn inject_orphan(ctx: &Ctx) -> Result<(), String> {
    let spec = ctx.fixture(&["hang"]);
    let from = oracle::filetime_now();
    let child = stdlib::command(&spec, false)
        .spawn()
        .map_err(|e| format!("--inject-orphan: {e}"))?;
    ctx.spawned(from, child.id());
    eprintln!("omni-qa: --inject-orphan left pid {} behind", child.id());
    Ok(())
}

/// K5: bytes missing from `got`, different in it, or extra in it, against `want`.
pub fn lost(want: &[u8], got: &[u8]) -> u64 {
    let altered = want.iter().zip(got).filter(|(a, b)| a != b).count();
    count(altered + want.len().abs_diff(got.len())).into()
}

#[cfg(test)]
mod tests {
    use super::lost;

    #[test]
    fn lost_counts_missing_altered_and_extra_bytes() {
        for (want, got, n) in [
            ("abc", "abc", 0),
            ("abc", "ab", 1),
            ("abc", "", 3),
            ("abc", "aXc", 1),
            ("x", "xCORRUPTION", 10),
            ("abc", "XbcD", 2),
        ] {
            assert_eq!(lost(want.as_bytes(), got.as_bytes()), n, "want {want:?}, got {got:?}");
        }
    }
}
