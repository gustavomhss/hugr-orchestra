//! N2: actual Linux inventory failure/recovery, with retained children and independent OS liveness assertions.

mod actor;
mod cases;
mod support;

use support::run_role;

#[test]
fn rss_watch_recovers_after_a_real_incomplete_inventory() {
    run_role("rss");
}

#[test]
fn initial_inventory_failure_preserves_the_original_timeout() {
    run_role("initial-timeout");
}

#[test]
fn initial_inventory_failure_preserves_cancellation() {
    run_role("initial-cancel");
}

#[test]
fn periodic_inventory_failure_preserves_the_original_timeout() {
    run_role("periodic-timeout");
}

#[test]
fn periodic_inventory_failure_preserves_cancellation() {
    run_role("periodic-cancel");
}

#[test]
fn recovered_watch_releases_weak_state_after_normal_completion() {
    run_role("normal");
}

#[test]
fn recovered_watch_releases_weak_state_after_drop() {
    run_role("drop");
}

/// Each outer test runs this one role in its own process and hence its own supervisor generation.
#[test]
fn role() {
    let Ok(case) = std::env::var("OMNI_N2_CASE") else {
        return;
    };
    match case.as_str() {
        "rss" => cases::rss(),
        "initial-timeout" => cases::deadline(false, false),
        "initial-cancel" => cases::deadline(false, true),
        "periodic-timeout" => cases::deadline(true, false),
        "periodic-cancel" => cases::deadline(true, true),
        "normal" => cases::release(false),
        "drop" => cases::release(true),
        _ => panic!("unknown N2 test role {case}"),
    }
}
