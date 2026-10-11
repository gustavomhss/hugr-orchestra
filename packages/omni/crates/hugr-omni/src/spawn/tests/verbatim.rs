//! A verbatim Windows command line (amendment WP8b): refused on Unix, with `args`, with a NUL, and for a batch file;
//! both OS rule sets, on any OS.

use std::path::Path;

use super::{expect_err, os, request};
use crate::error::ErrorCode;
use crate::spawn::Os;
use crate::spawn::validate::{check, verbatim_program};

#[test]
fn verbatim_is_windows_only_alone_and_without_nul() {
    let tail = |t: &str| request(|r| r.verbatim = Some(os(t)));
    check(&tail(r#"/d /s /c "echo a&echo b""#), Os::Windows).unwrap();
    check(&tail(""), Os::Windows).unwrap();
    expect_err(
        check(&tail("x"), Os::Unix),
        ErrorCode::InvalidArgument,
        &["windowsVerbatimArgs", "not Windows"],
    );
    let with_args = request(|r| {
        r.verbatim = Some(os("x"));
        r.args = vec![os("a"), os("b")];
    });
    expect_err(
        check(&with_args, Os::Windows),
        ErrorCode::InvalidArgument,
        &["windowsVerbatimArgs", "2 args"],
    );
    let text = expect_err(
        check(&tail("hunter2\0x"), Os::Windows),
        ErrorCode::InvalidArgument,
        &["windowsVerbatimArgs", "NUL", "byte 7"],
    );
    assert!(!text.contains("hunter2"), "the text is never echoed: {text}");
}

#[test]
fn verbatim_never_reaches_a_batch_file() {
    for batch in [
        r"C:\t\tool.cmd",
        r"C:\t\TOOL.BAT",
        r"C:\t\tool.Cmd. . ",
        r"\\?\C:\t\tool.bat",
        "C:/t/tool.cmd",
    ] {
        expect_err(
            verbatim_program(&os("tool"), Path::new(batch), Os::Windows),
            ErrorCode::InvalidArgument,
            &["batch file", "cmd.exe", "\"tool\""],
        );
    }
    for program in [
        r"C:\Windows\System32\cmd.exe",
        r"C:\t.cmd\tool.exe",
        r"C:\t\tool",
        r"C:\t\cmd",
        r"C:\t\x.cmdx",
    ] {
        verbatim_program(&os("x"), Path::new(program), Os::Windows).unwrap();
    }
    verbatim_program(&os("x"), Path::new("/t/tool.cmd"), Os::Unix).unwrap();
}

#[cfg(unix)]
#[test]
fn prepare_refuses_verbatim_on_unix_before_resolving() {
    let req = request(|r| {
        r.program = os("no-such-program-anywhere");
        r.verbatim = Some(os("x"));
    });
    expect_err(super::prepare(&req), ErrorCode::InvalidArgument, &["not Windows"]);
}
