//! A minimal test host: starts the supervisor on a socketpair (its fd 0, its own process group), speaks the
//! protocol with `omni_proto::{encode, decode}`, sends pipe ends as SCM_RIGHTS, and reads output by lines.

use std::collections::{HashMap, VecDeque};
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::fd::{AsRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::net::UnixStream;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use omni_proto::{Ack, Exit, FailCode, Msg, ProcEntry, Slot, Spawn, decode, encode};

/// Bound for every single observation; reaching it fails the test.
pub const T: Duration = Duration::from_secs(10);

/// The supervisor under test: `HUGR_OMNI_SUPERVISOR` (e.g. the static musl build), else this package's binary.
pub fn sup_path() -> PathBuf {
    std::env::var_os("HUGR_OMNI_SUPERVISOR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_BIN_EXE_hugr-omni-supervisor")))
}

/// What to run, and how.
#[derive(Clone, Debug)]
pub struct Cmd {
    pub program: PathBuf,
    pub argv: Vec<OsString>,
    pub env: Vec<(OsString, OsString)>,
    pub cwd: PathBuf,
    pub stdin: bool,
    pub merge: bool,
    pub grace_ms: u32,
}

impl Cmd {
    pub fn new(program: &str, args: &[&str]) -> Cmd {
        let mut argv = vec![OsString::from(program)];
        argv.extend(args.iter().map(OsString::from));
        Cmd {
            program: PathBuf::from(program),
            argv,
            env: std::env::vars_os().collect(),
            cwd: std::env::current_dir().unwrap(),
            stdin: false,
            merge: true,
            grace_ms: 300,
        }
    }

    /// This test binary in a child role (`role.rs`).
    pub fn role(spec: &str) -> Cmd {
        let exe = std::env::current_exe().unwrap();
        let mut c = Cmd::new(
            exe.to_str().unwrap(),
            &["--exact", "role", "--nocapture", "--test-threads=1", "-q"],
        );
        c.env.retain(|(k, _)| k != super::role::VAR);
        c.env.push((super::role::VAR.into(), spec.into()));
        c
    }

    pub fn stdin(mut self) -> Cmd {
        self.stdin = true;
        self
    }

    pub fn separate_stderr(mut self) -> Cmd {
        self.merge = false;
        self
    }

    pub fn grace(mut self, ms: u32) -> Cmd {
        self.grace_ms = ms;
        self
    }

    /// The same command through `std::process` (the in-host control), stdout piped.
    pub fn std(&self) -> Command {
        let mut c = Command::new(&self.program);
        c.args(&self.argv[1..])
            .env_clear()
            .envs(self.env.iter().cloned())
            .current_dir(&self.cwd);
        c.stdin(Stdio::null()).stdout(Stdio::piped());
        c
    }

    pub fn spawn_msg(&self, req: u64) -> Spawn {
        let b = |s: &std::ffi::OsStr| s.as_bytes().to_vec();
        Spawn {
            req,
            program: b(self.program.as_os_str()),
            argv: self.argv.iter().map(|a| b(a)).collect(),
            env: self.env.iter().map(|(k, v)| (b(k), b(v))).collect(),
            cwd: b(self.cwd.as_os_str()),
            pty: None,
            stdin: if self.stdin { Slot::Pipe } else { Slot::Null },
            stderr: if self.merge { Slot::Merge } else { Slot::Pipe },
            grace_ms: self.grace_ms,
            handles: [0; 3],
        }
    }
}

/// Lines of a pipe, read by a thread.
pub struct Lines(mpsc::Receiver<String>);

impl Lines {
    pub fn new(r: impl Read + Send + 'static) -> Lines {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(r).lines() {
                let Ok(line) = line else { break };
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Lines(rx)
    }

    /// The next line; `None` at end of file. Fails the test after `T`.
    pub fn next(&self) -> Option<String> {
        match self.0.recv_timeout(T) {
            Ok(l) => Some(l),
            Err(mpsc::RecvTimeoutError::Disconnected) => None,
            Err(mpsc::RecvTimeoutError::Timeout) => panic!("no output line within {T:?}"),
        }
    }

    /// The next `n` lines that start with `prefix` (other lines, e.g. the test harness banner, are skipped).
    pub fn take(&self, prefix: &str, n: usize) -> Vec<String> {
        let mut got = Vec::new();
        while got.len() < n {
            let line = self
                .next()
                .unwrap_or_else(|| panic!("end of output before {n} '{prefix}' lines: {got:?}"));
            if line.starts_with(prefix) {
                got.push(line);
            }
        }
        got
    }

    /// Every remaining line up to end of file.
    pub fn rest(&self) -> Vec<String> {
        std::iter::from_fn(|| self.next()).collect()
    }
}

/// Field `i` (0 = the marker) of each line, as a pid.
pub fn field(lines: &[String], i: usize) -> Vec<i32> {
    lines
        .iter()
        .map(|l| l.split(' ').nth(i).unwrap().parse().unwrap())
        .collect()
}

/// A tree started through the supervisor.
pub struct Tree {
    pub id: u64,
    pub pid: i32,
    pub out: Lines,
    pub err: Option<Lines>,
    pub stdin: Option<std::io::PipeWriter>,
}

pub struct Host {
    pub sup: Child,
    pub sock: UnixStream,
    rbuf: Vec<u8>,
    pub info: u32,
    next: u64,
    pub exits: HashMap<u64, Exit>,
    stash: VecDeque<Msg>,
}

impl Host {
    pub fn start() -> Host {
        Host::start_with(|_| {})
    }

    /// Starts the supervisor; `setup` may add pre-exec hooks (hostile host, no pidfd).
    pub fn start_with(setup: impl FnOnce(&mut Command)) -> Host {
        let (ours, theirs) = UnixStream::pair().unwrap();
        let mut cmd = Command::new(sup_path());
        cmd.arg("--host-pid").arg(std::process::id().to_string());
        cmd.stdin(Stdio::from(OwnedFd::from(theirs))).process_group(0);
        setup(&mut cmd);
        let sup = cmd.spawn().unwrap();
        let mut h = Host {
            sup,
            sock: ours,
            rbuf: Vec::new(),
            info: 0,
            next: 1,
            exits: HashMap::new(),
            stash: VecDeque::new(),
        };
        match h.recv() {
            Some(Msg::Ready { version, pid, info }) => {
                assert_eq!((version, pid), (omni_proto::VERSION, h.sup.id()));
                h.info = info;
            }
            other => panic!("expected Ready, got {other:?}"),
        }
        h
    }

    pub fn req(&mut self) -> u64 {
        self.next += 1;
        self.next
    }

    /// Sends one frame; `fds` ride on its first byte.
    pub fn send(&mut self, msg: &Msg, fds: &[RawFd]) {
        let mut bytes = Vec::new();
        encode(msg, &mut bytes).unwrap();
        self.send_bytes(&bytes, fds);
    }

    pub fn send_bytes(&mut self, bytes: &[u8], fds: &[RawFd]) {
        let n = if fds.is_empty() {
            0
        } else {
            send_with_fds(&self.sock, bytes, fds)
        };
        self.sock.write_all(&bytes[n..]).unwrap();
    }

    /// The next message; `None` once the supervisor closed the channel. Fails the test after `T`.
    pub fn recv(&mut self) -> Option<Msg> {
        self.recv_within(T).expect("no message from the supervisor in time")
    }

    /// `Err(())` if nothing complete arrived within `within`; `Ok(None)` once the channel closed.
    pub fn recv_within(&mut self, within: Duration) -> Result<Option<Msg>, ()> {
        let end = Instant::now() + within;
        loop {
            if let Some((msg, used)) = decode(&self.rbuf).unwrap() {
                self.rbuf.drain(..used);
                return Ok(Some(msg));
            }
            let left = end.checked_duration_since(Instant::now()).ok_or(())?;
            self.sock
                .set_read_timeout(Some(left.max(Duration::from_millis(1))))
                .unwrap();
            let mut buf = [0u8; 64 * 1024];
            match self.sock.read(&mut buf) {
                Ok(0) => return Ok(None),
                Ok(n) => self.rbuf.extend_from_slice(&buf[..n]),
                Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {
                    return Err(());
                }
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                Err(e) => panic!("reading the channel: {e}"),
            }
        }
    }

    /// The reply to `req`. `Exited` on the way is recorded; other replies wait in a stash.
    pub fn reply(&mut self, req: u64) -> Msg {
        if let Some(i) = self.stash.iter().position(|m| req_of(m) == Some(req)) {
            return self.stash.remove(i).unwrap();
        }
        loop {
            match self.recv().expect("the supervisor closed the channel") {
                Msg::Exited { id, exit } => assert!(self.exits.insert(id, exit).is_none(), "second Exited for {id}"),
                m if req_of(&m) == Some(req) => return m,
                m => self.stash.push_back(m),
            }
        }
    }

    pub fn request(&mut self, f: impl FnOnce(u64) -> Msg) -> Msg {
        let req = self.req();
        self.send(&f(req), &[]);
        self.reply(req)
    }

    pub fn ack(&mut self, f: impl FnOnce(u64) -> Msg) -> Ack {
        match self.request(f) {
            Msg::Ack { result, .. } => result,
            other => panic!("expected Ack, got {other:?}"),
        }
    }

    pub fn try_spawn(&mut self, cmd: &Cmd) -> Result<Tree, (FailCode, i32, String)> {
        let (out_r, out_w) = std::io::pipe().unwrap();
        let (in_r, in_w) = if cmd.stdin {
            Some(std::io::pipe().unwrap())
        } else {
            None
        }
        .unzip();
        let (err_r, err_w) = if cmd.merge {
            None
        } else {
            Some(std::io::pipe().unwrap())
        }
        .unzip();
        let mut fds: Vec<RawFd> = in_r.iter().map(AsRawFd::as_raw_fd).collect();
        fds.push(out_w.as_raw_fd());
        fds.extend(err_w.iter().map(AsRawFd::as_raw_fd));
        let req = self.req();
        self.send(&Msg::Spawn(cmd.spawn_msg(req)), &fds);
        drop((in_r, out_w, err_w)); // the supervisor and the child hold their own copies
        match self.reply(req) {
            Msg::Spawned { id, pid, pty_ends, .. } => {
                assert_eq!(pty_ends, [0, 0]);
                Ok(Tree {
                    id,
                    pid: pid as i32,
                    out: Lines::new(out_r),
                    err: err_r.map(Lines::new),
                    stdin: in_w,
                })
            }
            Msg::SpawnFailed { code, errno, msg, .. } => Err((code, errno, msg)),
            other => panic!("expected Spawned, got {other:?}"),
        }
    }

    pub fn spawn(&mut self, cmd: &Cmd) -> Tree {
        self.try_spawn(cmd)
            .unwrap_or_else(|e| panic!("spawn {cmd:?} failed: {e:?}"))
    }

    /// `Stop` and the time until `Stopped`.
    pub fn stop(&mut self, id: u64, grace_ms: u32) -> Duration {
        let t0 = Instant::now();
        match self.request(|req| Msg::Stop { req, id, grace_ms }) {
            Msg::Stopped { id: got, .. } if got == id => t0.elapsed(),
            other => panic!("expected Stopped, got {other:?}"),
        }
    }

    pub fn list(&mut self, id: u64) -> Result<Vec<ProcEntry>, Ack> {
        match self.request(|req| Msg::List { req, id }) {
            Msg::Processes { list, .. } => Ok(list),
            Msg::Ack { result, .. } => Err(result),
            other => panic!("expected Processes, got {other:?}"),
        }
    }

    /// Waits for the root's `Exited`.
    pub fn exited(&mut self, id: u64) -> Exit {
        loop {
            if let Some(&e) = self.exits.get(&id) {
                return e;
            }
            match self.recv().expect("the supervisor closed the channel") {
                Msg::Exited { id, exit } => assert!(self.exits.insert(id, exit).is_none(), "second Exited for {id}"),
                m => self.stash.push_back(m),
            }
        }
    }

    /// Closes the channel (host death for the supervisor) and returns the supervisor's exit status.
    pub fn close(mut self) -> ExitStatus {
        // Shut down, not just drop: `self` still owns the socket until the end of this function.
        self.sock.shutdown(std::net::Shutdown::Both).unwrap();
        wait_child(&mut self.sup, T).expect("the supervisor did not exit after host death")
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.sock.shutdown(std::net::Shutdown::Both);
        if wait_child(&mut self.sup, T).is_none() {
            let _ = self.sup.kill();
            let _ = self.sup.wait();
        }
    }
}

/// Bounded `wait` on a child of this process.
pub fn wait_child(c: &mut Child, within: Duration) -> Option<ExitStatus> {
    let end = Instant::now() + within;
    loop {
        if let Some(st) = c.try_wait().unwrap() {
            return Some(st);
        }
        if Instant::now() >= end {
            return None;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}

/// The signal that ended a status, if any.
pub fn signal_of(st: ExitStatus) -> Option<i32> {
    st.signal()
}

fn req_of(m: &Msg) -> Option<u64> {
    match *m {
        Msg::Spawned { req, .. }
        | Msg::SpawnFailed { req, .. }
        | Msg::Stopped { req, .. }
        | Msg::Processes { req, .. }
        | Msg::Ack { req, .. } => Some(req),
        _ => None,
    }
}

/// One `sendmsg` carrying `fds`; returns how many bytes of `data` went with it.
pub fn send_with_fds(sock: &UnixStream, data: &[u8], fds: &[RawFd]) -> usize {
    let mut iov = libc::iovec {
        iov_base: data.as_ptr().cast_mut().cast(),
        iov_len: data.len(),
    };
    let mut cbuf = [0u64; 8];
    let payload = std::mem::size_of_val(fds) as u32;
    // SAFETY: msghdr is plain old data; the pointers set below outlive the call; 3 fds fit in `cbuf`.
    let n = unsafe {
        let mut msg: libc::msghdr = std::mem::zeroed();
        msg.msg_iov = &raw mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = cbuf.as_mut_ptr().cast();
        msg.msg_controllen = libc::CMSG_SPACE(payload) as _;
        let c = libc::CMSG_FIRSTHDR(&raw const msg);
        (*c).cmsg_level = libc::SOL_SOCKET;
        (*c).cmsg_type = libc::SCM_RIGHTS;
        (*c).cmsg_len = libc::CMSG_LEN(payload) as _;
        std::ptr::copy_nonoverlapping(fds.as_ptr(), libc::CMSG_DATA(c).cast::<RawFd>(), fds.len());
        libc::sendmsg(sock.as_raw_fd(), &raw const msg, 0)
    };
    assert!(
        n > 0,
        "sendmsg with descriptors failed: {}",
        std::io::Error::last_os_error()
    );
    n as usize
}
