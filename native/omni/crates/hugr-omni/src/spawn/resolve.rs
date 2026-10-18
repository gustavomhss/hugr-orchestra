//! Program resolution against the child's final PATH (+ PATHEXT on Windows) (C-SPAWN-01, C-SPAWN-03). W03.

use std::ffi::{OsStr, OsString};
use std::io;
use std::path::{Path, PathBuf};

use super::path::{self, Kind};
use super::{HOST, Os, env};
use crate::error::Error;

/// PATHEXT when the child's environment has none (or an empty one): the extensions that start without a shell.
const DEFAULT_PATHEXT: &str = ".COM;.EXE;.BAT;.CMD";

/// What an existing path holds, as far as starting a program goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Entry {
    Dir,
    /// `executable`: the effective user may execute it (always `true` on Windows, where the extension decides).
    File {
        executable: bool,
    },
}

/// Absolute path of the program to execute. Never executes anything.
pub(super) fn program(program: &OsStr, env: &[(OsString, OsString)], cwd: &Path) -> Result<PathBuf, Error> {
    find(program, env, cwd, HOST, probe)
}

/// The rule behind `program`, with the OS rules and the file system (`probe`) as inputs. `cwd` is absolute.
///
/// A `program` with a separator is one path, made absolute against `cwd` (a Windows drive-relative one is
/// refused). A bare name is looked up in the directories of the child's PATH, in order; a relative directory
/// resolves against `cwd`; an empty or drive-relative one is skipped (no implicit current directory). On Windows a
/// name is tried as written only if it has an extension, then with each PATHEXT extension, so `npm` finds
/// `npm.cmd` and never the extensionless script beside it.
///
/// Like `execvp`: a candidate that is missing (or under a non-directory) is passed over; one that exists but
/// cannot run, or cannot be accessed, is skipped and is the `NotExecutable` answer when nothing runs; any other
/// file-system error ends the lookup with `Io`.
pub(super) fn find(
    program: &OsStr,
    env: &[(OsString, OsString)],
    cwd: &Path,
    os: Os,
    probe: impl Fn(&Path) -> io::Result<Entry>,
) -> Result<PathBuf, Error> {
    let exts = extensions(env, os);
    let (bases, path) = if path::has_separator(program, os) || path::kind(program, os) == Kind::DriveRelative {
        let base = path::join(cwd, program, os).ok_or_else(|| Error::drive_relative_command(program))?;
        (vec![base], None)
    } else {
        let path = env::get(env, "PATH", os).ok_or_else(|| Error::no_path(program, None))?;
        let bases: Vec<PathBuf> = path::split_path(path, os)
            .iter()
            .filter_map(|dir| path::join(cwd, dir.as_os_str(), os))
            .filter_map(|dir| path::join(&dir, program, os))
            .collect();
        if bases.is_empty() {
            return Err(Error::no_path(program, Some(path)));
        }
        (bases, Some(path))
    };
    let mut skipped = None;
    for candidate in bases.iter().flat_map(|base| candidates(base, &exts, os)) {
        let refusal: fn(&OsStr, &Path) -> Error = match probe(&candidate) {
            Err(err) if matches!(err.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) => continue,
            Err(err) if err.kind() == io::ErrorKind::PermissionDenied => Error::access_denied,
            Err(err) => return Err(Error::lookup_failed(program, &candidate, &err)),
            Ok(Entry::Dir) => Error::is_directory,
            Ok(Entry::File { executable }) => match os {
                Os::Unix if executable => return Ok(candidate),
                Os::Unix => Error::no_execute_permission,
                Os::Windows if startable(&candidate) => return Ok(candidate),
                Os::Windows => Error::not_startable,
            },
        };
        skipped.get_or_insert((candidate, refusal));
    }
    Err(match (skipped, path) {
        (Some((candidate, refusal)), _) => refusal(program, &candidate),
        (None, Some(path)) => Error::not_on_path(program, path, &exts),
        (None, None) => Error::no_such_program(program, bases.first().map_or(cwd, PathBuf::as_path), &exts),
    })
}

/// What the file system says about `path` (symlinks followed).
fn probe(path: &Path) -> io::Result<Entry> {
    if std::fs::metadata(path)?.is_dir() {
        return Ok(Entry::Dir);
    }
    Ok(Entry::File {
        executable: executable(path)?,
    })
}

/// The kernel's effective-access rule, not the mode bits: an owner without `u+x` cannot run a `0645` file.
#[cfg(unix)]
fn executable(path: &Path) -> io::Result<bool> {
    super::sys::can_execute(path)
}

#[cfg(windows)]
fn executable(_: &Path) -> io::Result<bool> {
    Ok(true)
}

/// Windows: the child's PATHEXT, lower-cased (as files are usually named). Elsewhere: none.
fn extensions(env: &[(OsString, OsString)], os: Os) -> Vec<String> {
    if os == Os::Unix {
        return Vec::new();
    }
    let parse = |list: &str| -> Vec<String> {
        list.split(';')
            .filter(|ext| !ext.is_empty())
            .map(str::to_ascii_lowercase)
            .collect()
    };
    let exts = env::get(env, "PATHEXT", os).map_or_else(Vec::new, |v| parse(&v.to_string_lossy()));
    if exts.is_empty() { parse(DEFAULT_PATHEXT) } else { exts }
}

/// The files `base` may name: itself (on Windows only if it has an extension), then `base` + each extension.
fn candidates(base: &Path, exts: &[String], os: Os) -> Vec<PathBuf> {
    let mut out = Vec::with_capacity(exts.len() + 1);
    if os == Os::Unix || path::extension(base.as_os_str()).is_some() {
        out.push(base.to_path_buf());
    }
    for ext in exts {
        let mut name = base.as_os_str().to_os_string();
        name.push(ext);
        out.push(PathBuf::from(name));
    }
    out
}

/// Windows starts these without a shell (`.bat`/`.cmd` through `cmd.exe`, C-SPAWN-02); anything else is refused.
fn startable(path: &Path) -> bool {
    path::extension(path.as_os_str()).is_some_and(|ext| {
        [b"exe", b"com", b"bat", b"cmd"]
            .iter()
            .any(|s| ext.eq_ignore_ascii_case(*s))
    })
}
