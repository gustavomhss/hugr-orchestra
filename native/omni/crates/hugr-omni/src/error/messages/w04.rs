//! W04: IO / CLOSED texts of the supervisor client.
//! Part of the shared, append-only error texts (see `messages`).

use std::fmt::Display;
use std::io;

use crate::error::{Error, ErrorCode};

use super::io_error;

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
