//! The channel suite on every OS: flood, admission, congestion and recovery, bounded state under a burst,
//! stalled peer, several waiters of one `Stop`, death mid-flight and restart by generation.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

use omni_proto::{Ack, Exit, FailCode, Msg, ProcEntry};
use tokio::task::JoinSet;

use super::{BOUND, LIMIT, READY, assert_io, block, connect, pair, spec, with_tree};
use crate::client::channel::{ADMIT_ALL, ADMIT_NORMAL, Class, Want};
use crate::client::start::{Registry, spawn_on};
use crate::error::ErrorCode;

#[test]
fn spawn_failures_keep_their_code_and_the_generation() {
    let (sup, mut peer) = pair(BOUND);
    let cases = [
        (FailCode::NotFound, ErrorCode::NotFound),
        (FailCode::NotExecutable, ErrorCode::NotExecutable),
        (FailCode::BadCwd, ErrorCode::InvalidCwd),
        (FailCode::Invalid, ErrorCode::InvalidArgument),
        (FailCode::Io, ErrorCode::Io),
    ];
    for (code, want) in cases {
        let caller = {
            let sup = sup.clone();
            std::thread::spawn(move || spawn_on(&sup, &spec(false)))
        };
        let Msg::Spawn(s) = peer.recv() else {
            panic!("expected Spawn")
        };
        assert_eq!((s.argv[1].as_slice(), s.grace_ms), (&b"arg with space"[..], 1500));
        let msg = "no such file: /bin/fixture".to_string();
        peer.send(&Msg::SpawnFailed {
            req: s.req,
            code,
            errno: 2,
            msg,
        });
        let e = caller.join().unwrap().expect_err("spawn must fail");
        assert_eq!(e.code(), want, "{e}");
        assert!(e.to_string().contains("/bin/fixture"), "{e}");
    }
    assert!(sup.alive(), "a refused spawn is not a supervisor failure");
}

/// R1/R2: a flood of concurrent requests from several threads and tasks, answered out of order; every
/// waiter gets its own reply.
#[test]
fn every_waiter_gets_its_own_reply_under_a_flood() {
    const TREES: u64 = 20;
    const LISTS_PER_TREE: u64 = 50;
    const SPAWNS_PER_THREAD: u64 = 25;
    const THREADS: u64 = 4;
    // The peer holds every List until the whole flood is in (seconds on a loaded machine): the requests'
    // deadline must outlast that, or the generation is rightly declared stuck.
    let (sup, mut peer) = pair(LIMIT);
    let mut trees = Vec::new();
    for id in 1..=TREES {
        let caller = {
            let sup = sup.clone();
            std::thread::spawn(move || spawn_on(&sup, &spec(false)))
        };
        peer.spawned(id);
        trees.push(Arc::new(caller.join().unwrap().unwrap().tree));
    }
    let server = std::thread::spawn(move || {
        let (mut lists, mut next_id) = (Vec::new(), 1000);
        let total = TREES * LISTS_PER_TREE + THREADS * SPAWNS_PER_THREAD;
        let mut seen = 0;
        while seen < total {
            match peer.recv() {
                Msg::List { req, id } => lists.push((req, id)),
                Msg::Spawn(s) => {
                    next_id += 1;
                    let pid = u32::try_from(next_id).unwrap() + 1000;
                    peer.send(&Msg::Spawned {
                        req: s.req,
                        id: next_id,
                        pid,
                        pty_ends: [0, 0],
                    });
                }
                Msg::Release { req, id } => {
                    peer.send(&Msg::Ack {
                        req,
                        id,
                        result: Ack::Ok,
                    });
                    continue;
                }
                other => panic!("unexpected {other:?}"),
            }
            seen += 1;
        }
        for (req, id) in lists.into_iter().rev() {
            let pid = u32::try_from(id).unwrap();
            peer.send(&Msg::Processes {
                req,
                id,
                list: vec![ProcEntry {
                    pid,
                    ppid: None,
                    name: None,
                }],
            });
        }
        peer
    });
    let spawners: Vec<_> = (0..THREADS)
        .map(|_| {
            let sup = sup.clone();
            std::thread::spawn(move || {
                (0..SPAWNS_PER_THREAD)
                    .map(|_| {
                        let s = spawn_on(&sup, &spec(false)).unwrap();
                        assert_eq!(u64::from(s.pid), s.tree.id + 1000, "a Spawned reached the wrong caller");
                        s.tree.id
                    })
                    .collect::<Vec<_>>()
            })
        })
        .collect();
    let answered = block(async {
        let mut set = JoinSet::new();
        for tree in &trees {
            for _ in 0..LISTS_PER_TREE {
                let tree = tree.clone();
                set.spawn(async move { (tree.id, tree.processes().await) });
            }
        }
        let mut n = 0;
        while let Some(done) = set.join_next().await {
            let (id, list) = done.unwrap();
            assert_eq!(
                list.unwrap()[0].pid,
                u32::try_from(id).unwrap(),
                "a reply reached another tree's waiter"
            );
            n += 1;
        }
        n
    });
    assert_eq!(answered, TREES * LISTS_PER_TREE);
    let ids: Vec<u64> = spawners.into_iter().flat_map(|t| t.join().unwrap()).collect();
    assert_eq!(
        ids.iter().collect::<HashSet<_>>().len(),
        ids.len(),
        "two callers got the same tree"
    );
    let peer = server.join().unwrap();
    assert!(sup.alive());
    drop(peer);
}

/// R1: normal requests stop at their limit, cleanup keeps its reserved room, and a supervisor that does
/// not drain even that is declared dead.
#[test]
fn admission_keeps_room_for_cleanup() {
    let (sup, mut peer, spawned) = with_tree();
    let tree = spawned.tree;
    for _ in 0..ADMIT_NORMAL {
        tree.resize(80, 24).expect("admitted");
    }
    assert_io(tree.resize(80, 24), "the limit is 1024");
    let id = tree.id;
    let release = move |req| Msg::Release { req, id };
    sup.tell(Want::Release, id, Class::Cleanup, release)
        .expect("cleanup is still admitted");
    for _ in 0..=ADMIT_NORMAL {
        match peer.recv() {
            Msg::Resize { req, id, .. } | Msg::Release { req, id } => peer.send(&Msg::Ack {
                req,
                id,
                result: Ack::Ok,
            }),
            other => panic!("unexpected {other:?}"),
        }
    }
    // Replies are dispatched in order: once a later one arrives, the queue has drained.
    let marker = {
        let sup = sup.clone();
        std::thread::spawn(move || block(sup.ask(Want::Release, id, Class::Cleanup, release)).map(|_| ()))
    };
    let Msg::Release { req, .. } = peer.recv() else {
        panic!("expected the marker")
    };
    peer.send(&Msg::Ack {
        req,
        id,
        result: Ack::Ok,
    });
    marker.join().unwrap().unwrap();
    tree.resize(80, 24).expect("normal requests are admitted again");
    // Now the peer stops reading: cleanup fills its reserved room, then the generation is declared dead.
    let admitted = (0..=ADMIT_ALL).take_while(|_| sup.tell(Want::Release, id, Class::Cleanup, release).is_ok());
    assert_eq!(admitted.count(), ADMIT_ALL - 1, "one resize is still waiting");
    assert!(!sup.alive());
    assert_io(
        tree.resize(80, 24),
        "it stopped draining its channel (8192 requests waiting)",
    );
}

/// Congestion, then recovery: while the peer does not read, a frame bigger than any socket or pipe buffer
/// (~950 KB) fills the channel and the writer task waits for room; once the peer drains, every frame
/// (with the resizes sent meanwhile) goes out and the next spawn completes: nothing is left waiting with
/// no event to wake it.
#[test]
fn congestion_then_recovery() {
    let (sup, mut peer, spawned) = with_tree();
    let mut big = spec(false);
    big.env = (0..3000)
        .map(|i| (format!("VAR_{i:04}").into(), "x".repeat(300).into()))
        .collect();
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &big))
    };
    for _ in 0..200 {
        spawned.tree.resize(80, 24).unwrap();
    }
    let (mut resizes, mut big_seen) = (0, false);
    while resizes < 200 || !big_seen {
        match peer.recv() {
            Msg::Spawn(s) => {
                assert_eq!(s.env.len(), 3000);
                big_seen = true;
                peer.send(&Msg::Spawned {
                    req: s.req,
                    id: 2,
                    pid: 2,
                    pty_ends: [0, 0],
                });
            }
            Msg::Resize { req, id, .. } => {
                resizes += 1;
                peer.send(&Msg::Ack {
                    req,
                    id,
                    result: Ack::Ok,
                });
            }
            other => panic!("unexpected {other:?}"),
        }
    }
    assert_eq!(caller.join().unwrap().unwrap().tree.id, 2);
    let caller = std::thread::spawn(move || spawn_on(&sup, &spec(false)));
    assert!(
        matches!(peer.recv(), Msg::Release { id: 2, .. }),
        "the big tree was dropped"
    );
    peer.spawned(3);
    assert_eq!(caller.join().unwrap().unwrap().tree.id, 3);
}

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
