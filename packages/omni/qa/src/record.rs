//! One line of a runner's stdout: a JSON object (`kind` = `task`, `k4`, `k6` or `end`). Fields a kind does not use
//! are left out; the Node runner writes the same objects.

use serde::{Deserialize, Serialize};

use crate::oracle::HostUsage;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Record {
    pub kind: String,
    pub workload: String,
    pub name: String,
    /// `omni` or `std`.
    pub arm: String,
    pub ms: u64,
    /// K2: the task did not return within its bound.
    pub hung: bool,
    /// K1: its processes the OS still listed once it returned, proven its (and killed).
    pub orphans: u32,
    /// K1: live processes tied to it only by a link nobody observed (counted, never killed).
    pub incomplete: u32,
    /// K1 could not be observed (the oracle's snapshot failed or did not answer): K1 fails.
    pub unobserved: bool,
    /// K3: how long `stop` took, and the grace it was given.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grace_ms: Option<u64>,
    /// K5: output bytes missing or wrong.
    pub lost: u64,
    /// A check of the task that failed (the arm did the wrong thing, or the workload could not run).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fail: Option<String>,
    /// Why the task did not run here (only for what an OS does not have, e.g. zsh on Windows).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip: Option<String>,
    /// K4: p50 of the time to the pid and of a trivial child's round trip, in µs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid_p50_us: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rt_p50_us: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub samples: Option<u32>,
    /// K6: the host and its supervisor before and after the soak.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<HostUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<HostUsage>,
}

impl Record {
    pub fn end() -> Record {
        Record {
            kind: "end".into(),
            ..Record::default()
        }
    }

    /// Prints it as one line on stdout (the runner protocol).
    pub fn emit(&self) {
        match serde_json::to_string(self) {
            Ok(line) => println!("{line}"),
            Err(e) => eprintln!("omni-qa: unprintable record {self:?}: {e}"),
        }
    }
}
