//! Windows bootstrap (R7): nothing the bootstrap creates is inheritable, the started supervisor inherits no
//! host handle (proved on a helper that is alive through the inspection, against a control that does
//! inherit), the pipe has one instance, only the started pid connects, and a stuck supervisor is terminated
//! after its window (Codex r1 findings 4 and 6, r2 finding 3). Helpers stay alive on a named event, never
//! on stdin.
//!
//! Run them all with the test filter `client::tests::windows` (the helper itself is `#[ignore]`d).
//!
//! Mutation probe for the inheritance proof (Windows CI): pass `TRUE` as `bInheritHandles` in
//! `client::windows::create_process`; `the_bootstrap_creates_no_inheritable_handle` must then fail with
//! "the started process inherited a host handle".

use std::ffi::OsStr;
use std::fs::OpenOptions;
use std::io::Write;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle};
use std::process::{Command, Stdio};
use std::ptr::{null, null_mut};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    CompareObjectHandles, DUPLICATE_SAME_ACCESS, DuplicateHandle, FALSE, GetHandleInformation, HANDLE,
    HANDLE_FLAG_INHERIT, TRUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::System::Threading::{
    CreateEventW, EVENT_MODIFY_STATE, GetCurrentProcess, OpenEventW, SYNCHRONIZATION_SYNCHRONIZE, SetEvent,
    TerminateProcess, WaitForSingleObject,
};

use super::{BOUND, LIMIT, READY, assert_io, rt};
use crate::client::channel::Gen;
use crate::client::windows::{Chan, create_process, server};

const IDLE: &str = "client::tests::windows::idle_child";
/// Prefix of a helper's event names; the base name rides on its command line as a second test filter,
/// which matches nothing with `--exact`. `<base>-up`: set by the helper once it runs. `<base>-go`: set by
/// the parent when the helper may exit (it holds no stdin, so only this event keeps it alive).
const MARK: &str = r"Local\hugr-omni-test-helper-";
/// A helper whose parent never sets `-go` (it died, or the test terminates it) gives up after this.
const HELPER_LIFE_MS: u32 = 120_000;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn limit_ms() -> u32 {
    u32::try_from(LIMIT.as_millis()).unwrap()
}

/// A named, non-inheritable auto-reset event (`open`: an existing one, for signalling).
fn event(name: &str, open: bool) -> OwnedHandle {
    let name = wide(name);
    // SAFETY: null attributes (not inheritable), auto-reset, not signalled; the name is NUL-terminated.
    let h = unsafe {
        match open {
            false => CreateEventW(null(), FALSE, FALSE, name.as_ptr()),
            true => OpenEventW(EVENT_MODIFY_STATE | SYNCHRONIZATION_SYNCHRONIZE, FALSE, name.as_ptr()),
        }
    };
    assert!(!h.is_null(), "CreateEventW / OpenEventW");
    // SAFETY: a fresh handle that nothing else owns.
    unsafe { OwnedHandle::from_raw_handle(h) }
}

/// The parent's side of a helper: its `-up` and `-go` events, opened by the helper by name.
struct Helper {
    up: OwnedHandle,
    go: OwnedHandle,
    base: String,
}

impl Helper {
    fn new(tag: &str) -> Helper {
        let base = format!("{MARK}{}-{tag}", std::process::id());
        Helper {
            up: event(&format!("{base}-up"), false),
            go: event(&format!("{base}-go"), false),
            base,
        }
    }

    /// Starts the helper with `start` and waits (bounded) until it runs.
    fn start<T>(&self, start: impl FnOnce(&[&OsStr; 4]) -> T) -> T {
        let args: [&OsStr; 4] = [
            IDLE.as_ref(),
            self.base.as_ref(),
            "--exact".as_ref(),
            "--ignored".as_ref(),
        ];
        let helper = start(&args);
        // SAFETY: waits on our own event handle.
        let r = unsafe { WaitForSingleObject(self.up.as_raw_handle(), limit_ms()) };
        assert_eq!(r, WAIT_OBJECT_0, "the helper never said it started");
        helper
    }

    /// Lets the helper exit.
    fn release(&self) {
        // SAFETY: signals our own event handle.
        assert_ne!(unsafe { SetEvent(self.go.as_raw_handle()) }, 0, "SetEvent");
    }
}

fn alive(process: RawHandle) -> bool {
    // SAFETY: a zero-timeout wait on a valid process handle.
    unsafe { WaitForSingleObject(process, 0) == WAIT_TIMEOUT }
}

fn inheritable(h: RawHandle) -> bool {
    let mut flags = 0;
    // SAFETY: `h` is a valid handle for the call and `flags` is writable.
    let ok = unsafe { GetHandleInformation(h, &mut flags) };
    assert_ne!(ok, 0, "GetHandleInformation");
    flags & HANDLE_FLAG_INHERIT != 0
}

/// True if `process` holds, at the value `v`, the same object as our handle `v`.
fn holds(process: RawHandle, v: RawHandle) -> bool {
    let mut copy: HANDLE = null_mut();
    // SAFETY: copies whatever `process` has at `v` into this process; fails if it has nothing there.
    let ok = unsafe {
        DuplicateHandle(
            process,
            v,
            GetCurrentProcess(),
            &mut copy,
            0,
            FALSE,
            DUPLICATE_SAME_ACCESS,
        )
    };
    if ok == 0 {
        return false;
    }
    // SAFETY: DuplicateHandle created `copy` for us.
    let copy = unsafe { OwnedHandle::from_raw_handle(copy) };
    // SAFETY: both handles are valid for the call.
    unsafe { CompareObjectHandles(copy.as_raw_handle(), v) != 0 }
}

/// Not a test: the helper process. Says it runs (`-up`), then stays alive until its parent sets `-go`,
/// terminates it, or `HELPER_LIFE_MS` passes. It never reads stdin: started with no inherited handles it
/// has none, and a read would return at once.
#[test]
#[ignore = "helper process of the Windows bootstrap tests"]
fn idle_child() {
    let Some(base) = std::env::args().find(|a| a.starts_with(MARK)) else {
        return;
    };
    let (up, go) = (event(&format!("{base}-up"), true), event(&format!("{base}-go"), true));
    // SAFETY: signals the parent's event through our own handle.
    assert_ne!(unsafe { SetEvent(up.as_raw_handle()) }, 0, "SetEvent");
    // SAFETY: waits on our own handle to the parent's event.
    unsafe { WaitForSingleObject(go.as_raw_handle(), HELPER_LIFE_MS) };
}

#[test]
fn the_bootstrap_creates_no_inheritable_handle() {
    let mut planted: HANDLE = null_mut();
    // SAFETY: duplicates the current-process pseudo handle into a real, inheritable handle we own: what a
    // careless host may hold when the supervisor starts.
    let ok = unsafe {
        let me = GetCurrentProcess();
        DuplicateHandle(me, me, me, &mut planted, 0, TRUE, DUPLICATE_SAME_ACCESS)
    };
    assert_ne!(ok, 0, "DuplicateHandle");
    // SAFETY: a fresh handle that nothing else owns.
    let planted = unsafe { OwnedHandle::from_raw_handle(planted) };
    let name = format!(r"\\.\pipe\hugr-omni-test-boot-{}", std::process::id());
    let pipe = {
        let _ctx = rt().enter();
        server(&name).expect("pipe server")
    };
    assert!(!inheritable(pipe.as_raw_handle()), "the pipe server is inheritable");
    let squatter = {
        let _ctx = rt().enter();
        server(&name)
    };
    assert!(squatter.is_err(), "a second instance of the pipe was created");
    let exe = std::env::current_exe().unwrap();
    let ours = Helper::new("ours");
    let (started, _pid) = ours.start(|args| create_process(&exe, args).expect("CreateProcessW"));
    let theirs = Helper::new("control");
    let mut control = theirs.start(|args| Command::new(&exe).args(args).stdin(Stdio::null()).spawn().unwrap());
    // Both helpers are alive through the inspection: they wait for `-go`, set only after it.
    let leaked = holds(started.as_raw_handle(), planted.as_raw_handle());
    let seen = holds(control.as_raw_handle(), planted.as_raw_handle());
    let (started_alive, control_alive) = (alive(started.as_raw_handle()), alive(control.as_raw_handle()));
    ours.release();
    theirs.release();
    let _ = control.wait();
    // SAFETY: waits on our own handle to the helper we started, bounded.
    let ended = unsafe { WaitForSingleObject(started.as_raw_handle(), limit_ms()) };
    if ended != WAIT_OBJECT_0 {
        // SAFETY: ends the helper we started, so a failed test leaves nothing running.
        unsafe { TerminateProcess(started.as_raw_handle(), 1) };
    }
    assert!(
        started_alive && control_alive,
        "a helper died before its inspection: the proof would be vacuous"
    );
    assert!(
        !inheritable(started.as_raw_handle()),
        "the supervisor's process handle is inheritable"
    );
    assert!(
        seen,
        "control: a child started with bInheritHandles = TRUE must see the planted handle"
    );
    assert!(!leaked, "the started process inherited a host handle");
}

#[test]
fn only_the_started_process_may_connect() {
    let name = format!(r"\\.\pipe\hugr-omni-test-impostor-{}", std::process::id());
    let pipe = {
        let _ctx = rt().enter();
        server(&name).expect("pipe server")
    };
    let mut impostor = OpenOptions::new().read(true).write(true).open(&name).expect("connect");
    let mut ready = Vec::new();
    omni_proto::encode(&READY, &mut ready).unwrap();
    impostor.write_all(&ready).unwrap();
    let started = Gen::start(rt(), 1, BOUND, move || {
        Chan::new(pipe, super::platform::me(), u32::MAX, false)
    });
    assert_io(started, "connected instead of process 4294967295");
}

/// Finding 4: a supervisor that does not exit once its channel closes (the helper never reads it) is
/// terminated through its process handle after the cooperative window.
#[test]
fn a_stuck_supervisor_is_terminated_after_its_window() {
    let window = Duration::from_millis(1000);
    let exe = std::env::current_exe().unwrap();
    let stuck = Helper::new("stuck"); // never released: only the termination can end it
    let (helper, _pid) = stuck.start(|args| create_process(&exe, args).expect("CreateProcessW"));
    let watch = helper.try_clone().unwrap();
    let name = format!(r"\\.\pipe\hugr-omni-test-stuck-{}", std::process::id());
    let pipe = {
        let _ctx = rt().enter();
        server(&name).expect("pipe server")
    };
    let mut peer = OpenOptions::new().read(true).write(true).open(&name).expect("connect");
    let mut ready = Vec::new();
    omni_proto::encode(&READY, &mut ready).unwrap();
    peer.write_all(&ready).unwrap();
    let me = std::process::id();
    let sup = Gen::start(rt(), 1, window, move || Chan::new(pipe, helper, me, true)).unwrap();
    assert!(
        alive(watch.as_raw_handle()),
        "the stand-in supervisor exited on its own: the test would be vacuous"
    );
    let t0 = Instant::now();
    sup.die("the test declared it stuck".into());
    // SAFETY: waits on our own duplicate of the helper's process handle.
    let r = unsafe { WaitForSingleObject(watch.as_raw_handle(), limit_ms()) };
    if r != WAIT_OBJECT_0 {
        // SAFETY: ends the helper we started, so a failed test leaves nothing running.
        unsafe { TerminateProcess(watch.as_raw_handle(), 1) };
    }
    assert_eq!(r, WAIT_OBJECT_0, "the stuck supervisor was not terminated");
    assert!(t0.elapsed() >= window, "terminated before its cooperative window");
    drop(peer);
}
