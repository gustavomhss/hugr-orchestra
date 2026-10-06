//! Host side of the Windows supervisor suite (SUP-W), included as `host` by `windows_spawn.rs` and
//! `windows_tree.rs`: a named-pipe host as `docs/protocol.md` describes it, the supervisor under test, and the
//! `child` test that runs the child program (`windows_child.rs`) or a sub-host.
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "windows_child.rs"]
pub mod kid;
#[path = "windows_os.rs"]
pub mod os;

use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::os::windows::io::{AsRawHandle, IntoRawHandle, OwnedHandle};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex, mpsc};
use std::time::{Duration, Instant};

pub use kid::child_cmd;
use kid::{CHILD, out};
use omni_proto::{FailCode, INFO_PIDFD_HOST, Msg, ProcEntry, Slot, Spawn, VERSION};
pub use os::{Lines, Proc, T, pipe};
use os::{check, overlapped, owned, write_watching};
use windows_sys::Win32::Foundation::{DUPLICATE_CLOSE_SOURCE, DUPLICATE_SAME_ACCESS, DuplicateHandle, FALSE, TRUE};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, PIPE_ACCESS_DUPLEX, ReadFile, WriteFile,
};
use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, GenerateConsoleCtrlEvent, SetConsoleCtrlHandler};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, GetNamedPipeClientProcessId, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{CREATE_NO_WINDOW, GetCurrentProcess, GetProcessHandleCount};

/// Pipe buffers and read size: small, so a host that stops reading backs the supervisor up quickly.
const BUF: u32 = 4096;

/// What a test asks the supervisor to start (the fields of `Spawn`).
pub struct Spec {
    /// Absolute path of the file to run.
    pub program: PathBuf,
    /// `argv[0]`, then the arguments.
    pub argv: Vec<OsString>,
    /// The complete environment.
    pub env: Vec<(OsString, OsString)>,
    /// Working directory.
    pub cwd: PathBuf,
    /// `Null` or `Pipe`.
    pub stdin: Slot,
    /// `Pipe` or `Merge`.
    pub stderr: Slot,
    /// Grace on host death.
    pub grace_ms: u32,
}

impl Spec {
    /// `program args...` with this process's environment and cwd, stdin null, stderr piped.
    pub fn program(program: &Path, args: &[&str]) -> Spec {
        Spec {
            program: program.into(),
            argv: std::iter::once(program.as_os_str())
                .chain(args.iter().map(OsStr::new))
                .map(Into::into)
                .collect(),
            env: std::env::vars_os().collect(),
            cwd: std::env::current_dir().unwrap(),
            stdin: Slot::Null,
            stderr: Slot::Pipe,
            grace_ms: 1000,
        }
    }

    /// The child program (`windows_child.rs`) in mode `args`.
    pub fn child(args: &[&str]) -> Spec {
        let all: Vec<&str> = CHILD.iter().chain(args).copied().collect();
        Spec::program(&std::env::current_exe().unwrap(), &all)
    }
}

/// A started tree, seen from the host.
pub struct Tree {
    /// Tree id.
    pub id: u64,
    /// Root pid.
    pub pid: u32,
    /// The root, seen by the OS.
    pub root: Proc,
    /// stdout (with stderr when merged).
    pub stdout: Lines,
    /// stderr, when piped.
    pub stderr: Option<Lines>,
    /// stdin, when piped.
    pub stdin: Option<File>,
}

/// A `Spawn` ready to send (its stdio handles already given to the supervisor) and the host's ends.
pub struct Prepared {
    /// Its request id.
    pub req: u64,
    /// The message.
    pub msg: Msg,
    stdout: OwnedHandle,
    stderr: Option<Lines>,
    stdin: Option<File>,
}

/// Writes to a host's channel from another thread.
pub struct Writer(Arc<OwnedHandle>);

impl Writer {
    /// `os::write_watching` on the channel.
    pub fn write(&self, bytes: &[u8], stall: Duration, on_stall: impl FnOnce()) {
        write_watching(&self.0, bytes, stall, on_stall);
    }
}

/// The test process as the host of one supervisor.
pub struct Host {
    /// The supervisor process.
    pub sup: std::process::Child,
    pipe: Arc<OwnedHandle>,
    frames: mpsc::Receiver<Msg>,
    early: Vec<Msg>,
    next_req: u64,
}

impl Host {
    /// Pipe first (first instance, local clients only), then the supervisor on its own windowless console,
    /// then the client-pid check and `Ready`.
    pub fn start() -> Host {
        static N: AtomicU32 = AtomicU32::new(0);
        let name = format!(
            r"\\.\pipe\hugr-omni-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        );
        let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
        let open = PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE;
        let mode = PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;
        // SAFETY: a NUL-terminated name and null security attributes (not inheritable).
        let h = unsafe { CreateNamedPipeW(wide.as_ptr(), open, mode, 1, BUF, BUF, 0, std::ptr::null()) };
        let pipe = Arc::new(owned(h, "CreateNamedPipeW"));
        let sup = Command::new(env!("CARGO_BIN_EXE_hugr-omni-supervisor"))
            .args(["--host-pid", &std::process::id().to_string(), "--pipe", &name])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let raw = pipe.as_raw_handle();
        // SAFETY: `overlapped` keeps the OVERLAPPED alive until the operation completes.
        overlapped(&pipe, |ov| unsafe { ConnectNamedPipe(raw, ov) }, Some(T)).unwrap();
        let mut client = 0;
        // SAFETY: a connected pipe and a valid out pointer.
        check(unsafe { GetNamedPipeClientProcessId(raw, &mut client) }, "client pid");
        assert_eq!(client, sup.id(), "the pipe's client is not the supervisor we started");
        let (tx, frames) = mpsc::sync_channel(64); // a host that stops reading stalls the supervisor's writes
        let p = pipe.clone();
        std::thread::spawn(move || {
            let (mut buf, mut chunk) = (Vec::new(), vec![0u8; BUF as usize]);
            loop {
                match omni_proto::decode(&buf) {
                    Ok(Some((m, n))) => {
                        buf.drain(..n);
                        if tx.send(m).is_err() {
                            return;
                        }
                    }
                    Ok(None) => {
                        let at = chunk.as_mut_ptr();
                        // SAFETY: as above; `chunk` outlives the read.
                        let read = |ov| unsafe { ReadFile(p.as_raw_handle(), at, BUF, std::ptr::null_mut(), ov) };
                        match overlapped(&p, read, None) {
                            Ok(n) if n > 0 => buf.extend_from_slice(&chunk[..n]),
                            _ => return,
                        }
                    }
                    Err(e) => panic!("the supervisor sent a malformed frame: {e}"),
                }
            }
        });
        let mut host = Host {
            sup,
            pipe,
            frames,
            early: Vec::new(),
            next_req: 0,
        };
        let ready = host.recv("Ready", |m| matches!(m, Msg::Ready { .. }));
        assert_eq!(
            ready,
            Msg::Ready {
                version: VERSION,
                pid: host.sup.id(),
                info: INFO_PIDFD_HOST
            }
        );
        host
    }

    /// Writes one message.
    pub fn send(&self, msg: &Msg) {
        self.write(&frame(msg));
    }

    /// Writes raw bytes to the channel.
    pub fn write(&self, bytes: &[u8]) {
        let (raw, len) = (self.pipe.as_raw_handle(), bytes.len() as u32);
        // SAFETY: `overlapped` keeps the OVERLAPPED alive until completion; `bytes` outlives the write.
        let n = overlapped(
            &self.pipe,
            |ov| unsafe { WriteFile(raw, bytes.as_ptr(), len, std::ptr::null_mut(), ov) },
            Some(T),
        );
        assert_eq!(n.unwrap(), bytes.len());
    }

    /// A writer for another thread.
    pub fn writer(&self) -> Writer {
        Writer(self.pipe.clone())
    }

    /// A fresh request id.
    pub fn req(&mut self) -> u64 {
        self.next_req += 1;
        self.next_req
    }

    /// The first frame matching `want` (earlier ones are kept for later), within `T`.
    pub fn recv(&mut self, what: &str, want: impl Fn(&Msg) -> bool) -> Msg {
        if let Some(i) = self.early.iter().position(&want) {
            return self.early.remove(i);
        }
        let end = Instant::now() + T;
        loop {
            match self.frames.recv_timeout(end.saturating_duration_since(Instant::now())) {
                Ok(m) if want(&m) => return m,
                Ok(m) => self.early.push(m),
                Err(e) => panic!("waiting for {what}: {e:?}; received meanwhile: {:?}", self.early),
            }
        }
    }

    /// The reply to request `req`.
    pub fn reply(&mut self, req: u64) -> Msg {
        self.recv("a reply", |m| reply_to(m) == Some(req))
    }

    /// One request, its reply.
    pub fn call(&mut self, make: impl FnOnce(u64) -> Msg) -> Msg {
        let req = self.req();
        self.send(&make(req));
        self.reply(req)
    }

    /// Hands a host-side handle to the supervisor (non-inheritable, `DUPLICATE_CLOSE_SOURCE`).
    pub fn give(&self, h: OwnedHandle) -> u64 {
        let (sup, mut target) = (self.sup.as_raw_handle(), std::ptr::null_mut());
        let opts = DUPLICATE_SAME_ACCESS | DUPLICATE_CLOSE_SOURCE;
        // SAFETY: valid process handles; the source handle is closed by the call.
        let ok = unsafe {
            DuplicateHandle(
                GetCurrentProcess(),
                h.into_raw_handle(),
                sup,
                &mut target,
                0,
                FALSE,
                opts,
            )
        };
        check(ok, "give");
        target as u64
    }

    /// The `Spawn` for `spec`, with fresh pipes for its stdio slots.
    pub fn prepare(&mut self, spec: Spec) -> Prepared {
        let (out_r, out_w) = pipe();
        let (stdin, in_h) = match spec.stdin {
            Slot::Pipe => {
                let (r, w) = pipe();
                (Some(File::from(w)), self.give(r))
            }
            _ => (None, 0),
        };
        let (stderr, err_h) = match spec.stderr {
            Slot::Pipe => {
                let (r, w) = pipe();
                (Some(Lines::new(File::from(r))), self.give(w))
            }
            _ => (None, 0),
        };
        let handles = [in_h, self.give(out_w), err_h];
        let bytes = |s: &OsStr| s.as_encoded_bytes().to_vec();
        let req = self.req();
        let msg = Msg::Spawn(Spawn {
            req,
            program: bytes(spec.program.as_os_str()),
            argv: spec.argv.iter().map(|a| bytes(a)).collect(),
            env: spec.env.iter().map(|(k, v)| (bytes(k), bytes(v))).collect(),
            cwd: bytes(spec.cwd.as_os_str()),
            pty: None,
            stdin: spec.stdin,
            stderr: spec.stderr,
            grace_ms: spec.grace_ms,
            handles,
        });
        Prepared {
            req,
            msg,
            stdout: out_r,
            stderr,
            stdin,
        }
    }

    /// Spawns `spec` with fresh pipes for its stdio slots.
    pub fn spawn(&mut self, spec: Spec) -> Result<Tree, (FailCode, String)> {
        let p = self.prepare(spec);
        self.send(&p.msg);
        match self.reply(p.req) {
            Msg::Spawned {
                id,
                pid,
                pty_ends: [0, 0],
                ..
            } => {
                let (root, stdout) = (Proc::open(pid), Lines::new(File::from(p.stdout)));
                Ok(Tree {
                    id,
                    pid,
                    root,
                    stdout,
                    stderr: p.stderr,
                    stdin: p.stdin,
                })
            }
            Msg::SpawnFailed { code, msg, .. } => Err((code, msg)),
            other => panic!("unexpected reply to Spawn: {other:?}"),
        }
    }

    /// The exit code in tree `id`'s `Exited`.
    pub fn exited(&mut self, id: u64) -> u32 {
        match self.recv("Exited", |m| matches!(m, Msg::Exited { id: i, .. } if *i == id)) {
            Msg::Exited {
                exit: omni_proto::Exit::Code(c),
                ..
            } => c,
            other => panic!("{other:?}"),
        }
    }

    /// `Stop`, returning how long the tree took to be confirmed gone.
    pub fn stop(&mut self, id: u64, grace_ms: u32) -> Duration {
        let t0 = Instant::now();
        let req = self.req();
        self.send(&Msg::Stop { req, id, grace_ms });
        assert_eq!(self.reply(req), Msg::Stopped { req, id });
        t0.elapsed()
    }

    /// `List`, which must succeed.
    pub fn list(&mut self, id: u64) -> Vec<ProcEntry> {
        match self.call(|req| Msg::List { req, id }) {
            Msg::Processes { list, .. } => list,
            other => panic!("unexpected reply to List: {other:?}"),
        }
    }

    /// The supervisor's open handle count.
    pub fn handle_count(&self) -> u32 {
        let mut n = 0;
        // SAFETY: the supervisor's process handle (full access) and a valid out pointer.
        check(
            unsafe { GetProcessHandleCount(self.sup.as_raw_handle(), &mut n) },
            "GetProcessHandleCount",
        );
        n
    }

    /// The supervisor, seen by the OS.
    pub fn sup_proc(&self) -> Proc {
        Proc::open(self.sup.id())
    }

    /// Ends the channel from the host's side, as a dying host would.
    pub fn disconnect(&self) {
        // SAFETY: the server end of a connected pipe.
        check(
            unsafe { DisconnectNamedPipe(self.pipe.as_raw_handle()) },
            "DisconnectNamedPipe",
        );
    }

    /// Writes `Go` requests without reading any reply until one write stays pending for 2 s, i.e. the
    /// supervisor stopped reading; prints `STALLED` and never returns (the pending write stays alive).
    pub fn flood(&self, id: u64) -> ! {
        let mut req = 1 << 40;
        loop {
            req += 1;
            write_watching(&self.pipe, &frame(&Msg::Go { req, id }), Duration::from_secs(2), || {
                out("STALLED");
                loop {
                    std::thread::park();
                }
            });
        }
    }
}

impl Drop for Host {
    /// Whatever a test leaves behind dies with the supervisor's Jobs.
    fn drop(&mut self) {
        let _ = self.sup.kill();
    }
}

/// One encoded frame.
pub fn frame(msg: &Msg) -> Vec<u8> {
    let mut f = Vec::new();
    omni_proto::encode(msg, &mut f).unwrap();
    f
}

fn reply_to(m: &Msg) -> Option<u64> {
    match *m {
        Msg::Spawned { req, .. }
        | Msg::SpawnFailed { req, .. }
        | Msg::Stopped { req, .. }
        | Msg::Processes { req, .. }
        | Msg::Ack { req, .. } => Some(req),
        _ => None,
    }
}

static EVENTS: Mutex<u32> = Mutex::new(0);
static EVENT_SEEN: Condvar = Condvar::new();

unsafe extern "system" fn count_ctrl(_: u32) -> i32 {
    *EVENTS.lock().unwrap() += 1;
    EVENT_SEEN.notify_all();
    TRUE
}

/// Started by the tests as the child program: `host <kind>` is a sub-host, anything else a `kid` mode.
#[test]
#[ignore = "the child program of the suite: the tests start it"]
fn child() {
    let args: Vec<OsString> = std::env::args_os().skip_while(|a| a != "--").skip(1).collect();
    match args.first().and_then(|a| a.to_str()) {
        Some("host") => sub_host(args.get(1).and_then(|a| a.to_str()).unwrap()),
        _ => kid::run(&args),
    }
}

/// A host in its own process (so the test can kill it or give it its own console) with a resistant chain
/// (grace 500 ms), except in `console`. Prints `SUP <pid>` and `TREE <root> <pid 1> <pid 2>`, then:
/// `kill`: starts a `std::process` control child, prints `CONTROL <pid>` and waits to be killed;
/// `flood`: floods the channel (`Host::flood`);
/// `console`: counts console events, stops the tree gracefully, sends one CTRL_BREAK to its own console
/// as the control, prints `EVENTS <count> EXIT <root exit code> MS <stop time>`.
fn sub_host(kind: &str) -> ! {
    if kind == "console" {
        // SAFETY: a handler that lives as long as the process.
        unsafe { SetConsoleCtrlHandler(Some(count_ctrl), TRUE) };
    }
    let mut host = Host::start();
    let mut spec = Spec::child(&["chain", "0", "2", if kind == "console" { "0" } else { "1" }, "0"]);
    spec.grace_ms = 500;
    let tree = host.spawn(spec).unwrap();
    let pids: Vec<String> = tree
        .stdout
        .take("PID ", 2)
        .iter()
        .map(|l| l.rsplit(' ').next().unwrap().into())
        .collect();
    tree.stdout.line("READY");
    out(&format!("SUP {}", host.sup.id()));
    out(&format!("TREE {} {}", tree.pid, pids.join(" ")));
    match kind {
        "kill" => {
            let mut control = child_cmd(&["chain", "0", "0", "0", "0"])
                .stdout(Stdio::null())
                .spawn()
                .unwrap();
            out(&format!("CONTROL {}", control.id()));
            let _ = control.wait(); // the test kills this host first
        }
        "flood" => host.flood(tree.id),
        _ => {
            let ms = host.stop(tree.id, 5000).as_millis();
            let code = host.exited(tree.id);
            // SAFETY: plain call; group 0 = every process on this sub-host's own console.
            check(
                unsafe { GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, 0) },
                "GenerateConsoleCtrlEvent",
            );
            let n = *EVENT_SEEN
                .wait_timeout_while(EVENTS.lock().unwrap(), T, |n| *n == 0)
                .unwrap()
                .0;
            out(&format!("EVENTS {n} EXIT {code} MS {ms}"));
        }
    }
    std::process::exit(0)
}
