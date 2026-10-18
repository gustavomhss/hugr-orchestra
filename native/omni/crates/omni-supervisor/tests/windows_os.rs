//! The OS's view for the Windows supervisor suite (SUP-W), included as `host::os` by `windows_host.rs`:
//! processes checked through their own handles (never through the supervisor), child output as lines, and
//! overlapped pipe I/O, every wait bounded by `T`.
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io::{BufRead, BufReader, Read};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    CompareObjectHandles, DUPLICATE_SAME_ACCESS, DuplicateHandle, ERROR_INVALID_PARAMETER, ERROR_IO_PENDING,
    ERROR_MORE_DATA, ERROR_PIPE_CONNECTED, FALSE, FILETIME, HANDLE, INVALID_HANDLE_VALUE, TRUE, WAIT_OBJECT_0,
    WAIT_TIMEOUT,
};
use windows_sys::Win32::Storage::FileSystem::WriteFile;
use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
    CreateEventW, GetCurrentProcess, GetExitCodeProcess, GetProcessTimes, INFINITE, OpenProcess, PROCESS_DUP_HANDLE,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE, TerminateProcess, WaitForSingleObject,
};

/// Every wait of the suite fails after this.
pub const T: Duration = Duration::from_secs(10);

/// Asserts a Win32 `BOOL` result.
pub fn check(ok: i32, what: &str) {
    assert_ne!(ok, 0, "{what}: {}", std::io::Error::last_os_error());
}

/// Takes ownership of a handle a Win32 call just returned, asserting it is valid.
pub(crate) fn owned(h: HANDLE, what: &str) -> OwnedHandle {
    assert!(
        !h.is_null() && h != INVALID_HANDLE_VALUE,
        "{what}: {}",
        std::io::Error::last_os_error()
    );
    // SAFETY: a fresh, valid handle owned by nobody else.
    unsafe { OwnedHandle::from_raw_handle(h) }
}

/// An anonymous manual-reset event.
pub fn event() -> OwnedHandle {
    // SAFETY: plain creation, null attributes.
    owned(
        unsafe { CreateEventW(std::ptr::null(), TRUE, FALSE, std::ptr::null()) },
        "CreateEventW",
    )
}

/// An anonymous pipe, both ends non-inheritable: (read, write).
pub fn pipe() -> (OwnedHandle, OwnedHandle) {
    let (mut r, mut w) = (std::ptr::null_mut(), std::ptr::null_mut());
    // SAFETY: valid out pointers, null security attributes.
    check(unsafe { CreatePipe(&mut r, &mut w, std::ptr::null(), 0) }, "CreatePipe");
    (owned(r, "pipe"), owned(w, "pipe"))
}

/// Runs one overlapped operation on `pipe` and waits for it (within `limit`, cancelling on timeout).
pub fn overlapped(
    pipe: &OwnedHandle,
    op: impl FnOnce(*mut OVERLAPPED) -> i32,
    limit: Option<Duration>,
) -> std::io::Result<usize> {
    let ev = event();
    let mut ov = OVERLAPPED {
        hEvent: ev.as_raw_handle(),
        ..Default::default()
    };
    if op(&mut ov) == 0 {
        let e = std::io::Error::last_os_error();
        match e.raw_os_error().map(|c| c as u32) {
            Some(ERROR_IO_PENDING | ERROR_MORE_DATA) => {}
            Some(ERROR_PIPE_CONNECTED) => return Ok(0),
            _ => return Err(e),
        }
    }
    let ms = limit.map_or(INFINITE, |d| d.as_millis() as u32);
    // SAFETY: a valid event and pipe; on timeout the operation is cancelled, then awaited below.
    unsafe {
        if WaitForSingleObject(ev.as_raw_handle(), ms) == WAIT_TIMEOUT {
            CancelIoEx(pipe.as_raw_handle(), &ov);
        }
    }
    let mut n = 0;
    // SAFETY: `ov` belongs to the operation above; waiting completes it before `ov` goes away.
    if unsafe { GetOverlappedResult(pipe.as_raw_handle(), &ov, &mut n, TRUE) } == 0 {
        let e = std::io::Error::last_os_error();
        if e.raw_os_error() != Some(ERROR_MORE_DATA as i32) {
            return Err(e);
        }
    }
    Ok(n as usize)
}

/// Writes `bytes` to `pipe`; if the write is still pending after `stall` (the reader stopped reading), calls
/// `on_stall` once, then waits for the write to complete.
pub fn write_watching(pipe: &OwnedHandle, bytes: &[u8], stall: Duration, on_stall: impl FnOnce()) {
    let ev = event();
    let mut ov = OVERLAPPED {
        hEvent: ev.as_raw_handle(),
        ..Default::default()
    };
    // SAFETY: `bytes` and `ov` outlive the write: it is awaited below (or `on_stall` never returns).
    let ok = unsafe {
        WriteFile(
            pipe.as_raw_handle(),
            bytes.as_ptr(),
            bytes.len() as u32,
            std::ptr::null_mut(),
            &mut ov,
        )
    };
    if ok == 0 {
        let e = std::io::Error::last_os_error();
        assert_eq!(e.raw_os_error(), Some(ERROR_IO_PENDING as i32), "write: {e}");
        // SAFETY: a valid event.
        if unsafe { WaitForSingleObject(ev.as_raw_handle(), stall.as_millis() as u32) } == WAIT_TIMEOUT {
            on_stall();
        }
    }
    let mut n = 0;
    // SAFETY: `ov` belongs to the write above.
    check(
        unsafe { GetOverlappedResult(pipe.as_raw_handle(), &ov, &mut n, TRUE) },
        "write",
    );
    assert_eq!(n as usize, bytes.len());
}

/// Creation time of a process (FILETIME as one number).
pub fn created(process: &OwnedHandle) -> u64 {
    let (mut c, mut e, mut k, mut u) = (
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
        FILETIME::default(),
    );
    // SAFETY: a process handle with query access and four valid out pointers.
    check(
        unsafe { GetProcessTimes(process.as_raw_handle(), &mut c, &mut e, &mut k, &mut u) },
        "GetProcessTimes",
    );
    u64::from(c.dwHighDateTime) << 32 | u64::from(c.dwLowDateTime)
}

/// The OS-only oracle: the process that had `pid` and was created at `born` is gone (no process has the pid,
/// another process has it now, or it has exited).
pub fn gone(pid: u32, born: u64) -> bool {
    // SAFETY: a plain open by pid.
    let h = unsafe { OpenProcess(PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid) };
    if h.is_null() {
        let e = std::io::Error::last_os_error();
        assert_eq!(
            e.raw_os_error(),
            Some(ERROR_INVALID_PARAMETER as i32),
            "OpenProcess({pid}): {e}"
        );
        return true;
    }
    let h = owned(h, "OpenProcess");
    // SAFETY: a valid process handle.
    created(&h) != born || unsafe { WaitForSingleObject(h.as_raw_handle(), 0) } == WAIT_OBJECT_0
}

/// Lines of a child's output, read on a thread. Lines a wait skips are kept for later waits.
pub struct Lines {
    rx: mpsc::Receiver<String>,
    kept: std::cell::RefCell<Vec<String>>,
}

impl Lines {
    /// Starts reading `r`.
    pub fn new(r: impl Read + Send + 'static) -> Lines {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(r).split(b'\n').map_while(Result::ok) {
                if tx
                    .send(String::from_utf8_lossy(&line).trim_end_matches('\r').to_string())
                    .is_err()
                {
                    return;
                }
            }
        });
        Lines {
            rx,
            kept: Default::default(),
        }
    }

    /// The next `n` lines starting with `prefix`, within `T`.
    pub fn take(&self, prefix: &str, n: usize) -> Vec<String> {
        let mut kept = self.kept.borrow_mut();
        let mut got = Vec::new();
        while got.len() < n
            && let Some(i) = kept.iter().position(|l| l.starts_with(prefix))
        {
            got.push(kept.remove(i));
        }
        let end = Instant::now() + T;
        while got.len() < n {
            match self.rx.recv_timeout(end.saturating_duration_since(Instant::now())) {
                Ok(l) if l.starts_with(prefix) => got.push(l),
                Ok(l) => kept.push(l),
                Err(e) => panic!("waiting for {n} `{prefix}` lines: {e:?}; got {got:?}, other lines {kept:?}"),
            }
        }
        got
    }

    /// The next line starting with `prefix`.
    pub fn line(&self, prefix: &str) -> String {
        self.take(prefix, 1).remove(0)
    }

    /// Every line not taken yet, up to EOF, within `T`.
    pub fn rest(&self) -> Vec<String> {
        let mut got = std::mem::take(&mut *self.kept.borrow_mut());
        let end = Instant::now() + T;
        loop {
            match self.rx.recv_timeout(end.saturating_duration_since(Instant::now())) {
                Ok(l) => got.push(l),
                Err(mpsc::RecvTimeoutError::Disconnected) => return got,
                Err(e) => panic!("waiting for EOF: {e:?}; got {got:?}"),
            }
        }
    }
}

/// A process seen by the OS (never by the supervisor), held open so its pid cannot be reused meanwhile.
pub struct Proc(OwnedHandle, u32);

impl Proc {
    /// Opens a live process.
    pub fn open(pid: u32) -> Proc {
        let access = PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_DUP_HANDLE | PROCESS_TERMINATE;
        // SAFETY: a plain open by pid.
        Proc(owned(unsafe { OpenProcess(access, FALSE, pid) }, "OpenProcess"), pid)
    }

    /// Its pid.
    pub fn pid(&self) -> u32 {
        self.1
    }

    /// Ends it (cleanup of controls).
    pub fn kill(&self) {
        // SAFETY: a valid process handle with terminate access.
        unsafe { TerminateProcess(self.0.as_raw_handle(), 1) };
    }

    /// Not exited.
    pub fn alive(&self) -> bool {
        // SAFETY: a valid process handle.
        unsafe { WaitForSingleObject(self.0.as_raw_handle(), 0) == WAIT_TIMEOUT }
    }

    /// Exits within `d`.
    pub fn dead_within(&self, d: Duration) -> bool {
        // SAFETY: a valid process handle.
        unsafe { WaitForSingleObject(self.0.as_raw_handle(), d.as_millis() as u32) == WAIT_OBJECT_0 }
    }

    /// Its exit code.
    pub fn exit_code(&self) -> u32 {
        let mut code = 0;
        // SAFETY: a process handle with query access.
        check(
            unsafe { GetExitCodeProcess(self.0.as_raw_handle(), &mut code) },
            "GetExitCodeProcess",
        );
        code
    }

    /// Whether it holds, at value `value`, a handle to the same object as `ours`.
    pub fn holds(&self, value: usize, ours: &OwnedHandle) -> bool {
        let (from, mut dup) = (self.0.as_raw_handle(), std::ptr::null_mut());
        // SAFETY: valid process handles (`from` has PROCESS_DUP_HANDLE); a failed duplicate leaves `dup` null.
        let ok = unsafe {
            DuplicateHandle(
                from,
                value as HANDLE,
                GetCurrentProcess(),
                &mut dup,
                0,
                FALSE,
                DUPLICATE_SAME_ACCESS,
            )
        };
        // SAFETY: two valid handles.
        ok != 0 && unsafe { CompareObjectHandles(owned(dup, "dup").as_raw_handle(), ours.as_raw_handle()) } != 0
    }
}
