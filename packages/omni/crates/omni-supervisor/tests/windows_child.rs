//! The child program of the Windows supervisor suite (SUP-W), included as `host::kid` by
//! `windows_host.rs`: the test binary re-run through its `host::child` test, so the suite needs no other
//! binary. Every marker is one line written with one write call.
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::ffi::OsString;
use std::io::{Read, Write};
use std::os::windows::ffi::OsStringExt;
use std::os::windows::io::{AsRawHandle, RawHandle};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Condvar, Mutex};

use windows_sys::Win32::Foundation::FILETIME;
use windows_sys::Win32::Storage::FileSystem::GetFileType;
use windows_sys::Win32::System::Console::{GetStdHandle, STD_INPUT_HANDLE, SetConsoleCtrlHandler};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_BREAKAWAY_OK, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JobObjectBasicAccountingInformation, JobObjectExtendedLimitInformation, QueryInformationJobObject,
};
use windows_sys::Win32::System::Threading::{CREATE_BREAKAWAY_FROM_JOB, GetCurrentProcess, GetProcessTimes};

/// The arguments that select `host::child` in the including test binary, then `--`.
pub const CHILD: [&str; 5] = ["host::child", "--exact", "--ignored", "--nocapture", "--"];

/// `child <args>` started by `std::process` (controls and sub-hosts).
pub fn child_cmd(args: &[&str]) -> Command {
    let mut c = Command::new(std::env::current_exe().unwrap());
    c.args(CHILD).args(args);
    c
}

/// Prints one marker line with one write.
pub fn out(line: &str) {
    let mut o = std::io::stdout().lock();
    o.write_all(format!("{line}\n").as_bytes()).unwrap();
    o.flush().unwrap();
}

#[link(name = "kernel32")]
unsafe extern "system" {
    // Not in the crate's windows-sys features; kernel32 is linked by std anyway.
    fn GetCommandLineW() -> *const u16;
}

unsafe extern "system" fn ignore_ctrl(_: u32) -> i32 {
    1
}

/// Runs one mode and exits:
/// - `argv <args>`: prints its raw command line, its arguments, cwd and `HUGR_W06`;
/// - `stdin`: reads stdin to EOF, prints the handle's file type and the byte count;
/// - `both`: `OUT` on stdout, `ERR` on stderr;
/// - `job`: prints its own Job's member count and limits, and whether a breakaway child was refused;
/// - `exit <code>`;
/// - `chain <level> <depth> <resist> <root-exits>`: a chain of descendants; each prints `PID <level> <pid>`,
///   the root prints `READY` (or exits, if asked); `resist` ignores CTRL_BREAK/C/CLOSE; all hang;
/// - `breed <log>`: prints `READY`; on CTRL_BREAK starts hanging descendants until it is killed, appending
///   `<pid> <creation time>` to `log` (one write) for each one as soon as it exists;
/// - `nest`: puts itself in a Job of its own (nested in the supervisor's), then runs `chain 0 2 0 0`.
pub fn run(args: &[OsString]) -> ! {
    let words: Vec<&str> = args.iter().map(|a| a.to_str().unwrap_or("")).collect();
    match words.as_slice() {
        ["argv", ..] => {
            // SAFETY: GetCommandLineW returns this process's NUL-terminated command line.
            let raw = unsafe {
                let p = GetCommandLineW();
                OsString::from_wide(std::slice::from_raw_parts(
                    p,
                    (0..).take_while(|&i| *p.add(i) != 0).count(),
                ))
            };
            out(&format!("CMDLINE {raw:?}"));
            out(&format!("ARGS {:?}", &args[1..]));
            out(&format!("CWD {:?}", std::env::current_dir().unwrap()));
            out(&format!("ENV {:?}", std::env::var_os("HUGR_W06")));
        }
        ["stdin"] => {
            // SAFETY: plain queries on this process's stdin.
            let kind = unsafe { GetFileType(GetStdHandle(STD_INPUT_HANDLE)) };
            let mut buf = Vec::new();
            std::io::stdin().read_to_end(&mut buf).unwrap();
            out(&format!("STDIN kind={kind} bytes={}", buf.len()));
        }
        ["both"] => {
            out("OUT");
            eprintln!("ERR");
        }
        ["job"] => job(),
        ["exit", code] => std::process::exit(code.parse::<u32>().unwrap() as i32),
        ["chain", level, depth, resist, root_exits] => chain(level.parse().unwrap(), depth, resist, root_exits),
        ["breed", log] => breed(log),
        ["nest"] => {
            // A Job of its own inside the supervisor's, as cargo makes one: its descendants are in both.
            // SAFETY: an anonymous Job and the current-process pseudo handle; the Job handle is kept open.
            unsafe {
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                assert!(!job.is_null());
                assert_ne!(AssignProcessToJobObject(job, GetCurrentProcess()), 0);
            }
            chain(0, "2", "0", "0")
        }
        other => panic!("unknown child mode {other:?}"),
    }
    std::process::exit(0)
}

fn job() {
    let mut acct = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
    let mut lim = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    let null = std::ptr::null_mut();
    // SAFETY: a null Job is the caller's innermost Job; each structure matches its class and size.
    unsafe {
        let n = size_of_val(&acct) as u32;
        assert_ne!(
            QueryInformationJobObject(
                null,
                JobObjectBasicAccountingInformation,
                (&raw mut acct).cast(),
                n,
                null.cast()
            ),
            0
        );
        let n = size_of_val(&lim) as u32;
        assert_ne!(
            QueryInformationJobObject(
                null,
                JobObjectExtendedLimitInformation,
                (&raw mut lim).cast(),
                n,
                null.cast()
            ),
            0
        );
    }
    let flags = lim.BasicLimitInformation.LimitFlags;
    let escape = match child_cmd(&["exit", "0"])
        .creation_flags(CREATE_BREAKAWAY_FROM_JOB)
        .status()
    {
        Ok(_) => "escaped".to_string(),
        Err(e) => format!("refused:{}", e.raw_os_error().unwrap_or(0)),
    };
    out(&format!(
        "JOB active={} kill={} breakaway={} escape={escape}",
        acct.ActiveProcesses,
        flags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE != 0,
        flags & (JOB_OBJECT_LIMIT_BREAKAWAY_OK | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK) != 0
    ));
}

static BREAK_SEEN: Mutex<bool> = Mutex::new(false);
static BREAK: Condvar = Condvar::new();

unsafe extern "system" fn start_breeding(_: u32) -> i32 {
    *BREAK_SEEN.lock().unwrap() = true;
    BREAK.notify_all();
    1 // handled: the root lives on until it is forced
}

/// The barrier: nothing is started before the graceful stop's CTRL_BREAK arrives; from then on descendants
/// (hanging `chain`s) are started one after another until the Job is terminated. Each one is logged here as
/// soon as it exists, never by itself: on a slow machine the descendants of this unthrottled loop may never
/// get to run before the deadline (W06b: 875 created, 46 started, on GitLab's 2-vCPU runner), and the oracle
/// must cover the ones the Job's termination caught still starting.
fn breed(log: &str) -> ! {
    // SAFETY: a handler that lives as long as the process.
    unsafe { SetConsoleCtrlHandler(Some(start_breeding), 1) };
    let log = log.to_string();
    std::thread::spawn(move || {
        drop(BREAK.wait_while(BREAK_SEEN.lock().unwrap(), |seen| !*seen).unwrap());
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .create(true)
            .open(&log)
            .unwrap();
        while let Ok(mut c) = child_cmd(&["chain", "0", "0", "0", "0"]).stdout(Stdio::null()).spawn() {
            let line = format!("{} {}\n", c.id(), created(c.as_raw_handle()));
            file.write_all(line.as_bytes()).unwrap();
            std::thread::spawn(move || c.wait());
        }
    });
    out("READY");
    loop {
        std::thread::park();
    }
}

/// A process's creation time (FILETIME as one number).
fn created(process: RawHandle) -> u64 {
    let mut times = [FILETIME::default(); 4];
    let [c, e, k, u] = &mut times;
    // SAFETY: a process handle with query access and four valid out pointers.
    assert_ne!(unsafe { GetProcessTimes(process, c, e, k, u) }, 0);
    u64::from(c.dwHighDateTime) << 32 | u64::from(c.dwLowDateTime)
}

fn chain(level: u32, depth: &str, resist: &str, root_exits: &str) -> ! {
    if resist == "1" {
        // SAFETY: a handler that lives as long as the process.
        unsafe { SetConsoleCtrlHandler(Some(ignore_ctrl), 1) };
    }
    let mut next = (level < depth.parse().unwrap()).then(|| {
        child_cmd(&["chain", &(level + 1).to_string(), depth, resist, "0"])
            .spawn()
            .unwrap()
    });
    if level > 0 {
        out(&format!("PID {level} {}", std::process::id()));
    } else if root_exits == "1" {
        std::process::exit(0);
    } else {
        out("READY");
    }
    if let Some(c) = next.as_mut() {
        let _ = c.wait(); // never returns while the chain hangs
    }
    loop {
        std::thread::park();
    }
}
