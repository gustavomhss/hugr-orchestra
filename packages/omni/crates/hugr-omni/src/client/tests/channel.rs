//! The channel suite on every OS: flood, admission, congestion and recovery. The rest of the suite (bounded
//! state, stalled peer, several waiters of one `Stop`, death and restart) is in `lifetime`.

use std::collections::HashSet;
use std::sync::Arc;

use omni_proto::{Ack, FailCode, Msg, ProcEntry};
use tokio::task::JoinSet;

use super::{BOUND, LIMIT, assert_io, block, pair, spec, with_tree};
use crate::client::channel::{ADMIT_ALL, ADMIT_NORMAL, Class, Want};
use crate::client::start::spawn_on;
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
