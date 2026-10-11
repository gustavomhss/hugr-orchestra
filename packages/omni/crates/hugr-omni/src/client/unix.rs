//! Unix side of the channel: the socketpair, SCM_RIGHTS, the pipes, and starting the supervisor
//! (`docs/protocol.md`). Linux creates every descriptor with CLOEXEC atomically; macOS sets it right
//! after creation (the window is declared in GUARANTEES).

use std::collections::VecDeque;
use std::ffi::{CStr, OsStr};
use std::io;
use std::os::fd::{AsFd, AsRawFd, BorrowedFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::net::UnixStream as StdStream;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tokio::io::Interest;
use tokio::net::UnixStream;
use tokio::runtime::{Handle, Runtime};

use super::channel::Gen;
use super::keeper::{Keeper, Watch};
use super::{HostStdio, REPLY_WITHIN};
use crate::error::Error;

/// The terminal master that arrives with `Spawned` (`pty_ends = [1, 0]`).
pub(super) type Ends = OwnedFd;

#[cfg(target_os = "linux")]
const SEND_FLAGS: libc::c_int = libc::MSG_NOSIGNAL;
#[cfg(not(target_os = "linux"))]
const SEND_FLAGS: libc::c_int = 0; // SO_NOSIGPIPE is set on the socket instead
#[cfg(target_os = "linux")]
const RECV_FLAGS: libc::c_int = libc::MSG_CMSG_CLOEXEC;
#[cfg(not(target_os = "linux"))]
const RECV_FLAGS: libc::c_int = 0;
/// Control buffer, in u64 words: room for 8 descriptors (a frame carries at most 3; more is a violation).
const CMSG_WORDS: usize = 8;

/// The host end of the socketpair and the supervisor process behind it (`None` for an in-test peer).
pub(super) struct Chan {
    sock: UnixStream,
    sup: Option<Watch>,
    rt: Handle,
}

impl Chan {
    /// Must run inside the runtime's context (`Gen::start` does that).
    pub(super) fn new(host: StdStream, sup: Option<Watch>) -> io::Result<Chan> {
        let setup = (|| {
            let rt = Handle::try_current().map_err(io::Error::other)?;
            host.set_nonblocking(true)?;
            #[cfg(not(target_os = "linux"))]
            no_sigpipe(host.as_fd())?;
            Ok((UnixStream::from_std(host)?, rt))
        })();
        match setup {
            Ok((sock, rt)) => Ok(Chan { sock, sup, rt }),
            Err(e) => {
                // It never served: do not leave it running (its keeper then reaps it).
                if let Some(sup) = &sup {
                    let _ = sup.kill();
                }
                Err(e)
            }
        }
    }

    /// The socketpair is connected from the start.
    pub(super) async fn accept(&self) -> io::Result<()> {
        Ok(())
    }

    /// One non-blocking `sendmsg`; `fds` ride on its first byte.
    pub(super) fn try_send(&self, data: &[u8], fds: &[OwnedFd]) -> io::Result<usize> {
        self.sock
            .try_io(Interest::WRITABLE, || send(self.sock.as_fd(), data, fds))
    }

    pub(super) async fn writable(&self) -> io::Result<()> {
        self.sock.writable().await
    }

    pub(super) async fn recv(&self, buf: &mut [u8], fds: &mut VecDeque<OwnedFd>) -> io::Result<usize> {
        loop {
            self.sock.readable().await?;
            match self
                .sock
                .try_io(Interest::READABLE, || recv(self.sock.as_fd(), buf, fds))
            {
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => continue,
                other => return other,
            }
        }
    }

    /// Both directions end: a live supervisor reads EOF, stops every tree as on host death and exits. One
    /// that has not exited after `window` (stuck or stopped) is killed by identity; its keeper reaps it.
    pub(super) fn close(&self, window: Duration) {
        // SAFETY: `shutdown` on a socket this channel owns; it changes no memory.
        unsafe { libc::shutdown(self.sock.as_raw_fd(), libc::SHUT_RDWR) };
        if let Some(sup) = self.sup.clone() {
            self.rt.spawn(async move {
                tokio::time::sleep(window).await;
                let _ = sup.kill();
            });
        }
    }

    /// Whether a supervisor stuck after `close` can be ended (false: no pidfd or no start time).
    pub(super) fn can_end(&self) -> bool {
        self.sup.as_ref().is_none_or(Watch::can_end)
    }

    /// Validates `Spawned.pty_ends` and takes the master that travelled with the frame.
    pub(super) fn ends(&self, raw: [u64; 2], fds: &mut VecDeque<OwnedFd>) -> Result<Option<Ends>, String> {
        match raw {
            [0, 0] => Ok(None),
            [1, 0] => fds
                .pop_front()
                .map(Some)
                .ok_or_else(|| "it announced a terminal without sending its descriptor".into()),
            other => Err(format!("it sent terminal ends {other:?}, which mean nothing on Unix")),
        }
    }

    /// The host's terminal ends: the master for output and a duplicate of it for input.
    pub(super) fn pty(&self, master: Ends) -> io::Result<HostStdio> {
        Ok(HostStdio::Pty {
            input: master.try_clone()?,
            output: master,
        })
    }

    /// Unix pipe ends travel as SCM_RIGHTS with the frame, in stdin, stdout, stderr order.
    pub(super) fn hand_over(&self, child: [Option<OwnedFd>; 3]) -> io::Result<([u64; 3], Vec<OwnedFd>)> {
        Ok(([0; 3], child.into_iter().flatten().collect()))
    }

    /// Nothing to take back on Unix: unsent ends never left the host (and close when dropped).
    pub(super) fn reclaim(&self, _values: [u64; 3]) {}
}

/// Starts `hugr-omni-supervisor` (`docs/protocol.md`).
pub(super) fn launch(rt: &Runtime, num: u64) -> Result<Arc<Gen>, Error> {
    let path = super::locate()?;
    let reaper = thread::Builder::new().name("hugr-omni-reap".into());
    start(rt, num, REPLY_WITHIN, &path, reaper)
}

/// Starts `path` as the supervisor by exec (posix_spawn in std), its socket end on fd 0, in its own process
/// group so a terminal's Ctrl-C to the host's job does not reach it. The reaper thread (from `reaper`) is
/// created first: without it, nothing is started.
pub(super) fn start(
    rt: &Runtime,
    num: u64,
    bound: Duration,
    path: &Path,
    reaper: thread::Builder,
) -> Result<Arc<Gen>, Error> {
    let keeper = Keeper::new(reaper).map_err(|e| Error::supervisor_not_started("its reaper or exit watch", &e))?;
    let (host, sup) = StdStream::pair().map_err(|e| Error::supervisor_not_started("its channel", &e))?;
    let child = Command::new(path)
        .arg("--host-pid")
        .arg(std::process::id().to_string())
        .stdin(Stdio::from(OwnedFd::from(sup)))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|e| Error::supervisor_not_started(&format!("\"{}\"", path.display()), &e))?;
    let watch = keeper.adopt(child);
    Gen::start(rt, num, bound, move || Chan::new(host, Some(watch)))
}

/// A pipe as (read end, write end), both CLOEXEC.
pub(super) fn pipe() -> io::Result<(OwnedFd, OwnedFd)> {
    let mut p: [libc::c_int; 2] = [-1, -1];
    #[cfg(target_os = "linux")]
    // SAFETY: `p` has room for the two descriptors `pipe2` writes.
    let r = unsafe { libc::pipe2(p.as_mut_ptr(), libc::O_CLOEXEC) };
    #[cfg(not(target_os = "linux"))]
    // SAFETY: `p` has room for the two descriptors `pipe` writes.
    let r = unsafe { libc::pipe(p.as_mut_ptr()) };
    if r != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the call succeeded, so both are fresh descriptors that nothing else owns.
    let (read, write) = unsafe { (OwnedFd::from_raw_fd(p[0]), OwnedFd::from_raw_fd(p[1])) };
    #[cfg(not(target_os = "linux"))]
    {
        cloexec(read.as_fd())?;
        cloexec(write.as_fd())?;
    }
    Ok((read, write))
}

/// The directory of the module that contains this code (the native module under Node or Python).
pub(super) fn module_dir() -> Option<PathBuf> {
    // SAFETY: an all-zero `Dl_info` is a valid value for `dladdr` to overwrite.
    let mut info: libc::Dl_info = unsafe { std::mem::zeroed() };
    let addr = module_dir as fn() -> Option<PathBuf> as *const libc::c_void;
    // SAFETY: `dladdr` only reads the address of a function of this module and fills `info`.
    if unsafe { libc::dladdr(addr, &mut info) } == 0 || info.dli_fname.is_null() {
        return None;
    }
    // SAFETY: `dli_fname` is a NUL-terminated path owned by the loader, valid while the module is loaded.
    let name = unsafe { CStr::from_ptr(info.dli_fname) };
    Path::new(OsStr::from_bytes(name.to_bytes()))
        .parent()
        .map(Path::to_path_buf)
}

#[cfg(not(target_os = "linux"))]
fn cloexec(fd: BorrowedFd<'_>) -> io::Result<()> {
    // SAFETY: F_SETFD on a descriptor we own changes only its flags.
    match unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_SETFD, libc::FD_CLOEXEC) } {
        -1 => Err(io::Error::last_os_error()),
        _ => Ok(()),
    }
}

#[cfg(not(target_os = "linux"))]
fn no_sigpipe(fd: BorrowedFd<'_>) -> io::Result<()> {
    let one: libc::c_int = 1;
    let len = std::mem::size_of_val(&one) as libc::socklen_t;
    let ptr = std::ptr::from_ref(&one).cast();
    // SAFETY: `ptr` points at a c_int of `len` bytes that outlives the call.
    match unsafe { libc::setsockopt(fd.as_raw_fd(), libc::SOL_SOCKET, libc::SO_NOSIGPIPE, ptr, len) } {
        -1 => Err(io::Error::last_os_error()),
        _ => Ok(()),
    }
}

/// One `sendmsg` of `data` with `fds` as SCM_RIGHTS (retried on EINTR). macOS refuses (EMSGSIZE) a message with
/// descriptors that does not fit the send buffer whole, and that buffer shrinks while the supervisor has not read:
/// then only the first byte goes with them (the caller queues the rest), or it is `WouldBlock`.
pub(super) fn send(sock: BorrowedFd<'_>, data: &[u8], fds: &[OwnedFd]) -> io::Result<usize> {
    let mut iov = libc::iovec {
        iov_base: data.as_ptr().cast_mut().cast(),
        iov_len: data.len(),
    };
    let mut cbuf = [0u64; CMSG_WORDS];
    // SAFETY: an all-zero `msghdr` is a valid empty header.
    let mut msg: libc::msghdr = unsafe { std::mem::zeroed() };
    msg.msg_iov = &mut iov;
    msg.msg_iovlen = 1;
    if !fds.is_empty() {
        let bytes = u32::try_from(std::mem::size_of_val(fds)).map_err(|_| io::ErrorKind::InvalidInput)?;
        // SAFETY: CMSG_SPACE only computes a size.
        let space = unsafe { libc::CMSG_SPACE(bytes) } as usize;
        if space > std::mem::size_of_val(&cbuf) {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        msg.msg_control = cbuf.as_mut_ptr().cast();
        msg.msg_controllen = space as _;
        // SAFETY: `msg_control` points at `space` writable, 8-aligned bytes, enough for one header and
        // `bytes` of data (checked above), so CMSG_FIRSTHDR is non-null and CMSG_DATA stays inside cbuf.
        unsafe {
            let c = libc::CMSG_FIRSTHDR(&msg);
            (*c).cmsg_level = libc::SOL_SOCKET;
            (*c).cmsg_type = libc::SCM_RIGHTS;
            (*c).cmsg_len = libc::CMSG_LEN(bytes) as _;
            let out = libc::CMSG_DATA(c).cast::<RawFd>();
            for (i, fd) in fds.iter().enumerate() {
                out.add(i).write_unaligned(fd.as_raw_fd());
            }
        }
    }
    loop {
        // SAFETY: `msg` points at `iov` and `cbuf`, which outlive the call; the kernel only reads them.
        let n = unsafe { libc::sendmsg(sock.as_raw_fd(), &msg, SEND_FLAGS) };
        if let Ok(n) = usize::try_from(n) {
            return Ok(n);
        }
        let e = io::Error::last_os_error();
        if e.raw_os_error() == Some(libc::EMSGSIZE) && !fds.is_empty() {
            if iov.iov_len <= 1 {
                return Err(io::ErrorKind::WouldBlock.into());
            }
            iov.iov_len = 1;
        } else if e.kind() != io::ErrorKind::Interrupted {
            return Err(e);
        }
    }
}

/// One `recvmsg` into `buf`; received descriptors (CLOEXEC) are appended to `fds`. `Ok(0)` is EOF.
pub(super) fn recv(sock: BorrowedFd<'_>, buf: &mut [u8], fds: &mut VecDeque<OwnedFd>) -> io::Result<usize> {
    let mut iov = libc::iovec {
        iov_base: buf.as_mut_ptr().cast(),
        iov_len: buf.len(),
    };
    let mut cbuf = [0u64; CMSG_WORDS];
    // SAFETY: an all-zero `msghdr` is a valid empty header.
    let mut msg: libc::msghdr = unsafe { std::mem::zeroed() };
    msg.msg_iov = &mut iov;
    msg.msg_iovlen = 1;
    msg.msg_control = cbuf.as_mut_ptr().cast();
    msg.msg_controllen = std::mem::size_of_val(&cbuf) as _;
    let n = loop {
        // SAFETY: `msg` points at `iov` (over `buf`) and `cbuf`, both writable and alive for the call.
        let n = unsafe { libc::recvmsg(sock.as_raw_fd(), &mut msg, RECV_FLAGS) };
        if let Ok(n) = usize::try_from(n) {
            break n;
        }
        let e = io::Error::last_os_error();
        if e.kind() != io::ErrorKind::Interrupted {
            return Err(e);
        }
    };
    #[cfg(not(target_os = "linux"))]
    let first = fds.len();
    // SAFETY: the kernel wrote well-formed headers into `cbuf` up to `msg_controllen`; FIRSTHDR/NXTHDR
    // walk them and return null at the end. Each SCM_RIGHTS entry is a descriptor the kernel just
    // installed in this process for this call, so it is owned exactly once, here.
    unsafe {
        let mut c = libc::CMSG_FIRSTHDR(&msg);
        while !c.is_null() {
            if (*c).cmsg_level == libc::SOL_SOCKET && (*c).cmsg_type == libc::SCM_RIGHTS {
                let len = ((*c).cmsg_len as usize).saturating_sub(libc::CMSG_LEN(0) as usize);
                let data = libc::CMSG_DATA(c).cast::<RawFd>();
                for i in 0..len / std::mem::size_of::<RawFd>() {
                    fds.push_back(OwnedFd::from_raw_fd(data.add(i).read_unaligned()));
                }
            }
            c = libc::CMSG_NXTHDR(&msg, c);
        }
    }
    #[cfg(not(target_os = "linux"))]
    for fd in fds.iter().skip(first) {
        cloexec(fd.as_fd())?;
    }
    if msg.msg_flags & libc::MSG_CTRUNC != 0 {
        return Err(io::Error::other("more descriptors arrived than a frame may carry"));
    }
    Ok(n)
}
