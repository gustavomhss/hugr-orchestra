//! Connects to the administrator's socket without waiting for a full accept queue.

use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::net::UnixStream;
use std::sync::Arc;

use tokio::runtime::Runtime;

use super::channel::Gen;
use super::unix::Chan;
use super::REPLY_WITHIN;
use crate::error::Error;

pub(super) fn connect(rt: &Runtime, num: u64) -> Result<Arc<Gen>, Error> {
    let stream = connect_root().map_err(|e| Error::supervisor_not_started("isolated supervisor socket", &e))?;
    Gen::start(rt, num | (1 << 63), REPLY_WITHIN, move || Chan::isolated(stream))
}

fn connect_root() -> io::Result<UnixStream> {
    // SAFETY: geteuid takes no arguments.
    let uid = unsafe { libc::geteuid() };
    if uid == 0 {
        return Err(io::Error::other("isolated desktop peer must not be root"));
    }
    let path = format!("/run/orchestra/omni/{uid}.sock");
    // SAFETY: zero initializes AF_UNIX's trailing terminator and unused padding.
    let mut addr: libc::sockaddr_un = unsafe { std::mem::zeroed() };
    addr.sun_family = libc::AF_UNIX as libc::sa_family_t;
    if path.len() >= addr.sun_path.len() {
        return Err(io::Error::other("isolated supervisor socket path is too long"));
    }
    for (dest, byte) in addr.sun_path.iter_mut().zip(path.bytes()) {
        *dest = byte as libc::c_char;
    }
    // SAFETY: socket creates a fresh CLOEXEC descriptor or returns an error.
    let fd = unsafe { libc::socket(libc::AF_UNIX, libc::SOCK_STREAM | libc::SOCK_NONBLOCK | libc::SOCK_CLOEXEC, 0) };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful socket call returned an owned descriptor.
    let fd = unsafe { OwnedFd::from_raw_fd(fd) };
    // SAFETY: the address is a valid, fully initialized sockaddr_un with a NUL-terminated path.
    let result = unsafe {
        libc::connect(
            fd.as_raw_fd(),
            (&raw const addr).cast(),
            std::mem::size_of::<libc::sockaddr_un>() as libc::socklen_t,
        )
    };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: getsockopt writes into the credential and length buffers for this connected socket.
    unsafe {
        let mut peer: libc::ucred = std::mem::zeroed();
        let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
        if libc::getsockopt(
            fd.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&raw mut peer).cast(),
            &raw mut len,
        ) != 0
        {
            return Err(io::Error::last_os_error());
        }
        if len as usize != std::mem::size_of::<libc::ucred>() || peer.uid != 0 {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "isolated supervisor peer is not root"));
        }
    }
    Ok(UnixStream::from(fd))
}
