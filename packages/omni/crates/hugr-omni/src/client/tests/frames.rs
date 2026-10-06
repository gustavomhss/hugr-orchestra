//! Frames on every OS: partial frames, protocol violations (R6), and finding the supervisor binary.

use std::sync::Arc;

use omni_proto::{Ack, Exit, Msg};

use super::{BOUND, READY, assert_io, block, connect, pair, spec, with_tree};
use crate::client::start::{EXE, pick, spawn_on};

/// A reply written one byte at a time is reassembled; a frame cut by the peer's death is `Io`.
#[test]
fn partial_frames_are_reassembled_and_a_cut_frame_is_death() {
    let (sup, mut peer) = pair(BOUND);
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &spec(false)))
    };
    let Msg::Spawn(s) = peer.recv() else {
        panic!("expected Spawn")
    };
    let mut bytes = Vec::new();
    let reply = Msg::Spawned {
        req: s.req,
        id: 9,
        pid: 99,
        pty_ends: [0, 0],
    };
    omni_proto::encode(&reply, &mut bytes).unwrap();
    for b in &bytes {
        peer.send_raw(std::slice::from_ref(b));
    }
    let spawned = caller.join().unwrap().unwrap();
    assert_eq!((spawned.tree.id, spawned.pid), (9, 99));
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &spec(false)))
    };
    let Msg::Spawn(s) = peer.recv() else {
        panic!("expected Spawn")
    };
    bytes.clear();
    omni_proto::encode(
        &Msg::Spawned {
            req: s.req,
            id: 10,
            pid: 100,
            pty_ends: [0, 0],
        },
        &mut bytes,
    )
    .unwrap();
    peer.send_raw(&bytes[..bytes.len() / 2]);
    drop(peer);
    assert_io(caller.join().unwrap(), "in the middle of a frame");
    assert!(!sup.alive());
}

/// R6: anything the protocol does not allow ends the generation with `Io`.
#[test]
fn protocol_violations_end_the_generation() {
    type Bad = fn(u64) -> Vec<u8>;
    fn frame(m: Msg) -> Vec<u8> {
        let mut b = Vec::new();
        omni_proto::encode(&m, &mut b).unwrap();
        b
    }
    let cases: [(&str, Bad); 6] = [
        ("which is not waiting", |req| {
            frame(Msg::Ack {
                req: req + 1,
                id: 0,
                result: Ack::Ok,
            })
        }),
        ("with the wrong message", |req| frame(Msg::Stopped { req, id: 1 })),
        ("malformed frame", |_| vec![0, 0, 0, 0]),
        ("Ready twice", |_| frame(READY)),
        ("only a host may send", |req| frame(Msg::Go { req, id: 1 })),
        ("terminal ends", |req| {
            frame(Msg::Spawned {
                req,
                id: 1,
                pid: 1,
                pty_ends: [3, 3],
            })
        }),
    ];
    for (needle, bad) in cases {
        let (sup, mut peer) = pair(BOUND);
        let caller = {
            let sup = sup.clone();
            std::thread::spawn(move || spawn_on(&sup, &spec(false)))
        };
        let Msg::Spawn(s) = peer.recv() else {
            panic!("expected Spawn")
        };
        peer.send_raw(&bad(s.req));
        assert_io(caller.join().unwrap(), needle);
        assert!(!sup.alive(), "{needle}");
    }
    let old = Msg::Ready {
        version: omni_proto::VERSION + 1,
        pid: 1,
        info: 0,
    };
    let (started, _peer) = connect(1, BOUND, &old);
    assert_io(started, "protocol version 2");
}

/// R6, for replies about trees: an answer for another tree, a second exit, a reused tree id.
#[test]
fn tree_reply_violations_end_the_generation() {
    let (sup, mut peer, spawned) = with_tree();
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
        id: 2,
        list: Vec::new(),
    });
    assert_io(lister.join().unwrap(), "for tree 2 a request about tree 1");
    assert!(!sup.alive());

    let (_sup, mut peer, spawned) = with_tree();
    for _ in 0..2 {
        peer.send(&Msg::Exited {
            id: 1,
            exit: Exit::Code(0),
        });
    }
    // Answered by `die` whether the request goes out before or after the second exit is read.
    assert_io(block(spawned.tree.processes()), "the exit of tree 1 twice");

    let (sup, mut peer, _first) = with_tree();
    let caller = std::thread::spawn(move || spawn_on(&sup, &spec(false)));
    peer.spawned(1);
    assert_io(caller.join().unwrap(), "reused tree id 1");
}

#[test]
fn the_binary_is_found_by_env_then_module_then_executable() {
    let dir = |s: &str| std::env::temp_dir().join(format!("omni-w04-{}-{s}", std::process::id()));
    let (module, exe) = (dir("module"), dir("exe"));
    for d in [&module, &exe] {
        std::fs::create_dir_all(d).unwrap();
    }
    std::fs::write(exe.join(EXE), b"").unwrap();
    let dirs = [Some(module.clone()), Some(exe.clone())];
    assert_eq!(
        pick(Some("/x/sup".into()), &dirs).unwrap(),
        std::path::PathBuf::from("/x/sup")
    );
    assert_eq!(pick(None, &dirs).unwrap(), exe.join(EXE));
    std::fs::write(module.join(EXE), b"").unwrap();
    assert_eq!(
        pick(Some("".into()), &dirs).unwrap(),
        module.join(EXE),
        "an empty variable is unset"
    );
    for d in [&module, &exe] {
        std::fs::remove_dir_all(d).unwrap();
    }
    assert_io(pick(None, &dirs), "was not found");
}
