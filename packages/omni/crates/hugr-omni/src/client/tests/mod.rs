//! PROTO-01: the host↔supervisor channel suite (ADR-0005 R1, R2, R6, R7). The client talks to a peer that
//! plays the supervisor on the other end of a real socketpair (Unix) or named pipe (Windows), so every
//! outcome is driven by frames, never by sleeps.

mod channel;
mod deadlines;
mod frames;
#[cfg(unix)]
mod go;
#[cfg(unix)]
mod identity;
#[cfg(unix)]
mod ledger;
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

use std::collections::VecDeque;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use omni_proto::{Msg, VERSION, decode, encode};

use super::Pipe;
use super::channel::Gen;
use crate::error::{Error, ErrorCode};
use crate::spawn::{Mode, Spec};
use crate::types::{PtySize, Stdin};

/// Round-trip bound for a healthy peer (generous: CI machines stall).
const BOUND: Duration = Duration::from_secs(5);
/// Every wait of a test fails after this, so a broken client fails instead of hanging.
const LIMIT: Duration = Duration::from_secs(20);

const READY: Msg = Msg::Ready {
    version: VERSION,
    pid: 4242,
    info: 0,
};

fn rt() -> &'static tokio::runtime::Runtime {
    super::runtime().expect("runtime")
}

/// Runs `fut` to completion on a separate current-thread runtime (the caller's, not the library's).
fn block<F: Future>(fut: F) -> F::Output {
    let caller = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .expect("caller runtime");
    caller.block_on(async { tokio::time::timeout(LIMIT, fut).await.expect("timed out") })
}

fn spec(pty: bool) -> Spec {
    Spec {
        program: "/bin/fixture".into(),
        argv: vec!["fixture".into(), "arg with space".into()],
        env: vec![("K".into(), "V".into())],
        cwd: std::env::temp_dir(),
        mode: if pty {
            Mode::Pty(PtySize { cols: 100, rows: 30 })
        } else {
            Mode::Pipe
        },
        stdin: Stdin::Pipe,
        merge_stderr: false,
        grace: Duration::from_millis(1500),
    }
}

fn assert_io(r: Result<impl std::fmt::Debug, Error>, needle: &str) {
    let e = r.expect_err("expected an IO error");
    assert_eq!(e.code(), ErrorCode::Io, "{e}");
    assert!(e.to_string().contains(needle), "`{e}` does not mention `{needle}`");
}

/// The in-test supervisor: reads and writes frames on the other end of the channel.
struct Peer {
    end: platform::End,
    buf: Vec<u8>,
    fds: VecDeque<Pipe>,
}

impl Peer {
    /// The next frame; `None` once the client closed the channel.
    fn next(&mut self) -> Option<Msg> {
        loop {
            if let Some((msg, n)) = decode(&self.buf).expect("the client sent a malformed frame") {
                self.buf.drain(..n);
                return Some(msg);
            }
            let mut chunk = [0u8; 64 * 1024];
            let n = platform::read(&mut self.end, &mut chunk, &mut self.fds);
            if n == 0 {
                return None;
            }
            self.buf.extend_from_slice(&chunk[..n]);
        }
    }

    fn recv(&mut self) -> Msg {
        self.next().expect("the client closed the channel")
    }

    fn send(&mut self, msg: &Msg) {
        let mut bytes = Vec::new();
        encode(msg, &mut bytes).expect("encode");
        platform::write(&mut self.end, &bytes, None);
    }

    fn send_raw(&mut self, bytes: &[u8]) {
        platform::write(&mut self.end, bytes, None);
    }

    /// Answers the next frame, a `Spawn`, with tree `id` (pid `1000 + id`); returns the request.
    fn spawned(&mut self, id: u64) -> omni_proto::Spawn {
        let Msg::Spawn(s) = self.recv() else {
            panic!("expected Spawn")
        };
        let pid = 1000 + u32::try_from(id).expect("small id");
        self.send(&Msg::Spawned {
            req: s.req,
            id,
            pid,
            pty_ends: [0, 0],
        });
        s
    }
}

/// A generation connected to a peer that already said `hello`.
fn connect(num: u64, bound: Duration, hello: &Msg) -> (Result<Arc<Gen>, Error>, Peer) {
    silent(num, bound, Some(hello))
}

/// A generation whose peer said `hello`, or nothing at all.
fn silent(num: u64, bound: Duration, hello: Option<&Msg>) -> (Result<Arc<Gen>, Error>, Peer) {
    let (end, make) = platform::pair();
    let mut peer = Peer {
        end,
        buf: Vec::new(),
        fds: VecDeque::new(),
    };
    if let Some(hello) = hello {
        peer.send(hello);
    }
    (Gen::start(rt(), num, bound, make), peer)
}

fn pair(bound: Duration) -> (Arc<Gen>, Peer) {
    let (sup, peer) = connect(1, bound, &READY);
    (sup.expect("start"), peer)
}

/// A generation with one spawned tree (id 1).
fn with_tree() -> (Arc<Gen>, Peer, super::Spawned) {
    tree_within(BOUND)
}

/// `with_tree` on a generation whose requests are due within `bound`.
fn tree_within(bound: Duration) -> (Arc<Gen>, Peer, super::Spawned) {
    let (sup, mut peer) = pair(bound);
    let caller = {
        let sup = sup.clone();
        std::thread::spawn(move || super::spawn_on(&sup, &spec(false)))
    };
    peer.spawned(1);
    let spawned = caller.join().expect("join").expect("spawn");
    (sup, peer, spawned)
}

#[cfg(unix)]
mod platform {
    //! The peer's end: the other half of a socketpair.

    use std::collections::VecDeque;
    use std::io;
    use std::os::fd::{AsFd, OwnedFd};
    use std::os::unix::net::UnixStream;

    use crate::client::unix::{Chan, recv, send};

    pub(super) type End = UnixStream;

    pub(super) fn pair() -> (End, impl FnOnce() -> io::Result<Chan>) {
        let (host, peer) = UnixStream::pair().expect("socketpair");
        peer.set_read_timeout(Some(super::LIMIT)).expect("timeout");
        (peer, move || Chan::new(host, None))
    }

    pub(super) fn read(end: &mut End, buf: &mut [u8], fds: &mut VecDeque<OwnedFd>) -> usize {
        recv(end.as_fd(), buf, fds).expect("peer read (timed out?)")
    }

    pub(super) fn write(end: &mut End, mut bytes: &[u8], fd: Option<&OwnedFd>) {
        let mut fds: Vec<OwnedFd> = fd.map(|f| f.try_clone().expect("dup")).into_iter().collect();
        while !bytes.is_empty() {
            let n = send(end.as_fd(), bytes, &fds).expect("peer write");
            fds.clear();
            bytes = &bytes[n..];
        }
    }
}

#[cfg(windows)]
mod platform {
    //! The peer's end: a client of the named pipe, in this process (which plays the supervisor process).

    use std::collections::VecDeque;
    use std::fs::{File, OpenOptions};
    use std::io::{self, Read, Write};
    use std::os::windows::io::{FromRawHandle, OwnedHandle};
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicU64, Ordering};

    use windows_sys::Win32::Foundation::{DUPLICATE_SAME_ACCESS, DuplicateHandle, FALSE};
    use windows_sys::Win32::System::Threading::GetCurrentProcess;

    use crate::client::windows::{Chan, server};

    pub(super) type End = File;

    pub(super) fn pair() -> (End, impl FnOnce() -> io::Result<Chan>) {
        static N: AtomicU64 = AtomicU64::new(0);
        let name = format!(
            r"\\.\pipe\hugr-omni-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        );
        let pipe = {
            let _ctx = super::rt().enter();
            server(&name).expect("pipe server")
        };
        let end = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&name)
            .expect("pipe client");
        (end, move || Chan::new(pipe, me(), std::process::id(), false))
    }

    /// A real handle to this process (the "supervisor" that handles are duplicated into).
    pub(super) fn me() -> OwnedHandle {
        let mut h = null_mut();
        // SAFETY: duplicates the current-process pseudo handle into a real one that we own.
        let ok = unsafe {
            let p = GetCurrentProcess();
            DuplicateHandle(p, p, p, &mut h, 0, FALSE, DUPLICATE_SAME_ACCESS)
        };
        assert_ne!(ok, 0, "DuplicateHandle");
        // SAFETY: DuplicateHandle returned a fresh handle.
        unsafe { OwnedHandle::from_raw_handle(h) }
    }

    pub(super) fn read(end: &mut End, buf: &mut [u8], _fds: &mut VecDeque<OwnedHandle>) -> usize {
        match end.read(buf) {
            Ok(n) => n,
            // The host closed its end (broken pipe) or disconnected it (ERROR_PIPE_NOT_CONNECTED = 233).
            Err(e) if e.kind() == io::ErrorKind::BrokenPipe || e.raw_os_error() == Some(233) => 0,
            Err(e) => panic!("peer read: {e}"),
        }
    }

    pub(super) fn write(end: &mut End, bytes: &[u8], _fd: Option<&OwnedHandle>) {
        end.write_all(bytes).expect("peer write");
    }
}
