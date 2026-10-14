//! `find` with a fake file system, under both OS rule sets, on any OS.

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};

use super::{expect_err, vars};
use crate::error::{Error, ErrorCode};
use crate::spawn::Os;
use crate::spawn::resolve::{Entry, find};

const EXE: Result<Entry, ErrorKind> = Ok(Entry::File { executable: true });
const DATA: Result<Entry, ErrorKind> = Ok(Entry::File { executable: false });
const DIR: Result<Entry, ErrorKind> = Ok(Entry::Dir);

/// A fake file system: the listed paths (an entry, or the error asking about it gives); everything else is
/// missing (`NotFound`).
fn fs(entries: &[(PathBuf, Result<Entry, ErrorKind>)]) -> impl Fn(&Path) -> io::Result<Entry> + use<> {
    let map: HashMap<PathBuf, Result<Entry, ErrorKind>> = entries.iter().cloned().collect();
    move |path| match map.get(path) {
        Some(Ok(entry)) => Ok(*entry),
        Some(Err(kind)) => Err(io::Error::from(*kind)),
        None => Err(io::Error::from(ErrorKind::NotFound)),
    }
}

fn unix(
    name: &str,
    env: &[(OsString, OsString)],
    probe: impl Fn(&Path) -> io::Result<Entry>,
) -> Result<PathBuf, Error> {
    find(OsStr::new(name), env, Path::new("/proj"), Os::Unix, probe)
}

fn windows(
    name: &str,
    env: &[(OsString, OsString)],
    probe: impl Fn(&Path) -> io::Result<Entry>,
) -> Result<PathBuf, Error> {
    find(OsStr::new(name), env, Path::new(r"D:\proj"), Os::Windows, probe)
}

#[test]
fn a_bare_name_is_the_first_runnable_file_on_the_childs_path() {
    let (a, b) = (Path::new("/a"), Path::new("/b"));
    let env = vars(&[("PATH", "/a:/b")]);
    let probe = fs(&[
        (a.join("both"), EXE),
        (b.join("both"), EXE),
        (a.join("data"), DATA),
        (b.join("data"), EXE),
        (a.join("dir"), DIR),
        (b.join("plain"), DATA),
    ]);
    assert_eq!(unix("both", &env, &probe).unwrap(), a.join("both"));
    // A file that cannot run is skipped, like execvp does ...
    assert_eq!(unix("data", &env, &probe).unwrap(), b.join("data"));
    // ... and is the answer when nothing runs.
    expect_err(
        unix("dir", &env, &probe),
        ErrorCode::NotExecutable,
        &["\"dir\"", "is a directory"],
    );
    let plain = b.join("plain").display().to_string();
    let parts = [plain.as_str(), "no execute permission", "chmod +x"];
    expect_err(unix("plain", &env, &probe), ErrorCode::NotExecutable, &parts);
}

#[test]
fn a_missing_program_or_path_is_not_found_saying_so() {
    let nothing = fs(&[]);
    let parts = ["\"npm\"", "has no PATH", "inheritEnv", "Set PATH in env"];
    expect_err(unix("npm", &[], &nothing), ErrorCode::NotFound, &parts);
    let empty = unix("npm", &vars(&[("PATH", "::")]), &nothing);
    expect_err(empty, ErrorCode::NotFound, &["PATH (\"::\") names no directory"]);
    let parts = ["\"npm\"", "PATH (\"/a\")", "Install it", "full path"];
    expect_err(
        unix("npm", &vars(&[("PATH", "/a")]), &nothing),
        ErrorCode::NotFound,
        &parts,
    );
}

#[test]
fn a_path_with_a_separator_resolves_against_cwd_and_never_uses_path() {
    let cwd = Path::new("/proj");
    let probe = fs(&[
        (cwd.join("bin/tool"), EXE),
        (cwd.join("node_modules/.bin").join("jest"), EXE),
    ]);
    assert_eq!(unix("bin/tool", &[], &probe).unwrap(), cwd.join("bin/tool"));
    let parts = ["\"bin/nope\"", "resolves against cwd"];
    expect_err(unix("bin/nope", &[], &probe), ErrorCode::NotFound, &parts);
    // A relative PATH directory resolves against cwd too.
    let env = vars(&[("PATH", "node_modules/.bin")]);
    assert_eq!(
        unix("jest", &env, &probe).unwrap(),
        cwd.join("node_modules/.bin").join("jest")
    );
}

#[test]
fn file_system_errors_are_refusals_or_io_never_missing() {
    let (a, b) = (Path::new("/a"), Path::new("/b"));
    let env = vars(&[("PATH", "/a:/b")]);
    let probe = fs(&[
        (a.join("tool"), Err(ErrorKind::PermissionDenied)),
        (b.join("tool"), EXE),
        (a.join("locked"), Err(ErrorKind::PermissionDenied)),
        (a.join("sub"), Err(ErrorKind::NotADirectory)),
        (b.join("sub"), EXE),
        (a.join("broken"), Err(ErrorKind::InvalidData)),
        (b.join("broken"), EXE),
    ]);
    // Permission denied is skipped like execvp's EACCES, and is the answer when nothing runs.
    assert_eq!(unix("tool", &env, &probe).unwrap(), b.join("tool"));
    let locked = a.join("locked").display().to_string();
    let parts = [
        locked.as_str(),
        "could not be accessed (permission denied)",
        "Give the host's user access",
    ];
    expect_err(unix("locked", &env, &probe), ErrorCode::NotExecutable, &parts);
    // A PATH entry that is a file is passed over, as by execvp.
    assert_eq!(unix("sub", &env, &probe).unwrap(), b.join("sub"));
    // Any other error ends the lookup, naming the path and the error.
    let broken = a.join("broken").display().to_string();
    let parts = ["\"broken\" could not be looked up", broken.as_str(), "invalid data"];
    expect_err(unix("broken", &env, &probe), ErrorCode::Io, &parts);
}

#[test]
fn windows_finds_npm_cmd_through_pathext() {
    // npm installs an extensionless shell script beside npm.cmd; only the latter can start.
    let probe = fs(&[
        (PathBuf::from(r"C:\nodejs\npm"), EXE),
        (PathBuf::from(r"C:\nodejs\npm.cmd"), EXE),
        (PathBuf::from(r"C:\nodejs\node.exe"), EXE),
    ]);
    // PATH and PATHEXT under any case; without PATHEXT the default list applies.
    let npm = Path::new(r"C:\nodejs\npm.cmd");
    assert_eq!(windows("npm", &vars(&[("Path", r"C:\nodejs")]), &probe).unwrap(), npm);
    let pathext = vars(&[("Path", r"C:\nodejs"), ("PathExt", ".EXE;.CMD")]);
    assert_eq!(windows("npm", &pathext, &probe).unwrap(), npm);
    // PATHEXT is honored, not assumed: without .CMD there is no npm.
    let exe_only = vars(&[("PATH", r"C:\nodejs"), ("PATHEXT", ".EXE")]);
    let parts = ["\"npm\"", r#"PATH ("C:\nodejs")"#, "PATHEXT extensions .exe"];
    expect_err(windows("npm", &exe_only, &probe), ErrorCode::NotFound, &parts);
    // A name with an extension is tried as written.
    let node = windows("node.exe", &vars(&[("PATH", r"C:\nodejs")]), &probe).unwrap();
    assert_eq!(node, Path::new(r"C:\nodejs\node.exe"));
}

#[test]
fn windows_starts_only_exe_com_bat_cmd() {
    let probe = fs(&[
        (PathBuf::from(r"C:\py\x.py"), EXE),
        (PathBuf::from(r"D:\proj\tools\build.exe"), EXE),
    ]);
    let env = vars(&[("PATH", r"C:\py"), ("PATHEXT", ".EXE;.PY")]);
    let parts = [r"C:\py\x.py", "Windows cannot start", "\"python\""];
    expect_err(windows("x", &env, &probe), ErrorCode::NotExecutable, &parts);
    assert_eq!(
        windows(r"tools\build", &env, &probe).unwrap(),
        Path::new(r"D:\proj\tools\build.exe")
    );
}

#[test]
fn windows_paths_resolve_against_the_childs_cwd_never_the_hosts() {
    // The child's cwd is D:\proj (the `windows` helper); the host's is somewhere on C:.
    let asked = RefCell::new(Vec::new());
    let files = fs(&[
        (PathBuf::from(r"D:\bin\tool.exe"), EXE),
        (PathBuf::from(r"D:\proj\bin\tool.exe"), EXE),
    ]);
    let probe = |path: &Path| {
        asked.borrow_mut().push(path.display().to_string());
        files(path)
    };
    // Root-relative: the drive of the child's cwd.
    assert_eq!(
        windows(r"\bin\tool.exe", &[], probe).unwrap(),
        Path::new(r"D:\bin\tool.exe")
    );
    assert_eq!(
        windows(r"bin\tool.exe", &[], probe).unwrap(),
        Path::new(r"D:\proj\bin\tool.exe")
    );
    // Drive-relative: refused before the file system is asked anything.
    asked.borrow_mut().clear();
    for command in [r"C:bin\tool.exe", "C:tool.exe"] {
        let parts = [command, "drive's current directory", "full path"];
        expect_err(windows(command, &[], probe), ErrorCode::InvalidArgument, &parts);
    }
    assert!(asked.borrow().is_empty());
    // PATH: quotes protect a `;`, a drive-relative entry is skipped, the others resolve against the child's cwd.
    let env = vars(&[("PATH", r#"C:rel;"D:\a;b";\shared;tools"#)]);
    expect_err(windows("x", &env, probe), ErrorCode::NotFound, &["\"x\""]);
    let bases = [r"D:\a;b\x", r"D:\shared\x", r"D:\proj\tools\x"];
    let expected: Vec<String> = bases
        .iter()
        .flat_map(|base| [".com", ".exe", ".bat", ".cmd"].map(|ext| format!("{base}{ext}")))
        .collect();
    assert_eq!(*asked.borrow(), expected);
}
