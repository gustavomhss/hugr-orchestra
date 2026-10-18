//! W03: INVALID_ARGUMENT, NOT_FOUND / NOT_EXECUTABLE, IO and INVALID_CWD texts of spawn validation and lookup.
//! Part of the shared, append-only error texts (see `messages`).

use std::ffi::OsStr;
use std::fmt::Display;
use std::io;
use std::path::Path;

use crate::error::{Error, ErrorCode};

use super::{invalid, nul};

// INVALID_ARGUMENT (contract §3): checked before anything is looked up or started.
impl Error {
    pub(crate) fn empty_command() -> Error {
        invalid("command is empty. Pass the program to run: a name looked up on PATH (e.g. \"node\") or a path to it.")
    }

    pub(crate) fn nul_in_command(command: &OsStr, at: usize) -> Error {
        nul(&format!("command {command:?}"), "command", at)
    }

    pub(crate) fn nul_in_arg(index: usize, at: usize) -> Error {
        let field = format!("args[{index}]");
        nul(
            &format!("{field} (not shown: arguments often carry secrets)"),
            &field,
            at,
        )
    }

    pub(crate) fn nul_in_cwd(cwd: &Path, at: usize) -> Error {
        nul(&format!("cwd {:?}", cwd.as_os_str()), "cwd", at)
    }

    pub(crate) fn nul_in_env_name(name: &OsStr, at: usize) -> Error {
        nul(&format!("env name {name:?}"), "the name", at)
    }

    pub(crate) fn nul_in_env_value(name: &OsStr, at: usize) -> Error {
        let what = format!("the value of env {name:?} (not shown: environment values often carry secrets)");
        nul(&what, "the value", at)
    }

    pub(crate) fn empty_env_name() -> Error {
        invalid("env has an entry with an empty name, which no operating system accepts. Remove the entry or name it.")
    }

    pub(crate) fn equals_in_env_name(name: &OsStr) -> Error {
        invalid(&format!(
            "env name {name:?} contains \"=\", which ends a name in the environment. Use a name without \"=\"."
        ))
    }

    /// Windows `C:dir\x.exe`: relative to a per-drive current directory (contract §3).
    pub(crate) fn drive_relative_command(command: &OsStr) -> Error {
        invalid(&format!(
            "command \"{}\" is relative to its drive's current directory, which cwd does not set. Write the full \
             path instead, with \"\\\" after the drive letter.",
            command.display()
        ))
    }

    /// `field` is `pty.cols` or `pty.rows` (or a binding's name for them); `value` as the caller passed it.
    pub(crate) fn bad_pty_size(field: &str, value: impl Display) -> Error {
        invalid(&format!(
            "{field} is {value}; a terminal side must be a whole number of cells from 1 to 32767. Pass a size in \
             that range (the default is 80 x 24)."
        ))
    }

    /// `field` is `timeoutMs` or `graceMs`; `value` in milliseconds (rounded up when it comes from a `Duration`).
    pub(crate) fn duration_out_of_range(field: &str, value: impl Display) -> Error {
        invalid(&format!(
            "{field} is {value}; it must be a number of milliseconds from 0 to 4294967295 (about 49.7 days), a \
             fraction rounding up. Pass a value in that range."
        ))
    }

    /// `field` is `maxOutputBytes`; only a binding can pass a negative, fractional or non-finite number.
    pub(crate) fn bad_byte_limit(field: &str, value: impl Display) -> Error {
        invalid(&format!(
            "{field} is {value}; it must be a whole number of bytes from 0 to {}. Pass a whole number in that range.",
            usize::MAX
        ))
    }
}

// NOT_FOUND / NOT_EXECUTABLE (contract §3): the lookup of `command`; nothing was started.
impl Error {
    /// A bare name, and the child's environment has no PATH (`path` is `None`) or a PATH that names no directory.
    pub(crate) fn no_path(command: &OsStr, path: Option<&OsStr>) -> Error {
        let why = match path {
            None => "the child's environment has no PATH (inheritEnv is false, or env removed PATH)".to_owned(),
            Some(path) => format!("the child's PATH (\"{}\") names no directory", path.display()),
        };
        Error::new(
            ErrorCode::NotFound,
            format!(
                "command \"{}\" cannot be looked up: {why}. Set PATH in env, or pass the program's full path.",
                command.display()
            ),
        )
    }

    /// A bare name that no directory of the child's PATH holds. `exts`: the PATHEXT extensions tried (Windows).
    pub(crate) fn not_on_path(command: &OsStr, path: &OsStr, exts: &[String]) -> Error {
        Error::new(
            ErrorCode::NotFound,
            format!(
                "command \"{}\" was not found in any directory of the child's PATH (\"{}\"){}. Install it, add its \
                 directory to PATH (in env, or in the host's environment when inheritEnv is true), or pass the \
                 program's full path.",
                command.display(),
                path.display(),
                tried(exts)
            ),
        )
    }

    /// A path with a separator (`resolved` is it made absolute against cwd) where nothing exists.
    pub(crate) fn no_such_program(command: &OsStr, resolved: &Path, exts: &[String]) -> Error {
        let relative = if Path::new(command).is_relative() {
            " (a relative path resolves against cwd)"
        } else {
            ""
        };
        Error::new(
            ErrorCode::NotFound,
            format!(
                "command \"{}\" was not found at \"{}\"{}{relative}. Check the path and cwd, or pass the program's \
                 full path.",
                command.display(),
                resolved.display(),
                tried(exts)
            ),
        )
    }

    pub(crate) fn is_directory(command: &OsStr, resolved: &Path) -> Error {
        not_executable(
            command,
            resolved,
            "which is a directory. Pass the program file inside it, not the directory.",
        )
    }

    /// Unix: the effective user may not execute it (`spawn/sys.rs`).
    pub(crate) fn no_execute_permission(command: &OsStr, resolved: &Path) -> Error {
        let fix = format!(
            "which has no execute permission for the host's user. Make it executable (chmod +x \"{}\") or pass it as \
             an argument to its interpreter (e.g. command \"sh\" for a shell script).",
            resolved.display()
        );
        not_executable(command, resolved, &fix)
    }

    /// The file system refused to say what is at `resolved` (EACCES on it or on a directory above it).
    pub(crate) fn access_denied(command: &OsStr, resolved: &Path) -> Error {
        not_executable(
            command,
            resolved,
            "which could not be accessed (permission denied). Give the host's user access to the file and the \
             directories above it, or pass a program it can access.",
        )
    }

    /// Windows: a file whose extension `CreateProcess` cannot start (`.py`, `.ps1`, `.js`, ...).
    pub(crate) fn not_startable(command: &OsStr, resolved: &Path) -> Error {
        not_executable(
            command,
            resolved,
            "which Windows cannot start: only .exe, .com, .bat and .cmd files start directly. Pass it as an \
             argument to the program that opens it (e.g. command \"python\" for a .py file).",
        )
    }
}

// IO: the lookup itself failed; nothing was started.
impl Error {
    /// Asking the file system about `candidate` failed with something other than missing or permission denied.
    pub(crate) fn lookup_failed(command: &OsStr, candidate: &Path, err: &io::Error) -> Error {
        Error::new(
            ErrorCode::Io,
            format!(
                "command \"{}\" could not be looked up: checking \"{}\" failed ({err}). Fix that path (e.g. a \
                 symlink loop, or a failing disk or network share), or point command or PATH elsewhere.",
                command.display(),
                candidate.display()
            ),
        )
    }
}

// INVALID_CWD (contract §3). `given` is the cwd as passed (`None`: the host's), `dir` the absolute directory.
impl Error {
    /// Windows `C:dir`: relative to a per-drive current directory (contract §3).
    pub(crate) fn drive_relative_cwd(given: &Path) -> Error {
        bad_cwd(&format!(
            "cwd \"{}\" is relative to its drive's current directory, which the child cannot rely on. Write the \
             full path instead, with \"\\\" after the drive letter.",
            given.display()
        ))
    }

    pub(crate) fn cwd_missing(given: Option<&Path>, dir: &Path) -> Error {
        bad_cwd(&format!(
            "{} does not exist. Create the directory, or pass an existing one as cwd.",
            cwd_named(given, dir)
        ))
    }

    pub(crate) fn cwd_not_directory(given: Option<&Path>, dir: &Path) -> Error {
        bad_cwd(&format!(
            "{} is not a directory. Pass a directory as cwd.",
            cwd_named(given, dir)
        ))
    }

    pub(crate) fn cwd_inaccessible(given: Option<&Path>, dir: &Path, err: &io::Error) -> Error {
        bad_cwd(&format!(
            "{} cannot be accessed ({err}). Pass a directory the host process can access as cwd.",
            cwd_named(given, dir)
        ))
    }

    /// The host's working directory was needed (no cwd, or a relative one) and could not be read.
    pub(crate) fn host_cwd_unreadable(given: Option<&Path>, err: &io::Error) -> Error {
        bad_cwd(&match given {
            None => format!(
                "the host's working directory cannot be read ({err}), so the child has none to inherit. Pass an \
                 absolute cwd."
            ),
            Some(given) => format!(
                "cwd \"{}\" is relative, but the host's working directory it resolves against cannot be read \
                 ({err}). Pass an absolute cwd.",
                given.display()
            ),
        })
    }
}

fn not_executable(command: &OsStr, resolved: &Path, why_and_fix: &str) -> Error {
    Error::new(
        ErrorCode::NotExecutable,
        format!(
            "command \"{}\" resolved to \"{}\", {why_and_fix}",
            command.display(),
            resolved.display()
        ),
    )
}

fn bad_cwd(message: &str) -> Error {
    Error::new(ErrorCode::InvalidCwd, message)
}

/// The PATHEXT extensions tried, for the NOT_FOUND texts (empty off Windows).
fn tried(exts: &[String]) -> String {
    if exts.is_empty() {
        String::new()
    } else {
        format!(", with the PATHEXT extensions {}", exts.join(" "))
    }
}

/// Which directory an INVALID_CWD text is about, and how a relative cwd became it.
fn cwd_named(given: Option<&Path>, dir: &Path) -> String {
    match given {
        None => format!("the host's working directory \"{}\"", dir.display()),
        Some(given) if given == dir => format!("cwd \"{}\"", dir.display()),
        Some(given) => format!(
            "cwd \"{}\" (resolved against the host's working directory to \"{}\")",
            given.display(),
            dir.display()
        ),
    }
}
