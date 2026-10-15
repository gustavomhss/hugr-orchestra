//! The orchestrator behind `qa/run`: build, fetch, check the oracle, run each runner as a child process (the host
//! K7 watches), then report.

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant};

use crate::invoke::invoke;
use crate::report::{Invocation, Run};
use crate::setup::{Mode, Setup};
use crate::{control, fetch, oracle, report};

/// The languages of v0.1. Python joins in v0.2 as one more runner speaking the same protocol (`qa/README.md`).
const LANGS: [&str; 2] = ["rust", "ts"];

/// Each runner invocation: a workload and an arm. QA-C has no std arm (no terminal in the stdlib), K4 measures both
/// arms in one process (interleaved), K6 measures the library only.
const INVOCATIONS: [(&str, &str); 11] = [
    ("QA-A", "omni"),
    ("QA-A", "std"),
    ("QA-B", "omni"),
    ("QA-B", "std"),
    ("QA-C", "omni"),
    ("QA-D", "omni"),
    ("QA-D", "std"),
    ("QA-E", "omni"),
    ("QA-E", "std"),
    ("K4", "omni"),
    ("K6", "omni"),
];

/// The measured part of a run (from the controls to the report; the builds and the one-time fetch are not in it):
/// the card's limits, quick at most 5 minutes on a laptop (plus a margin for a loaded machine) and full 30 minutes
/// per OS. Windows' quick gets 18: there omni's `run()` tasks are checked one at a time (a PowerShell snapshot each),
/// and quick is a laptop's loop, Windows runs in CI. What does not fit is reported as not run.
fn budget(mode: Mode) -> Duration {
    Duration::from_secs(match mode {
        Mode::Quick if cfg!(windows) => 18 * 60,
        Mode::Quick => 6 * 60,
        Mode::Full => 30 * 60,
    })
}

/// Each runner's own limit, within what is left of the budget: a runner past it is ended and counted as hung (K2).
/// Windows' snapshots are slower, so its limits are three times as long.
fn cap(workload: &str, mode: Mode) -> Duration {
    let (quick, full) = match workload {
        "QA-A" => (150, 600),
        "QA-E" => (120, 600),
        "QA-C" | "QA-D" | "K6" => (90, 300),
        "QA-B" => (60, 300),
        _ => (45, 180),
    };
    let factor = if cfg!(windows) { 3 } else { 1 };
    Duration::from_secs(factor * if mode == Mode::Quick { quick } else { full })
}

/// Kept from the budget for the report, and after each runner for its drain and final observation.
const RESERVE: Duration = Duration::from_secs(10);
const AFTER: Duration = Duration::from_secs(25);

pub fn main(args: &[String]) -> ExitCode {
    match plan(args) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(1),
        Err(e) => {
            eprintln!("qa/run: {e}");
            ExitCode::from(2)
        }
    }
}

fn plan(args: &[String]) -> Result<bool, String> {
    let mut mode = None;
    let mut langs: Vec<String> = LANGS.iter().map(|l| (*l).to_owned()).collect();
    let mut inject = false;
    let mut no_k4 = false;
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--quick" => mode = Some(Mode::Quick),
            "--full" => mode = Some(Mode::Full),
            "--inject-orphan" => inject = true,
            "--no-k4" => no_k4 = true,
            "--lang" => {
                langs = it
                    .next()
                    .ok_or("--lang needs a value")?
                    .split(',')
                    .map(str::to_owned)
                    .collect();
                if let Some(bad) = langs.iter().find(|l| !LANGS.contains(&l.as_str())) {
                    return Err(format!("--lang {bad}: v0.1 has {LANGS:?}"));
                }
            }
            other => {
                return Err(format!(
                    "unknown argument {other}; usage: qa/run --quick|--full [--lang rust,ts] [--inject-orphan] [--no-k4]"
                ));
            }
        }
    }
    let mode = mode.ok_or("usage: qa/run --quick|--full [--lang rust,ts] [--inject-orphan] [--no-k4]")?;
    let started = Instant::now();
    let load = report::load_average(Duration::from_secs(3));
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let root = root.canonicalize().map_err(|e| format!("{}: {e}", root.display()))?;
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    let release = me.parent().ok_or("omni-qa has no directory")?.to_path_buf();
    build(&root, &release, langs.iter().any(|l| l == "ts"))?;
    let cache = fetch::cache_dir(&root);
    fetch::ensure(&root, &cache)?;
    let setup = Setup {
        fixture: release.join(exe("omni-fixture")),
        root: root.clone(),
        cache,
        mode,
        run: format!("q-{}", oracle::token()),
        inject,
    };
    let deadline = Instant::now() + budget(mode);
    // An identity the controls could not take stops the run (exit 2): they could not vouch for the harness.
    let control = control::control(&setup).map_err(|e| format!("the controls: {e}"))?;
    eprintln!("qa/run: oracle control: {control:?}");
    let out = root.join("qa/out");
    let logs = out.join("logs");
    std::fs::create_dir_all(&logs).map_err(|e| format!("{}: {e}", logs.display()))?;
    let mut invocations = Vec::new();
    if control.is_ok() {
        for lang in &langs {
            for (workload, arm) in INVOCATIONS.into_iter().filter(|(w, _)| !(no_k4 && *w == "K4")) {
                let left = deadline
                    .saturating_duration_since(Instant::now())
                    .saturating_sub(RESERVE + AFTER);
                if left.is_zero() {
                    let why = format!("not run: the {} budget of {:?} ran out", mode.name(), budget(mode));
                    invocations.push(Invocation::not_run(lang, workload, arm, why));
                    continue;
                }
                eprintln!("qa/run: {lang} {workload} {arm}");
                let log = logs.join(format!("{lang}-{workload}-{arm}.log"));
                // Each runner its own run id: every marker of its tasks starts with it (its final observation).
                let own = Setup {
                    run: format!("{}i{}", setup.run, invocations.len()),
                    ..setup.clone()
                };
                let mut cmd = runner(lang, &me, &root, workload, arm);
                cmd.envs(own.to_env())
                    .env("HUGR_OMNI_SUPERVISOR", release.join(exe("hugr-omni-supervisor")))
                    .env("HUGR_OMNI_ADDON", release.join(addon()));
                let bound = cap(workload, mode).min(left);
                let prefix = format!("{}-", own.run);
                invocations.push(invoke(lang, workload, arm, &mut cmd, &log, (bound, &prefix))?);
            }
        }
    }
    let run = Run {
        mode,
        langs,
        control,
        invocations,
        started,
        deadline,
        inject,
        no_k4,
        load,
    };
    report::write(&root, &out, &run)
}

fn runner(lang: &str, me: &Path, root: &Path, workload: &str, arm: &str) -> Command {
    let mut cmd = if lang == "rust" {
        let mut cmd = Command::new(me);
        cmd.arg("runner");
        cmd
    } else {
        let mut cmd = Command::new("node");
        cmd.arg(root.join("qa/node/qa.mjs"));
        cmd
    };
    cmd.args([workload, arm]);
    cmd
}

/// `cargo build --release` of the fixture and the supervisor (and the Node addon for TS) into omni-qa's target dir.
fn build(root: &Path, release: &Path, ts: bool) -> Result<(), String> {
    let target = release.parent().ok_or("no target dir")?;
    let mut builds = vec![vec!["build", "--release", "--workspace", "--bins"]];
    if ts {
        builds.push(vec!["build", "--release", "-p", "hugr-omni-node"]);
    }
    for args in builds {
        eprintln!("qa/run: cargo {}", args.join(" "));
        let status = Command::new("cargo")
            .args(&args)
            .arg("--target-dir")
            .arg(target)
            .current_dir(root)
            .status()
            .map_err(|e| format!("cargo: {e}"))?;
        if !status.success() {
            return Err(format!("cargo {} failed: {status}", args.join(" ")));
        }
    }
    // The TS arm is never skipped: without its addon or Node the run stops here.
    if ts {
        let addon = release.join(addon());
        if !addon.is_file() {
            return Err(format!("the Node addon {} is missing after the build", addon.display()));
        }
        match Command::new("node").arg("--version").output() {
            Ok(out) if out.status.success() => {}
            other => return Err(format!("node does not run ({other:?}): the TS arm needs Node 22+")),
        }
    }
    Ok(())
}

fn exe(name: &str) -> String {
    format!("{name}{}", std::env::consts::EXE_SUFFIX)
}

/// The Node addon's file name in the target dir (what `bindings/node/index.js` loads).
fn addon() -> PathBuf {
    PathBuf::from(match crate::os_name() {
        "macos" => "libhugr_omni_node.dylib",
        "windows" => "hugr_omni_node.dll",
        _ => "libhugr_omni_node.so",
    })
}
