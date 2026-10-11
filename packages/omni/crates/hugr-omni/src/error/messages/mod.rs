//! Error message texts: what failed + the value + the likely cause + the fix (QS-05). Identical in every
//! language, because the bindings never write their own. W03.
//!
//! Each text comes with its code, as an `Error` constructor: this module is private to `error`, so callers write
//! `Error::not_on_path(..)`, and no call site can pair a text with the wrong code. Fields carry their contract
//! names (`command`, `args[i]`, `cwd`, `env`, `inheritEnv`, `timeoutMs`, `graceMs`, `pty.cols`), so one text serves
//! every language. Shared and append-only (AGENTS.md): each WP owns one submodule, named after it, and adds
//! its `impl Error` blocks at the end of it; a new WP adds a new submodule. Shared helpers stay here.
//!
//! Secrets: argument text and env values are never echoed, because they often carry secrets; the field and the
//! byte offset point at the problem instead. One exception, decided by the lead (UX-D): the NOT_FOUND texts of a
//! PATH lookup show the PATH and PATHEXT values that were searched, because they are the values that failed and
//! the user needs them to fix the lookup. No other env value appears in any text.

mod w03;
mod w04;
mod w07;
mod w09;
mod w10;
mod wp8b;
mod wp_h;

use super::{Error, ErrorCode};

fn invalid(message: &str) -> Error {
    Error::new(ErrorCode::InvalidArgument, message)
}

fn nul(what: &str, field: &str, at: usize) -> Error {
    invalid(&format!(
        "{what} contains a NUL byte at byte {at}; no operating system can pass one to a process. Remove it from \
         {field}."
    ))
}

fn io_error(message: String) -> Error {
    Error::new(ErrorCode::Io, message)
}

fn stream_name(stream: crate::types::Stream) -> &'static str {
    use crate::types::Stream;
    match stream {
        Stream::Stdout => "stdout",
        Stream::Stderr => "stderr",
        Stream::Pty => "terminal output",
    }
}
