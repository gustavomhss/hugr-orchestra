//! Creating a root inside its own Job: `CreateProcessW` with one attribute list holding
//! `PROC_THREAD_ATTRIBUTE_JOB_LIST` (containment from the first instruction) and either `HANDLE_LIST`
//! (pipe root: it inherits exactly its stdio) or `PSEUDOCONSOLE` (terminal root: it inherits nothing).
//! Every handle the host transferred is closed on every path; a failure leaves nothing running.

use std::ffi::OsString;
use std::io;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::io::{AsRawHandle, FromRawHandle, HandleOrInvalid, OwnedHandle, RawHandle};
use std::path::{Path, PathBuf};
use std::time::Instant;

use omni_proto::{FailCode, Slot, Spawn};
use windows_sys::Win32::Foundation::{
    ERROR_ACCESS_DENIED, ERROR_BAD_EXE_FORMAT, ERROR_DIRECTORY, ERROR_EXE_MACHINE_TYPE_MISMATCH, ERROR_FILE_NOT_FOUND,
    ERROR_PATH_NOT_FOUND, GENERIC_READ, HANDLE, HANDLE_FLAG_INHERIT, SetHandleInformation,
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_TYPE_PIPE, GetFileType, OPEN_EXISTING,
};
use windows_sys::Win32::System::SystemInformation::GetSystemDirectoryW;
use windows_sys::Win32::System::Threading::{
    CREATE_NEW_PROCESS_GROUP, CREATE_UNICODE_ENVIRONMENT, CreateProcessW, DeleteProcThreadAttributeList,
    EXTENDED_STARTUPINFO_PRESENT, InitializeProcThreadAttributeList, LPPROC_THREAD_ATTRIBUTE_LIST,
    PROC_THREAD_ATTRIBUTE_HANDLE_LIST, PROC_THREAD_ATTRIBUTE_JOB_LIST, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
    PROCESS_INFORMATION, STARTF_USESTDHANDLES, STARTUPINFOEXW, UpdateProcThreadAttribute,
};

use super::{cmdline, job};
use crate::pty_windows::{self, ConPty, ConPtyEnds};

/// A started root; dropping it before it is recorded ends it (KILL_ON_JOB_CLOSE).
pub(super) struct Root {
    pub pid: u32,
    pub process: OwnedHandle,
    pub job: OwnedHandle,
    pub pty: Option<(ConPty, ConPtyEnds)>,
}

/// Why nothing was started.
pub(super) struct Failure {
    pub code: FailCode,
    pub errno: i32,
    pub msg: String,
}

fn invalid(msg: impl Into<String>) -> Failure {
    Failure {
        code: FailCode::Invalid,
        errno: 0,
        msg: msg.into(),
    }
}

fn os_failure(what: &str, e: &io::Error) -> Failure {
    let code = match e.raw_os_error().and_then(|c| u32::try_from(c).ok()) {
        Some(ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND) => FailCode::NotFound,
        Some(ERROR_ACCESS_DENIED | ERROR_BAD_EXE_FORMAT | ERROR_EXE_MACHINE_TYPE_MISMATCH) => FailCode::NotExecutable,
        Some(ERROR_DIRECTORY) => FailCode::BadCwd,
        _ => FailCode::Io,
    };
    Failure {
        code,
        errno: e.raw_os_error().unwrap_or(0),
        msg: format!("{what}: {e}"),
    }
}

fn text(bytes: &[u8], what: &str) -> Result<Vec<u16>, Failure> {
    cmdline::wide(bytes).ok_or_else(|| invalid(format!("{what} is not valid WTF-8 or contains NUL")))
}

/// Starts `s`. `channel` is the host pipe, which a transferred handle may never be. `watch` sees the Job
/// before any process exists in it.
pub(super) fn spawn(
    s: &Spawn,
    channel: RawHandle,
    watch: impl FnOnce(&OwnedHandle) -> io::Result<()>,
) -> Result<Root, Failure> {
    let stdio = take_stdio(s, channel)?;
    let program = text(&s.program, "program")?;
    let argv = s
        .argv
        .iter()
        .map(|a| text(a, "argument"))
        .collect::<Result<Vec<_>, _>>()?;
    let Some((argv0, args)) = argv.split_first() else {
        return Err(invalid("argv is empty"));
    };
    let program_path = PathBuf::from(OsString::from_wide(&program));
    if !program_path.is_absolute() {
        return Err(invalid(format!(
            "program {} is not an absolute path",
            program_path.display()
        )));
    }
    let cwd = text(&s.cwd, "cwd")?;
    let cwd_path = PathBuf::from(OsString::from_wide(&cwd));
    match std::fs::metadata(&cwd_path) {
        Ok(m) if m.is_dir() => {}
        Ok(_) => {
            return Err(os_failure(
                &cwd_path.display().to_string(),
                &io::Error::from_raw_os_error(ERROR_DIRECTORY as i32),
            ));
        }
        Err(e) => {
            return Err(Failure {
                code: FailCode::BadCwd,
                ..os_failure(&cwd_path.display().to_string(), &e)
            });
        }
    }
    // A batch file never reaches CreateProcessW by name (it would start cmd.exe with our unescaped line):
    // it runs as `cmd.exe /c` with std's batch quoting, or is refused.
    let (app, line) = if is_batch(&program_path).map_err(|e| os_failure("program path", &e))? {
        if !program_path.is_file() {
            let e = io::Error::from_raw_os_error(ERROR_FILE_NOT_FOUND as i32);
            return Err(os_failure(&program_path.display().to_string(), &e));
        }
        // cmd.exe cannot open a verbatim path: std's plain spelling, or a refusal.
        (
            cmd_exe().map_err(|e| os_failure("system directory", &e))?,
            cmdline::user_path(&program).and_then(|script| cmdline::bat(&script, args)),
        )
    } else {
        (program, cmdline::exe(argv0, args))
    };
    let mut line = line.map_err(invalid)?;
    line.push(0);
    let env = env_block(&s.env)?;
    let job = job::create().map_err(|e| os_failure("job", &e))?;
    watch(&job).map_err(|e| os_failure("job completion port", &e))?;
    // A terminal root: the ConPTY path is laid out step by step in `pty_windows`; `create` below is its step 5.
    let pty = match s.pty {
        Some((cols, rows)) => Some(pty_windows::create(cols, rows).map_err(|e| match e.kind() {
            io::ErrorKind::InvalidInput => invalid(e.to_string()),
            _ => os_failure("terminal", &e),
        })?),
        None => None,
    };
    let pc = pty.as_ref().map(|(p, _)| p.handle());
    match create(&app, &mut line, &env, &cwd, &job, stdio.as_ref(), pc) {
        Ok((pid, process)) => Ok(Root { pid, process, job, pty }),
        Err(e) => {
            if let Some((p, _)) = pty {
                p.close(Instant::now());
            }
            Err(os_failure("CreateProcessW", &e))
        }
    }
}

/// The child's standard handles: stdin (a pipe or `NUL` for reading), stdout, stderr (`None` = stdout).
struct Stdio {
    stdin: OwnedHandle,
    stdout: OwnedHandle,
    stderr: Option<OwnedHandle>,
}

/// Closes whatever `s` transferred, for a spawn refused before it starts.
pub(super) fn discard(s: &Spawn, channel: RawHandle) {
    drop(take_stdio(s, channel));
}

/// Takes ownership of each distinct transferred pipe exactly once (the host gave it to this process for this
/// spawn), then checks the slots. A repeated value, or a missing or extra handle, is refused, and every handle
/// taken is closed on that path. A value that is not a pipe, or is the channel, is not ours to close.
fn take_stdio(s: &Spawn, channel: RawHandle) -> Result<Option<Stdio>, Failure> {
    let mut i = 0;
    let [stdin, stdout, stderr] = s.handles.map(|v| {
        let first = !s.handles.iter().take(i).any(|&o| o == v);
        i += 1;
        let h = v as usize as RawHandle;
        // SAFETY: GetFileType only reads the handle's type; an invalid value gives FILE_TYPE_UNKNOWN.
        let pipe = v != 0 && first && h != channel && unsafe { GetFileType(h as HANDLE) } == FILE_TYPE_PIPE;
        // SAFETY: a pipe handle the host duplicated into this process for this spawn; owned from here on.
        pipe.then(|| unsafe { OwnedHandle::from_raw_handle(h) })
    });
    let given = s.handles.map(|v| v != 0);
    let unusable =
        given.iter().filter(|&&g| g).count() != [&stdin, &stdout, &stderr].iter().filter(|h| h.is_some()).count();
    let wanted = match s.pty {
        Some(_) => [false; 3],
        None => [s.stdin == Slot::Pipe, true, s.stderr == Slot::Pipe],
    };
    if unusable || given != wanted {
        return Err(invalid(format!("handles {:?} do not match the stdio slots", s.handles)));
    }
    let (Some(stdout), None) = (stdout, s.pty) else {
        return Ok(None);
    };
    let stdin = match stdin {
        Some(pipe) => pipe,
        None => open_nul().map_err(|e| os_failure("NUL", &e))?,
    };
    Ok(Some(Stdio { stdin, stdout, stderr }))
}

/// The null device opened for reading: the child reads end of input at once (never a NULL handle).
fn open_nul() -> io::Result<OwnedHandle> {
    let name: Vec<u16> = "NUL".encode_utf16().chain([0]).collect();
    // SAFETY: a NUL-terminated name, null attributes (not inheritable); checked for INVALID_HANDLE_VALUE.
    let h = unsafe {
        CreateFileW(
            name.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null::<SECURITY_ATTRIBUTES>(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };
    // SAFETY: `h` is INVALID_HANDLE_VALUE or a fresh handle owned by nobody else.
    OwnedHandle::try_from(unsafe { HandleOrInvalid::from_raw_handle(h) }).map_err(|_| io::Error::last_os_error())
}

/// std's test: `.bat`/`.cmd`, case-insensitive, on the path as Windows will open it (`GetFullPathNameW`
/// drops trailing dots and spaces, so `x.bat.` is a batch file); verbatim paths are taken as written.
fn is_batch(program: &Path) -> io::Result<bool> {
    let full: Vec<u16> = std::path::absolute(program)?.as_os_str().encode_wide().collect();
    Ok(matches!(
        full.len().checked_sub(4).and_then(|i| full.get(i..)),
        Some([46, 98 | 66, 97 | 65, 116 | 84] | [46, 99 | 67, 109 | 77, 100 | 68])
    ))
}

/// `<system directory>\cmd.exe`, never resolved through PATH or ComSpec (as std).
fn cmd_exe() -> io::Result<Vec<u16>> {
    let mut buf = vec![0u16; 260];
    loop {
        let cap = u32::try_from(buf.len()).map_err(io::Error::other)?;
        // SAFETY: `buf` is writable for `cap` units.
        let n = unsafe { GetSystemDirectoryW(buf.as_mut_ptr(), cap) } as usize;
        if n == 0 {
            return Err(io::Error::last_os_error());
        }
        if n < buf.len() {
            buf.truncate(n);
            buf.extend("\\cmd.exe".encode_utf16().chain([0]));
            return Ok(buf);
        }
        buf.resize(n, 0);
    }
}

/// `KEY=VALUE\0...\0`, sorted by name ignoring ASCII case (the order Windows documents for the block).
fn env_block(env: &[(Vec<u8>, Vec<u8>)]) -> Result<Vec<u16>, Failure> {
    let mut vars = Vec::with_capacity(env.len());
    for (k, v) in env {
        let key = text(k, "environment name")?;
        // A leading `=` is legal (the hidden per-drive `=C:` variables); one anywhere else is not.
        if key.is_empty() || key.iter().skip(1).any(|&c| c == u16::from(b'=')) {
            return Err(invalid(format!(
                "environment name {:?} is empty or contains `=`",
                String::from_utf16_lossy(&key)
            )));
        }
        vars.push((key, text(v, "environment value")?));
    }
    let upper = |c: &u16| if (97..=122).contains(c) { c - 32 } else { *c };
    vars.sort_by(|a, b| a.0.iter().map(upper).cmp(b.0.iter().map(upper)));
    let mut block = Vec::new();
    for (k, v) in vars {
        block.extend(k);
        block.push(u16::from(b'='));
        block.extend(v);
        block.push(0);
    }
    if block.is_empty() {
        block.push(0);
    }
    block.push(0);
    Ok(block)
}

/// `CreateProcessW` inside `job`; `pc` = the pseudoconsole of a terminal root.
fn create(
    app: &[u16],
    line: &mut [u16],
    env: &[u16],
    cwd: &[u16],
    job: &OwnedHandle,
    stdio: Option<&Stdio>,
    pc: Option<isize>,
) -> io::Result<(u32, OwnedHandle)> {
    let cwd: Vec<u16> = cwd.iter().copied().chain([0]).collect();
    let app: Vec<u16> = app.iter().copied().chain([0]).collect();
    // The attribute list points at these two: declared first, so they outlive it.
    let jobs: [HANDLE; 1] = [job.as_raw_handle()];
    let mut inherit: Vec<HANDLE> = Vec::new();
    let mut si = STARTUPINFOEXW::default();
    si.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES; // a terminal root gets explicit null handles
    if let Some(io) = stdio {
        let err = io.stderr.as_ref().unwrap_or(&io.stdout);
        for h in [&io.stdin, &io.stdout, err] {
            // Inheritable only for this call; HANDLE_LIST keeps them from any other child.
            // SAFETY: a handle we own.
            if unsafe { SetHandleInformation(h.as_raw_handle(), HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) } == 0 {
                return Err(io::Error::last_os_error());
            }
            if !inherit.contains(&h.as_raw_handle()) {
                inherit.push(h.as_raw_handle());
            }
        }
        si.StartupInfo.hStdInput = io.stdin.as_raw_handle();
        si.StartupInfo.hStdOutput = io.stdout.as_raw_handle();
        si.StartupInfo.hStdError = err.as_raw_handle();
    }
    let mut attrs = Attributes::new(2)?;
    // SAFETY: `jobs`, `inherit` and the pseudoconsole outlive `attrs`, and none of them moves before it is dropped.
    unsafe {
        attrs.set(
            PROC_THREAD_ATTRIBUTE_JOB_LIST as usize,
            jobs.as_ptr().cast(),
            size_of_val(&jobs),
        )?;
        match pc {
            Some(pc) => attrs.set(
                PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE as usize,
                pc as *const _,
                size_of::<isize>(),
            )?,
            None => attrs.set(
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
                inherit.as_ptr().cast(),
                size_of_val(inherit.as_slice()),
            )?,
        }
    }
    si.lpAttributeList = attrs.list();
    // CTRL_BREAK targets the root's group; a terminal root stays in the console's group (ADR-0003).
    let group = if pc.is_none() { CREATE_NEW_PROCESS_GROUP } else { 0 };
    let mut pi = PROCESS_INFORMATION::default();
    // SAFETY: NUL-terminated strings, a double-NUL environment block, a writable command line, and an
    // initialized STARTUPINFOEXW whose attribute list is alive. Handles are inherited only for a pipe root,
    // and then only the HANDLE_LIST.
    let ok = unsafe {
        CreateProcessW(
            app.as_ptr(),
            line.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            i32::from(pc.is_none()),
            EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | group,
            env.as_ptr().cast(),
            cwd.as_ptr(),
            &si.StartupInfo,
            &mut pi,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: both handles are fresh from CreateProcessW and owned by nobody else.
    let (process, _thread) = unsafe {
        (
            OwnedHandle::from_raw_handle(pi.hProcess),
            OwnedHandle::from_raw_handle(pi.hThread),
        )
    };
    Ok((pi.dwProcessId, process))
}

/// A `PROC_THREAD_ATTRIBUTE_LIST`, deleted on drop.
struct Attributes {
    buf: Vec<usize>,
}

impl Attributes {
    fn new(count: u32) -> io::Result<Attributes> {
        let mut size = 0;
        // SAFETY: a size query with a null list (it fails with ERROR_INSUFFICIENT_BUFFER and sets `size`).
        unsafe { InitializeProcThreadAttributeList(std::ptr::null_mut(), count, 0, &mut size) };
        let mut buf = vec![0usize; size.div_ceil(size_of::<usize>())];
        // SAFETY: `buf` is at least `size` bytes, pointer-aligned.
        if unsafe { InitializeProcThreadAttributeList(buf.as_mut_ptr().cast(), count, 0, &mut size) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Attributes { buf })
    }

    fn list(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
        self.buf.as_mut_ptr().cast()
    }

    /// # Safety
    /// `value` must stay valid, unmoved, until the list is dropped.
    unsafe fn set(&mut self, attribute: usize, value: *const core::ffi::c_void, size: usize) -> io::Result<()> {
        // SAFETY: an initialized list; the caller keeps `value` alive.
        let ok = unsafe {
            UpdateProcThreadAttribute(
                self.list(),
                0,
                attribute,
                value,
                size,
                std::ptr::null_mut(),
                std::ptr::null(),
            )
        };
        if ok == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
}

impl Drop for Attributes {
    fn drop(&mut self) {
        // SAFETY: the list was initialized in `new`.
        unsafe { DeleteProcThreadAttributeList(self.list()) };
    }
}
