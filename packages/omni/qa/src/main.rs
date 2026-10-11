//! `omni-qa`, the QA harness of hugr-omni (PLAN §4.2; how to run it and what it measures: `qa/README.md`).
//!
//! - `qa/run --quick|--full [--lang rust,ts] [--inject-orphan] [--no-k4]`: builds, fetches the pinned workloads
//!   once, checks the orphan oracle, runs every workload against omni and the stdlib in each language, and writes
//!   `qa/out/report.json` and `qa/out/report.md` (exit 0 only if omni meets every KPI target).
//! - `omni-qa runner <workload> <omni|std>`: the Rust runner (one workload, one arm), started by `qa/run`.

mod bounded;
mod control;
mod fetch;
mod invoke;
mod oracle;
mod plan;
mod record;
mod report;
mod rust;
mod setup;

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("runner") => rust::main(args.get(1..).unwrap_or_default()),
        _ => plan::main(&args),
    }
}

/// The OS as the reports and `shells.json` name it.
pub fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        _ => "linux",
    }
}
