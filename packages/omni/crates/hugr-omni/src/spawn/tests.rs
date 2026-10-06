//! The rules of `spawn` (W03): the environment, validation and cwd as pure functions (both OS rule sets, on any
//! OS), plus the real file system for cwd and `prepare`. Resolution is in `tests/resolve.rs`. Nothing here starts
//! a process.

mod resolve;

use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use super::env::merge;
use super::validate::{absolute, check, directory};
use super::{HOST, Mode, Os, Request, prepare};
use crate::error::{Error, ErrorCode};
use crate::types::PtySize;

fn os(s: &str) -> OsString {
    s.into()
}

fn vars(pairs: &[(&str, &str)]) -> Vec<(OsString, OsString)> {
    pairs.iter().map(|(k, v)| (os(k), os(v))).collect()
}

fn request(edit: impl FnOnce(&mut Request)) -> Request {
    let mut req = Request::new(os("tool"));
    edit(&mut req);
    req
}

/// A fresh directory for one test.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("hugr-omni-w03-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[track_caller]
fn expect_err<T: std::fmt::Debug>(result: Result<T, Error>, code: ErrorCode, parts: &[&str]) -> String {
    let text = result.unwrap_err().to_string();
    assert!(text.starts_with(code.as_str()), "{text}");
    for part in parts {
        assert!(text.contains(part), "{text:?} lacks {part:?}");
    }
    text
}

#[test]
fn env_merges_over_the_inherited_one_in_call_order_and_none_removes() {
    let host = vars(&[("A", "1"), ("B", "2"), ("C", "3")]);
    let overrides = [
        (os("B"), Some(os("first"))),
        (os("B"), Some(os("ñandú 日本"))),
        (os("A"), None),
        (os("CAFÉ"), Some(os("é"))),
    ];
    for rules in [Os::Unix, Os::Windows] {
        let mut env = merge(host.clone(), &overrides, true, rules);
        env.sort();
        assert_eq!(env, vars(&[("B", "ñandú 日本"), ("C", "3"), ("CAFÉ", "é")]));
    }
}

#[test]
fn a_clean_env_is_only_what_was_passed_plus_system_root_on_windows() {
    let host = vars(&[("PATH", "/bin"), ("SystemRoot", "C:\\Windows"), ("HOME", "/h")]);
    let set = [(os("X"), Some(os("1")))];
    assert_eq!(merge(host.clone(), &set, false, Os::Unix), vars(&[("X", "1")]));
    let windows = merge(host.clone(), &set, false, Os::Windows);
    assert_eq!(windows, vars(&[("SystemRoot", "C:\\Windows"), ("X", "1")]));
    // ... unless env sets or removes it, in any case.
    assert_eq!(merge(host.clone(), &[(os("SYSTEMROOT"), None)], false, Os::Windows), []);
    let replaced = merge(host, &[(os("systemroot"), Some(os("D:\\W")))], false, Os::Windows);
    assert_eq!(replaced, vars(&[("systemroot", "D:\\W")]));
}

#[test]
fn env_names_ignore_case_on_windows_only() {
    let host = vars(&[("Path", "/old"), ("Äpfel", "1")]);
    let overrides = [(os("PATH"), Some(os("/new"))), (os("äPFEL"), None)];
    let windows = merge(host.clone(), &overrides, true, Os::Windows);
    assert_eq!(windows, vars(&[("PATH", "/new")]));
    let mut unix = merge(host, &overrides, true, Os::Unix);
    unix.sort();
    assert_eq!(unix, vars(&[("PATH", "/new"), ("Path", "/old"), ("Äpfel", "1")]));
}

/// A Windows name from its UTF-16 units, unpaired surrogates included (off Windows, in the WTF-8 form Rust
/// gives Windows strings).
fn wide(units: &[u16]) -> OsString {
    #[cfg(windows)]
    let name = std::os::windows::ffi::OsStringExt::from_wide(units);
    #[cfg(unix)]
    let name = {
        let mut bytes = Vec::new();
        for c in char::decode_utf16(units.iter().copied()) {
            match c {
                Ok(c) => bytes.extend_from_slice(c.encode_utf8(&mut [0; 4]).as_bytes()),
                Err(lone) => {
                    let u = lone.unpaired_surrogate();
                    bytes.extend([
                        0xE0 | (u >> 12) as u8,
                        0x80 | (u >> 6 & 0x3F) as u8,
                        0x80 | (u & 0x3F) as u8,
                    ]);
                }
            }
        }
        std::os::unix::ffi::OsStringExt::from_vec(bytes)
    };
    name
}

#[test]
fn windows_names_ignore_case_over_the_whole_utf16_even_with_lone_surrogates() {
    let (upper, lower, other) = (wide(&[0xC4, 0xD800]), wide(&[0xE4, 0xD800]), wide(&[0xC4, 0xD801]));
    let host = vec![(upper, os("1")), (other.clone(), os("2"))];
    // "ÄD800" and "äD800" are one name; "ÄD801" is another.
    let replaced = merge(host.clone(), &[(lower.clone(), Some(os("x")))], true, Os::Windows);
    assert_eq!(replaced, [(other.clone(), os("2")), (lower.clone(), os("x"))]);
    let removed = merge(host, &[(lower, None)], true, Os::Windows);
    assert_eq!(removed, [(other, os("2"))]);
    // Only one-to-one BMP upper cases fold: ß stays ß, and 𐐨 (upper case 𐐀, outside the BMP) stays 𐐨.
    let kept = vars(&[("ß", "1"), ("𐐨", "2")]);
    assert_eq!(
        merge(kept.clone(), &[(os("SS"), None), (os("𐐀"), None)], true, Os::Windows),
        kept
    );
}

#[test]
fn invalid_strings_are_invalid_arguments_naming_the_field() {
    let cases: [(Request, &[&str]); 8] = [
        (request(|r| r.program = os("")), &["command is empty"]),
        (
            request(|r| r.program = os("to\0ol")),
            &["command \"to\\0ol\"", "NUL byte at byte 2"],
        ),
        (
            request(|r| r.args = vec![os("ok"), os("pa\0ss1234")]),
            &["args[1]", "byte 2"],
        ),
        (
            request(|r| r.cwd = Some(PathBuf::from("/tmp/\0"))),
            &["cwd \"/tmp/\\0\"", "byte 5"],
        ),
        (request(|r| r.env = vec![(os("K\0"), None)]), &["env name \"K\\0\""]),
        (
            request(|r| r.env = vec![(os("TOKEN"), Some(os("pa\0ss1234")))]),
            &["value of env \"TOKEN\"", "byte 2"],
        ),
        (request(|r| r.env = vec![(os(""), Some(os("v")))]), &["empty name"]),
        (
            request(|r| r.env = vec![(os("A=B"), Some(os("v")))]),
            &["env name \"A=B\" contains \"=\""],
        ),
    ];
    for (req, parts) in cases {
        let text = expect_err(check(&req, Os::Unix), ErrorCode::InvalidArgument, parts);
        assert!(!text.contains("1234"), "a secret leaked: {text}");
    }
}

#[test]
fn a_windows_drive_relative_command_is_refused() {
    for command in [r"C:bin\tool.exe", "c:tool.exe", "C:"] {
        let req = request(|r| r.program = os(command));
        let parts = [command, "drive's current directory", "full path"];
        expect_err(check(&req, Os::Windows), ErrorCode::InvalidArgument, &parts);
        // A Unix file name may well look like that.
        check(&req, Os::Unix).unwrap();
    }
}

#[test]
fn pty_sizes_and_durations_are_range_checked() {
    let pty = |cols, rows| request(|r| r.mode = Mode::Pty(PtySize { cols, rows }));
    check(&pty(1, 32767), Os::Unix).unwrap();
    let small = check(&pty(0, 24), Os::Unix);
    expect_err(
        small,
        ErrorCode::InvalidArgument,
        &["pty.cols is 0;", "from 1 to 32767"],
    );
    expect_err(
        check(&pty(80, 32768), Os::Unix),
        ErrorCode::InvalidArgument,
        &["pty.rows is 32768;"],
    );
    let max = Duration::from_millis(u64::from(u32::MAX));
    check(
        &request(|r| (r.timeout, r.grace) = (Some(max), Duration::ZERO)),
        Os::Unix,
    )
    .unwrap();
    // A fraction of a millisecond rounds up, here past the limit.
    let over = request(|r| r.timeout = Some(max + Duration::from_nanos(1)));
    expect_err(
        check(&over, Os::Unix),
        ErrorCode::InvalidArgument,
        &["timeoutMs is 4294967296;"],
    );
    let grace = check(&request(|r| r.grace = Duration::MAX), Os::Unix);
    expect_err(grace, ErrorCode::InvalidArgument, &["graceMs is"]);
}

#[test]
fn invalid_input_is_reported_before_anything_is_looked_up() {
    let req = request(|r| {
        r.program = os("surely-not-a-program");
        r.cwd = Some(PathBuf::from("surely/not/a/dir"));
        r.args = vec![os("a\0")];
    });
    expect_err(prepare(&req), ErrorCode::InvalidArgument, &["args[0]"]);
}

#[test]
fn cwd_resolves_against_the_host_cwd_and_must_be_a_directory() {
    let root = scratch("cwd");
    std::fs::create_dir(root.join("app")).unwrap();
    std::fs::write(root.join("file"), b"").unwrap();
    let host = || io::Result::Ok(root.clone());
    let cwd = |given: Option<&Path>| absolute(given, host, HOST).and_then(|dir| directory(given, dir));
    assert_eq!(cwd(None).unwrap(), root);
    assert_eq!(cwd(Some(Path::new("app"))).unwrap(), root.join("app"));
    let nope = root.join("nope").display().to_string();
    let missing = cwd(Some(Path::new("nope")));
    expect_err(
        missing,
        ErrorCode::InvalidCwd,
        &["cwd \"nope\"", &nope, "does not exist"],
    );
    expect_err(
        cwd(Some(Path::new("file"))),
        ErrorCode::InvalidCwd,
        &["is not a directory"],
    );
    // An absolute cwd never needs the host's; a relative one fails when the host's cannot be read.
    let app = root.join("app");
    assert_eq!(
        absolute(Some(&app), || Err(io::Error::other("unused")), HOST).unwrap(),
        app
    );
    let unreadable = absolute(Some(Path::new("app")), || Err(io::Error::other("gone")), HOST);
    expect_err(
        unreadable,
        ErrorCode::InvalidCwd,
        &["cwd \"app\" is relative", "gone", "absolute cwd"],
    );
    std::fs::remove_dir_all(&root).unwrap();
}

#[test]
fn windows_cwd_is_absolute_or_refused_before_the_host_cwd_is_read() {
    let host = || io::Result::Ok(PathBuf::from(r"C:\host"));
    let unread = || Err(io::Error::other("the host cwd was read"));
    let windows = |given: &str| absolute(Some(Path::new(given)), host, Os::Windows).unwrap();
    assert_eq!(absolute(None, host, Os::Windows).unwrap(), Path::new(r"C:\host"));
    assert_eq!(
        absolute(Some(Path::new(r"D:\proj")), unread, Os::Windows).unwrap(),
        Path::new(r"D:\proj")
    );
    let unc = Path::new(r"\\server\share\x");
    assert_eq!(absolute(Some(unc), unread, Os::Windows).unwrap(), unc);
    assert_eq!(windows(r"app\x"), Path::new(r"C:\host\app\x"));
    // Root-relative: the drive of the host's cwd, which a relative cwd resolves against.
    assert_eq!(windows(r"\work"), Path::new(r"C:\work"));
    for given in ["C:app", "d:"] {
        let refused = absolute(Some(Path::new(given)), unread, Os::Windows);
        expect_err(
            refused,
            ErrorCode::InvalidCwd,
            &[given, "drive's current directory", "full path"],
        );
    }
}

#[cfg(unix)]
#[test]
fn prepare_resolves_on_the_childs_final_path() {
    use std::os::unix::fs::PermissionsExt;
    let root = scratch("prepare");
    let bin = root.join("bin");
    std::fs::create_dir(&bin).unwrap();
    for (name, mode) in [("tool", 0o755), ("data", 0o644)] {
        std::fs::write(bin.join(name), b"#!/bin/sh\n").unwrap();
        std::fs::set_permissions(bin.join(name), std::fs::Permissions::from_mode(mode)).unwrap();
    }
    let req = |program: &str| {
        request(|r| {
            r.program = os(program);
            r.args = vec![os("--flag")];
            r.cwd = Some(root.clone());
            r.inherit_env = false;
            r.env = vec![(os("PATH"), Some(bin.clone().into_os_string()))];
        })
    };
    let spec = prepare(&req("tool")).unwrap();
    assert_eq!(spec.program, bin.join("tool"));
    assert_eq!(spec.argv, [os("tool"), os("--flag")]);
    assert_eq!(spec.env, [(os("PATH"), bin.clone().into_os_string())]);
    assert_eq!(spec.cwd, root);
    assert_eq!(prepare(&req("./bin/tool")).unwrap().program, root.join("./bin/tool"));
    expect_err(prepare(&req("data")), ErrorCode::NotExecutable, &["chmod +x"]);
    expect_err(prepare(&req("nope")), ErrorCode::NotFound, &["\"nope\""]);
    std::fs::remove_dir_all(&root).unwrap();
}

/// Regression (W03 r2): mode bits are not the rule. An owner-denied `0645` file early on PATH must not hide a
/// runnable one later, since the kernel would refuse it at exec.
#[cfg(unix)]
#[test]
fn an_owner_denied_file_does_not_hide_a_runnable_one_later_on_path() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let root = scratch("effective");
    for (dir, mode) in [("a", 0o645), ("b", 0o755)] {
        std::fs::create_dir(root.join(dir)).unwrap();
        let npm = root.join(dir).join("npm");
        std::fs::write(&npm, b"#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&npm, std::fs::Permissions::from_mode(mode)).unwrap();
    }
    let path = std::env::join_paths([root.join("a"), root.join("b")]).unwrap();
    let req = request(|r| {
        r.program = os("npm");
        r.cwd = Some(root.clone());
        r.inherit_env = false;
        r.env = vec![(os("PATH"), Some(path))];
    });
    // The kernel's rule: the owner needs the owner's execute bit; root needs any execute bit.
    let as_root = std::fs::metadata(&root).unwrap().uid() == 0;
    let expected = root.join(if as_root { "a" } else { "b" }).join("npm");
    assert_eq!(prepare(&req).unwrap().program, expected, "as root: {as_root}");
    std::fs::remove_dir_all(&root).unwrap();
}

#[cfg(windows)]
#[test]
fn prepare_finds_npm_cmd_on_the_childs_final_path() {
    let root = scratch("prepare");
    for name in ["npm", "npm.cmd"] {
        std::fs::write(root.join(name), b"").unwrap();
    }
    let req = request(|r| {
        r.program = os("npm");
        r.inherit_env = false;
        r.env = vec![(os("Path"), Some(root.clone().into_os_string()))];
    });
    let spec = prepare(&req).unwrap();
    assert_eq!(spec.program, root.join("npm.cmd"));
    assert!(spec.program.is_absolute() && spec.cwd.is_absolute());
    assert!(spec.env.iter().any(|(name, _)| name.eq_ignore_ascii_case("SystemRoot")));
    std::fs::remove_dir_all(&root).unwrap();
}
