//! What every runner needs to know, handed down by the orchestrator through the environment (the runner protocol of
//! `qa/README.md`, the same for the Rust and the Node runner, and for the Python one in v0.2).

use std::path::PathBuf;

/// `--quick` (at most 5 minutes on a laptop) or `--full` (at most 30 minutes per OS).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Mode {
    Quick,
    Full,
}

impl Mode {
    pub fn name(self) -> &'static str {
        match self {
            Mode::Quick => "quick",
            Mode::Full => "full",
        }
    }

    /// How many times each QA-A and QA-D task runs.
    pub fn reps(self) -> u32 {
        match self {
            Mode::Quick => 1,
            Mode::Full => 3,
        }
    }

    /// QA-B dev-server rounds per arm.
    pub fn rounds(self) -> u32 {
        match self {
            Mode::Quick => 2,
            Mode::Full => 10,
        }
    }

    /// QA-E commands per arm (PLAN §4.2: 200). Full runs 600, except on Windows, where omni's `run()` tasks are
    /// checked one at a time and 600 would not fit in 30 minutes.
    pub fn commands(self) -> u32 {
        match self {
            Mode::Full if !cfg!(windows) => 600,
            _ => 200,
        }
    }

    /// K4 samples per arm, after `K4_WARM` warm-up spawns.
    pub fn samples(self) -> u32 {
        match self {
            Mode::Quick => 200,
            Mode::Full => 1000,
        }
    }
}

/// K6: the soak's length (PLAN §4.2), after `SOAK_WARM` warm-up tasks.
pub const SOAK: u32 = 1000;
pub const SOAK_WARM: u32 = 50;
pub const K4_WARM: u32 = 30;

#[derive(Debug, Clone)]
pub struct Setup {
    /// The repository.
    pub root: PathBuf,
    /// `omni-fixture`, from the release build.
    pub fixture: PathBuf,
    /// The pinned workloads, fetched once (`fetch.rs`).
    pub cache: PathBuf,
    pub mode: Mode,
    /// This run's id: the prefix of every task marker.
    pub run: String,
    /// `--inject-orphan`: the first omni task of each runner leaves a process behind (K1's teeth).
    pub inject: bool,
}

const ROOT: &str = "HUGR_QA_ROOT";
const FIXTURE: &str = "HUGR_QA_FIXTURE";
const CACHE: &str = "HUGR_QA_CACHE";
const MODE: &str = "HUGR_QA_MODE";
const RUN: &str = "HUGR_QA_RUN";
const INJECT: &str = "HUGR_QA_INJECT_ORPHAN";

impl Setup {
    /// The variables a runner is started with. `HUGR_QA_TASK_ENV` is `task_env` as a JSON object (without the
    /// marker), for runners in other languages.
    pub fn to_env(&self) -> Vec<(String, String)> {
        let path = |p: &PathBuf| p.to_string_lossy().into_owned();
        let task_env: serde_json::Map<String, serde_json::Value> = self
            .task_env("")
            .into_iter()
            .filter(|(k, _)| k != crate::oracle::MARKER)
            .map(|(k, v)| (k, v.into()))
            .collect();
        vec![
            (ROOT.into(), path(&self.root)),
            (FIXTURE.into(), path(&self.fixture)),
            (CACHE.into(), path(&self.cache)),
            (MODE.into(), self.mode.name().into()),
            (RUN.into(), self.run.clone()),
            (INJECT.into(), if self.inject { "1" } else { "0" }.into()),
            (
                "HUGR_QA_TASK_ENV".into(),
                serde_json::Value::Object(task_env).to_string(),
            ),
            ("HUGR_QA_SIZES".into(), self.sizes().to_string()),
        ]
    }

    /// How much each workload runs, for runners in other languages (`HUGR_QA_SIZES`).
    fn sizes(&self) -> serde_json::Value {
        let m = self.mode;
        serde_json::json!({
            "reps": m.reps(), "rounds": m.rounds(), "commands": m.commands(), "samples": m.samples(),
            "k4Warm": K4_WARM, "soak": SOAK, "soakWarm": SOAK_WARM,
        })
    }

    pub fn from_env() -> Result<Setup, String> {
        let var =
            |name: &str| std::env::var(name).map_err(|_| format!("{name} is not set: runners are started by qa/run"));
        Ok(Setup {
            root: var(ROOT)?.into(),
            fixture: var(FIXTURE)?.into(),
            cache: var(CACHE)?.into(),
            mode: match var(MODE)?.as_str() {
                "full" => Mode::Full,
                _ => Mode::Quick,
            },
            run: var(RUN)?,
            inject: var(INJECT)? == "1",
        })
    }

    /// The environment every task gets on top of the host's: its marker, and the pinned workloads' tools held
    /// offline, on the cache's own Cargo and npm stores.
    pub fn task_env(&self, tag: &str) -> Vec<(String, String)> {
        let at = |p: &str| self.cache.join(p).to_string_lossy().into_owned();
        [
            (crate::oracle::MARKER, tag.to_owned()),
            ("CARGO_HOME", at("cargo-home")),
            ("CARGO_TARGET_DIR", at("target")),
            ("CARGO_NET_OFFLINE", "true".into()),
            ("npm_config_cache", at("npm-cache")),
            ("npm_config_offline", "true".into()),
            ("npm_config_update_notifier", "false".into()),
            ("npm_config_fund", "false".into()),
            ("npm_config_audit", "false".into()),
            ("CI", "true".into()),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_owned(), v))
        .collect()
    }
}

/// Tests: `omni-fixture` from the root workspace's build into this target dir (`cargo build --workspace --bins`).
#[cfg(test)]
pub fn test_fixture() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let dir = exe
        .parent()
        .and_then(std::path::Path::parent)
        .unwrap_or(std::path::Path::new("."));
    let path = dir.join(format!("omni-fixture{}", std::env::consts::EXE_SUFFIX));
    assert!(
        path.is_file(),
        "{} is missing: cargo build --workspace --bins",
        path.display()
    );
    path
}
