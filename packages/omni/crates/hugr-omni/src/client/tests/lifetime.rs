//! The channel suite on every OS, part two: bounded state under a burst, stalled peer, several waiters of one
//! `Stop`, death mid-flight and restart by generation.

use std::sync::Arc;
use std::time::{Duration, Instant};

use omni_proto::{Exit, Msg};
use tokio::task::JoinSet;

use super::{BOUND, READY, assert_io, block, connect, pair, spec, with_tree};
use crate::client::start::{Registry, spawn_on};

/// Bounded state: a burst of unsolicited exits for trees nobody holds stores nothing and never blocks
/// the reader; the next request is answered and the generation lives.
#[test]
fn a_burst_of_unknown_exits_is_absorbed() {
    let (sup, mut peer, spawned) = with_tree();
    let mut burst = Vec::new();
    for id in 1000..101_000 {
        omni_proto::encode(
            &Msg::Exited {
                id,
                exit: Exit::Code(0),
            },
            &mut burst,
        )
        .unwrap();
    }
    peer.send_raw(&burst);
    let tree = Arc::new(spawned.tree);
    let lister = {
        let tree = tree.clone();
        std::thread::spawn(move || block(tree.processes()))
    };
    let Msg::List { req, id: 1 } = peer.recv() else {
        panic!("expected List")
    };
    peer.send(&Msg::Processes {
        req,
        id: 1,
        list: Vec::new(),
    });
    assert!(lister.join().unwrap().unwrap().is_empty());
    assert!(sup.alive());
}

/// A peer that reads but never answers: the spawn fails with `Io` after the bound (never a hang), the
/// generation dies with every pending call, and the channel closes.
#[test]
fn a_stalled_peer_fails_the_spawn_and_ends_the_generation() {
    let bound = Duration::from_millis(1000);
    let (sup, mut peer) = pair(bound);
    let t0 = Instant::now();
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &spec(false)))
    };
    assert!(matches!(peer.recv(), Msg::Spawn(_)));
    assert_io(caller.join().unwrap(), "did not answer a Spawn request within 1000 ms");
    let took = t0.elapsed();
    assert!(took >= bound && took < bound + Duration::from_secs(5), "took {took:?}");
    assert!(!sup.alive());
    assert!(peer.next().is_none(), "the channel must be closed");
}

/// R2: several waiters of one `Stop` (and of `exited`) all get the answer; a later `stop` is answered
/// at once, without a frame.
#[test]
fn several_waiters_of_one_stop_all_get_it() {
    let (_sup, mut peer, spawned) = with_tree();
    let tree = Arc::new(spawned.tree);
    let server = std::thread::spawn(move || {
        let mut stops = Vec::new();
        while stops.len() < 6 {
            match peer.recv() {
                Msg::Stop { req, id, grace_ms } => stops.push((req, id, grace_ms)),
                other => panic!("unexpected {other:?}"),
            }
        }
        peer.send(&Msg::Exited {
            id: 1,
            exit: Exit::Signal(15),
        });
        for &(req, id, _) in stops.iter().rev() {
            peer.send(&Msg::Stopped { req, id });
        }
        (peer, stops)
    });
    tree.stop_detached(Duration::from_millis(100));
    let results = block(async {
        let mut set = JoinSet::new();
        for i in 0..5u64 {
            let tree = tree.clone();
            set.spawn(async move { tree.stop(Duration::from_millis(1000 + i)).await.map(|()| None) });
        }
        for _ in 0..3 {
            let tree = tree.clone();
            set.spawn(async move { tree.exited().await.map(Some) });
        }
        set.join_all().await
    });
    let (mut peer, stops) = server.join().unwrap();
    assert_eq!(
        stops.iter().filter(|s| s.2 == 100).count(),
        1,
        "the detached stop is a Stop too"
    );
    assert_eq!(
        results.iter().filter(|r| matches!(r, Ok(None))).count(),
        5,
        "{results:?}"
    );
    assert_eq!(
        results
            .iter()
            .filter(|r| matches!(r, Ok(Some(Exit::Signal(15)))))
            .count(),
        3
    );
    block(tree.stop(Duration::ZERO)).expect("gone: at once");
    assert!(block(tree.processes()).unwrap().is_empty());
    tree.stop_detached(Duration::ZERO);
    drop(Arc::into_inner(tree));
    assert!(
        matches!(peer.recv(), Msg::Release { id: 1, .. }),
        "no frame may precede the Release"
    );
}

/// The card's success criterion: the supervisor dies in the middle of 10 concurrent operations; all
/// of them fail with `Io`, the old tree stays bound to its dead generation, and the next spawn works.
#[test]
fn death_mid_flight_fails_every_call_and_the_next_spawn_restarts() {
    let registry = Registry::new(BOUND);
    let mut first = None;
    let sup = registry
        .get(|num| {
            let (sup, peer) = connect(num, BOUND, &READY);
            first = Some(peer);
            sup
        })
        .unwrap();
    let mut peer = first.take().unwrap();
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &spec(false)))
    };
    peer.spawned(1);
    let tree = Arc::new(caller.join().unwrap().unwrap().tree);
    let server = std::thread::spawn(move || {
        for _ in 0..8 {
            assert!(matches!(
                peer.recv(),
                Msg::Spawn(_) | Msg::Stop { .. } | Msg::List { .. }
            ));
        }
        drop(peer); // the supervisor dies with 8 requests in flight and 2 exit waiters
    });
    let spawners: Vec<_> = (0..3)
        .map(|_| {
            let sup = sup.clone();
            std::thread::spawn(move || spawn_on(&sup, &spec(false)).map(|_| ()))
        })
        .collect();
    let results = block(async {
        let mut set = JoinSet::new();
        for _ in 0..3 {
            let tree = tree.clone();
            set.spawn(async move { tree.stop(Duration::from_secs(5)).await });
        }
        for _ in 0..2 {
            let (lister, waiter) = (tree.clone(), tree.clone());
            set.spawn(async move { lister.processes().await.map(|_| ()) });
            set.spawn(async move { waiter.exited().await.map(|_| ()) });
        }
        set.join_all().await
    });
    server.join().unwrap();
    let mut all: Vec<_> = spawners.into_iter().map(|t| t.join().unwrap()).collect();
    all.extend(results);
    assert_eq!(all.len(), 10);
    for r in all {
        assert_io(r, "it closed the channel");
    }
    let mut second = None;
    let next = registry
        .get(|num| {
            let (sup, peer) = connect(num, BOUND, &READY);
            second = Some(peer);
            sup
        })
        .unwrap();
    assert_eq!((next.num, Arc::ptr_eq(&sup, &next)), (2, false), "a new generation");
    let mut peer = second.take().unwrap();
    assert_io(block(tree.stop(Duration::ZERO)), "generation 1");
    assert_io(tree.resize(80, 24), "generation 1");
    let caller = std::thread::spawn(move || spawn_on(&next, &spec(false)));
    peer.spawned(7); // the first frame of generation 2 is this Spawn: nothing of the old tree reached it
    assert_eq!(caller.join().unwrap().unwrap().tree.id, 7);
}
