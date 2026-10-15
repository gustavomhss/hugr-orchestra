//! W10: INVALID_ARGUMENT / CLOSED / IO texts of the output pumps and stdin.
//! Part of the shared, append-only error texts (see `messages`).

use std::io;

use crate::error::{Error, ErrorCode};

use super::{invalid, io_error, stream_name};

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
