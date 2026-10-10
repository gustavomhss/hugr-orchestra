//! The verdict on made-up records: a clean run passes; K1 fails on what the OS showed or could not show, also for a
//! skipped task.

use std::time::Instant;

use super::kpis::{Ended, Invocation, Run, judge};
use crate::oracle::{HostUsage, Usage};
use crate::record::Record;
use crate::setup::Mode;

fn record(kind: &str, arm: &str) -> Record {
    Record {
        kind: kind.into(),
        workload: "W".into(),
        name: "n".into(),
        arm: arm.into(),
        ..Record::default()
    }
}

fn invocation(arm: &str, records: Vec<Record>) -> Invocation {
    Invocation {
        lang: "rust".into(),
        workload: "W".into(),
        arm: arm.into(),
        records,
        ended: Ended::Ok,
        leftovers: Ok(Vec::new()),
        left_running: Vec::new(),
        seconds: 1.0,
    }
}

/// A run where omni meets every target: a stop within its grace, K4 at std's speed, a soak with nothing grown.
fn clean(soak: Record) -> Run {
    let stop = Record {
        stop_ms: Some(510),
        grace_ms: Some(500),
        ..record("task", "omni")
    };
    let k4 = |arm| Record {
        pid_p50_us: Some(1000.0),
        rt_p50_us: Some(2000.0),
        ..record("k4", arm)
    };
    Run {
        mode: Mode::Quick,
        langs: vec!["rust".into()],
        control: Ok("ok".into()),
        invocations: vec![invocation("omni", vec![stop, k4("omni"), k4("std"), soak])],
        started: Instant::now(),
        deadline: Instant::now(),
        inject: false,
        no_k4: false,
        load: String::new(),
    }
}

/// A soak with complete figures: the host and its supervisor, before and after, nothing grown.
fn soak() -> Record {
    let usage = HostUsage {
        host: Usage { fds: 10, rss_kb: 1000 },
        supervisor: Some(Usage { fds: 5, rss_kb: 500 }),
    };
    Record {
        before: Some(usage),
        after: Some(usage),
        ..record("k6", "omni")
    }
}

#[test]
fn k6_without_the_supervisor_before_or_after_is_not_measured() {
    for side in ["before", "after"] {
        let mut soak = soak();
        let figures = if side == "before" {
            &mut soak.before
        } else {
            &mut soak.after
        };
        if let Some(usage) = figures.as_mut() {
            usage.supervisor = None;
        }
        let (per, _, pass) = judge(&clean(soak), "macos");
        assert_eq!(per[0].3[5], None, "K6 with no supervisor figure {side} the soak");
        assert!(!pass, "{side}");
    }
}

#[test]
fn a_clean_run_passes() {
    let (_, _, pass) = judge(&clean(soak()), "macos");
    assert!(pass);
}

#[test]
fn a_soak_whose_k1_was_not_observed_fails_k1_and_the_run() {
    let failed = Record {
        unobserved: true,
        fail: Some("K1 not observed: ps did not finish".into()),
        ..soak()
    };
    let (per, _, pass) = judge(&clean(failed), "macos");
    assert!(!pass);
    assert_eq!(per[0].3[0], Some(false), "K1");
    assert_eq!(per[0].3[5], Some(true), "K6 itself was measured");
}

#[test]
fn leftovers_after_the_runner_ended_count_and_a_failed_final_observation_fails() {
    let mut run = clean(soak());
    run.invocations[0].leftovers = Ok(vec![42]);
    let (per, _, pass) = judge(&run, "macos");
    assert!(!pass);
    assert_eq!((per[0].1.k1_orphans, per[0].3[0]), (1, Some(false)));
    run.invocations[0].leftovers = Err("ps did not finish".into());
    let (per, _, pass) = judge(&run, "macos");
    assert!(!pass);
    assert_eq!((per[0].1.k1_unobserved, per[0].3[0]), (1, Some(false)));
}

#[test]
fn a_skipped_task_still_counts_for_k1_and_its_failures() {
    let skipped = |r: Record| Record {
        skip: Some("not installed here".into()),
        ..r
    };
    let unobserved = skipped(Record {
        unobserved: true,
        fail: Some("K1 not observed: ps did not finish".into()),
        ..record("task", "omni")
    });
    let orphaned = skipped(Record {
        orphans: 2,
        ..record("task", "omni")
    });
    for (what, r) in [("unobserved", unobserved), ("orphans", orphaned)] {
        let mut run = clean(soak());
        run.invocations[0].records.push(r);
        let (per, _, pass) = judge(&run, "macos");
        assert!(!pass, "skip + {what}");
        assert_eq!(per[0].3[0], Some(false), "K1, skip + {what}");
        assert_eq!(per[0].1.skipped.len(), 1, "{what}");
    }
}
