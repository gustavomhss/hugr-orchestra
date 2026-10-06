//! Input validation before any syscall (C-ERR-02, C-SPAWN-03). W03.

use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use super::path::{self, Kind};
use super::{HOST, Mode, Os, Request};
use crate::error::Error;

/// The largest `timeoutMs` / `graceMs` (contract §3; the protocol carries them as u32 milliseconds).
const MAX_MS: u128 = u32::MAX as u128;
/// The largest PTY `cols` / `rows` (contract §3).
const MAX_CELLS: u16 = 32767;

/// Rejects invalid input (NUL bytes, bad PTY size, ...) with `InvalidArgument` naming the field.
pub(super) fn check(req: &Request, os: Os) -> Result<(), Error> {
    if req.program.is_empty() {
        return Err(Error::empty_command());
    }
    if let Some(at) = nul(&req.program) {
        return Err(Error::nul_in_command(&req.program, at));
    }
    if path::kind(&req.program, os) == Kind::DriveRelative {
        return Err(Error::drive_relative_command(&req.program));
    }
    for (index, arg) in req.args.iter().enumerate() {
        if let Some(at) = nul(arg) {
            return Err(Error::nul_in_arg(index, at));
        }
    }
    if let Some(cwd) = &req.cwd
        && let Some(at) = nul(cwd.as_os_str())
    {
        return Err(Error::nul_in_cwd(cwd, at));
    }
    for (name, value) in &req.env {
        if name.is_empty() {
            return Err(Error::empty_env_name());
        }
        if let Some(at) = nul(name) {
            return Err(Error::nul_in_env_name(name, at));
        }
        if name.as_encoded_bytes().contains(&b'=') {
            return Err(Error::equals_in_env_name(name));
        }
        if let Some(at) = value.as_deref().and_then(nul) {
            return Err(Error::nul_in_env_value(name, at));
        }
    }
    if let Mode::Pty(size) = req.mode {
        cells("pty.cols", size.cols)?;
        cells("pty.rows", size.rows)?;
    }
    if let Some(timeout) = req.timeout {
        millis("timeoutMs", timeout)?;
    }
    millis("graceMs", req.grace)
}

/// The absolute working directory (`InvalidCwd` if it is missing or not a directory).
pub(super) fn cwd(req: &Request) -> Result<PathBuf, Error> {
    let given = req.cwd.as_deref();
    directory(given, absolute(given, std::env::current_dir, HOST)?)
}

/// `cwd` made absolute against the host's working directory (`host`, read only when needed). A Windows
/// drive-relative cwd is refused before anything is read.
pub(super) fn absolute(
    cwd: Option<&Path>,
    host: impl FnOnce() -> io::Result<PathBuf>,
    os: Os,
) -> Result<PathBuf, Error> {
    let Some(given) = cwd else {
        return host().map_err(|err| Error::host_cwd_unreadable(None, &err));
    };
    match path::kind(given.as_os_str(), os) {
        Kind::Absolute => Ok(given.to_path_buf()),
        Kind::DriveRelative => Err(Error::drive_relative_cwd(given)),
        Kind::RootRelative | Kind::Relative => {
            let host = host().map_err(|err| Error::host_cwd_unreadable(cwd, &err))?;
            path::join(&host, given.as_os_str(), os).ok_or_else(|| Error::drive_relative_cwd(given))
        }
    }
}

/// `dir` checked to be a directory (symlinks followed). `given` is the cwd as passed, for the message.
pub(super) fn directory(given: Option<&Path>, dir: PathBuf) -> Result<PathBuf, Error> {
    match std::fs::metadata(&dir) {
        Ok(meta) if meta.is_dir() => Ok(dir),
        Ok(_) => Err(Error::cwd_not_directory(given, &dir)),
        Err(err) if matches!(err.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) => {
            Err(Error::cwd_missing(given, &dir))
        }
        Err(err) => Err(Error::cwd_inaccessible(given, &dir, &err)),
    }
}

/// Byte offset of the first NUL (in the OS encoding: bytes on Unix, WTF-8 on Windows; NUL is one byte in both).
fn nul(s: &OsStr) -> Option<usize> {
    s.as_encoded_bytes().iter().position(|&b| b == 0)
}

fn cells(field: &str, value: u16) -> Result<(), Error> {
    if (1..=MAX_CELLS).contains(&value) {
        Ok(())
    } else {
        Err(Error::bad_pty_size(field, value))
    }
}

/// A fraction of a millisecond rounds up (contract §3).
fn millis(field: &str, value: Duration) -> Result<(), Error> {
    let ms = value.as_nanos().div_ceil(1_000_000);
    if ms <= MAX_MS {
        Ok(())
    } else {
        Err(Error::duration_out_of_range(field, ms))
    }
}
