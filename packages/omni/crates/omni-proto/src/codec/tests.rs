use super::{decode, encode};
use crate::{Ack, Exit, FailCode, MAX_FRAME, Msg, ProcEntry, Slot, Spawn};

fn spawn() -> Spawn {
    Spawn {
        req: 7,
        program: b"/usr/bin/env".to_vec(),
        argv: vec![b"env".to_vec(), b"".to_vec(), vec![0xff, b' ']],
        env: vec![(b"K".to_vec(), b"V=1".to_vec())],
        cwd: b"/tmp".to_vec(),
        pty: None,
        stdin: Slot::Pipe,
        stderr: Slot::Merge,
        grace_ms: 2000,
        handles: [0, 0, 0],
    }
}

fn all() -> Vec<Msg> {
    let name = |s: &str| Some(s.to_string());
    vec![
        Msg::Spawn(spawn()),
        Msg::Spawn(Spawn {
            pty: Some((80, 24)),
            stdin: Slot::Null,
            stderr: Slot::Pipe,
            handles: [1, 2, 3],
            ..spawn()
        }),
        Msg::Go { req: 1, id: 2 },
        Msg::Stop {
            req: 1,
            id: 2,
            grace_ms: 0,
        },
        Msg::Resize {
            req: 1,
            id: 2,
            cols: 100,
            rows: 30,
        },
        Msg::List { req: 1, id: 2 },
        Msg::Release { req: 1, id: 2 },
        Msg::Ready {
            version: crate::VERSION,
            pid: 42,
            info: crate::INFO_PIDFD_HOST,
        },
        Msg::Spawned {
            req: 1,
            id: 2,
            pid: 3,
            pty_ends: [1, 0],
        },
        Msg::SpawnFailed {
            req: 1,
            code: FailCode::NotFound,
            errno: -2,
            msg: "não".into(),
        },
        Msg::Exited {
            id: 2,
            exit: Exit::Code(0xC000_013A),
        },
        Msg::Exited {
            id: 2,
            exit: Exit::Signal(15),
        },
        Msg::Stopped { req: 1, id: 2 },
        Msg::Processes {
            req: 1,
            id: 2,
            list: vec![
                ProcEntry {
                    pid: 10,
                    ppid: None,
                    name: name("node"),
                },
                ProcEntry {
                    pid: 11,
                    ppid: Some(10),
                    name: None,
                },
            ],
        },
        Msg::Processes {
            req: 1,
            id: 2,
            list: vec![],
        },
        Msg::Ack {
            req: 1,
            id: 2,
            result: Ack::Closed,
        },
    ]
}

#[test]
fn every_message_round_trips_and_partial_frames_wait() {
    for m in all() {
        let mut buf = Vec::new();
        encode(&m, &mut buf).unwrap();
        assert_eq!(decode(&buf).unwrap(), Some((m.clone(), buf.len())), "{m:?}");
        for cut in 0..buf.len() {
            assert_eq!(decode(&buf[..cut]).unwrap(), None, "{m:?} cut at {cut}");
        }
    }
}

#[test]
fn two_frames_back_to_back() {
    let mut buf = Vec::new();
    encode(&Msg::Go { req: 1, id: 1 }, &mut buf).unwrap();
    encode(&Msg::Stopped { req: 2, id: 1 }, &mut buf).unwrap();
    let (first, used) = decode(&buf).unwrap().unwrap();
    assert_eq!(first, Msg::Go { req: 1, id: 1 });
    assert_eq!(decode(&buf[used..]).unwrap().unwrap().0, Msg::Stopped { req: 2, id: 1 });
}

/// Frame `body` with a correct length prefix.
fn framed(body: &[u8]) -> Vec<u8> {
    let mut v = (body.len() as u32).to_le_bytes().to_vec();
    v.extend_from_slice(body);
    v
}

fn body(m: &Msg) -> Vec<u8> {
    let mut buf = Vec::new();
    encode(m, &mut buf).unwrap();
    buf[4..].to_vec()
}

#[test]
fn malformed_frames_are_errors() {
    let go = body(&Msg::Go { req: 1, id: 2 });
    let mut trailing = go.clone();
    trailing.push(0);
    let mut unknown = go.clone();
    unknown[0] = 0x7f;
    let mut bad_bool = body(&Msg::Spawn(spawn()));
    let pty_at = bad_bool.len() - (2 + 2 + 1 + 1 + 4 + 24) - 1;
    bad_bool[pty_at] = 2;
    let mut size_without_pty = body(&Msg::Spawn(spawn()));
    size_without_pty[pty_at + 1] = 80;
    let mut bad_slot = body(&Msg::Spawn(spawn()));
    bad_slot[pty_at + 5] = 2; // stdin = merge
    let exited_sig0 = [&[0x84][..], &2u64.to_le_bytes(), &[1], &0u32.to_le_bytes()].concat();
    let list_bomb = [
        &[0x86][..],
        &1u64.to_le_bytes(),
        &2u64.to_le_bytes(),
        &u32::MAX.to_le_bytes(),
    ]
    .concat();
    let bad_utf8 = [
        &[0x83][..],
        &1u64.to_le_bytes(),
        &[1],
        &0i32.to_le_bytes(),
        &1u32.to_le_bytes(),
        &[0xff],
    ]
    .concat();
    for (what, frame) in [
        ("trailing byte", framed(&trailing)),
        ("unknown kind", framed(&unknown)),
        ("bool 2", framed(&bad_bool)),
        ("size without pty", framed(&size_without_pty)),
        ("stdin merge", framed(&bad_slot)),
        ("signal 0", framed(&exited_sig0)),
        ("count bomb", framed(&list_bomb)),
        ("invalid UTF-8 msg", framed(&bad_utf8)),
        ("zero length", vec![0, 0, 0, 0]),
        ("over 1 MiB", ((MAX_FRAME + 1) as u32).to_le_bytes().to_vec()),
    ] {
        assert!(decode(&frame).is_err(), "{what} was accepted");
    }
}

#[test]
fn encode_refuses_what_decode_would_refuse() {
    let mut out = Vec::new();
    assert!(
        encode(
            &Msg::Spawn(Spawn {
                stdin: Slot::Merge,
                ..spawn()
            }),
            &mut out
        )
        .is_err()
    );
    assert!(
        encode(
            &Msg::Spawn(Spawn {
                stderr: Slot::Null,
                ..spawn()
            }),
            &mut out
        )
        .is_err()
    );
    assert!(
        encode(
            &Msg::Exited {
                id: 1,
                exit: Exit::Signal(0)
            },
            &mut out
        )
        .is_err()
    );
    let huge = Spawn {
        argv: vec![vec![b'a'; MAX_FRAME]],
        ..spawn()
    };
    assert!(encode(&Msg::Spawn(huge), &mut out).is_err());
    assert!(out.is_empty(), "a refused message must append nothing");
}
