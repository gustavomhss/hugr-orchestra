//! `CreateProcessW` for one root: the attribute list (`JOB_LIST` plus `HANDLE_LIST` or `PSEUDOCONSOLE`), the
//! standard handles, and the process group.

use std::io;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};

use windows_sys::Win32::Foundation::{HANDLE, HANDLE_FLAG_INHERIT, SetHandleInformation};
use windows_sys::Win32::System::Threading::{
    CREATE_NEW_PROCESS_GROUP, CREATE_UNICODE_ENVIRONMENT, CreateProcessW, DeleteProcThreadAttributeList,
    EXTENDED_STARTUPINFO_PRESENT, InitializeProcThreadAttributeList, LPPROC_THREAD_ATTRIBUTE_LIST,
    PROC_THREAD_ATTRIBUTE_HANDLE_LIST, PROC_THREAD_ATTRIBUTE_JOB_LIST, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
    PROCESS_INFORMATION, STARTF_USESTDHANDLES, STARTUPINFOEXW, UpdateProcThreadAttribute,
};

use super::spawn::Stdio;

/// `CreateProcessW` inside `job`; `pc` = the pseudoconsole of a terminal root.
pub(super) fn create(
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
pub(super) struct Attributes {
    buf: Vec<usize>,
}

impl Attributes {
    pub(super) fn new(count: u32) -> io::Result<Attributes> {
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

    pub(super) fn list(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
        self.buf.as_mut_ptr().cast()
    }

    /// # Safety
    /// `value` must stay valid, unmoved, until the list is dropped.
    pub(super) unsafe fn set(
        &mut self,
        attribute: usize,
        value: *const core::ffi::c_void,
        size: usize,
    ) -> io::Result<()> {
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
