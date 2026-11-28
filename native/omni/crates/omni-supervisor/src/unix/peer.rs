//! Authenticates and pins the accepted systemd socket peer.

use std::os::fd::OwnedFd;

use super::isolated::Isolation;
use super::watch::HostWatch;

pub(super) fn host_watch(args: &crate::Args, isolation: Option<&Isolation>) -> std::io::Result<HostWatch> {
    let Some(uid) = args.isolated_peer_uid else {
        return Ok(HostWatch::arm(
            i32::try_from(args.host_pid).map_err(std::io::Error::other)?,
        ));
    };
    let (peer, fd) = authenticate(uid)?;
    let isolation = isolation.ok_or_else(|| std::io::Error::other("missing isolation provisioning"))?;
    if !isolation.distinct_from(peer.uid, peer.gid)? {
        return Err(std::io::Error::other("isolation identity overlaps desktop peer"));
    }
    HostWatch::remote(fd)
}

fn authenticate(uid: u32) -> std::io::Result<(libc::ucred, OwnedFd)> {
    use std::os::fd::FromRawFd;
    // SAFETY: geteuid and getsockopt use a valid fd and writable credential storage.
    unsafe {
        if libc::geteuid() != 0 {
            return Err(std::io::Error::other("isolated supervisor must be root"));
        }
        let mut peer: libc::ucred = std::mem::zeroed();
        let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
        if libc::getsockopt(
            0,
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&raw mut peer).cast(),
            &raw mut len,
        ) != 0
        {
            return Err(std::io::Error::last_os_error());
        }
        if len as usize != std::mem::size_of::<libc::ucred>() || peer.uid != uid || peer.uid == 0 || peer.pid <= 0 {
            return Err(std::io::Error::other("unauthorized isolated peer"));
        }
        // Linux SO_PEERPIDFD returns a pidfd pinned to the socket peer (no PID reuse race).
        let mut fd: libc::c_int = -1;
        let mut size = std::mem::size_of::<libc::c_int>() as libc::socklen_t;
        if libc::getsockopt(0, libc::SOL_SOCKET, 77, (&raw mut fd).cast(), &raw mut size) != 0 {
            return Err(std::io::Error::last_os_error());
        }
        if size as usize != std::mem::size_of::<libc::c_int>() || fd < 0 {
            return Err(std::io::Error::other("invalid peer pidfd"));
        }
        Ok((peer, OwnedFd::from_raw_fd(fd)))
    }
}

/// SO_PEERGROUPS is the peer credential snapshot captured by the kernel at connect time.
pub(super) fn excludes_group(gid: u32) -> std::io::Result<bool> {
    let mut groups = vec![0 as libc::gid_t; 65536];
    let mut len = (groups.len() * std::mem::size_of::<libc::gid_t>()) as libc::socklen_t;
    // SAFETY: groups is writable for len bytes; SO_PEERGROUPS only fills that buffer.
    if unsafe { libc::getsockopt(0, libc::SOL_SOCKET, 59, groups.as_mut_ptr().cast(), &raw mut len) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    let bytes = len as usize;
    if bytes > groups.len() * std::mem::size_of::<libc::gid_t>() || bytes % std::mem::size_of::<libc::gid_t>() != 0 {
        return Err(std::io::Error::other("invalid peer groups"));
    }
    groups.truncate(bytes / std::mem::size_of::<libc::gid_t>());
    Ok(!groups.contains(&gid))
}
