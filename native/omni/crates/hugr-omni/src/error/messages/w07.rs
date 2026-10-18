//! W07: INVALID_ARGUMENT / IO texts of the child (process).
//! Part of the shared, append-only error texts (see `messages`).

use crate::error::Error;

use super::{invalid, io_error};

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
