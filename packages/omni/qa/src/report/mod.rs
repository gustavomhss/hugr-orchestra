//! K1–K8 from the runners' records, per language and arm, as `qa/out/report.json` and a readable
//! `qa/out/report.md`. omni is judged against the PLAN §4.2 targets (`kpis::judge`); the stdlib is the baseline it is
//! compared with. The metadata (commit, versions, load) is bounded by what is left of the budget: missing metadata
//! never delays the report.

mod kpis;

#[cfg(test)]
mod tests;

use std::fmt::Write as _;
use std::path::Path;
use std::time::{Duration, Instant};

pub use kpis::{Ended, Invocation, Run};
use kpis::{Kpis, judge};

const KPI_NAMES: [&str; 8] = [
    "K1 orphan processes after a task",
    "K2 hangs (no return within timeout + grace)",
    "K3 stop latency p95, over graceMs",
    "K4 spawn p50: to the pid / round trip",
    "K5 output bytes lost or wrong",
    "K6 1000-task soak: fds/handles back, RSS growth",
    "K7 host crashes",
    "K8 Windows parity (K1–K7 on Windows)",
];
const TARGETS: [&str; 8] = [
    "0",
    "0",
    "≤ 500 ms",
    "≤ 1.25× std or ≤ +0.3 ms",
    "0",
    "Δ ≤ 0; ≤ 10 MB",
    "0",
    "same targets",
];

/// Each metadata command's own limit, within what is left of the budget.
const META: Duration = Duration::from_secs(3);

/// The 1, 5 and 15 minute load averages, where the OS has them (Linux, macOS), read within `within`.
pub fn load_average(within: Duration) -> String {
    let text = match crate::os_name() {
        "linux" => std::fs::read_to_string("/proc/loadavg").unwrap_or_default(),
        "macos" => tool(Path::new("."), "sysctl", &["-n", "vm.loadavg"], within),
        _ => return "n/a".into(),
    };
    let fields: Vec<&str> = text
        .split_whitespace()
        .filter(|f| f.parse::<f64>().is_ok())
        .take(3)
        .collect();
    if fields.len() == 3 {
        fields.join(" ")
    } else {
        "unknown".into()
    }
}

fn cell(k: &Kpis, i: usize, arm: &str) -> String {
    let ms = |us: Option<f64>| us.map_or("–".into(), |u| format!("{:.2}", u / 1000.0));
    match i {
        0 => {
            let mut text = format!("{} ({} tasks)", k.k1_orphans, k.k1_tasks);
            if k.k1_incomplete > 0 {
                let _ = write!(text, " + {} incomplete", k.k1_incomplete);
            }
            if k.k1_unobserved > 0 {
                let _ = write!(text, "; **not observed {}×**", k.k1_unobserved);
            }
            if !k.k1_left_running.is_empty() {
                let _ = write!(text, "; some left running (link unconfirmable)");
            }
            text
        }
        1 => k.k2_hung.to_string(),
        2 if k.k3_stops == 0 => "–".into(),
        2 if arm == "std" => format!("tree outlived the stop {}/{}", k.k3_trees_survived, k.k3_stops),
        2 if k.k3_trees_survived > 0 => format!(
            "{} ms; tree outlived the stop {}/{}",
            k.k3_p95_over_grace_ms.unwrap_or(0),
            k.k3_trees_survived,
            k.k3_stops
        ),
        2 => format!("{} ms (n={})", k.k3_p95_over_grace_ms.unwrap_or(0), k.k3_stops),
        3 => format!("{} / {} ms", ms(k.k4_pid_p50_us), ms(k.k4_round_trip_p50_us)),
        4 => k.k5_lost_bytes.to_string(),
        5 if arm == "std" => "not measured (a library KPI)".into(),
        5 => match (k.k6_host_fds_delta, k.k6_rss_growth_kb) {
            (Some(fds), Some(rss)) => format!(
                "fds Δ host {fds}, supervisor {}; RSS +{:.1} MB",
                k.k6_supervisor_fds_delta.map_or("–".into(), |s| s.to_string()),
                rss as f64 / 1024.0
            ),
            _ => "not measured".into(),
        },
        _ => k.k7_crashes.to_string(),
    }
}

fn mark(v: Option<bool>) -> &'static str {
    match v {
        Some(true) => "PASS",
        Some(false) => "FAIL",
        None => "FAIL (not measured)",
    }
}

pub fn write(root: &Path, out: &Path, run: &Run) -> Result<bool, String> {
    let os = crate::os_name();
    let (per, k8, pass) = judge(run, os);
    let left = || run.deadline.saturating_duration_since(Instant::now()).min(META);
    let load = format!(
        "load average {} at the start, {} at the end",
        run.load,
        load_average(left())
    );
    let commit = tool(root, "git", &["rev-parse", "--short", "HEAD"], left());
    let versions = format!(
        "{}; node {}",
        tool(root, "rustc", &["--version"], left()),
        tool(root, "node", &["--version"], left())
    );
    let seconds = run.started.elapsed().as_secs();

    let json = serde_json::json!({
        "os": os, "arch": std::env::consts::ARCH, "mode": run.mode.name(), "commit": commit, "versions": versions,
        "seconds": seconds, "load": load, "inject_orphan": run.inject, "no_k4": run.no_k4,
        "verdict": if pass { "pass" } else { "fail" },
        "oracle_control": match &run.control { Ok(s) => serde_json::json!({"ok": true, "detail": s}),
                                               Err(e) => serde_json::json!({"ok": false, "detail": e}) },
        "kpis": per.iter().map(|(lang, omni, std, _)| (lang.clone(), serde_json::json!({"omni": omni, "std": std})))
            .collect::<serde_json::Map<_, _>>(),
        "k8_windows_parity": k8,
        "invocations": run.invocations.iter().map(|i| serde_json::json!({
            "lang": i.lang, "workload": i.workload, "arm": i.arm, "seconds": i.seconds, "records": i.records,
            "leftovers": match &i.leftovers { Ok(l) => serde_json::json!(l), Err(e) => serde_json::json!({"error": e}) },
        })).collect::<Vec<_>>(),
    });
    let text = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(out.join("report.json"), text).map_err(|e| e.to_string())?;

    let mut md = String::new();
    let _ = writeln!(
        md,
        "# hugr-omni QA: {os} {}, {}\n",
        std::env::consts::ARCH,
        run.mode.name()
    );
    let flags = [
        (
            run.inject,
            " · **an orphan was injected on purpose (`--inject-orphan`)**",
        ),
        (run.no_k4, " · **K4 not run (`--no-k4`)**"),
    ];
    let flags: String = flags.iter().filter(|(on, _)| *on).map(|(_, text)| *text).collect();
    let verdict = if pass { "PASS" } else { "FAIL" };
    let _ = writeln!(
        md,
        "**{verdict}** · commit `{commit}` · {versions} · {seconds} s · {load}{flags}\n"
    );
    let _ = writeln!(md, "K1 oracle: {}  ", oracle_rule(os));
    let control = match &run.control {
        Ok(s) => format!("PASS ({s})"),
        Err(e) => format!("**FAIL**: {e}. No figure of this run is believed."),
    };
    let _ = writeln!(md, "Controls: {control}\n");
    let mut head = String::from("| KPI | target |");
    let mut rule = String::from("|---|---|");
    for (lang, ..) in &per {
        let _ = write!(head, " {lang} omni | {lang} std |");
        rule.push_str("---|---|");
    }
    let _ = writeln!(md, "{head} omni |\n{rule}---|");
    for (i, (name, target)) in KPI_NAMES.iter().zip(TARGETS).enumerate() {
        let mut row = format!("| {name} | {target} |");
        for (_, omni, std, _) in &per {
            match i {
                7 => row.push_str(" | |"),
                _ => {
                    let _ = write!(row, " {} | {} |", cell(omni, i, "omni"), cell(std, i, "std"));
                }
            }
        }
        let verdict = match i {
            7 => k8.map_or("measured on Windows only", |k| mark(Some(k))),
            3 if run.no_k4 => "not run (`--no-k4`)",
            _ => mark(
                per.iter()
                    .map(|p| p.3[i])
                    .try_fold(true, |a, v| v.map(|v| a && v))
                    .filter(|_| !per.is_empty()),
            ),
        };
        let _ = writeln!(md, "{row} {verdict} |");
    }
    runners(&mut md, run);
    for (lang, omni, std, _) in &per {
        for (arm, k) in [("omni", omni), ("std", std)] {
            if !k.failed.is_empty() {
                let baseline = if arm == "std" {
                    " (the baseline; not judged)"
                } else {
                    ""
                };
                let _ = writeln!(md, "\n### {lang} {arm}: failed checks{baseline}\n");
                for f in &k.failed {
                    let line: String = f.replace('\n', " ").chars().take(400).collect();
                    let _ = writeln!(md, "- {line}");
                }
            }
            if !k.k1_left_running.is_empty() {
                let _ = writeln!(md, "\n### {lang} {arm}: counted, left running (link unconfirmable)\n");
                for l in &k.k1_left_running {
                    let _ = writeln!(md, "- {l}");
                }
            }
            if !k.skipped.is_empty() {
                let _ = writeln!(md, "\n### {lang} {arm}: skipped (not on this OS)\n");
                for s in &k.skipped {
                    let _ = writeln!(md, "- {s}");
                }
            }
        }
    }
    std::fs::write(out.join("report.md"), &md).map_err(|e| e.to_string())?;
    println!("{md}");
    eprintln!(
        "qa/run: {} and {}",
        out.join("report.md").display(),
        out.join("report.json").display()
    );
    Ok(pass)
}

fn runners(md: &mut String, run: &Run) {
    let _ = writeln!(
        md,
        "\n## Runners\n\n| lang | workload | arm | tasks | orphans | hung | failed | left after | s |\n\
         |---|---|---|---|---|---|---|---|---|"
    );
    for inv in &run.invocations {
        let tasks = inv.records.iter().filter(|r| r.kind == "task" && r.skip.is_none());
        let (n, orphans, hung, failed) = tasks.fold((0, 0, 0, 0), |(n, o, h, f), r| {
            (
                n + 1,
                o + r.orphans + r.incomplete,
                h + u32::from(r.hung),
                f + u32::from(r.fail.is_some()),
            )
        });
        let ended = match &inv.ended {
            Ended::Ok => "",
            Ended::Error(_) => " (runner error)",
            Ended::Crash(_) => " (**host crashed**)",
            Ended::Hung(_) => " (**runner hung**)",
            Ended::NotRun(_) => " (**not run: budget**)",
        };
        let left = inv
            .leftovers
            .as_ref()
            .map_or("not observed".into(), |l| l.len().to_string());
        let _ = writeln!(
            md,
            "| {} | {}{ended} | {} | {n} | {orphans} | {hung} | {failed} | {left} | {:.0} |",
            inv.lang, inv.workload, inv.arm, inv.seconds
        );
    }
}

fn oracle_rule(os: &str) -> &'static str {
    match os {
        "windows" => {
            "Win32_Process (CIM), sampled while each batch runs: a process is a task's when the parent links observed \
             between live processes lead to one of its roots (a child of the runner or of its supervisor with the \
             root's pid, created within its spawn call); a link nobody observed to an exited root is counted as incomplete and never killed"
        }
        "macos" => {
            "`ps -A -E` after each task returns: an exact `HUGR_QA_TASK` entry of the environment (never argv), the \
             group of a marked process, and their children (Apple binaries hide their environment: found by group or \
             parent only); the group of a root with no proven member is counted as incomplete and never killed"
        }
        _ => {
            "`/proc` after each task returns: the task's marker in `environ`, the group of a marked process, and their \
             children; the group of a root with no proven member is counted as incomplete and never killed"
        }
    }
}

/// `program args` within `within` (nothing at all once it is zero); its trimmed stdout, or a note that it is missing.
fn tool(dir: &Path, program: &str, args: &[&str], within: Duration) -> String {
    if within.is_zero() {
        return format!("({program}: no time left)");
    }
    crate::bounded::run(std::process::Command::new(program).args(args).current_dir(dir), within)
        .ok()
        .filter(|ran| ran.status.success())
        .map_or_else(
            || format!("({program} unavailable)"),
            |ran| ran.stdout.trim().to_owned(),
        )
}
