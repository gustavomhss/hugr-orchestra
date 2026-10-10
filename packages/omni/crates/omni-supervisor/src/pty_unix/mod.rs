//! Terminals on Unix, supervisor side (W12): the PTY pair and the child-side step; the fork, the hold
//! until `Go` and exec are the event loop's (`unix`, W05) (ADR-0003, ADR-0005 R9).
//!
//! SEAM (frozen in W00): `PtyPair`, `open`, `resize`, `make_controlling`. Bodies belong to W12.

#[cfg(test)]
mod tests;

use std::ffi::CStr;
use std::io;
use std::os::fd::{AsFd, AsRawFd, BorrowedFd, FromRawFd, OwnedFd, RawFd};

/// Both ends are opened with these: never the opener's controlling terminal, closed at every exec.
const FLAGS: libc::c_int = libc::O_RDWR | libc::O_NOCTTY | libc::O_CLOEXEC;

#[cfg(target_os = "linux")]
const TIOCSCTTY: libc::Ioctl = libc::TIOCSCTTY;
#[cfg(target_os = "macos")]
const TIOCSCTTY: libc::c_ulong = libc::TIOCSCTTY as libc::c_ulong;

/// A new terminal: the master (sent to the host, a dup kept for `Resize`) and the slave (for the child).
#[derive(Debug)]
pub(crate) struct PtyPair {
    pub master: OwnedFd,
    pub slave: OwnedFd,
}

/// `/dev/ptmx` with `O_CLOEXEC`, grant + unlock, slave via `ptsname_r` (Linux) / `TIOCPTYGNAME` (macOS),
/// never `ptsname`; size set before any child exists.
pub(crate) fn open(cols: u16, rows: u16) -> io::Result<PtyPair> {
    let master = open_path(c"/dev/ptmx")?;
    // SAFETY: grantpt and unlockpt only act on the master descriptor we own.
    cvt(unsafe { libc::grantpt(master.as_raw_fd()) })?;
    // SAFETY: as above.
    cvt(unsafe { libc::unlockpt(master.as_raw_fd()) })?;
    let mut name = [0u8; 128];
    slave_name(master.as_fd(), &mut name)?;
    let name = CStr::from_bytes_until_nul(&name).map_err(io::Error::other)?;
    let slave = open_path(name)?;
    resize(master.as_fd(), cols, rows)?;
    Ok(PtyPair { master, slave })
}

/// `TIOCSWINSZ` on the master.
pub(crate) fn resize(master: BorrowedFd<'_>, cols: u16, rows: u16) -> io::Result<()> {
    let size = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    // SAFETY: TIOCSWINSZ reads one `winsize` from a live local.
    cvt(unsafe { libc::ioctl(master.as_raw_fd(), libc::TIOCSWINSZ, &raw const size) }).map(drop)
}

/// In the forked child, after `setsid`: makes `slave` the controlling terminal (`TIOCSCTTY`) and its
/// stdio. Returns the errno on failure.
///
/// # Safety
/// Only between `fork` and `exec` in the child; async-signal-safe calls only.
pub(crate) unsafe fn make_controlling(slave: RawFd) -> Result<(), i32> {
    // `slave` is never one of 0..=2 (the supervisor keeps those open, `unix::sys::fill_stdio`), so each `dup2`
    // makes a new descriptor without close-on-exec. Reading errno allocates nothing.
    // SAFETY: ioctl and dup2 are async-signal-safe and take plain integers; the caller is the forked child.
    unsafe {
        if libc::ioctl(slave, TIOCSCTTY, 0) == -1 {
            return Err(errno());
        }
        for stdio in 0..3 {
            if libc::dup2(slave, stdio) == -1 {
                return Err(errno());
            }
        }
    }
    Ok(())
}

/// The slave's path, NUL-terminated in `buf`. Both calls are thread-safe, unlike `ptsname`.
fn slave_name(master: BorrowedFd<'_>, buf: &mut [u8; 128]) -> io::Result<()> {
    #[cfg(target_os = "linux")]
    {
        // SAFETY: `buf` is writable for its whole length, which is passed with it.
        match unsafe { libc::ptsname_r(master.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) } {
            0 => Ok(()),
            e => Err(io::Error::from_raw_os_error(e)),
        }
    }
    #[cfg(target_os = "macos")]
    {
        // TIOCPTYGNAME writes the name into a 128-byte buffer (its size is part of the request number).
        let request = libc::c_ulong::from(libc::TIOCPTYGNAME);
        // SAFETY: `buf` has the 128 writable bytes the request writes.
        cvt(unsafe { libc::ioctl(master.as_raw_fd(), request, buf.as_mut_ptr()) }).map(drop)
    }
}

fn open_path(path: &CStr) -> io::Result<OwnedFd> {
    // SAFETY: `path` is NUL-terminated and outlives the call.
    let fd = cvt(unsafe { libc::open(path.as_ptr(), FLAGS) })?;
    // SAFETY: `open` just returned this descriptor; nothing else owns it.
    Ok(unsafe { OwnedFd::from_raw_fd(fd) })
}

fn cvt(r: libc::c_int) -> io::Result<libc::c_int> {
    if r == -1 {
        Err(io::Error::last_os_error())
    } else {
        Ok(r)
    }
}

fn errno() -> i32 {
    io::Error::last_os_error().raw_os_error().unwrap_or(0)
}
