//! Unix PTY `Go` (Codex r1 finding 3): one `Go`, one outcome for every caller; a `Go` refused before it was
//! sent leaves the root held.

use std::sync::{Arc, Barrier};
use std::thread;

use omni_proto::{Ack, FailCode, Msg};

use super::unix::pty_spawn;
use super::{BOUND, assert_io, block, pair};
use crate::client::channel::{ADMIT_NORMAL, Class, Want};
use crate::error::ErrorCode;

/// A caller arriving while the `Go` is in flight waits for it: when exec fails, every caller (and every
/// later one) gets `NotFound`, never `Ok`, and exactly one `Go` frame was sent.
#[test]
fn every_caller_gets_the_one_go_outcome() {
    let (sup, mut peer) = pair(BOUND);
    let (spawned, _master) = pty_spawn(&sup, &mut peer, 1);
    let tree = Arc::new(spawned.tree);
    let first = {
        let tree = tree.clone();
        thread::spawn(move || tree.go())
    };
    let Msg::Go { req, id: 1 } = peer.recv() else {
        panic!("expected Go")
    };
    let ready = Arc::new(Barrier::new(2));
    let second = {
        let (tree, ready) = (tree.clone(), ready.clone());
        thread::spawn(move || {
            ready.wait();
            tree.go()
        })
    };
    ready.wait(); // the second caller is running; the reply below takes a full hop to reach the first
    let msg = "execve /bin/fixture: no such file".into();
    peer.send(&Msg::SpawnFailed {
        req,
        code: FailCode::NotFound,
        errno: 2,
        msg,
    });
    for caller in [first, second] {
        assert_eq!(caller.join().unwrap().unwrap_err().code(), ErrorCode::NotFound);
    }
    assert_eq!(
        tree.go().unwrap_err().code(),
        ErrorCode::NotFound,
        "a later call gets it too"
    );
    drop(Arc::into_inner(tree));
    assert!(
        matches!(peer.recv(), Msg::Release { id: 1, .. }),
        "a second Go frame was sent"
    );
    assert!(sup.alive());
}

/// A `Go` refused by admission was never sent: the root stays held, and a later `go` releases it.
#[test]
fn a_go_refused_by_admission_stays_held() {
    let (sup, mut peer) = pair(BOUND);
    let (spawned, _master) = pty_spawn(&sup, &mut peer, 1);
    for _ in 0..ADMIT_NORMAL {
        spawned.tree.resize(80, 24).unwrap();
    }
    assert_io(spawned.tree.go(), "the limit is 1024");
    for _ in 0..ADMIT_NORMAL {
        let Msg::Resize { req, id, .. } = peer.recv() else {
            panic!("expected Resize")
        };
        peer.send(&Msg::Ack {
            req,
            id,
            result: Ack::Ok,
        });
    }
    // Replies are dispatched in order: once the marker is answered, the queue has drained.
    let marker = {
        let sup = sup.clone();
        thread::spawn(move || {
            block(sup.ask(Want::Release, 1, Class::Cleanup, |req| Msg::Release { req, id: 1 })).map(|_| ())
        })
    };
    let Msg::Release { req, .. } = peer.recv() else {
        panic!("expected the marker")
    };
    peer.send(&Msg::Ack {
        req,
        id: 1,
        result: Ack::Ok,
    });
    marker.join().unwrap().unwrap();
    let go = thread::spawn(move || spawned.tree.go());
    let Msg::Go { req, id: 1 } = peer.recv() else {
        panic!("the root was not held any more")
    };
    peer.send(&Msg::Ack {
        req,
        id: 1,
        result: Ack::Ok,
    });
    go.join().unwrap().unwrap();
}
