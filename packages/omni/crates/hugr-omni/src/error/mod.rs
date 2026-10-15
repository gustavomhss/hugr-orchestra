//! `Error` and its codes (contract §8, §11). Frozen in W00; the message texts live in `messages` (W03).

mod messages;

use std::fmt;

use crate::types::RunOutput;

/// What went wrong, as a stable code. The same codes exist in every language (`OmniError.code` in TS).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ErrorCode {
    /// The program was not found on the child's PATH (or at the given path).
    NotFound,
    /// The program exists but cannot be executed.
    NotExecutable,
    /// The working directory does not exist or is not a directory.
    InvalidCwd,
    /// An option or argument is invalid; the message names the field. Nothing was started.
    InvalidArgument,
    /// Cancelled; the tree was stopped first.
    Aborted,
    /// `run()` output went over `max_output_bytes`; the tree was stopped first.
    OutputLimit,
    /// Writing to, or resizing, a stream or terminal that is already closed.
    Closed,
    /// An operating-system or supervisor failure.
    Io,
}

impl ErrorCode {
    /// The code as written in every language: `"NOT_FOUND"`, `"INVALID_ARGUMENT"`, ...
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::NotFound => "NOT_FOUND",
            ErrorCode::NotExecutable => "NOT_EXECUTABLE",
            ErrorCode::InvalidCwd => "INVALID_CWD",
            ErrorCode::InvalidArgument => "INVALID_ARGUMENT",
            ErrorCode::Aborted => "ABORTED",
            ErrorCode::OutputLimit => "OUTPUT_LIMIT",
            ErrorCode::Closed => "CLOSED",
            ErrorCode::Io => "IO",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// An error with a stable code and a message that says what failed, with which value, and how to fix it.
#[derive(Debug)]
pub struct Error {
    code: ErrorCode,
    message: String,
    result: Option<Box<RunOutput>>,
}

impl Error {
    /// The stable code.
    pub fn code(&self) -> ErrorCode {
        self.code
    }

    /// What `run()` collected before failing with `Aborted`, `OutputLimit` or `Io`.
    pub fn result(&self) -> Option<&RunOutput> {
        self.result.as_deref()
    }

    pub(crate) fn new(code: ErrorCode, message: impl Into<String>) -> Error {
        Error {
            code,
            message: message.into(),
            result: None,
        }
    }

    pub(crate) fn with_result(mut self, result: RunOutput) -> Error {
        self.result = Some(Box::new(result));
        self
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for Error {}
