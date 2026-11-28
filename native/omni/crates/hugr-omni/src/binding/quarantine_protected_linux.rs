//! Privileged, explicitly provisioned Linux quarantine boundary.

use std::ffi::CString;
use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};

fn error(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, message)
}
fn parts(path: &str) -> io::Result<Vec<&str>> {
    if !path.starts_with('/') || path == "/" || path.ends_with('/') {
        return Err(error("invalid absolute path"));
    }
    let parts: Vec<_> = path[1..].split('/').collect();
    if parts
        .iter()
        .any(|p| p.is_empty() || *p == "." || *p == ".." || p.as_bytes().contains(&0))
    {
        return Err(error("invalid path component"));
    }
    Ok(parts)
}
fn open(parent: i32, name: &str) -> io::Result<OwnedFd> {
    let name = CString::new(name).map_err(|_| error("invalid name"))?;
    // SAFETY: name is terminated and parent is a live directory fd or AT_FDCWD.
    let fd = unsafe {
        libc::openat(
            parent,
            name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: openat returned a newly owned descriptor.
    Ok(unsafe { OwnedFd::from_raw_fd(fd) })
}
fn stat(fd: &OwnedFd, owner_only: bool, dev: Option<u64>) -> io::Result<libc::stat> {
    // SAFETY: zero is a valid initial state for the output structure.
    let mut s: libc::stat = unsafe { std::mem::zeroed() };
    // SAFETY: the fd is live and s points to writable storage.
    if unsafe { libc::fstat(fd.as_raw_fd(), &mut s) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if s.st_uid != 0 || s.st_mode & if owner_only { 0o077 } else { 0o022 } != 0 || dev.is_some_and(|d| d != s.st_dev) {
        return Err(error("unprotected directory"));
    }
    Ok(s)
}
fn mount(fd: &OwnedFd) -> io::Result<u64> {
    // SAFETY: zero initializes the output structure and empty path is NUL terminated.
    let mut value: libc::statx = unsafe { std::mem::zeroed() };
    // SAFETY: the descriptor is live and value is writable.
    if unsafe {
        libc::syscall(
            libc::SYS_statx,
            fd.as_raw_fd(),
            c"".as_ptr(),
            libc::AT_EMPTY_PATH | libc::AT_SYMLINK_NOFOLLOW,
            libc::STATX_MNT_ID,
            &mut value,
        )
    } != 0
        || value.stx_mask & libc::STATX_MNT_ID == 0
    {
        return Err(error("mount identity unavailable"));
    }
    Ok(value.stx_mnt_id)
}
fn root(path: &str) -> io::Result<(OwnedFd, (u64, u64))> {
    // SAFETY: geteuid has no preconditions.
    if unsafe { libc::geteuid() } != 0 {
        return Err(error("requires privileged sidecar"));
    }
    let components = parts(path)?;
    let mut fd = open(libc::AT_FDCWD, "/")?;
    stat(&fd, false, None)?;
    for (i, component) in components.iter().enumerate() {
        fd = open(fd.as_raw_fd(), component)?;
        stat(&fd, i + 1 == components.len(), None)?;
    }
    let dev = stat(&fd, true, None)?.st_dev;
    // SAFETY: zero is a valid initial state for the output structure.
    let mut fs: libc::statfs = unsafe { std::mem::zeroed() };
    // SAFETY: fd is live and fs points to writable storage.
    if unsafe { libc::fstatfs(fd.as_raw_fd(), &mut fs) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // Only local filesystems with kernel-controlled rename and identity semantics are admitted.
    if ![0xEF53, 0x58465342, 0x9123683E, 0x01021994].contains(&(fs.f_type as u64)) {
        return Err(error("unsupported filesystem"));
    }
    let mount_id = mount(&fd)?;
    Ok((fd, (dev, mount_id)))
}
fn child(parent: &OwnedFd, name: &str, dev: (u64, u64)) -> io::Result<OwnedFd> {
    let fd = open(parent.as_raw_fd(), name)?;
    stat(&fd, true, Some(dev.0))?;
    if mount(&fd)? != dev.1 {
        return Err(error("mount boundary"));
    }
    Ok(fd)
}
fn target<'a>(root_path: &str, path: &'a str) -> io::Result<Vec<&'a str>> {
    parts(root_path)?;
    let suffix = path
        .strip_prefix(root_path)
        .and_then(|s| s.strip_prefix('/'))
        .ok_or_else(|| error("path outside root"))?;
    let components: Vec<_> = suffix.split('/').collect();
    if components
        .iter()
        .any(|p| p.is_empty() || *p == "." || *p == ".." || p.as_bytes().contains(&0))
    {
        return Err(error("invalid target"));
    }
    match components.as_slice() {
        ["worktrees", _, ".turbo" | "node_modules"] => Ok(components),
        ["quarantine", name]
            if name.len() == 66
                && name.starts_with("q-")
                && name.as_bytes()[2..]
                    .iter()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c)) =>
        {
            Ok(components)
        }
        _ => Err(error("invalid target shape")),
    }
}
fn parent(root: &OwnedFd, dev: (u64, u64), components: &[&str]) -> io::Result<OwnedFd> {
    let dir = child(root, components[0], dev)?;
    if components.len() == 3 {
        return child(&dir, components[1], dev);
    }
    Ok(dir)
}
fn identity(fd: &OwnedFd, dev: (u64, u64)) -> io::Result<String> {
    let s = stat(fd, true, Some(dev.0))?;
    if mount(fd)? != dev.1 {
        return Err(error("mount boundary"));
    }
    Ok(format!("{}:{}", s.st_dev, s.st_ino))
}
/// Check whether the configured protected root is available to this privileged process.
pub fn available(path: &str) -> io::Result<bool> {
    let (fd, dev) = root(path)?;
    child(&fd, "worktrees", dev)?;
    child(&fd, "quarantine", dev)?;
    Ok(true)
}
/// Inspect a protected source or destination, returning None only for a protected absence.
pub fn inspect(root_path: &str, path: &str) -> io::Result<Option<String>> {
    let components = target(root_path, path)?;
    let (root, dev) = root(root_path)?;
    let parent = parent(&root, dev, &components)?;
    match open(parent.as_raw_fd(), components[components.len() - 1]) {
        Ok(fd) => Ok(Some(identity(&fd, dev)?)),
        Err(e) if e.raw_os_error() == Some(libc::ENOENT) => Ok(None),
        Err(e) => Err(e),
    }
}
/// Move the pinned source to an unused protected destination, failing closed on uncertainty.
pub fn rename(root_path: &str, source: &str, destination: &str, expected: &str) -> &'static str {
    match prepare(root_path, source, destination, expected) {
        Ok(pin) => {
            // SAFETY: both directory descriptors and NUL-terminated names remain live throughout the syscall.
            let rc = unsafe {
                libc::syscall(
                    libc::SYS_renameat2,
                    pin.source_parent.as_raw_fd(),
                    pin.source_name.as_ptr(),
                    pin.destination_parent.as_raw_fd(),
                    pin.destination_name.as_ptr(),
                    libc::RENAME_NOREPLACE,
                )
            };
            if rc != 0 {
                return match io::Error::last_os_error().raw_os_error() {
                    Some(
                        libc::EEXIST
                        | libc::ENOENT
                        | libc::EXDEV
                        | libc::EINVAL
                        | libc::EACCES
                        | libc::EPERM
                        | libc::ENOTEMPTY
                        | libc::ENOSYS,
                    ) => "refused",
                    _ => "unknown",
                };
            }
            let verified = open(
                pin.destination_parent.as_raw_fd(),
                pin.destination_name.to_str().unwrap_or(""),
            )
            .and_then(|fd| Ok(identity(&fd, pin.dev)? == identity(&pin.source_fd, pin.dev)?));
            if matches!(verified, Ok(true)) {
                "accepted"
            } else {
                "unknown"
            }
        }
        Err(_) => "refused",
    }
}
struct RenamePin {
    source_parent: OwnedFd,
    source_name: CString,
    destination_parent: OwnedFd,
    destination_name: CString,
    source_fd: OwnedFd,
    dev: (u64, u64),
}
fn prepare(root_path: &str, source: &str, destination: &str, expected: &str) -> io::Result<RenamePin> {
    let src = target(root_path, source)?;
    let dst = target(root_path, destination)?;
    if src.len() != 3 || dst.len() != 2 {
        return Err(error("invalid rename shape"));
    }
    let (root, dev) = root(root_path)?;
    let sp = parent(&root, dev, &src)?;
    let dp = parent(&root, dev, &dst)?;
    let fd = open(sp.as_raw_fd(), src[2])?;
    if identity(&fd, dev)? != expected {
        return Err(error("identity mismatch"));
    }
    Ok(RenamePin {
        source_parent: sp,
        source_name: CString::new(src[2]).map_err(|_| error("invalid name"))?,
        destination_parent: dp,
        destination_name: CString::new(dst[1]).map_err(|_| error("invalid name"))?,
        source_fd: fd,
        dev,
    })
}
