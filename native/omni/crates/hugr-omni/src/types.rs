//! The public value types (contract §1). Frozen in W00. This module depends on nothing, so every layer
//! (including `error`) can use it.

use std::fmt;

/// What a spawned pipe child gets on stdin (contract §9).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Stdin {
    /// End of input at once (the default).
    #[default]
    Closed,
    /// A pipe you write to with `write()` and close with `close_stdin()`.
    Pipe,
}

/// Terminal size in character cells (contract §10). The default is 80 x 24.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PtySize {
    /// Columns.
    pub cols: u16,
    /// Rows.
    pub rows: u16,
}

impl Default for PtySize {
    fn default() -> Self {
        PtySize { cols: 80, rows: 24 }
    }
}

/// Which stream a chunk or line came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Stream {
    /// Standard output (and stderr with `merge_stderr`).
    Stdout,
    /// Standard error.
    Stderr,
    /// Everything a terminal shows.
    Pty,
}

/// Output data: text with `text(true)` (the default), raw bytes with `text(false)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Data {
    /// UTF-8 text, decoded across chunks; invalid bytes become U+FFFD.
    Text(String),
    /// Raw bytes, lossless.
    Bytes(Vec<u8>),
}

impl fmt::Display for Data {
    /// Text as is; bytes decoded lossily.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Data::Text(s) => f.write_str(s),
            Data::Bytes(b) => f.write_str(&String::from_utf8_lossy(b)),
        }
    }
}

/// A piece of output.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Chunk {
    /// Where it came from.
    pub stream: Stream,
    /// The data (empty only on the final item that reports a gap before the end).
    pub data: Data,
    /// Bytes dropped right before this item (contract §4).
    pub lost_before: Option<u64>,
}

/// A line of output, without its `\n` (and a trailing `\r`).
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Line {
    /// Where it came from.
    pub stream: Stream,
    /// The text.
    pub text: String,
    /// Bytes dropped right before this line (contract §4).
    pub lost_before: Option<u64>,
    /// `true` on every piece but the last of a line longer than 1 MiB.
    pub continues: bool,
}

/// Bytes dropped so far because nobody was reading (contract §4). PTY output counts as stdout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DroppedBytes {
    /// stdout (and PTY output).
    pub stdout: u64,
    /// stderr.
    pub stderr: u64,
}

/// Why the root process ended (contract §7). The cause is committed when the library acts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Reason {
    /// It exited on its own.
    Exit,
    /// A signal ended it, not sent by this library (Unix only).
    Signal,
    /// `stop()` or dropping the child ended it.
    Killed,
    /// The timeout ended it.
    Timeout,
    /// Cancellation ended it.
    Aborted,
}

/// How the root process ended.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Exit {
    /// The exit code; `None` only when a Unix process was ended by a signal. Windows codes are reported as
    /// non-negative integers (e.g. `0xC000013A`).
    pub code: Option<u32>,
    /// The Unix signal name (e.g. `"SIGTERM"`); always `None` on Windows.
    pub signal: Option<String>,
    /// Why it ended.
    pub reason: Reason,
}

impl Exit {
    /// `reason` is `Exit` and the code is 0.
    pub fn success(&self) -> bool {
        self.reason == Reason::Exit && self.code == Some(0)
    }
}

/// The result of `run()`: describes the whole run, not only the root (contract §6).
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct RunOutput {
    /// How the run ended.
    pub exit: Exit,
    /// Complete stdout (PTY output lands here).
    pub stdout: Data,
    /// Complete stderr; empty for a PTY and with `merge_stderr`.
    pub stderr: Data,
}

/// One live process of a child's tree (contract §5, `processes()`).
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct ProcessInfo {
    /// Process id.
    pub pid: u32,
    /// The parent's pid when the parent is in the same list; `None` otherwise (e.g. the root).
    pub parent_pid: Option<u32>,
    /// The executable's file name without directory (`node`, `node.exe`); `None` when the OS does not tell.
    pub name: Option<String>,
}
