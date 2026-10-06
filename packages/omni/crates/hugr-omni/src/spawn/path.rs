//! Path rules per OS, as pure functions, so the Windows rules run on every OS (W03). Only ASCII units are
//! inspected or cut at, which is exact in both encodings (bytes on Unix, WTF-8 / UTF-16 on Windows).

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use super::Os;

/// How a path relates to the directory it is resolved against.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    /// Unix `/x`; Windows `C:\x`, `\\server\share\x`, `\\?\…`.
    Absolute,
    /// Windows `\x`: the drive of the base, then `x`.
    RootRelative,
    /// Windows `C:x`: relative to drive C's own current directory, which nobody sets for the child. Refused.
    DriveRelative,
    /// Everything else: the base, then the path.
    Relative,
}

pub(super) fn kind(path: &OsStr, os: Os) -> Kind {
    let bytes = path.as_encoded_bytes();
    let sep = |i: usize| bytes.get(i).is_some_and(|&b| is_sep(b, os));
    match os {
        Os::Unix if sep(0) => Kind::Absolute,
        Os::Unix => Kind::Relative,
        Os::Windows if drive(bytes).is_some() && sep(2) => Kind::Absolute,
        Os::Windows if drive(bytes).is_some() => Kind::DriveRelative,
        Os::Windows if sep(0) && sep(1) => Kind::Absolute,
        Os::Windows if sep(0) => Kind::RootRelative,
        Os::Windows => Kind::Relative,
    }
}

/// `/` everywhere; `\` too on Windows.
pub(super) fn has_separator(path: &OsStr, os: Os) -> bool {
    path.as_encoded_bytes().iter().any(|&b| is_sep(b, os))
}

/// `path` made absolute against the absolute directory `base`; `None` for a Windows drive-relative `path`.
pub(super) fn join(base: &Path, path: &OsStr, os: Os) -> Option<PathBuf> {
    match (os, kind(path, os)) {
        (Os::Unix, _) => Some(base.join(path)),
        (Os::Windows, Kind::DriveRelative) => None,
        (Os::Windows, Kind::Absolute) => Some(PathBuf::from(path)),
        (Os::Windows, Kind::RootRelative) => Some(match drive(base.as_os_str().as_encoded_bytes()) {
            Some(letter) => concat(&format!("{letter}:"), path),
            // A UNC or `\\?\` base: std's rule, which is Windows' own on the only host that has such bases.
            None => base.join(path),
        }),
        // A `\\?\` base takes no `/` and no `.`: std normalizes `path` into it.
        (Os::Windows, Kind::Relative) if is_verbatim(base) => Some(base.join(path)),
        (Os::Windows, Kind::Relative) => {
            let mut joined = base.as_os_str().to_os_string();
            if !joined.as_encoded_bytes().last().is_some_and(|&b| is_sep(b, os)) {
                joined.push("\\");
            }
            joined.push(path);
            Some(PathBuf::from(joined))
        }
    }
}

/// The directories of a PATH value, empty ones dropped: `:`-separated on Unix; `;`-separated on Windows, where
/// double quotes protect a `;` and are removed (std's rule).
pub(super) fn split_path(value: &OsStr, os: Os) -> Vec<PathBuf> {
    let (sep, quotes) = match os {
        Os::Unix => (b':', false),
        Os::Windows => (b';', true),
    };
    split_os(value, sep, quotes).into_iter().map(PathBuf::from).collect()
}

/// Windows: the extension of the last component (after its last `.`, which must not be its first byte).
pub(super) fn extension(path: &OsStr) -> Option<&[u8]> {
    let bytes = path.as_encoded_bytes();
    let name = match bytes.iter().rposition(|&b| is_sep(b, Os::Windows)) {
        Some(at) => bytes.get(at + 1..).unwrap_or_default(),
        None => bytes,
    };
    match name.iter().rposition(|&b| b == b'.') {
        None | Some(0) => None,
        Some(at) => name.get(at + 1..),
    }
}

fn is_sep(b: u8, os: Os) -> bool {
    b == b'/' || (os == Os::Windows && b == b'\\')
}

/// The drive letter of a path that starts with `X:`.
fn drive(bytes: &[u8]) -> Option<char> {
    match bytes {
        [letter, b':', ..] if letter.is_ascii_alphabetic() => Some(char::from(*letter)),
        _ => None,
    }
}

fn is_verbatim(base: &Path) -> bool {
    base.as_os_str().as_encoded_bytes().starts_with(br"\\?\")
}

fn concat(head: &str, tail: &OsStr) -> PathBuf {
    let mut joined = OsString::from(head);
    joined.push(tail);
    PathBuf::from(joined)
}

#[cfg(unix)]
fn split_os(value: &OsStr, sep: u8, quotes: bool) -> Vec<OsString> {
    use std::os::unix::ffi::{OsStrExt, OsStringExt};
    split(value.as_bytes(), sep, quotes)
        .into_iter()
        .map(OsString::from_vec)
        .collect()
}

#[cfg(windows)]
fn split_os(value: &OsStr, sep: u8, quotes: bool) -> Vec<OsString> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    let wide: Vec<u16> = value.encode_wide().collect();
    split(&wide, sep, quotes)
        .iter()
        .map(|piece| OsString::from_wide(piece))
        .collect()
}

/// `units` cut at every unquoted `sep`; quotes removed; empty pieces dropped.
fn split<T: Copy + PartialEq + From<u8>>(units: &[T], sep: u8, quotes: bool) -> Vec<Vec<T>> {
    let mut pieces = vec![Vec::new()];
    let mut quoted = false;
    for &unit in units {
        if quotes && unit == T::from(b'"') {
            quoted = !quoted;
        } else if !quoted && unit == T::from(sep) {
            pieces.push(Vec::new());
        } else if let Some(piece) = pieces.last_mut() {
            piece.push(unit);
        }
    }
    pieces.retain(|piece| !piece.is_empty());
    pieces
}
