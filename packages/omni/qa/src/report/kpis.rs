//! From the runners' records to K1–K7 per language and arm, and omni's verdict (`judge`), with no I/O.

use std::time::Instant;

use serde::Serialize;

use crate::record::Record;
use crate::setup::Mode;

pub enum Ended {
    Ok,
    /// The runner stopped itself with an error (exit 3).
    Error(String),
    /// The host died: K7.
    Crash(String),
    /// The runner did not finish within its bound: K2.
    Hung(String),
    /// The mode's budget ran out before it could run.
    NotRun(String),
}

pub struct Invocation {
    pub lang: String,
    pub workload: String,
    pub arm: String,
    pub records: Vec<Record>,
    pub ended: Ended,
    /// What the final observation, after the runner ended, proved its tasks left (and killed), or why it failed.
    pub leftovers: Result<Vec<u32>, String>,
    /// Proven processes (counted) the oracle did not kill: their link to strong evidence could not be confirmed.
    pub left_running: Vec<u32>,
    pub seconds: f64,
}

impl Invocation {
    pub fn not_run(lang: &str, workload: &str, arm: &str, why: String) -> Invocation {
        Invocation {
            lang: lang.into(),
            workload: workload.into(),
            arm: arm.into(),
            records: Vec::new(),
            ended: Ended::NotRun(why),
            leftovers: Ok(Vec::new()),
            left_running: Vec::new(),
            seconds: 0.0,
        }
    }
}

pub struct Run {
    pub mode: Mode,
    pub langs: Vec<String>,
    pub control: Result<String, String>,
    pub invocations: Vec<Invocation>,
    /// When the run started (its length is taken when the report is written) and when its budget ends.
    pub started: Instant,
    pub deadline: Instant,
    pub inject: bool,
    /// `--no-k4`: K4 was not run, and the verdict leaves it out (it is judged on quiet CI release builds).
    pub no_k4: bool,
    /// The load average when the run started (`load_average`).
    pub load: String,
}

/// One language and arm's figures.
#[derive(Debug, Default, Serialize)]
pub struct Kpis {
    pub tasks: u32,
    pub k1_orphans: u32,
    pub k1_tasks: u32,
    /// Processes tied to a task only by an unobserved link: an incomplete observation, which fails like an orphan.
    pub k1_incomplete: u32,
    /// Checks whose OS observation failed: K1 is not known there, which fails.
    pub k1_unobserved: u32,
    /// Counted processes left running (link unconfirmable), per runner: `workload: [pids]`.
    pub k1_left_running: Vec<String>,
    pub k2_hung: u32,
    pub k3_stops: u32,
    pub k3_p95_over_grace_ms: Option<i64>,
    pub k3_trees_survived: u32,
    pub k4_pid_p50_us: Option<f64>,
    pub k4_round_trip_p50_us: Option<f64>,
    pub k5_lost_bytes: u64,
    pub k6_host_fds_delta: Option<i64>,
    pub k6_supervisor_fds_delta: Option<i64>,
    pub k6_rss_growth_kb: Option<i64>,
    pub k7_crashes: u32,
    pub failed: Vec<String>,
    pub skipped: Vec<String>,
}

pub fn kpis(run: &Run, lang: &str, arm: &str) -> Kpis {
    let mut k = Kpis::default();
    let mut over = Vec::new();
    for inv in run.invocations.iter().filter(|i| i.lang == lang) {
        for r in inv.records.iter().filter(|r| r.arm == arm) {
            // Whatever the kind of record, skipped or not: a failed check fails, and K1 counts what the OS showed.
            if let Some(fail) = &r.fail {
                k.failed.push(format!("{}/{}: {fail}", r.workload, r.name));
            }
            k.k1_unobserved += u32::from(r.unobserved);
            k.k1_orphans += r.orphans;
            k.k1_incomplete += r.incomplete;
            k.k1_tasks += u32::from(r.orphans + r.incomplete > 0);
            // A skip only drops the workload's own measurement (K2, K3, K5, K4, K6).
            if let Some(skip) = &r.skip {
                k.skipped.push(format!("{}/{}: {skip}", r.workload, r.name));
                continue;
            }
            match r.kind.as_str() {
                "task" => {
                    k.tasks += 1;
                    k.k2_hung += u32::from(r.hung);
                    if let (Some(stop), Some(grace)) = (r.stop_ms, r.grace_ms) {
                        k.k3_stops += 1;
                        k.k3_trees_survived += u32::from(r.orphans + r.incomplete > 0);
                        over.push(i64::try_from(stop).unwrap_or(i64::MAX) - i64::try_from(grace).unwrap_or(0));
                    }
                    k.k5_lost_bytes += r.lost;
                }
                "k4" => (k.k4_pid_p50_us, k.k4_round_trip_p50_us) = (r.pid_p50_us, r.rt_p50_us),
                "k6" => {
                    if let (Some(b), Some(a)) = (r.before, r.after) {
                        let delta =
                            |a: u64, b: u64| i64::try_from(a).unwrap_or(i64::MAX) - i64::try_from(b).unwrap_or(0);
                        k.k6_host_fds_delta = Some(delta(a.host.fds, b.host.fds));
                        k.k6_supervisor_fds_delta = a.supervisor.zip(b.supervisor).map(|(a, b)| delta(a.fds, b.fds));
                        k.k6_rss_growth_kb = Some(delta(a.host.rss_kb, b.host.rss_kb));
                    }
                }
                _ => {}
            }
        }
        if inv.arm != arm {
            continue;
        }
        if !inv.left_running.is_empty() {
            k.k1_left_running
                .push(format!("{}: {:?}", inv.workload, inv.left_running));
        }
        match &inv.leftovers {
            Ok(left) if left.is_empty() => {}
            Ok(left) => {
                k.k1_orphans += u32::try_from(left.len()).unwrap_or(u32::MAX);
                k.k1_tasks += 1;
                k.failed.push(format!(
                    "{}: left behind after the runner ended: {left:?}",
                    inv.workload
                ));
            }
            Err(e) => {
                k.k1_unobserved += 1;
                k.failed
                    .push(format!("{}: the final observation failed: {e}", inv.workload));
            }
        }
        match &inv.ended {
            Ended::Ok => {}
            Ended::Error(e) | Ended::NotRun(e) => k.failed.push(format!("{}: {e}", inv.workload)),
            Ended::Crash(e) => {
                k.k7_crashes += 1;
                k.failed.push(format!("{}: the host crashed: {e}", inv.workload));
            }
            Ended::Hung(e) => {
                k.k2_hung += 1;
                k.failed.push(format!("{}: {e}", inv.workload));
            }
        }
    }
    over.sort_unstable();
    k.k3_p95_over_grace_ms = (!over.is_empty()).then(|| over[(over.len() * 95).div_ceil(100) - 1]);
    k
}

/// omni's verdict on K1–K7 (`None` = not measured, which fails).
pub fn verdicts(omni: &Kpis, std: &Kpis) -> [Option<bool>; 7] {
    let k4 = |o: Option<f64>, s: Option<f64>| o.zip(s).map(|(o, s)| o <= (1.25 * s).max(s + 300.0));
    [
        Some(omni.k1_orphans == 0 && omni.k1_incomplete == 0 && omni.k1_unobserved == 0),
        Some(omni.k2_hung == 0),
        omni.k3_p95_over_grace_ms
            .map(|p| p <= 500 && omni.k3_trees_survived == 0),
        k4(omni.k4_pid_p50_us, std.k4_pid_p50_us)
            .zip(k4(omni.k4_round_trip_p50_us, std.k4_round_trip_p50_us))
            .map(|(a, b)| a && b),
        Some(omni.k5_lost_bytes == 0),
        // The supervisor's figures are part of the soak: missing on either side, K6 is not measured.
        omni.k6_host_fds_delta
            .zip(omni.k6_rss_growth_kb)
            .zip(omni.k6_supervisor_fds_delta)
            .map(|((fds, rss), sup)| fds <= 0 && sup <= 0 && rss <= 10 * 1024),
        Some(omni.k7_crashes == 0),
    ]
}

/// Per language: its omni and std figures and omni's verdicts.
pub type PerLang = (String, Kpis, Kpis, [Option<bool>; 7]);

/// The run's verdict: every language's omni meets K1–K7 (K4 left out with `--no-k4`), no omni check failed, the
/// controls passed, and on Windows K8 holds.
pub fn judge(run: &Run, os: &str) -> (Vec<PerLang>, Option<bool>, bool) {
    let per: Vec<PerLang> = run
        .langs
        .iter()
        .map(|lang| {
            let (omni, std) = (kpis(run, lang, "omni"), kpis(run, lang, "std"));
            let v = verdicts(&omni, &std);
            (lang.clone(), omni, std, v)
        })
        .collect();
    let k_ok = |i: usize| (run.no_k4 && i == 3) || per.iter().all(|p| p.3[i] == Some(true));
    let k8 = (os == "windows").then(|| (0..7).all(k_ok));
    let checks = per.iter().all(|p| p.1.failed.is_empty());
    let pass = run.control.is_ok() && !per.is_empty() && (0..7).all(k_ok) && checks && k8 != Some(false);
    (per, k8, pass)
}
