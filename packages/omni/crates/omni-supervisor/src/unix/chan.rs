//! The channel to the host: fd 0, a non-blocking Unix stream socket (ADR-0005 R1, R6). Frames come in with
//! the descriptors that ride on their first byte (SCM_RIGHTS) and go out through a queue; past `HIGH_WATER`
//! queued bytes the loop stops reading requests, so a host that stops reading stalls only itself.

use std::collections::VecDeque;
use std::io;
use std::os::fd::{AsFd, AsRawFd, BorrowedFd, OwnedFd, RawFd};

use omni_proto::{Msg, decode, encode};

use super::sys;

const READ_CHUNK: usize = 64 * 1024;
/// Received descriptors waiting for their `Spawn` frame (one frame carries at most 3).
const MAX_QUEUED_FDS: usize = 48;
/// Above this many queued reply bytes no new request is read until the host drains its side.
const HIGH_WATER: usize = 256 * 1024;

#[cfg(target_os = "linux")]
const SEND_FLAGS: libc::c_int = libc::MSG_NOSIGNAL;
#[cfg(target_os = "macos")]
const SEND_FLAGS: libc::c_int = 0;
#[cfg(target_os = "linux")]
const RECV_FLAGS: libc::c_int = libc::MSG_CMSG_CLOEXEC;
#[cfg(target_os = "macos")]
const RECV_FLAGS: libc::c_int = 0;

/// Why the channel ended. Every case is host death for the supervisor.
#[derive(Debug)]
pub(super) enum Closed {
    /// The host closed its end, or the socket failed.
    Gone,
    /// A malformed frame or a descriptor count that does not match the frames.
    Proto(String),
}

pub(super) struct Chan {
    sock: OwnedFd,
    rbuf: Vec<u8>,
    fds: VecDeque<OwnedFd>,
    out: VecDeque<(Vec<u8>, Option<OwnedFd>)>,
    /// Bytes of the front frame already sent.
    sent: usize,
    queued: usize,
}

impl Chan {
    /// Takes over the socket (fd 0): close-on-exec, non-blocking, no SIGPIPE.
    pub(super) fn new(sock: OwnedFd) -> io::Result<Chan> {
        sys::set_cloexec(sock.as_fd())?;
        sys::set_nonblock(sock.as_fd())?;
        #[cfg(target_os = "macos")]
        {
            let one: libc::c_int = 1;
            let len = std::mem::size_of_val(&one) as libc::socklen_t;
            // SAFETY: `one` outlives the call and `len` is its size.
            let r = unsafe {
                libc::setsockopt(
                    sock.as_raw_fd(),
                    libc::SOL_SOCKET,
                    libc::SO_NOSIGPIPE,
                    (&raw const one).cast(),
                    len,
                )
            };
            sys::cvt(r)?;
        }
        Ok(Chan {
            sock,
            rbuf: Vec::new(),
            fds: VecDeque::new(),
            out: VecDeque::new(),
            sent: 0,
            queued: 0,
        })
    }

    pub(super) fn raw(&self) -> RawFd {
        self.sock.as_raw_fd()
    }

    /// True while replies wait to be sent.
    pub(super) fn wants_write(&self) -> bool {
        !self.out.is_empty()
    }

    /// True when queued replies plus `reserved` bytes (replies owed later, e.g. `Stopped` to waiting `Stop`s)
    /// pass `HIGH_WATER`: requests stay unread until the host drains its side.
    pub(super) fn backlogged(&self, reserved: usize) -> bool {
        self.queued + reserved > HIGH_WATER
    }

    /// One `recvmsg`. `Ok(false)`: nothing to read now.
    pub(super) fn read(&mut self) -> Result<bool, Closed> {
        let mut buf = vec![0u8; READ_CHUNK];
        let mut cbuf = [0u64; 32];
        let mut iov = libc::iovec {
            iov_base: buf.as_mut_ptr().cast(),
            iov_len: buf.len(),
        };
        // SAFETY: msghdr is plain old data; all-zero is valid and the pointers are set below.
        let mut msg: libc::msghdr = unsafe { std::mem::zeroed() };
        msg.msg_iov = &raw mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = cbuf.as_mut_ptr().cast();
        msg.msg_controllen = std::mem::size_of_val(&cbuf) as _;
        let n = loop {
            // SAFETY: `msg` points at `iov` (into `buf`) and `cbuf`, which outlive the call.
            let n = unsafe { libc::recvmsg(self.sock.as_raw_fd(), &raw mut msg, RECV_FLAGS) };
            if n >= 0 {
                break n.unsigned_abs();
            }
            match sys::errno() {
                libc::EINTR => continue,
                libc::EAGAIN => return Ok(false),
                _ => return Err(Closed::Gone),
            }
        };
        self.take_rights(&msg)?;
        if msg.msg_flags & libc::MSG_CTRUNC != 0 {
            return Err(Closed::Proto("descriptors truncated".into()));
        }
        if n == 0 {
            return Err(Closed::Gone);
        }
        buf.truncate(n);
        self.rbuf.extend_from_slice(&buf);
        Ok(true)
    }

    /// Owns every descriptor of the batch first (infallibly), then configures them: on any error the whole
    /// batch is dropped, so no received descriptor is ever left without an owner.
    fn take_rights(&mut self, msg: &libc::msghdr) -> Result<(), Closed> {
        let batch = adopt(received(msg), cloexec)?;
        self.fds.extend(batch);
        if self.fds.len() > MAX_QUEUED_FDS {
            return Err(Closed::Proto("too many descriptors without a Spawn".into()));
        }
        Ok(())
    }

    /// A complete frame is buffered (judged by its length prefix; `next` validates the rest).
    pub(super) fn has_frame(&self) -> bool {
        let Some(head) = self.rbuf.first_chunk::<4>() else {
            return false;
        };
        let n = u32::from_le_bytes(*head) as usize;
        self.rbuf.len() >= 4 + n || n == 0 || n > omni_proto::MAX_FRAME
    }

    /// The next complete frame, if one is buffered.
    pub(super) fn next(&mut self) -> Result<Option<Msg>, Closed> {
        match decode(&self.rbuf) {
            Ok(Some((msg, used))) => {
                self.rbuf.drain(..used);
                Ok(Some(msg))
            }
            Ok(None) if self.rbuf.is_empty() && !self.fds.is_empty() => {
                Err(Closed::Proto("descriptors that belong to no Spawn".into()))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(Closed::Proto(e.0)),
        }
    }

    /// The `n` descriptors of the `Spawn` frame just decoded (they arrived with its first byte).
    pub(super) fn take_fds(&mut self, n: usize) -> Result<Vec<OwnedFd>, Closed> {
        if self.fds.len() < n {
            return Err(Closed::Proto(format!(
                "Spawn needs {n} descriptors, {} arrived",
                self.fds.len()
            )));
        }
        Ok(self.fds.drain(..n).collect())
    }

    /// Queues a frame; `fd` rides on its first byte. Fails only if the message cannot be encoded.
    pub(super) fn send(&mut self, msg: &Msg, fd: Option<OwnedFd>) -> Result<(), omni_proto::ProtoError> {
        let mut bytes = Vec::new();
        encode(msg, &mut bytes)?;
        self.queued += bytes.len();
        self.out.push_back((bytes, fd));
        Ok(())
    }

    /// Sends what the socket accepts now.
    pub(super) fn flush(&mut self) -> Result<(), Closed> {
        while let Some((bytes, fd)) = self.out.front() {
            let rest = bytes.get(self.sent..).unwrap_or_default();
            let fd = if self.sent == 0 {
                fd.as_ref().map(AsFd::as_fd)
            } else {
                None
            };
            let sent = match send_some(self.sock.as_fd(), rest, fd) {
                // macOS refuses (EMSGSIZE) a message with a descriptor that does not fit the send buffer whole, and
                // that buffer shrinks while the host has not read: the descriptor goes with one byte, or waits.
                Err(e) if e.raw_os_error() == Some(libc::EMSGSIZE) && fd.is_some() => {
                    send_some(self.sock.as_fd(), rest.get(..1).unwrap_or_default(), fd)
                }
                other => other,
            };
            match sent {
                Ok(n) => self.sent += n,
                Err(e) if matches!(e.raw_os_error(), Some(libc::EAGAIN | libc::EMSGSIZE)) => return Ok(()),
                Err(_) => return Err(Closed::Gone),
            }
            if self.sent == bytes.len() {
                self.queued -= bytes.len();
                self.sent = 0;
                self.out.pop_front();
            }
        }
        Ok(())
    }

    /// Host death: nothing more goes out or comes in; queued descriptors close, and a host that is still
    /// there (protocol error) sees end of file at once.
    pub(super) fn shut(&mut self) {
        // SAFETY: shutdown on our socket. ENOTCONN (the peer is gone) is the expected failure: ignored.
        let _ = unsafe { libc::shutdown(self.sock.as_raw_fd(), libc::SHUT_RDWR) };
        self.out.clear();
        self.fds.clear();
        self.rbuf.clear();
        self.queued = 0;
        self.sent = 0;
    }
}

/// Every descriptor of every SCM_RIGHTS header of `msg`, owned. Nothing here can fail.
fn received(msg: &libc::msghdr) -> Vec<OwnedFd> {
    let mut fds = Vec::new();
    // SAFETY: `msg` was filled by recvmsg; the CMSG_* walk stays inside msg_control/msg_controllen.
    let mut c = unsafe { libc::CMSG_FIRSTHDR(msg) };
    while !c.is_null() {
        // SAFETY: `c` is a valid header inside the control buffer (CMSG_FIRSTHDR/CMSG_NXTHDR checked it).
        let (level, kind, len) = unsafe { ((*c).cmsg_level, (*c).cmsg_type, (*c).cmsg_len as usize) };
        if level == libc::SOL_SOCKET && kind == libc::SCM_RIGHTS {
            // SAFETY: pure arithmetic on the header size.
            let head = unsafe { libc::CMSG_LEN(0) } as usize;
            let count = len.saturating_sub(head) / std::mem::size_of::<RawFd>();
            // SAFETY: the data of this header holds `count` descriptors.
            let data = unsafe { libc::CMSG_DATA(c) }.cast::<RawFd>();
            for i in 0..count {
                // SAFETY: `i < count`, inside this header's data (possibly unaligned); the kernel just installed
                // the descriptor in this process and nothing else owns it.
                fds.push(sys::owned(unsafe { data.add(i).read_unaligned() }));
            }
        }
        // SAFETY: `c` is a valid header of `msg`.
        c = unsafe { libc::CMSG_NXTHDR(msg, c) };
    }
    fds
}

/// Applies `configure` to each owned descriptor; the first failure drops the whole batch.
fn adopt(fds: Vec<OwnedFd>, configure: impl Fn(BorrowedFd<'_>) -> io::Result<()>) -> Result<Vec<OwnedFd>, Closed> {
    for fd in &fds {
        configure(fd.as_fd()).map_err(|_| Closed::Gone)?;
    }
    Ok(fds)
}

/// macOS has no MSG_CMSG_CLOEXEC: received descriptors get close-on-exec right away (only this thread forks, no fork
/// can come in between). Linux received them close-on-exec already.
fn cloexec(fd: BorrowedFd<'_>) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    return sys::set_cloexec(fd);
    #[cfg(target_os = "linux")]
    {
        let _ = fd;
        Ok(())
    }
}

/// One `sendmsg` of `data` (with `fd` as SCM_RIGHTS when given); retried on EINTR.
fn send_some(sock: BorrowedFd<'_>, data: &[u8], fd: Option<BorrowedFd<'_>>) -> io::Result<usize> {
    let mut iov = libc::iovec {
        iov_base: data.as_ptr().cast_mut().cast(),
        iov_len: data.len(),
    };
    let mut cbuf = [0u64; 4];
    // SAFETY: msghdr is plain old data; all-zero is valid and the pointers are set below.
    let mut msg: libc::msghdr = unsafe { std::mem::zeroed() };
    msg.msg_iov = &raw mut iov;
    msg.msg_iovlen = 1;
    if let Some(fd) = fd {
        let payload = std::mem::size_of::<RawFd>() as u32;
        msg.msg_control = cbuf.as_mut_ptr().cast();
        // SAFETY: pure arithmetic; CMSG_SPACE(4) fits the 32-byte buffer.
        msg.msg_controllen = unsafe { libc::CMSG_SPACE(payload) } as _;
        // SAFETY: the control buffer is large enough for one header with one descriptor.
        unsafe {
            let c = libc::CMSG_FIRSTHDR(&raw const msg);
            (*c).cmsg_level = libc::SOL_SOCKET;
            (*c).cmsg_type = libc::SCM_RIGHTS;
            (*c).cmsg_len = libc::CMSG_LEN(payload) as _;
            libc::CMSG_DATA(c).cast::<RawFd>().write_unaligned(fd.as_raw_fd());
        }
    }
    loop {
        // SAFETY: `msg` points at `iov` (into `data`) and `cbuf`, which outlive the call.
        let n = unsafe { libc::sendmsg(sock.as_raw_fd(), &raw const msg, SEND_FLAGS) };
        if n >= 0 {
            return Ok(n.unsigned_abs());
        }
        if sys::errno() != libc::EINTR {
            return Err(io::Error::last_os_error());
        }
    }
}

#[cfg(test)]
mod tests {
    use std::os::fd::{AsFd, AsRawFd, OwnedFd, RawFd};

    use super::adopt;

    /// The (device, inode) behind `fd`, or `None` when it is closed.
    fn ident(fd: RawFd) -> Option<(u64, u64)> {
        // SAFETY: an all-zero `stat` is a valid buffer; fstat only writes into it.
        let mut st: libc::stat = unsafe { std::mem::zeroed() };
        // SAFETY: fstat on a descriptor number; a closed one is EBADF.
        match unsafe { libc::fstat(fd, &raw mut st) } {
            0 => Some((st.st_dev as u64, st.st_ino as u64)),
            _ => None,
        }
    }

    /// A configuration failure in the middle of a batch closes every descriptor of the batch.
    #[test]
    fn a_failure_while_configuring_a_batch_closes_all_of_it() {
        let pipes: Vec<(std::io::PipeReader, std::io::PipeWriter)> = (0..2).map(|_| std::io::pipe().unwrap()).collect();
        let batch: Vec<OwnedFd> = pipes
            .into_iter()
            .flat_map(|(r, w)| [OwnedFd::from(r), OwnedFd::from(w)])
            .collect();
        let raw: Vec<RawFd> = batch.iter().map(AsRawFd::as_raw_fd).collect();
        // Other tests open descriptors meanwhile and may get these numbers again: compare identities, not numbers.
        let ids: Vec<_> = raw.iter().map(|&fd| ident(fd)).collect();
        assert!(ids.iter().all(Option::is_some));
        let second = raw[1];
        let failing = |fd: std::os::fd::BorrowedFd<'_>| {
            if fd.as_raw_fd() == second {
                Err(std::io::Error::from_raw_os_error(libc::EBADF))
            } else {
                Ok(())
            }
        };
        assert!(adopt(batch, failing).is_err());
        assert!(
            raw.iter().zip(&ids).all(|(&fd, id)| ident(fd) != *id),
            "a received descriptor leaked: {raw:?}"
        );

        let (r, w) = std::io::pipe().unwrap();
        let ok = adopt(vec![OwnedFd::from(r), OwnedFd::from(w)], |fd| {
            super::cloexec(fd.as_fd())
        })
        .unwrap();
        assert_eq!(ok.len(), 2);
    }
}
