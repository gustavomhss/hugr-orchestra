//! Error message texts: what failed + the value + the likely cause + the fix (QS-05). Identical in every
//! language, because the bindings never write their own. W03.
//!
//! Each text comes with its code, as an `Error` constructor: this module is private to `error`, so callers write
//! `Error::not_on_path(..)`, and no call site can pair a text with the wrong code. Fields carry their contract
//! names (`command`, `args[i]`, `cwd`, `env`, `inheritEnv`, `timeoutMs`, `graceMs`, `pty.cols`), so one text serves
//! every language. Shared and append-only (AGENTS.md): each WP adds its own `impl Error` blocks at the end.
//!
//! Secrets: argument text and env values are never echoed, because they often carry secrets; the field and the
//! byte offset point at the problem instead. One exception, decided by the lead (UX-D): the NOT_FOUND texts of a
//! PATH lookup show the PATH and PATHEXT values that were searched, because they are the values that failed and
//! the user needs them to fix the lookup. No other env value appears in any text.

use std::ffi::OsStr;
use std::fmt::Display;
use std::io;
use std::path::Path;

use super::{Error, ErrorCode};

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

fn invalid(message: &str) -> Error {
    Error::new(ErrorCode::InvalidArgument, message)
}

fn nul(what: &str, field: &str, at: usize) -> Error {
    invalid(&format!(
        "{what} contains a NUL byte at byte {at}; no operating system can pass one to a process. Remove it from \
         {field}."
    ))
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

// IO / CLOSED from the supervisor client (W04): starting hugr-omni-supervisor, its channel, and its trees.
impl Error {
    pub(crate) fn runtime_unavailable(err: &io::Error) -> Error {
        io_error(format!(
            "cannot start the hugr-omni runtime threads ({err}). The process is probably out of threads or file \
             descriptors; free some and retry."
        ))
    }

    /// R6: a forked copy of the host must not command the supervisor.
    pub(crate) fn forked_client(home: u32, me: u32) -> Error {
        io_error(format!(
            "hugr-omni was started in process {home} and cannot be used from process {me}, a fork of it: a forked \
             copy must not command the supervisor. Use hugr-omni in the original process, or exec a new program in \
             the child first."
        ))
    }

    pub(crate) fn supervisor_not_found(tried: &[std::path::PathBuf]) -> Error {
        let tried: Vec<String> = tried.iter().map(|p| format!("\"{}\"", p.display())).collect();
        io_error(format!(
            "hugr-omni-supervisor was not found (looked at: {}). Reinstall the package for this platform, or set \
             HUGR_OMNI_SUPERVISOR to its path.",
            tried.join(", ")
        ))
    }

    /// `what` names the part that failed: the binary at its path, its channel, or its reaper thread.
    pub(crate) fn supervisor_not_started(what: &str, err: &io::Error) -> Error {
        io_error(format!(
            "cannot start the hugr-omni supervisor: {what} failed ({err}). If the binary is missing or foreign, \
             reinstall the package or set HUGR_OMNI_SUPERVISOR; otherwise the process may be out of threads or \
             descriptors."
        ))
    }

    /// Another call's start attempt, which this one waited for, failed with `first`.
    pub(crate) fn supervisor_start_shared(first: &str) -> Error {
        io_error(format!(
            "the hugr-omni supervisor start that this call waited for failed: {first}"
        ))
    }

    pub(crate) fn supervisor_start_timed_out(waited: std::time::Duration) -> Error {
        io_error(format!(
            "the hugr-omni supervisor that another call was starting did not become ready within {} ms. The \
             machine may be overloaded; retry.",
            waited.as_millis()
        ))
    }

    pub(crate) fn supervisor_did_not_start(generation: u64, why: &str) -> Error {
        io_error(format!(
            "the hugr-omni supervisor (generation {generation}) did not start: {why}. Check that \
             hugr-omni-supervisor comes from the same release as this library (HUGR_OMNI_SUPERVISOR overrides its \
             path)."
        ))
    }

    pub(crate) fn supervisor_gone(generation: u64, why: &str) -> Error {
        io_error(format!(
            "the hugr-omni supervisor (generation {generation}) is gone: {why}. Calls on its processes fail with IO; \
             the next spawn starts a new supervisor."
        ))
    }

    pub(crate) fn supervisor_saturated(waiting: usize, limit: usize) -> Error {
        io_error(format!(
            "{waiting} requests are already waiting for the hugr-omni supervisor (the limit is {limit}): it is not \
             keeping up. Retry once some of them have finished."
        ))
    }

    pub(crate) fn request_too_big(err: &dyn Display) -> Error {
        io_error(format!(
            "cannot send this request to the hugr-omni supervisor: {err}. Pass a smaller environment or fewer \
             arguments."
        ))
    }

    /// `about` names what the request was about (`tree 3`, `the spawn`).
    pub(crate) fn supervisor_refused(op: &str, about: &str, why: &str) -> Error {
        io_error(format!("the hugr-omni supervisor refused {op} for {about}: {why}."))
    }

    /// The supervisor could not start `program`; `code` is the one its reply maps to.
    pub(crate) fn spawn_refused(code: ErrorCode, program: &str, msg: &str, errno: i32) -> Error {
        Error::new(code, format!("cannot start {program}: {msg} (os error {errno})."))
    }

    /// The host could not create, pass or take the child's pipe or terminal ends.
    pub(crate) fn host_ends(what: &str, err: &io::Error) -> Error {
        io_error(format!(
            "{what}: {err}. The process is probably out of file descriptors or handles; close some and retry."
        ))
    }

    pub(crate) fn terminal_never_started() -> Error {
        io_error("the terminal program never started (its exec failed), so it has no exit status.".to_string())
    }

    pub(crate) fn resize_after_exit(cols: u16, rows: u16) -> Error {
        Error::new(
            ErrorCode::Closed,
            format!("cannot resize the terminal to {cols}x{rows}: its program already exited."),
        )
    }
}

fn io_error(message: String) -> Error {
    Error::new(ErrorCode::Io, message)
}

// INVALID_ARGUMENT / CLOSED / IO from the output pumps and stdin (W10, contract §4, §6, §9).
impl Error {
    /// `output` or `lines()` claimed a second time, or after the consumer was left.
    pub(crate) fn output_claimed() -> Error {
        invalid(
            "output already has its consumer: output and lines() are two views of a single consumer, the first \
             one claims it, and leaving it detaches for good. Read everything through that first consumer.",
        )
    }

    /// `what` names the thread (`an output reader`, `the stdin writer`).
    pub(crate) fn io_thread(what: &str, err: &io::Error) -> Error {
        io_error(format!(
            "cannot start {what} thread ({err}). The process is probably out of threads or memory; free some and \
             retry."
        ))
    }

    pub(crate) fn read_failed(stream: crate::types::Stream, err: &io::Error) -> Error {
        io_error(format!(
            "reading the child's {} failed ({err}); the rest of that stream is lost.",
            stream_name(stream)
        ))
    }

    /// `run()` found `bytes` of `stream` dropped before it began collecting.
    pub(crate) fn output_lost(stream: crate::types::Stream, bytes: u64) -> Error {
        io_error(format!(
            "{bytes} bytes of the child's {} were dropped before run() began collecting them, so its result would \
             be incomplete. Retry; if it happens again, report it as a hugr-omni bug.",
            stream_name(stream)
        ))
    }

    /// `why` says what closed it: closeStdin(), the child, its exit or stop, or an earlier failure.
    pub(crate) fn stdin_closed(why: &str) -> Error {
        Error::new(
            ErrorCode::Closed,
            format!(
                "cannot write to the child's stdin: {why}. Write only before closeStdin() and while the child is \
                 running and reading its input."
            ),
        )
    }

    pub(crate) fn write_failed(err: &io::Error) -> Error {
        io_error(format!(
            "writing to the child's stdin failed ({err}); nothing more will be written to it."
        ))
    }
}

fn stream_name(stream: crate::types::Stream) -> &'static str {
    use crate::types::Stream;
    match stream {
        Stream::Stdout => "stdout",
        Stream::Stderr => "stderr",
        Stream::Pty => "terminal output",
    }
}

// INVALID_ARGUMENT / IO from the child (W07: process).
impl Error {
    /// `Command::spawn()` with `pty()` set: a terminal child comes from `spawn_pty()`.
    pub(crate) fn pty_needs_spawn_pty() -> Error {
        invalid(
            "spawn() starts a child with pipes, but pty() was set. Call spawn_pty() to start it inside a terminal, \
             or remove pty().",
        )
    }

    /// `write()` to a pipe child spawned without a stdin pipe (contract §9).
    pub(crate) fn no_stdin_pipe() -> Error {
        invalid(
            "write() needs a stdin pipe, but this child was spawned with stdin \"closed\" (the default), so it reads \
             end of input at once. Spawn it with stdin: \"pipe\" (Rust: .stdin(Stdin::Pipe)).",
        )
    }

    /// Until terminal children are wired into `process` (W12).
    pub(crate) fn terminal_unsupported() -> Error {
        io_error(
            "terminal children are not available in this build yet (terminal support arrives with W12). Spawn the \
             program with pipes instead."
                .to_string(),
        )
    }
}

// ABORTED / OUTPUT_LIMIT / INVALID_ARGUMENT from timeout, cancellation and run() (W09, contract §6, §8, §10).
impl Error {
    /// The cancellation had already fired when spawn() or run() was called: nothing ran (contract §8).
    pub(crate) fn cancelled_before_start() -> Error {
        Error::new(
            ErrorCode::Aborted,
            "the command was cancelled before it started: its cancellation had already been requested, so nothing \
             ran. Start it with a cancellation that has not fired yet.",
        )
    }

    /// run() was cancelled after the start; its tree was stopped first (contract §8).
    pub(crate) fn run_cancelled() -> Error {
        Error::new(
            ErrorCode::Aborted,
            "run() was cancelled, so the command's whole process tree was stopped. What it had written until then \
             is in the error's result.",
        )
    }

    /// run(): `stream` went over `max` bytes, and the tree was stopped (contract §6).
    pub(crate) fn output_limit(stream: crate::types::Stream, max: usize) -> Error {
        Error::new(
            ErrorCode::OutputLimit,
            format!(
                "the child's {} went over maxOutputBytes ({max} bytes), so its process tree was stopped; the first \
                 {max} bytes of each stream are in the error's result. Raise maxOutputBytes, or read the output as \
                 it comes with spawn().",
                stream_name(stream)
            ),
        )
    }

    /// run() with both pty and input (contract §10).
    pub(crate) fn pty_run_input() -> Error {
        invalid(
            "run() got both pty and input, but a terminal has no separate end of input, so the input would never \
             end. Remove input, or start the program with spawn() and pty and type into it with write().",
        )
    }
}
