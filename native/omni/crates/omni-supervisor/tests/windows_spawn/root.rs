//! The started root: born alone in its own Job, its stdio slots, inheritance limited to stdio, typed start
//! failures, full 32-bit exit codes, and a stable handle count.

use std::io::Write;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::Path;
use std::process::Stdio;

use omni_proto::{Ack, FailCode, Msg, Slot, Spawn};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{FILE_TYPE_CHAR, FILE_TYPE_PIPE};
use windows_sys::Win32::System::Threading::CreateEventW;

use super::host::{self, Host, Proc, Spec, child_cmd};
use super::{field, run, temp_dir};

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
        verbatim: None,
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
