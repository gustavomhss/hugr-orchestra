//! W09: ABORTED / OUTPUT_LIMIT / INVALID_ARGUMENT texts of timeout, cancellation and run().
//! Part of the shared, append-only error texts (see `messages`).

use crate::error::{Error, ErrorCode};

use super::{invalid, stream_name};

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
