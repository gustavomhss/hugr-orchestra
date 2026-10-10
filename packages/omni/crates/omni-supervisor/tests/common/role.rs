//! Child roles: the test binary re-runs itself (`<exe> --exact role`) with `OMNI_SUP_ROLE` set, so every
//! child is a known program whose markers say what it is (no shell, no sleep-based synchronization).
//! Each marker line is one write. Every role exits on its own after `LIFETIME` (`LONG_LIFETIME` with the leaf
//! flag `long`), so a failed test cannot
//! leave processes behind for long.
//!
//! - `info`: prints `FDS <open fds>`, `IGN <ignored signals>`, `BLK <blocked signals>`, `IDS <pid> <pgid> <sid>`.
//! - `out`: `OUT` on stdout, `ERR` on stderr · `exit <code>` · `raise <signal>`
//! - `leaf <flags>`: flags joined by `+`: `resist` (ignore SIGTERM and SIGHUP), `group` (own process group),
//!   `long` (outlives a full macOS pid cycle), `report` (on SIGTERM prints `TERM` and exits 0), `heavy`
//!   (256 MiB of touched memory and 64 threads: its teardown after SIGKILL takes tens of milliseconds),
//!   `zleader` (Linux, last: the main thread ends while another thread runs, so the leader is a zombie in
//!   /proc; prints `ZLEADER <pid> <pgid> <sid>` once it is);
//!   prints `UP <pid> <pgid> <sid>`, then hangs.
//! - `tree <then> <leaf flags>...`: starts one leaf per argument, prints `ROOT <pid>`, then `hang`s, `exit`s
//!   at once, or reads stdin to its end (`stdin`) and exits.
//! - `host <mode>`: a host process for the host-death tests (`host_role`).
//! - `cycle <lo> <hi>`: forks and reaps until a fork gets a pid in `[lo, hi)` (macOS pid cycling).

use std::io::Write;
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::Duration;

/// The variable that selects a role.
pub const VAR: &str = "OMNI_SUP_ROLE";
const LIFETIME: Duration = Duration::from_secs(60);
const LONG_LIFETIME: Duration = Duration::from_secs(600);

/// Runs the role named by `OMNI_SUP_ROLE` and exits; returns at once in a normal test run.
pub fn main() {
    let Ok(spec) = std::env::var(VAR) else { return };
    let snapshot = Snapshot::take(); // before anything opens a descriptor
    let lifetime = if spec.contains("long") { LONG_LIFETIME } else { LIFETIME };
    std::thread::spawn(move || {
        std::thread::sleep(lifetime);
        std::process::exit(70);
    });
    let words: Vec<&str> = spec.split(' ').collect();
    match words.as_slice() {
        ["info"] => snapshot.print(),
        ["out"] => {
            say("OUT");
            std::io::stderr().write_all(b"ERR\n").unwrap();
        }
        ["exit", code] => std::process::exit(code.parse().unwrap()),
        ["raise", sig] => {
            // SAFETY: plain integer argument; the signal has its default disposition.
            unsafe { libc::raise(sig.parse().unwrap()) };
        }
        ["leaf", flags] => leaf(flags),
        ["tree", then, leaves @ ..] => tree(then, leaves),
        ["host", mode] => super::host_role::run(mode),
        ["cycle", lo, hi] => cycle(lo.parse().unwrap(), hi.parse().unwrap()),
        _ => std::process::exit(99),
    }
    std::process::exit(0);
}

/// Prints one marker line with a single write.
pub fn say(line: &str) {
    let mut out = std::io::stdout().lock();
    out.write_all(format!("{line}\n").as_bytes()).unwrap();
    out.flush().unwrap();
}

pub fn hang() -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(3600));
    }
}

/// A role as a `std::process::Command` (children of roles, controls).
pub fn command(spec: &str) -> Command {
    let mut c = Command::new(std::env::current_exe().unwrap());
    c.args(["--exact", "role", "--nocapture", "--test-threads=1", "-q"])
        .env(VAR, spec)
        .stdin(Stdio::null());
    c
}

fn ids() -> String {
    // SAFETY: no arguments / plain integer arguments.
    unsafe { format!("{} {} {}", libc::getpid(), libc::getpgrp(), libc::getsid(0)) }
}

fn leaf(flags: &str) {
    for flag in flags.split('+') {
        match flag {
            "resist" => ignore_term(),
            // SAFETY: the handler only makes async-signal-safe calls.
            "report" => unsafe {
                libc::signal(
                    libc::SIGTERM,
                    on_term as extern "C" fn(libc::c_int) as libc::sighandler_t,
                );
            },
            // SAFETY: plain integer arguments.
            "group" => assert_eq!(unsafe { libc::setpgid(0, 0) }, 0),
            "plain" | "long" => {}
            "heavy" => heavy(),
            #[cfg(target_os = "linux")]
            "zleader" => zleader(),
            other => panic!("unknown leaf flag {other}"),
        }
    }
    say(&format!("UP {}", ids()));
    hang()
}

/// Ends the main thread only (the raw `exit` syscall, as `pthread_exit` does, from a SIGUSR1 handler sent to
/// it with `tgkill`) while a thread keeps the process running; never returns.
#[cfg(target_os = "linux")]
fn zleader() -> ! {
    extern "C" fn end_this_thread(_: libc::c_int) {
        // SAFETY: the raw exit syscall ends only the calling thread; async-signal-safe.
        unsafe { libc::syscall(libc::SYS_exit, 0) };
    }
    std::thread::spawn(|| {
        let me = std::process::id();
        let zombie = || {
            let s = std::fs::read_to_string(format!("/proc/{me}/stat")).unwrap();
            s.rsplit_once(')')
                .is_some_and(|(_, rest)| rest.trim_start().starts_with('Z'))
        };
        while !zombie() {
            std::thread::sleep(Duration::from_millis(1));
        }
        say(&format!("ZLEADER {}", ids()));
        hang()
    });
    // SAFETY: installs a handler that only calls an async-signal-safe syscall, then signals the main thread.
    unsafe {
        libc::signal(
            libc::SIGUSR1,
            end_this_thread as extern "C" fn(libc::c_int) as libc::sighandler_t,
        );
        let pid = libc::getpid();
        libc::syscall(libc::SYS_tgkill, pid, pid, libc::SIGUSR1);
    }
    hang()
}

/// Makes the process slow to tear down: memory to unmap and threads to end after SIGKILL.
fn heavy() {
    let heap: Vec<Vec<u8>> = (0..64).map(|_| vec![1u8; 4 << 20]).collect();
    std::mem::forget(heap);
    for _ in 0..64 {
        std::thread::spawn(|| std::thread::sleep(Duration::from_secs(3600)));
    }
}

fn ignore_term() {
    // SAFETY: plain integer arguments; ignoring a signal is always allowed.
    unsafe {
        libc::signal(libc::SIGTERM, libc::SIG_IGN);
        libc::signal(libc::SIGHUP, libc::SIG_IGN);
    }
}

extern "C" fn on_term(_: libc::c_int) {
    // SAFETY: one write of a static line, then exit: both async-signal-safe.
    unsafe {
        libc::write(1, c"TERM\n".as_ptr().cast(), 5);
        libc::_exit(0);
    }
}

fn tree(then: &str, leaves: &[&str]) {
    for flags in leaves {
        // Never waited for on purpose: the leaves outlive this root (they are the tree under test).
        #[allow(clippy::zombie_processes)]
        command(&format!("leaf {flags}")).spawn().unwrap();
    }
    say(&format!("ROOT {}", ids()));
    match then {
        "hang" => hang(),
        "exit" => {}
        "stdin" => _ = std::io::copy(&mut std::io::stdin(), &mut std::io::sink()),
        other => panic!("unknown tree end {other}"),
    }
}

fn cycle(lo: i32, hi: i32) {
    loop {
        // SAFETY: the child only calls _exit.
        let pid = unsafe { libc::fork() };
        if pid == 0 {
            // SAFETY: async-signal-safe exit of the forked child.
            unsafe { libc::_exit(0) };
        }
        let mut st = 0;
        // SAFETY: reaping our own child.
        unsafe { libc::waitpid(pid, &raw mut st, 0) };
        if (lo..hi).contains(&pid) {
            return;
        }
    }
}

/// What a fresh process inherited.
struct Snapshot {
    fds: Vec<i32>,
    ignored: Vec<i32>,
    blocked: Vec<i32>,
}

impl Snapshot {
    fn take() -> Snapshot {
        // SAFETY: queries only: F_GETFD, sigaction with no new action, sigprocmask with no new set.
        unsafe {
            let fds = (0..1024).filter(|&fd| libc::fcntl(fd, libc::F_GETFD) != -1).collect();
            let mut ignored = Vec::new();
            let mut blocked = Vec::new();
            let mut cur: libc::sigset_t = std::mem::zeroed();
            libc::sigprocmask(libc::SIG_BLOCK, std::ptr::null(), &raw mut cur);
            for sig in 1..32 {
                let mut old: libc::sigaction = std::mem::zeroed();
                if libc::sigaction(sig, std::ptr::null(), &raw mut old) == 0 && old.sa_sigaction == libc::SIG_IGN {
                    ignored.push(sig);
                }
                if libc::sigismember(&raw const cur, sig) == 1 {
                    blocked.push(sig);
                }
            }
            Snapshot { fds, ignored, blocked }
        }
    }

    fn print(&self) {
        let list = |v: &[i32]| v.iter().map(i32::to_string).collect::<Vec<_>>().join(" ");
        say(&format!("FDS {}", list(&self.fds)));
        say(&format!("IGN {}", list(&self.ignored)));
        say(&format!("BLK {}", list(&self.blocked)));
        say(&format!("IDS {}", ids()));
    }
}

/// Parses an `info` role's output: (fds, ignored, blocked, [pid, pgid, sid]).
pub fn parse_info(lines: &[String]) -> (Vec<i32>, Vec<i32>, Vec<i32>, Vec<i32>) {
    let get = |tag: &str| -> Vec<i32> {
        let line = lines
            .iter()
            .find(|l| l.starts_with(tag))
            .unwrap_or_else(|| panic!("no {tag} in {lines:?}"));
        line[tag.len()..]
            .split_whitespace()
            .map(|s| s.parse().unwrap())
            .collect()
    };
    (get("FDS"), get("IGN"), get("BLK"), get("IDS"))
}

/// Spawns `leaf <flags>` directly (not through the supervisor): an unrelated process, in its own group.
pub fn sentinel() -> std::process::Child {
    let mut c = command("leaf resist");
    c.process_group(0).stdout(Stdio::piped());
    let mut child = c.spawn().unwrap();
    let out = super::host::Lines::new(child.stdout.take().unwrap());
    out.take("UP ", 1);
    child
}
