//! Unix: descriptor transfer (SCM_RIGHTS both ways), the PTY `Go` round trip, the forked-client refusal
//! (R6) and the K4 spawn round trip.

use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, OwnedFd};
use std::os::unix::fs::MetadataExt;
use std::os::unix::net::UnixStream;
use std::pin::pin;
use std::sync::Arc;
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};

use omni_proto::{Ack, FailCode, Msg, Slot};

use super::{BOUND, LIMIT, Peer, assert_io, pair, spec, with_tree};
use crate::client::channel::Gen;
use crate::client::start::spawn_on;
use crate::client::unix::pipe;
use crate::client::{HostStdio, Spawned};
use crate::error::ErrorCode;

fn pipes(s: Spawned) -> (File, File, File) {
    let HostStdio::Pipes {
        stdin: Some(i),
        stdout,
        stderr: Some(e),
    } = s.stdio
    else {
        panic!("three pipes")
    };
    (File::from(i), File::from(stdout), File::from(e))
}

/// The child's ends travel with their frame, exactly once and in stdin, stdout, stderr order, even when
/// the frame is bigger than the socket buffer (partial writes finished by the writer task).
#[test]
fn pipe_ends_travel_with_the_spawn_frame() {
    let (sup, mut peer) = pair(BOUND);
    let mut big = spec(false);
    big.env = (0..2000)
        .map(|i| (format!("VAR_{i}").into(), "x".repeat(300).into()))
        .collect();
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &big))
    };
    let Msg::Spawn(s) = peer.recv() else {
        panic!("expected Spawn")
    };
    assert_eq!(
        (s.env.len(), s.stdin, s.stderr, s.pty),
        (2000, Slot::Pipe, Slot::Pipe, None)
    );
    let fds: Vec<OwnedFd> = peer.fds.drain(..).collect();
    assert_eq!(fds.len(), 3, "one descriptor per pipe, sent once");
    peer.send(&Msg::Spawned {
        req: s.req,
        id: 1,
        pid: 5,
        pty_ends: [0, 0],
    });
    let (mut stdin, mut stdout, mut stderr) = pipes(caller.join().unwrap().unwrap());
    let [child_in, child_out, child_err] = fds.try_into().unwrap();
    File::from(child_out).write_all(b"out").unwrap();
    File::from(child_err).write_all(b"err").unwrap();
    stdin.write_all(b"in").unwrap();
    drop(stdin);
    let read = |f: &mut dyn Read| {
        let mut s = String::new();
        f.read_to_string(&mut s).unwrap();
        s
    };
    assert_eq!(read(&mut stdout), "out");
    assert_eq!(read(&mut stderr), "err");
    assert_eq!(read(&mut File::from(child_in)), "in");
    assert!(
        matches!(peer.recv(), Msg::Release { id: 1, .. }),
        "dropping the tree releases it"
    );

    let mut merged = spec(false);
    (merged.stdin, merged.merge_stderr) = (crate::types::Stdin::Closed, true);
    let caller = std::thread::spawn(move || spawn_on(&sup, &merged));
    let Msg::Spawn(s) = peer.recv() else {
        panic!("expected Spawn")
    };
    assert_eq!(
        (s.stdin, s.stderr, peer.fds.len()),
        (Slot::Null, Slot::Merge, 1),
        "stdout only"
    );
    peer.send(&Msg::Spawned {
        req: s.req,
        id: 2,
        pid: 6,
        pty_ends: [0, 0],
    });
    let s = caller.join().unwrap().unwrap();
    assert!(matches!(
        s.stdio,
        HostStdio::Pipes {
            stdin: None,
            stderr: None,
            ..
        }
    ));
}

/// Starts a PTY tree `id`; the peer returns a pipe end as the "master".
pub(super) fn pty_spawn(sup: &Arc<Gen>, peer: &mut Peer, id: u64) -> (Spawned, OwnedFd) {
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &spec(true)))
    };
    let Msg::Spawn(s) = peer.recv() else {
        panic!("expected Spawn")
    };
    assert_eq!((s.pty, peer.fds.len()), (Some((100, 30)), 0));
    let (master, _other) = pipe().unwrap();
    let reply = Msg::Spawned {
        req: s.req,
        id,
        pid: 7,
        pty_ends: [1, 0],
    };
    let mut bytes = Vec::new();
    omni_proto::encode(&reply, &mut bytes).unwrap();
    super::platform::write(&mut peer.end, &bytes, Some(&master));
    (caller.join().unwrap().unwrap(), master)
}

/// A Unix PTY root: the master arrives with `Spawned`, `go` is the second round trip and reports exec.
#[test]
fn the_pty_master_arrives_and_go_reports_exec() {
    let (sup, mut peer) = pair(BOUND);
    let (ok, master) = pty_spawn(&sup, &mut peer, 1);
    let HostStdio::Pty { output, input } = &ok.stdio else {
        panic!("terminal ends")
    };
    let ino = |fd: &OwnedFd| File::from(fd.try_clone().unwrap()).metadata().unwrap().ino();
    assert_eq!(
        (ino(output), ino(input)),
        (ino(&master), ino(&master)),
        "both are the master"
    );
    assert_ne!(output.as_raw_fd(), input.as_raw_fd(), "input is a duplicate");
    let go = std::thread::spawn(move || ok.tree.go().map(|()| ok));
    let Msg::Go { req, id: 1 } = peer.recv() else {
        panic!("expected Go")
    };
    peer.send(&Msg::Ack {
        req,
        id: 1,
        result: Ack::Ok,
    });
    let ok = go.join().unwrap().unwrap();
    ok.tree.go().expect("a second go is a no-op");

    let (failed, _master) = pty_spawn(&sup, &mut peer, 2);
    let go = std::thread::spawn(move || (failed.tree.go(), failed));
    let Msg::Go { req, id: 2 } = peer.recv() else {
        panic!("expected Go")
    };
    let msg = "execve /bin/fixture: no such file".into();
    peer.send(&Msg::SpawnFailed {
        req,
        code: FailCode::NotFound,
        errno: 2,
        msg,
    });
    let (result, failed) = go.join().unwrap();
    assert_eq!(result.unwrap_err().code(), ErrorCode::NotFound);
    assert_io(super::block(failed.tree.exited()), "never started");
    super::block(failed.tree.stop(Duration::ZERO)).expect("nothing is left to stop");
    assert!(sup.alive());
}

/// R6, ADR-0005 §9: a forked copy of the host refuses the client and never commands the supervisor.
#[test]
fn a_forked_copy_refuses_the_client() {
    let (sup, mut peer, spawned) = with_tree();
    let (verdict, report) = pipe().unwrap();
    // SAFETY: the child only runs the client's refusal paths (getpid, then an error value), writes one
    // byte and calls `_exit`; it never returns into the test harness.
    let child = unsafe { libc::fork() };
    if child == 0 {
        let mut ok = spawn_on(&sup, &spec(false)).is_err();
        ok &= spawned.tree.go().is_err() && spawned.tree.resize(80, 24).is_err();
        let waker = Waker::noop();
        let mut cx = Context::from_waker(waker);
        ok &= matches!(
            pin!(spawned.tree.stop(Duration::ZERO)).poll(&mut cx),
            Poll::Ready(Err(_))
        );
        ok &= matches!(pin!(spawned.tree.processes()).poll(&mut cx), Poll::Ready(Err(_)));
        ok &= matches!(pin!(spawned.tree.exited()).poll(&mut cx), Poll::Ready(Err(_)));
        ok &= crate::client::runtime().is_err();
        spawned.tree.stop_detached(Duration::ZERO);
        drop(spawned);
        let byte = [u8::from(ok)];
        // SAFETY: plain write of one byte to a descriptor we own, then `_exit` without unwinding.
        unsafe {
            libc::write(report.as_raw_fd(), byte.as_ptr().cast(), 1);
            libc::_exit(0);
        }
    }
    assert!(child > 0, "fork failed");
    drop(report);
    let mut poll = libc::pollfd {
        fd: verdict.as_raw_fd(),
        events: libc::POLLIN,
        revents: 0,
    };
    let ms = libc::c_int::try_from(LIMIT.as_millis()).unwrap();
    // SAFETY: one valid pollfd for the duration of the call.
    if unsafe { libc::poll(&mut poll, 1, ms) } != 1 {
        // SAFETY: the child is ours and not reaped yet.
        unsafe { libc::kill(child, libc::SIGKILL) };
        panic!("the forked copy hung");
    }
    let mut byte = Vec::new();
    File::from(verdict.try_clone().unwrap()).read_to_end(&mut byte).unwrap();
    let mut status = 0;
    // SAFETY: waits for the child we forked.
    assert_eq!(unsafe { libc::waitpid(child, &mut status, 0) }, child);
    assert_eq!(byte, [1], "every call in the forked copy must be refused");
    drop(verdict);
    // Nothing reached the peer from the child: the next frame is the parent's own marker.
    let marker = std::thread::spawn(move || super::block(spawned.tree.processes()));
    let Msg::List { req, id } = peer.recv() else {
        panic!("the forked copy sent a frame")
    };
    peer.send(&Msg::Processes {
        req,
        id,
        list: Vec::new(),
    });
    assert!(marker.join().unwrap().unwrap().is_empty());
}

/// R6: a descriptor that no frame accounts for (here, riding on a pipe spawn's reply) ends the generation.
#[test]
fn an_unaccounted_descriptor_ends_the_generation() {
    let (sup, mut peer) = pair(BOUND);
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || spawn_on(&sup, &spec(false)))
    };
    let Msg::Spawn(s) = peer.recv() else {
        panic!("expected Spawn")
    };
    let (stray, _other) = pipe().unwrap();
    let mut bytes = Vec::new();
    omni_proto::encode(
        &Msg::Spawned {
            req: s.req,
            id: 1,
            pid: 1,
            pty_ends: [0, 0],
        },
        &mut bytes,
    )
    .unwrap();
    super::platform::write(&mut peer.end, &bytes, Some(&stray));
    // The reply itself was valid; the check runs once the chunk is read, so the next call sees the death.
    drop(caller.join().unwrap());
    assert_io(spawn_on(&sup, &spec(false)), "a descriptor that no frame accounts for");
}

/// A peer that answers every `Spawn` and `Release` at once, until the channel closes.
fn echo_supervisor(mut peer: Peer) {
    let mut id = 0;
    while let Some(msg) = peer.next() {
        peer.fds.clear();
        match msg {
            Msg::Spawn(s) => {
                id += 1;
                peer.send(&Msg::Spawned {
                    req: s.req,
                    id,
                    pid: 1,
                    pty_ends: [0, 0],
                });
            }
            Msg::Release { req, id } => peer.send(&Msg::Ack {
                req,
                id,
                result: Ack::Ok,
            }),
            other => panic!("unexpected {other:?}"),
        }
    }
}

/// K4 budget for the client: one spawn round trip (pipes, SCM_RIGHTS, reply, dispatch) of at most 0.2 ms
/// p50 on Linux in the shipped (release) build — `cargo test --release -p hugr-omni k4` — or 3x a bare
/// socketpair ping-pong measured in the same run, whichever is looser (the form of K4 itself). The 0.2 ms
/// binds whenever the bare ping-pong is under 67 µs (~12 µs on a healthy host); on a starved VM the
/// ping-pong alone costs over 0.1 ms and an absolute bound would measure the machine. Debug builds (tokio
/// unoptimized) and other OSes (K4 is a Linux target) keep it as a gross-regression guard (5 ms or 10x).
/// It must hold on a loaded machine too, so it only catches gross faults (a polling interval, a lost wake-up).
#[test]
fn spawn_round_trip_meets_the_k4_budget() {
    let (sup, peer) = pair(BOUND);
    let server = std::thread::spawn(move || echo_supervisor(peer));
    let (mut raw, mut echo) = UnixStream::pair().unwrap();
    let echoer = std::thread::spawn(move || {
        let mut buf = [0u8; 256];
        while let Ok(n @ 1..) = echo.read(&mut buf) {
            echo.write_all(&buf[..n]).unwrap();
        }
    });
    let mut spawn = || {
        let t0 = Instant::now();
        let s = spawn_on(&sup, &spec(false)).unwrap();
        let took = t0.elapsed();
        drop(s);
        took
    };
    let mut ping = || {
        let t0 = Instant::now();
        raw.write_all(&[7; 64]).unwrap();
        raw.read_exact(&mut [0; 64]).unwrap();
        t0.elapsed()
    };
    let p50 = |f: &mut dyn FnMut() -> Duration| {
        let mut batch: Vec<Duration> = (0..100).map(|_| f()).collect();
        batch.sort();
        batch[batch.len() / 2]
    };
    (0..100).for_each(|_| _ = (spawn(), ping()));
    // The best of ten interleaved batches each: the other tests of this binary run in parallel.
    let (mut client, mut bare) = (Duration::MAX, Duration::MAX);
    for _ in 0..10 {
        client = client.min(p50(&mut spawn));
        bare = bare.min(p50(&mut ping));
    }
    let budget = match cfg!(target_os = "linux") && !cfg!(debug_assertions) {
        true => Duration::from_micros(200).max(bare * 3),
        false => Duration::from_millis(5).max(bare * 10),
    };
    eprintln!("K4 spawn round trip: p50 {client:?} (bare ping-pong {bare:?}, budget {budget:?})");
    assert!(client <= budget, "p50 {client:?} over {budget:?}");
    drop(raw);
    echoer.join().unwrap();
    sup.die("the test is over".into());
    server.join().unwrap();
}
