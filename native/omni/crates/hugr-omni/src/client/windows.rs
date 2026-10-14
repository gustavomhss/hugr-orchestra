//! Windows side of the channel (ADR-0005 R7): a private named pipe with a random name, the supervisor
//! started with `bInheritHandles = FALSE`, only the client whose pid we created is accepted, and handles
//! cross with non-inheritable `DuplicateHandle`. No inheritable host handle exists at any point.

use std::collections::VecDeque;
use std::ffi::{OsStr, OsString};
use std::hash::{BuildHasher, Hasher, RandomState};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::ffi::OsStringExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::time::Duration;

use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use tokio::runtime::{Handle, Runtime};
use windows_sys::Win32::Foundation::{
    DUPLICATE_CLOSE_SOURCE, DUPLICATE_SAME_ACCESS, DuplicateHandle, FALSE, HANDLE, HMODULE, WAIT_TIMEOUT,
};
use windows_sys::Win32::System::LibraryLoader::{
    GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, GetModuleFileNameW,
    GetModuleHandleExW,
};
use windows_sys::Win32::System::Pipes::{CreatePipe, GetNamedPipeClientProcessId};
use windows_sys::Win32::System::Threading::{
    CREATE_NO_WINDOW, CreateProcessW, GetCurrentProcess, PROCESS_INFORMATION, STARTUPINFOW, TerminateProcess,
    WaitForSingleObject,
};

use super::channel::Gen;
use super::{HostStdio, REPLY_WITHIN};
use crate::error::Error;

/// ConPTY ends as handle values in the supervisor: [output read, input write].
pub(super) type Ends = [u64; 2];

/// The server end of the pipe and the process on the other end (handles are duplicated into and out of it).
pub(super) struct Chan {
    pipe: NamedPipeServer,
    peer: Arc<OwnedHandle>,
    /// The only client accepted.
    pid: u32,
    /// `peer` is the supervisor we started: it is terminated if it outlives the channel by a window.
    owned: bool,
    rt: Handle,
}

impl Chan {
    /// Must run inside the runtime's context (`Gen::start` does that).
    pub(super) fn new(pipe: NamedPipeServer, peer: OwnedHandle, pid: u32, owned: bool) -> io::Result<Chan> {
        let rt = Handle::try_current().map_err(io::Error::other)?;
        Ok(Chan {
            pipe,
            peer: Arc::new(peer),
            pid,
            owned,
            rt,
        })
    }

    /// Waits for the client and refuses any process but the one we started.
    pub(super) async fn accept(&self) -> io::Result<()> {
        self.pipe.connect().await?;
        let mut pid = 0;
        // SAFETY: the pipe handle is valid for the call and `pid` is a writable u32.
        if unsafe { GetNamedPipeClientProcessId(self.pipe.as_raw_handle(), &mut pid) } == 0 {
            return Err(io::Error::last_os_error());
        }
        match pid == self.pid {
            true => Ok(()),
            false => Err(io::Error::other(format!(
                "process {pid} connected instead of process {}",
                self.pid
            ))),
        }
    }

    /// One non-blocking write (handles never travel on the pipe).
    pub(super) fn try_send(&self, data: &[u8], _fds: &[OwnedHandle]) -> io::Result<usize> {
        self.pipe.try_write(data)
    }

    pub(super) async fn writable(&self) -> io::Result<()> {
        self.pipe.writable().await
    }

    pub(super) async fn recv(&self, buf: &mut [u8], _fds: &mut VecDeque<OwnedHandle>) -> io::Result<usize> {
        loop {
            self.pipe.readable().await?;
            match self.pipe.try_read(buf) {
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => continue,
                Err(e) if e.kind() == io::ErrorKind::BrokenPipe => return Ok(0),
                other => return other,
            }
        }
    }

    /// The supervisor sees a broken pipe (host death for it: it stops every tree and exits). One that is
    /// still running after `window` (stuck or suspended) is terminated through its handle, which pins its
    /// identity; its Jobs then end its trees.
    pub(super) fn close(&self, window: Duration) {
        let _ = self.pipe.disconnect();
        if self.owned {
            let sup = self.peer.clone();
            self.rt.spawn(async move {
                tokio::time::sleep(window).await;
                // SAFETY: `sup` is the process handle CreateProcessW gave us, alive while this Arc lives; a
                // zero-timeout wait and TerminateProcess change no memory of ours.
                unsafe {
                    if WaitForSingleObject(sup.as_raw_handle(), 0) == WAIT_TIMEOUT {
                        TerminateProcess(sup.as_raw_handle(), 1);
                    }
                }
            });
        }
    }

    /// A process handle always identifies the supervisor: a stuck one can always be ended.
    pub(super) fn can_end(&self) -> bool {
        true
    }

    /// Validates `Spawned.pty_ends`: both values for a terminal, neither for pipes.
    pub(super) fn ends(&self, raw: [u64; 2], _fds: &mut VecDeque<OwnedHandle>) -> Result<Option<Ends>, String> {
        match raw {
            [0, 0] => Ok(None),
            [a, b] if a != 0 && b != 0 => Ok(Some(raw)),
            other => Err(format!("it sent half a terminal: ends {other:?}")),
        }
    }

    /// Pulls the ConPTY ends out of the supervisor (closing them there).
    pub(super) fn pty(&self, ends: Ends) -> io::Result<HostStdio> {
        let (output, input) = (self.take(ends[0]), self.take(ends[1]));
        Ok(HostStdio::Pty {
            output: output?,
            input: input?,
        })
    }

    /// Duplicates the child's pipe ends into the supervisor; their values go in `Spawn.handles`.
    pub(super) fn hand_over(&self, child: [Option<OwnedHandle>; 3]) -> io::Result<([u64; 3], Vec<OwnedHandle>)> {
        let mut values = [0u64; 3];
        for (value, handle) in values.iter_mut().zip(child) {
            let Some(handle) = handle else { continue };
            match self.give(&handle) {
                Ok(v) => *value = v,
                Err(e) => {
                    self.reclaim(values);
                    return Err(e);
                }
            }
        }
        Ok((values, Vec::new()))
    }

    /// Closes, in the supervisor, handed-over ends that no frame will mention (spawn rollback).
    pub(super) fn reclaim(&self, values: [u64; 3]) {
        values.iter().filter(|v| **v != 0).for_each(|v| self.discard(*v));
    }

    fn give(&self, handle: &OwnedHandle) -> io::Result<u64> {
        let mut remote: HANDLE = null_mut();
        // SAFETY: both process handles and `handle` are valid; the copy is created in the peer, not
        // inheritable; nothing is closed here.
        let ok = unsafe {
            DuplicateHandle(
                GetCurrentProcess(),
                handle.as_raw_handle(),
                self.peer.as_raw_handle(),
                &mut remote,
                0,
                FALSE,
                DUPLICATE_SAME_ACCESS,
            )
        };
        match ok {
            0 => Err(io::Error::last_os_error()),
            _ => Ok(remote as usize as u64),
        }
    }

    fn take(&self, value: u64) -> io::Result<OwnedHandle> {
        let mut local: HANDLE = null_mut();
        // SAFETY: `value` names a handle in the peer (protocol `pty_ends`); DUPLICATE_CLOSE_SOURCE closes it
        // there whatever the outcome; the copy here is not inheritable.
        let ok = unsafe {
            DuplicateHandle(
                self.peer.as_raw_handle(),
                value as usize as HANDLE,
                GetCurrentProcess(),
                &mut local,
                0,
                FALSE,
                DUPLICATE_SAME_ACCESS | DUPLICATE_CLOSE_SOURCE,
            )
        };
        match ok {
            0 => Err(io::Error::last_os_error()),
            // SAFETY: DuplicateHandle created `local` for us; nothing else owns it.
            _ => Ok(unsafe { OwnedHandle::from_raw_handle(local) }),
        }
    }

    /// Closes, in the peer, a handle we put there.
    fn discard(&self, value: u64) {
        // SAFETY: closes `value` in the peer only; no handle is created here.
        unsafe {
            DuplicateHandle(
                self.peer.as_raw_handle(),
                value as usize as HANDLE,
                null_mut(),
                null_mut(),
                0,
                FALSE,
                DUPLICATE_CLOSE_SOURCE,
            )
        };
    }
}

/// Starts `hugr-omni-supervisor --host-pid <pid> --pipe <name>` (`docs/protocol.md`).
pub(super) fn launch(rt: &Runtime, num: u64) -> Result<Arc<Gen>, Error> {
    let path = super::locate()?;
    let host = std::process::id().to_string();
    let name = format!(r"\\.\pipe\hugr-omni-{host}-{:032x}", token());
    Gen::start(rt, num, REPLY_WITHIN, move || {
        let pipe = server(&name)?;
        let args: [&OsStr; 4] = ["--host-pid".as_ref(), host.as_ref(), "--pipe".as_ref(), name.as_ref()];
        let (peer, pid) =
            create_process(&path, &args).map_err(|e| io::Error::new(e.kind(), format!("{}: {e}", path.display())))?;
        Chan::new(pipe, peer, pid, true)
    })
}

/// The first and only instance of `name`, local clients only, not inheritable (null security attributes).
pub(super) fn server(name: &str) -> io::Result<NamedPipeServer> {
    ServerOptions::new()
        .first_pipe_instance(true)
        .reject_remote_clients(true)
        .max_instances(1)
        .create(name)
}

/// `CreateProcessW` with `bInheritHandles = FALSE` and its own windowless console. `args` must be plain
/// tokens (no space, tab or quote). Returns the process handle and pid.
pub(super) fn create_process(app: &Path, args: &[&OsStr]) -> io::Result<(OwnedHandle, u32)> {
    let mut line = OsString::from("\"");
    line.push(app.as_os_str());
    line.push("\"");
    for arg in args {
        if arg.is_empty() || arg.encode_wide().any(|c| [0x20, 0x09, 0x22].contains(&c)) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "argument is not a plain token",
            ));
        }
        line.push(" ");
        line.push(arg);
    }
    let app: Vec<u16> = app.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut line: Vec<u16> = line.encode_wide().chain(Some(0)).collect();
    // SAFETY: all-zero STARTUPINFOW and PROCESS_INFORMATION are valid empty values.
    let (mut si, mut pi): (STARTUPINFOW, PROCESS_INFORMATION) = unsafe { (std::mem::zeroed(), std::mem::zeroed()) };
    si.cb = u32::try_from(std::mem::size_of::<STARTUPINFOW>()).unwrap_or(u32::MAX);
    // SAFETY: both strings are NUL-terminated and alive, `line` is writable as CreateProcessW requires, and
    // `si`/`pi` are valid. bInheritHandles = FALSE: the new process inherits no handle of the host (R7).
    let ok = unsafe {
        CreateProcessW(
            app.as_ptr(),
            line.as_mut_ptr(),
            null(),
            null(),
            FALSE,
            CREATE_NO_WINDOW,
            null(),
            null(),
            &si,
            &mut pi,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: CreateProcessW returned these two handles for us to own (the thread one is closed at once).
    let (process, _thread) = unsafe {
        (
            OwnedHandle::from_raw_handle(pi.hProcess),
            OwnedHandle::from_raw_handle(pi.hThread),
        )
    };
    Ok((process, pi.dwProcessId))
}

/// A pipe as (read end, write end); null security attributes, so neither end is inheritable (R7).
pub(super) fn pipe() -> io::Result<(OwnedHandle, OwnedHandle)> {
    let (mut read, mut write): (HANDLE, HANDLE) = (null_mut(), null_mut());
    // SAFETY: both out-pointers are valid for the call.
    if unsafe { CreatePipe(&mut read, &mut write, null(), 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: CreatePipe returned two fresh handles that nothing else owns.
    Ok(unsafe { (OwnedHandle::from_raw_handle(read), OwnedHandle::from_raw_handle(write)) })
}

/// The directory of the module that contains this code (the `.node` / `.pyd` module, or the executable).
pub(super) fn module_dir() -> Option<PathBuf> {
    let mut module: HMODULE = null_mut();
    let addr = module_dir as fn() -> Option<PathBuf> as *const u16;
    let flags = GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT;
    // SAFETY: FROM_ADDRESS looks up the module containing this function and writes its handle to `module`;
    // UNCHANGED_REFCOUNT takes no reference, and the module stays loaded while its own code runs.
    if unsafe { GetModuleHandleExW(flags, addr, &mut module) } == 0 {
        return None;
    }
    let mut name = vec![0u16; 260];
    loop {
        let room = u32::try_from(name.len()).ok()?;
        // SAFETY: `name` has `room` writable u16s; the call writes at most that many.
        let n = usize::try_from(unsafe { GetModuleFileNameW(module, name.as_mut_ptr(), room) }).ok()?;
        if n == 0 {
            return None;
        }
        if n < name.len() {
            name.truncate(n);
            break;
        }
        if name.len() >= 32 * 1024 {
            return None;
        }
        name.resize(name.len() * 2, 0);
    }
    PathBuf::from(OsString::from_wide(&name))
        .parent()
        .map(Path::to_path_buf)
}

/// 128 unpredictable bits for the pipe name: std's SipHash keyed from the OS random generator.
fn token() -> u128 {
    let keyed = RandomState::new();
    let half = |salt: u64| {
        let mut h = keyed.build_hasher();
        h.write_u64(salt);
        u128::from(h.finish())
    };
    (half(1) << 64) | half(2)
}
