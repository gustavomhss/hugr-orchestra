//! The one place `spawn` may use `unsafe` (AGENTS.md): Unix effective execute access. W03.

use std::ffi::CString;
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

/// Whether the effective user may execute `path`, by the kernel's own rule: the owner needs the owner's execute
/// bit even when others have one; root needs any. `Ok(false)` is a refusal (`EACCES`); other errors come back as
/// they are.
///
/// Never `AT_EACCESS`: musl implements it, when the real and effective ids differ, by forking a helper process
/// (`src/unistd/faccessat.c`), and the host never forks (ADR-0005 §9). With equal ids (every normal host) the
/// plain `faccessat(X_OK, 0)` is the same check, and no libc forks for it. A setuid/setgid host skips the
/// host-side check: a regular file with any execute bit is accepted, and `execve` in the supervisor decides.
pub(super) fn can_execute(path: &Path) -> io::Result<bool> {
    if !same_ids() {
        let meta = std::fs::metadata(path)?;
        return Ok(meta.is_file() && meta.permissions().mode() & 0o111 != 0);
    }
    // Validation rejects NUL in every string a path is built from, so this fails only if that rule breaks.
    let path = CString::new(path.as_os_str().as_bytes()).map_err(|_| io::Error::from(io::ErrorKind::InvalidInput))?;
    // SAFETY: `path` is a valid NUL-terminated C string that lives across the call, and `faccessat` only reads it.
    // `AT_FDCWD` never matters: resolution makes every candidate absolute.
    let status = unsafe { libc::faccessat(libc::AT_FDCWD, path.as_ptr(), libc::X_OK, 0) };
    if status == 0 {
        return Ok(true);
    }
    let err = io::Error::last_os_error();
    if err.kind() == io::ErrorKind::PermissionDenied {
        Ok(false)
    } else {
        Err(err)
    }
}

/// The real and effective user and group ids are equal (not a setuid/setgid host).
fn same_ids() -> bool {
    // SAFETY: these four calls take no arguments, always succeed and touch no memory of ours.
    unsafe { libc::getuid() == libc::geteuid() && libc::getgid() == libc::getegid() }
}
