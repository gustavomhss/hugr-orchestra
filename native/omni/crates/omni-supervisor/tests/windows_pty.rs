//! PTYSYS-W, the ConPTY path of the Windows supervisor (W12w; ADR-0003, ADR-0005): an interactive prompt,
//! `"\x03"` interrupting the program on the terminal, resizes seen by the child, a stubborn writer ended within
//! `graceMs` = 1000, the close path 200 times with nothing lost and the supervisor's handles measured per build,
//! and the host's console untouched by terminal sessions. The host reads the terminal through the ends the
//! supervisor returns in `Spawned.pty_ends` (`docs/protocol.md`); the terminal side is in `windows_pty_term.rs`.
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "windows_pty_term.rs"]
pub mod term;

use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use omni_proto::{Ack, FailCode, Msg};
use term::host::{Host, Lines, Proc};
use term::{CTRL_EXIT, PTY_CHILD, Term};
use windows_sys::Win32::System::SystemInformation::OSVERSIONINFOW;
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

/// Started by the tests as the program on the terminal (`term::run`).
#[test]
#[ignore = "the terminal program of the suite: the tests start it"]
fn pty_child() {
    let args: Vec<String> = std::env::args().skip_while(|a| a != "--").skip(1).collect();
    term::run(&args)
}

fn resize(host: &mut Host, id: u64, cols: u16, rows: u16) -> Ack {
    match host.call(|req| Msg::Resize { req, id, cols, rows }) {
        Msg::Ack { result, .. } => result,
        other => panic!("unexpected reply to Resize: {other:?}"),
    }
}

fn release(host: &mut Host, id: u64) {
    let reply = host.call(|req| Msg::Release { req, id });
    assert!(matches!(reply, Msg::Ack { result: Ack::Ok, .. }), "{reply:?}");
}

/// The supervisor's handle count once every earlier request is done: a request answered after a `Release` comes
/// after the released record was dropped (each turn of the supervisor's loop drops those first).
fn settled_handles(host: &mut Host) -> u32 {
    let reply = host.call(|req| Msg::List { req, id: u64::MAX });
    assert!(
        matches!(
            reply,
            Msg::Ack {
                result: Ack::Unknown,
                ..
            }
        ),
        "{reply:?}"
    );
    host.handle_count()
}

#[link(name = "ntdll")]
unsafe extern "system" {
    // The true build number: GetVersionExW answers 9200 to a program without a manifest.
    fn RtlGetVersion(info: *mut OSVERSIONINFOW) -> i32;
}

fn windows_build() -> u32 {
    let mut v = OSVERSIONINFOW {
        dwOSVersionInfoSize: size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    // SAFETY: a valid structure with its size set.
    assert_eq!(unsafe { RtlGetVersion(&mut v) }, 0, "RtlGetVersion");
    v.dwBuildNumber
}

#[test]
fn conpty_a_prompt_is_answered_and_the_stream_ends_when_the_root_exits() {
    let mut host = Host::start();
    let mut t = Term::spawn(&mut host, &["prompt"], (80, 24));
    t.screen.wait("NAME?");
    t.type_in(b"omni\r");
    t.screen.wait("GOT=omni;");
    assert_eq!(host.exited(t.id), 0);
    t.screen.end();
}

#[test]
fn conpty_ctrl_c_typed_on_the_terminal_interrupts_its_program() {
    let mut host = Host::start();
    let mut t = Term::spawn(&mut host, &["hang"], (80, 24));
    t.screen.wait("READY;");
    t.type_in(b"\x03");
    assert_eq!(host.exited(t.id), CTRL_EXIT, "the program did not end by Ctrl+C");
    t.screen.end();
}

#[test]
fn conpty_the_child_sees_its_size_and_each_resize_and_a_resize_after_exit_is_closed() {
    let mut host = Host::start();
    let t = Term::spawn(&mut host, &["sizes"], (90, 30));
    t.screen.wait("SIZE=90x30;");
    for (cols, rows) in [(120, 40), (100, 25)] {
        assert_eq!(resize(&mut host, t.id, cols, rows), Ack::Ok);
        t.screen.wait(&format!("SIZE={cols}x{rows};"));
    }
    host.stop(t.id, 0);
    assert_eq!(resize(&mut host, t.id, 80, 24), Ack::Closed);
    t.screen.end();
}

#[test]
fn conpty_a_size_conhost_cannot_take_is_refused_as_invalid() {
    let mut host = Host::start();
    for size in [(0, 24), (80, 0), (32768, 24)] {
        match term::spawn_reply(&mut host, &["hang"], size) {
            Msg::SpawnFailed { code, msg, .. } => assert_eq!(code, FailCode::Invalid, "{size:?}: {msg}"),
            other => panic!("{size:?}: {other:?}"),
        }
    }
}

/// The card's success criterion. The writer is a descendant that ignores Ctrl+C and blocks in its CTRL_CLOSE
/// handler (the OS ends such a process about 5 s after the hang-up), writing all the while. `Stop` with a grace of
/// 1000 ms must end the tree at its deadline, whether the hang-up came at root exit or as the stop's graceful
/// step, and whether or not `ClosePseudoConsole` has returned (before 24H2 it waits for the writer).
#[test]
fn conpty_a_stubborn_writer_ends_within_a_grace_of_1000_ms() {
    let mut host = Host::start();
    for root_exits in [true, false] {
        let t = Term::spawn(&mut host, &["stubborn", if root_exits { "1" } else { "0" }], (80, 24));
        let writer = Proc::open(t.screen.value("WRITER").parse().unwrap());
        if root_exits {
            // The supervisor hangs up when the root exits, before it sends `Exited`.
            assert_eq!(host.exited(t.id), 0);
        } else {
            // Both are Job members: the root was born in the Job, the writer inherited it.
            let mut listed: Vec<u32> = host.list(t.id).iter().map(|e| e.pid).collect();
            listed.sort_unstable();
            let mut both = [t.root.pid(), writer.pid()];
            both.sort_unstable();
            assert_eq!(listed, both);
        }
        assert!(writer.alive(), "the writer is not stubborn");
        let t0 = Instant::now();
        let took = host.stop(t.id, 1000);
        let (end, _) = t.screen.end();
        let ended = end.saturating_duration_since(t0);
        // Recorded, not asserted: the order in which conhost hangs up the processes on a terminal is not
        // documented, so a live root may end by the hang-up (CTRL_EXIT) or by the forced stop (1).
        let root = if root_exits { 0 } else { host.exited(t.id) };
        eprintln!(
            "STUBBORN root_exits={root_exits}: Stopped after {} ms, stream ended after {} ms, root exit {root:#x}",
            took.as_millis(),
            ended.as_millis()
        );
        assert!(
            took >= Duration::from_millis(950),
            "the writer did not hold out until the deadline: {took:?}"
        );
        assert!(
            took <= Duration::from_millis(1500),
            "the deadline did not hold: {took:?}"
        );
        assert!(
            ended <= Duration::from_millis(1500),
            "the stream ended {ended:?} after Stop"
        );
        assert!(!writer.alive(), "the writer survived Stopped");
        release(&mut host, t.id);
    }
}

/// The close path (root exit → hang-up → the stream ends by itself, no `Stop` yet) 200 times in a row with nothing
/// lost, and the supervisor's handle count over those sessions. Below build 26100 conhost leaks handles per
/// pseudoconsole (ADR-0003 Q2); the number printed here is the one GUARANTEES declares.
#[test]
fn conpty_the_close_path_200_times_loses_nothing_and_handles_stay_bounded() {
    const RUNS: u32 = 200;
    const LINES: u32 = 40;
    let build = windows_build();
    let mut host = Host::start();
    // The counter's control: it sees what a live terminal holds in the supervisor.
    let t = Term::spawn(&mut host, &["hang"], (80, 24));
    t.screen.wait("READY;");
    let live = host.handle_count();
    host.stop(t.id, 0);
    t.screen.end();
    release(&mut host, t.id);
    let before = settled_handles(&mut host);
    assert!(
        live > before,
        "the handle count missed a live terminal: {live} then {before}"
    );
    let mut slowest = Duration::ZERO;
    for run in 1..=RUNS {
        let t0 = Instant::now();
        let t = Term::spawn(&mut host, &["burst", &LINES.to_string()], (80, 24));
        let (end, text) = t.screen.end();
        slowest = slowest.max(end.saturating_duration_since(t0));
        let lost: Vec<u32> = (1..=LINES).filter(|i| !text.contains(&format!("LINE={i};"))).collect();
        assert!(
            lost.is_empty() && text.contains("END;"),
            "run {run}: lines {lost:?} lost, or no END: {text:?}"
        );
        assert_eq!(host.exited(t.id), 0, "run {run}");
        host.stop(t.id, 1000);
        release(&mut host, t.id);
    }
    let after = settled_handles(&mut host);
    let per_session = (f64::from(after) - f64::from(before)) / f64::from(RUNS);
    eprintln!(
        "CONPTY-HANDLES build={build} sessions={RUNS} before={before} after={after} per_session={per_session:.2} \
         live_terminal={live} slowest_spawn_to_end_ms={}",
        slowest.as_millis()
    );
    let leak = if build < 26100 { RUNS } else { 0 };
    assert!(
        after <= before + leak + 10,
        "build {build}: supervisor handles grew from {before} to {after} over {RUNS} sessions"
    );
}

/// A host with its own console (as W06's console test) runs terminal sessions: Ctrl+C typed into one, a stubborn
/// writer hung up and forced in another. No console event may reach it; then the control, a Ctrl+C on its own
/// console, must reach its handler: the handler table and its cleared ignore-Ctrl+C flag are unchanged.
#[test]
fn conpty_sessions_never_reach_the_hosts_console() {
    let mut sub = Command::new(std::env::current_exe().unwrap())
        .args(PTY_CHILD)
        .arg("console-host")
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let lines = Lines::new(sub.stdout.take().unwrap());
    assert_eq!(lines.line("EVENTS "), "EVENTS during=0 control=1");
    assert!(sub.wait().unwrap().success());
}
