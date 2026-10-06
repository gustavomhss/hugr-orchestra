//! SUP-W, spawning (ADR-0005 R5, R7; C-SPAWN-02): the root is born alone in its own Job, command lines are
//! byte-identical to `std::process` (differential), batch files run through cmd.exe with std's rules or are
//! refused with nothing run, stdio slots, inheritance limited to stdio, typed failures, stable handles.
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "windows_host.rs"]
pub mod host;

use std::ffi::OsString;
use std::io::Write;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use host::{Host, Proc, Spec, child_cmd};
use omni_proto::{Ack, FailCode, Msg, Slot, Spawn};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{FILE_TYPE_CHAR, FILE_TYPE_PIPE};
use windows_sys::Win32::System::Threading::CreateEventW;

/// Arguments that break naive quoting, cmd.exe, or both.
const ARGS: &[&str] = &[
    "",
    " ",
    "a b",
    "\t",
    "\"",
    "\"\"",
    "a\"b",
    "\"a b\"",
    "\\",
    "a\\",
    "a\\\\",
    "\\\"",
    "a\\\"b",
    "a b\\",
    "\\\\srv\\share\\",
    "%PATH%",
    "%",
    "%%",
    "%cd%",
    "!PATH!",
    "&echo INJECTED&",
    "|echo INJECTED",
    "a&b|c<d>e",
    "^",
    "x^&y",
    "(",
    ")",
    "@echo",
    "--",
    "/c",
    ";",
    ",",
    "=",
    "a=b",
    "'",
    "`",
    "$x",
    "*?",
    "é",
    "日本語",
    "😀",
];

fn temp_dir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("hugr-w06-{}-{tag}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// Exit code and every stdout line of a tree.
fn run(host: &mut Host, spec: Spec) -> (u32, Vec<String>) {
    let t = host.spawn(spec).unwrap();
    let lines = t.stdout.rest();
    (host.exited(t.id), lines)
}

fn run_std(cmd: &mut Command) -> (u32, Vec<String>) {
    let o = cmd.stdin(Stdio::null()).output().unwrap();
    let lines = String::from_utf8_lossy(&o.stdout).lines().map(str::to_string).collect();
    (o.status.code().unwrap() as u32, lines)
}

fn field<'a>(lines: &'a [String], prefix: &str) -> &'a str {
    lines
        .iter()
        .find(|l| l.starts_with(prefix))
        .unwrap_or_else(|| panic!("no `{prefix}` in {lines:?}"))
}

fn args_line(args: &[&str]) -> String {
    format!("ARGS {:?}", args.iter().map(OsString::from).collect::<Vec<_>>())
}

fn injected(lines: &[String]) -> bool {
    lines.iter().any(|l| l.trim() == "INJECTED")
}

#[test]
fn command_lines_are_identical_to_std_and_arguments_arrive_exactly() {
    let dir = temp_dir("cwd é 日");
    let argv: Vec<&str> = ["argv"].iter().chain(ARGS).copied().collect();
    let mut host = Host::start();
    let mut spec = Spec::child(&argv);
    spec.cwd = dir.clone();
    spec.env.push(("HUGR_W06".into(), "ü 日 %PATH%".into()));
    let (code, ours) = run(&mut host, spec);
    let (_, theirs) = run_std(child_cmd(&argv).current_dir(&dir).env("HUGR_W06", "ü 日 %PATH%"));
    assert_eq!(code, 0, "{ours:?}");
    assert_eq!(field(&ours, "ARGS "), args_line(ARGS));
    assert_eq!(
        field(&ours, "CMDLINE "),
        field(&theirs, "CMDLINE "),
        "differential: std built another line"
    );
    assert_eq!(field(&ours, "CWD "), field(&theirs, "CWD "));
    assert!(field(&ours, "CWD ").contains("cwd é 日"));
    assert_eq!(field(&ours, "ENV "), r#"ENV Some("ü 日 %PATH%")"#);
}

#[test]
fn batch_files_get_std_batch_quoting_and_metacharacters_stay_literal() {
    let dir = temp_dir("bat");
    let exe = std::env::current_exe().unwrap();
    let body = format!(
        "@\"{}\" host::child --exact --ignored --nocapture -- argv %*\r\n",
        exe.display()
    );
    let mut host = Host::start();
    for name in ["t.bat", "u.CMD"] {
        std::fs::write(dir.join(name), &body).unwrap();
        let (code, ours) = run(&mut host, Spec::program(&dir.join(name), ARGS));
        let (_, theirs) = run_std(Command::new(dir.join(name)).args(ARGS));
        assert_eq!(code, 0, "{name}: {ours:?}");
        assert_eq!(field(&ours, "ARGS "), args_line(ARGS), "{name}");
        assert_eq!(
            field(&ours, "CMDLINE "),
            field(&theirs, "CMDLINE "),
            "{name}: differential"
        );
        assert!(!injected(&ours), "{name}: {ours:?}");
    }
    // `v.bat.` opens `v.bat`: it must be treated as the batch file it is, never handed to CreateProcessW as a
    // program (which would run cmd.exe on the unescaped line). Whatever cmd.exe makes of the name, the result
    // is std's, and nothing is injected.
    std::fs::write(dir.join("v.bat"), &body).unwrap();
    let dotted = dir.join("v.bat.");
    let ours = run(&mut host, Spec::program(&dotted, ARGS));
    assert_eq!(ours, run_std(Command::new(&dotted).args(ARGS)), "differential");
    assert!(!injected(&ours.1), "{ours:?}");
}

#[test]
fn verbatim_batch_paths_run_as_std_runs_them_and_unconvertible_ones_are_refused() {
    let dir = temp_dir("verbatim");
    let exe = std::env::current_exe().unwrap();
    let body = format!(
        "@\"{}\" host::child --exact --ignored --nocapture -- argv %*\r\n",
        exe.display()
    );
    let mut host = Host::start();
    for name in ["x.bat", "x.cmd"] {
        std::fs::write(dir.join(name), &body).unwrap();
        // The canonical spelling is verbatim (`\\?\C:\…`), which cmd.exe cannot open as it is.
        let verbatim = std::fs::canonicalize(dir.join(name)).unwrap();
        assert!(verbatim.to_string_lossy().starts_with(r"\\?\"), "{verbatim:?}");
        let (code, ours) = run(&mut host, Spec::program(&verbatim, ARGS));
        let (_, theirs) = run_std(Command::new(&verbatim).args(ARGS));
        assert_eq!(code, 0, "{name}: {ours:?}");
        assert_eq!(field(&ours, "ARGS "), args_line(ARGS), "{name}");
        assert_eq!(
            field(&ours, "CMDLINE "),
            field(&theirs, "CMDLINE "),
            "{name}: differential"
        );
    }
    // Too long for a plain spelling (std would keep it verbatim, and cmd.exe could not run it): refused before
    // anything runs.
    let long = dir.join("d".repeat(240));
    std::fs::create_dir_all(&long).unwrap();
    let canary = dir.join("canary");
    std::fs::write(long.join("x.bat"), format!("@echo ran> \"{}\"\r\n", canary.display())).unwrap();
    let verbatim = std::fs::canonicalize(long.join("x.bat")).unwrap();
    match host.spawn(Spec::program(&verbatim, &["a"])) {
        Err((FailCode::Invalid, msg)) => assert!(msg.contains("verbatim"), "{msg}"),
        other => panic!("{:?}", other.map(|t| t.pid)),
    }
    assert!(!canary.exists(), "a refused spawn ran the batch file");
}

#[test]
fn batch_arguments_that_cannot_pass_literally_are_refused_and_nothing_runs() {
    let dir = temp_dir("refuse");
    let canary = dir.join("canary");
    let body = format!("@echo ran> \"{}\"\r\n", canary.display());
    std::fs::create_dir_all(dir.join("100%")).unwrap();
    for script in [dir.join("c.bat"), dir.join("100%").join("c.bat")] {
        std::fs::write(script, &body).unwrap();
    }
    let mut host = Host::start();
    let cases: [(PathBuf, &str); 3] = [
        (dir.join("c.bat"), "a\nb"),
        (dir.join("c.bat"), "a\rb"),
        (dir.join("100%").join("c.bat"), "plain"), // cmd.exe would expand `%` in the path
    ];
    for (script, arg) in cases {
        match host.spawn(Spec::program(&script, &[arg])) {
            Err((FailCode::Invalid, _)) => {}
            other => panic!("{arg:?}: {:?}", other.map(|t| t.pid)),
        }
    }
    let e = Command::new(dir.join("c.bat")).arg("a\nb").spawn().unwrap_err();
    assert_eq!(
        e.kind(),
        std::io::ErrorKind::InvalidInput,
        "differential: std refuses it too"
    );
    assert!(!canary.exists(), "a refused spawn ran the batch file");
    // Control: the canary appears when the script does run.
    assert_eq!(run(&mut host, Spec::program(&dir.join("c.bat"), &["ok"])).0, 0);
    assert!(canary.exists());
}

#[test]
fn the_root_is_born_alone_in_its_own_job_which_refuses_breakaway() {
    let mut host = Host::start();
    let t = host.spawn(Spec::child(&["job"])).unwrap();
    assert_eq!(
        t.stdout.line("JOB "),
        "JOB active=1 kill=true breakaway=false escape=refused:5"
    );
    assert_eq!(host.exited(t.id), 0);
}

#[test]
fn stdio_slots_are_nul_pipe_and_merge() {
    let mut host = Host::start();
    // A null stdin is the NUL device (a character file), never a NULL handle.
    let (_, lines) = run(&mut host, Spec::child(&["stdin"]));
    assert_eq!(field(&lines, "STDIN "), format!("STDIN kind={FILE_TYPE_CHAR} bytes=0"));
    let mut spec = Spec::child(&["stdin"]);
    spec.stdin = Slot::Pipe;
    let mut t = host.spawn(spec).unwrap();
    t.stdin.take().unwrap().write_all(b"hello").unwrap();
    assert_eq!(t.stdout.line("STDIN "), format!("STDIN kind={FILE_TYPE_PIPE} bytes=5"));
    let mut spec = Spec::child(&["both"]);
    spec.stderr = Slot::Merge;
    let (_, lines) = run(&mut host, spec);
    assert!(
        lines.contains(&"OUT".into()) && lines.contains(&"ERR".into()),
        "{lines:?}"
    );
    let t = host.spawn(Spec::child(&["both"])).unwrap();
    assert_eq!(t.stderr.as_ref().unwrap().line("ERR"), "ERR");
    assert!(!t.stdout.rest().contains(&"ERR".into()));
}

#[test]
fn the_child_inherits_its_stdio_and_nothing_else() {
    // An inheritable handle in the host. std::process hands it to the supervisor (control 1) and to its own
    // children (control 2); HANDLE_LIST must keep it from the supervisor's child.
    let sa = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        bInheritHandle: 1,
        ..Default::default()
    };
    // SAFETY: an anonymous event with inheritable attributes.
    let leak = unsafe { OwnedHandle::from_raw_handle(CreateEventW(&sa, 1, 0, std::ptr::null())) };
    let value = leak.as_raw_handle() as usize;
    let mut host = Host::start();
    let t = host.spawn(Spec::child(&["chain", "0", "0", "0", "0"])).unwrap();
    t.stdout.line("READY");
    assert!(
        host.sup_proc().holds(value, &leak),
        "control: the supervisor inherited the handle"
    );
    let mut plain = child_cmd(&["chain", "0", "0", "0", "0"])
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    assert!(
        Proc::open(plain.id()).holds(value, &leak),
        "control: a std::process child inherits it"
    );
    plain.kill().unwrap();
    plain.wait().unwrap();
    assert!(
        !t.root.holds(value, &leak),
        "the supervisor's child inherited a handle outside its stdio"
    );
}

#[test]
fn start_failures_are_typed_and_handles_are_validated() {
    let dir = temp_dir("fail");
    std::fs::write(dir.join("text.txt"), "not a program").unwrap();
    let mut host = Host::start();
    let mut code = |spec: Spec| host.spawn(spec).err().map(|e| e.0);
    assert_eq!(
        code(Spec::program(&dir.join("missing.exe"), &[])),
        Some(FailCode::NotFound)
    );
    assert_eq!(
        code(Spec::program(&dir.join("text.txt"), &[])),
        Some(FailCode::NotExecutable)
    );
    let mut spec = Spec::child(&["exit", "0"]);
    spec.cwd = dir.join("missing");
    assert_eq!(code(spec), Some(FailCode::BadCwd));
    let mut spec = Spec::child(&["exit", "0"]);
    spec.argv.push("a\0b".into());
    assert_eq!(code(spec), Some(FailCode::Invalid));
    assert_eq!(
        code(Spec::program(Path::new("relative.exe"), &[])),
        Some(FailCode::Invalid)
    );
    // stdout is always a pipe: a Spawn without its handle is refused.
    let reply = host.call(|req| raw_spawn(req, Slot::Merge, [0; 3]));
    assert!(
        matches!(
            reply,
            Msg::SpawnFailed {
                code: FailCode::Invalid,
                ..
            }
        ),
        "{reply:?}"
    );
    repeated_pipe_is_refused_and_closed(&mut host);
}

/// A `Spawn` of this test binary with hand-made stdio slots.
fn raw_spawn(req: u64, stderr: Slot, handles: [u64; 3]) -> Msg {
    let me = std::env::current_exe().unwrap().into_os_string().into_encoded_bytes();
    Msg::Spawn(Spawn {
        req,
        program: me.clone(),
        argv: vec![me],
        env: Vec::new(),
        cwd: b"C:\\".to_vec(),
        pty: None,
        stdin: Slot::Null,
        stderr,
        grace_ms: 0,
        handles,
    })
}

/// One transferred pipe named in both the stdout and stderr slots: refused, and closed exactly once by the
/// supervisor, so the host's read end sees EOF.
fn repeated_pipe_is_refused_and_closed(host: &mut Host) {
    let (r, w) = host::pipe();
    let v = host.give(w);
    let reply = host.call(|req| raw_spawn(req, Slot::Pipe, [0, v, v]));
    assert!(
        matches!(
            reply,
            Msg::SpawnFailed {
                code: FailCode::Invalid,
                ..
            }
        ),
        "{reply:?}"
    );
    assert_eq!(
        host::Lines::new(std::fs::File::from(r)).rest(),
        Vec::<String>::new(),
        "EOF"
    );
}

#[test]
fn exit_codes_arrive_as_full_32_bit_values() {
    let mut host = Host::start();
    for code in [0u32, 42, 3221225786] {
        let t = host.spawn(Spec::child(&["exit", &code.to_string()])).unwrap();
        assert_eq!(host.exited(t.id), code);
    }
}

#[test]
fn handle_count_is_stable_across_spawns_stops_and_failures() {
    let dir = temp_dir("handles");
    let mut host = Host::start();
    let cycle = |host: &mut Host| {
        let t = host.spawn(Spec::child(&["exit", "0"])).unwrap();
        assert_eq!(host.exited(t.id), 0);
        host.stop(t.id, 0);
        assert!(matches!(
            host.call(|req| Msg::Release { req, id: t.id }),
            Msg::Ack { result: Ack::Ok, .. }
        ));
        // Failures after the stdio handles were transferred: the supervisor must close them.
        assert!(host.spawn(Spec::program(&dir.join("missing.exe"), &[])).is_err());
        let mut spec = Spec::child(&["exit", "0"]);
        spec.stdin = Slot::Pipe;
        spec.cwd = dir.join("missing");
        assert!(host.spawn(spec).is_err());
        repeated_pipe_is_refused_and_closed(host);
    };
    cycle(&mut host);
    let before = host.handle_count();
    for _ in 0..30 {
        cycle(&mut host);
    }
    let after = host.handle_count();
    assert!(
        after <= before + 3,
        "supervisor handles grew from {before} to {after} over 30 cycles"
    );
}
