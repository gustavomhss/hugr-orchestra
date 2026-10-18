//! Deadlines on every OS: a request the supervisor never answers ends the generation at its deadline,
//! with every waiter woken (Codex r1 finding 1), and callers of a failing start share one attempt
//! (finding 2).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Barrier};
use std::thread;
use std::time::{Duration, Instant};

use omni_proto::Msg;

use super::{LIMIT, assert_io, block, silent, tree_within};
use crate::client::start::Registry;

const BOUND: Duration = Duration::from_millis(1000);

/// Waits for `call` (run on its own thread) and checks it failed with `Io` naming `needle` after at least
/// `due` and well within the test limit.
fn fails_at<T: Send + std::fmt::Debug + 'static>(
    due: Duration,
    needle: &str,
    call: impl FnOnce() -> Result<T, crate::Error> + Send + 'static,
) {
    let t0 = Instant::now();
    let result = thread::spawn(call).join().unwrap();
    let took = t0.elapsed();
    assert_io(result, needle);
    assert!(took >= due && took < due + LIMIT / 2, "took {took:?}");
}

/// A `Stop` alone, sent to a peer that stays connected and never answers, fails with `Io` at its deadline
/// (its grace on top of the bound); the generation is dead.
#[test]
fn a_stop_alone_times_out_against_a_silent_peer() {
    let (sup, mut peer, spawned) = tree_within(BOUND);
    let reader = thread::spawn(move || {
        assert!(matches!(peer.recv(), Msg::Stop { grace_ms: 200, .. }));
        peer // kept connected, never answering
    });
    let stop = move || block(spawned.tree.stop(Duration::from_millis(200)));
    fails_at(
        BOUND + Duration::from_millis(200),
        "did not answer a Stop request within 1200 ms",
        stop,
    );
    assert!(!sup.alive());
    drop(reader.join().unwrap());
}

/// The same for a `List` (the bound) and for a detached `Resize`, whose death wakes the exit waiter.
#[test]
fn a_list_or_a_detached_request_alone_times_out_against_a_silent_peer() {
    let (sup, peer, spawned) = tree_within(BOUND);
    let list = move || block(spawned.tree.processes());
    fails_at(BOUND, "did not answer a List request within 1000 ms", list);
    assert!(!sup.alive());
    drop(peer);

    let (sup, peer, spawned) = tree_within(BOUND);
    spawned.tree.resize(100, 40).unwrap();
    let exited = move || block(spawned.tree.exited());
    fails_at(BOUND, "did not answer a Resize request within 1000 ms", exited);
    assert!(!sup.alive());
    drop(peer);
}

/// Five callers against a bootstrap that never says Ready: one attempt runs, the others wait for it and
/// share its failure, so all fail after about one bound, not five.
#[test]
fn concurrent_callers_share_one_failed_start() {
    let bound = Duration::from_millis(1000);
    let registry = Arc::new(Registry::new(LIMIT));
    let (opens, gate) = (Arc::new(AtomicUsize::new(0)), Arc::new(Barrier::new(5)));
    let t0 = Instant::now();
    let callers: Vec<_> = (0..5)
        .map(|_| {
            let (registry, opens, gate) = (registry.clone(), opens.clone(), gate.clone());
            thread::spawn(move || {
                gate.wait();
                registry.get(|num| {
                    opens.fetch_add(1, Ordering::Relaxed);
                    silent(num, bound, None).0 // the peer stays connected through the start, silent
                })
            })
        })
        .collect();
    for caller in callers {
        assert_io(caller.join().unwrap(), "did not say Ready within 1000 ms");
    }
    let took = t0.elapsed();
    assert_eq!(opens.load(Ordering::Relaxed), 1, "every caller ran its own start");
    assert!(
        took >= bound && took < bound * 2,
        "took {took:?}: the callers were serialized"
    );
}
