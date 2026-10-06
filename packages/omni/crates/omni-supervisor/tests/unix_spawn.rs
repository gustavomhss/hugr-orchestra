//! SUP-U, starting trees: `posix_spawn` + SETSID with only the stdio descriptors, default signals and an
//! empty mask even under a hostile host; typed spawn failures that leak nothing; the channel's backpressure
//! and its end on a protocol violation (ADR-0005 §2, R1, R4, R5, R6).
#![cfg(unix)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use std::io::Write;
use std::sync::mpsc;
use std::time::Duration;

use common::host::{Cmd, Host, T, wait_child};
use common::os;
use common::role::parse_info;
#[cfg(target_os = "linux")]
use omni_proto::INFO_PIDFD_MEMBERS;
use omni_proto::{Ack, Exit, FailCode, INFO_PIDFD_HOST, Msg, encode};

/// Entry point of the child roles (`common::role`); a no-op in a normal run.
#[test]
fn role() {
    common::role::main();
}

#[test]
fn ready_reports_how_the_host_and_members_are_watched() {
    let h = Host::start();
    // An independent probe of the same kernel facility the supervisor detects.
    #[cfg(target_os = "linux")]
    let expected = {
        // SAFETY: pidfd_open on ourselves; the descriptor is closed right away.
        let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, std::process::id(), 0) };
        if fd >= 0 {
            // SAFETY: closing the descriptor we just opened.
            unsafe { libc::close(fd as i32) };
            INFO_PIDFD_HOST | INFO_PIDFD_MEMBERS
        } else {
            0
        }
    };
    // macOS: kqueue NOTE_EXIT for the host; no pidfd for members.
    #[cfg(target_os = "macos")]
    let expected = INFO_PIDFD_HOST;
    assert_eq!(h.info, expected);
}

#[test]
fn a_pipe_root_leads_its_session_with_only_stdio_and_default_signals() {
    // The host leaked fd 99, ignores SIGINT/SIGHUP/SIGTERM/SIGUSR1 and SIGCHLD, and blocks SIGUSR2.
    let mut h = Host::start_with(os::hostile);
    assert!(
        !os::fds_of(h.sup.id()).contains(&99),
        "the supervisor kept the host's leaked descriptor"
    );
    let t = h.spawn(&Cmd::role("info"));
    let (fds, ignored, blocked, ids) = parse_info(&t.out.rest());
    assert_eq!(fds, [0, 1, 2]);
    assert_eq!(
        ignored,
        [libc::SIGPIPE],
        "only the one a Rust program ignores by itself"
    );
    assert_eq!(blocked, Vec::<i32>::new());
    assert_eq!(ids, [t.pid; 3], "pid = pgid = sid: a session leader");
    // SIGCHLD was SIG_IGN when the supervisor started: exits are still observed (not auto-reaped).
    assert_eq!(h.exited(t.id), Exit::Code(0));

    // Control: the same probe started through std::process by a parent in the same hostile state sees all of it.
    let mut c = Cmd::role("info").std();
    os::hostile(&mut c);
    let out = String::from_utf8(c.output().unwrap().stdout).unwrap();
    let (fds, ignored, blocked, _) = parse_info(&out.lines().map(str::to_owned).collect::<Vec<_>>());
    assert!(fds.contains(&99) && ignored.contains(&libc::SIGTERM) && blocked.contains(&libc::SIGUSR2));
}

/// Linux < 5.9 (no `close_range`, simulated with seccomp): the fallback still closes what the host leaked.
#[cfg(target_os = "linux")]
#[test]
fn without_close_range_leaked_descriptors_are_still_closed() {
    let mut h = Host::start_with(|c| {
        os::hostile(c);
        os::without_close_range(c);
    });
    assert!(
        !os::fds_of(h.sup.id()).contains(&99),
        "the supervisor kept the host's leaked descriptor"
    );
    let t = h.spawn(&Cmd::role("info"));
    assert_eq!(parse_info(&t.out.rest()).0, [0, 1, 2]);
}

#[test]
fn stdio_slots_and_exit_statuses_arrive_as_sent() {
    let mut h = Host::start();
    let mut t = h.spawn(&Cmd::new("/bin/cat", &[]).stdin());
    let mut stdin = t.stdin.take().unwrap();
    stdin.write_all(b"hello\n").unwrap();
    drop(stdin);
    assert_eq!(t.out.rest(), ["hello"]);
    assert_eq!(h.exited(t.id), Exit::Code(0));

    let t = h.spawn(&Cmd::new("/bin/cat", &[])); // null stdin: end of input at once
    assert_eq!(t.out.rest(), Vec::<String>::new());
    assert_eq!(h.exited(t.id), Exit::Code(0));

    let merged = h.spawn(&Cmd::role("out")).out.rest();
    assert!(
        merged.iter().any(|l| l == "OUT") && merged.iter().any(|l| l == "ERR"),
        "{merged:?}"
    );
    let t = h.spawn(&Cmd::role("out").separate_stderr());
    let (out, err) = (t.out.rest(), t.err.as_ref().unwrap().rest());
    assert!(
        out.iter().any(|l| l == "OUT") && !out.iter().any(|l| l == "ERR"),
        "{out:?}"
    );
    assert_eq!(err, ["ERR"]);

    let t = h.spawn(&Cmd::role("exit 42"));
    assert_eq!(h.exited(t.id), Exit::Code(42));
    let t = h.spawn(&Cmd::role("raise 15"));
    assert_eq!(h.exited(t.id), Exit::Signal(libc::SIGTERM));
}

#[test]
fn spawn_failures_are_typed_and_leave_nothing_behind() {
    let mut h = Host::start();
    let before = os::fds_of(h.sup.id());
    let dir = std::env::temp_dir().join(format!("omni-sup-spawn-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let plain = dir.join("not-executable");
    std::fs::write(&plain, b"#!/bin/sh\n").unwrap();

    let mut bad_cwd = Cmd::new("/bin/cat", &[]);
    bad_cwd.cwd = dir.join("missing");
    let mut nul = Cmd::new("/bin/cat", &[]);
    nul.argv.push("a\0b".into());
    let cases = [
        (Cmd::new("/nonexistent/omni-sup", &[]), FailCode::NotFound),
        (Cmd::new(plain.to_str().unwrap(), &[]), FailCode::NotExecutable),
        (bad_cwd, FailCode::BadCwd),
        (Cmd::new("cat", &[]), FailCode::Invalid), // not absolute: the host resolves programs
        (nul, FailCode::Invalid),
    ];
    for (cmd, code) in cases {
        let cmd = cmd.stdin();
        let Err((got, errno, msg)) = h.try_spawn(&cmd) else {
            panic!("{cmd:?} started")
        };
        assert_eq!(got, code, "{cmd:?}: {msg}");
        assert_eq!(errno != 0, code != FailCode::Invalid, "{cmd:?}: errno {errno}");
    }
    std::fs::remove_dir_all(&dir).unwrap();
    // One descriptor number sent three times (the kernel installs three copies), on a rejected spawn.
    let (_r, w) = std::io::pipe().unwrap();
    let cmd = Cmd::new("cat", &[]).stdin().separate_stderr(); // not absolute: rejected
    let req = h.req();
    let raw = std::os::fd::AsRawFd::as_raw_fd(&w);
    h.send(&Msg::Spawn(cmd.spawn_msg(req)), &[raw, raw, raw]);
    assert!(matches!(
        h.reply(req),
        Msg::SpawnFailed {
            code: FailCode::Invalid,
            ..
        }
    ));
    // Every received pipe end was closed again: the supervisor's descriptor table is as before.
    assert_eq!(os::fds_of(h.sup.id()), before);
}

#[test]
fn a_flood_from_a_host_that_stops_reading_is_backpressured_and_lossless() {
    const N: u64 = 100_000;
    let mut h = Host::start();
    let mut frames = Vec::new();
    for req in 1..=N {
        encode(&Msg::List { req, id: 999 }, &mut frames).unwrap();
    }
    let mut w = h.sock.try_clone().unwrap();
    let (done_tx, done) = mpsc::channel();
    let writer = std::thread::spawn(move || {
        w.write_all(&frames).unwrap();
        done_tx.send(()).unwrap();
    });
    // The host reads nothing: with its reply queue full the supervisor stops reading, so the writer blocks.
    assert!(
        done.recv_timeout(Duration::from_secs(1)).is_err(),
        "the supervisor buffered the whole flood"
    );
    for req in 1..=N {
        match h.recv() {
            Some(Msg::Ack {
                req: r,
                id: 999,
                result: Ack::Unknown,
            }) if r == req => {}
            other => panic!("reply {req}: {other:?}"),
        }
    }
    done.recv_timeout(T).unwrap();
    // Admission resumed: a new request after the stall completes.
    assert_eq!(h.ack(|req| Msg::Release { req, id: 999 }), Ack::Unknown);
    writer.join().unwrap();
}

#[test]
fn a_protocol_violation_ends_the_connection_and_every_tree() {
    let mut h = Host::start();
    let t = h.spawn(&Cmd::role("tree hang resist").grace(200));
    let leaf = common::host::field(&t.out.take("UP ", 1), 1)[0];
    // A Spawn that announces a stdout pipe but carries no descriptor.
    let req = h.req();
    h.send(&Msg::Spawn(Cmd::role("leaf plain").spawn_msg(req)), &[]);
    assert!(h.recv().is_none(), "the connection must end");
    let st = wait_child(&mut h.sup, T).expect("the supervisor did not exit");
    assert_eq!(st.code(), Some(1));
    assert!(!os::alive(t.pid) && !os::alive(leaf));
}

#[test]
fn a_burst_of_exits_while_the_host_does_not_read_is_delivered() {
    const N: usize = 300;
    let mut h = Host::start();
    let mut trees: Vec<_> = (0..N).map(|_| h.spawn(&Cmd::new("/bin/cat", &[]).stdin())).collect();
    for t in &mut trees {
        drop(t.stdin.take()); // every cat sees end of input and exits
    }
    // Nobody reads the channel until every root is gone (asked of the OS).
    assert!(os::wait_until(T, || trees.iter().all(|t| !os::alive(t.pid))));
    for t in &trees {
        assert_eq!(h.exited(t.id), Exit::Code(0));
    }
    assert_eq!(h.list(trees[0].id).unwrap(), [], "the loop still serves requests");
}
