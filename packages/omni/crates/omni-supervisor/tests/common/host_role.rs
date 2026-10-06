//! The host process of the host-death tests (role `host <mode>`): starts its own supervisor, spawns a tree
//! whose two leaves resist SIGTERM (one in another process group), reports
//! `TREE <root> <leaf> <leaf> <supervisor>` and `INFO <ready info>`, then dies the way `mode` says.
//! `idle`: grace 1000 ms, the supervisor left idle for `IDLE`, then SIGKILL.

use std::os::fd::AsRawFd;
use std::process::Stdio;

use omni_proto::{Msg, encode};

use super::host::{Cmd, Host, Lines, field, send_with_fds};
use super::role::{command, hang, say};

pub fn run(mode: &str) {
    let mut host = match mode {
        #[cfg(target_os = "linux")]
        "held-nopidfd" => Host::start_with(super::os::without_pidfd),
        _ => Host::start(),
    };
    let grace = if mode == "idle" { 1000 } else { 300 };
    let tree = host.spawn(&Cmd::role("tree hang resist+group resist").grace(grace));
    let leaves = field(&tree.out.take("UP ", 2), 1);
    say(&format!(
        "TREE {} {} {} {}",
        tree.pid,
        leaves[0],
        leaves[1],
        host.sup.id()
    ));
    say(&format!("INFO {}", host.info));
    match mode {
        "exit" => std::process::exit(0),
        "abort" => {
            let none = libc::rlimit {
                rlim_cur: 0,
                rlim_max: 0,
            };
            // SAFETY: a valid limit; no core file lands in the working tree.
            unsafe { libc::setrlimit(libc::RLIMIT_CORE, &raw const none) };
            std::process::abort()
        }
        "signal" => {
            say("WAIT");
            hang()
        }
        "idle" => {
            std::thread::sleep(IDLE); // the scenario: nothing happens for a while, then the host dies
            die()
        }
        "midspawn" => {
            // A complete Spawn; once its child runs, die before reading `Spawned`.
            let (out_r, out_w) = std::io::pipe().unwrap();
            let req = host.req();
            host.send(
                &Msg::Spawn(Cmd::role("leaf plain").spawn_msg(req)),
                &[out_w.as_raw_fd()],
            );
            drop(out_w);
            let up = Lines::new(out_r).take("UP ", 1);
            say(&format!("INFLIGHT {}", field(&up, 1)[0]));
            die()
        }
        "partial" => {
            // Half a Spawn frame, its descriptor riding on the first byte; then die.
            let (_out_r, out_w) = std::io::pipe().unwrap();
            let mut bytes = Vec::new();
            encode(&Msg::Spawn(Cmd::role("leaf plain").spawn_msg(host.req())), &mut bytes).unwrap();
            let half = &bytes[..bytes.len() / 2];
            assert_eq!(send_with_fds(&host.sock, half, &[out_w.as_raw_fd()]), half.len());
            say("PARTIAL");
            die()
        }
        "held" | "held-nopidfd" => {
            // A copy of the channel without close-on-exec, kept open by an unrelated child: no EOF at death.
            // SAFETY: dup of our own socket; the copy is closed below, after the holder inherited it.
            let copy = unsafe { libc::dup(host.sock.as_raw_fd()) };
            assert!(copy >= 0);
            // Never waited for on purpose: it outlives this host, and the test kills it.
            #[allow(clippy::zombie_processes)]
            let holder = command("leaf plain").stdout(Stdio::null()).spawn().unwrap();
            // SAFETY: closing the copy we just made.
            unsafe { libc::close(copy) };
            say(&format!("HOLDER {}", holder.id()));
            say("WAIT");
            hang()
        }
        other => panic!("unknown host mode {other}"),
    }
}

/// How long the `idle` host leaves its supervisor without any event.
pub const IDLE: std::time::Duration = std::time::Duration::from_millis(1500);

fn die() -> ! {
    // SAFETY: plain integer argument; SIGKILL cannot be caught.
    unsafe { libc::raise(libc::SIGKILL) };
    hang()
}
