//! The host channel (ADR-0005 R1, R7). The supervisor opens the host's named pipe itself (nothing is
//! inherited) with overlapped I/O, so one reader and one writer thread use it at once. The reader feeds the
//! bounded inbox and the writer drains the outbox (`queues`), so a host that stops reading never blocks the
//! owner thread, and one that floods is held back by its own pipe.

use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrInvalid, HandleOrNull, OwnedHandle};
use std::sync::Arc;

use omni_proto::Msg;
use windows_sys::Win32::Foundation::{ERROR_IO_PENDING, ERROR_MORE_DATA, GENERIC_READ, GENERIC_WRITE, TRUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_OVERLAPPED, OPEN_EXISTING, ReadFile, SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT,
    WriteFile,
};
use windows_sys::Win32::System::IO::{GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Pipes::GetNamedPipeServerProcessId;
use windows_sys::Win32::System::Threading::CreateEventW;

use super::queues::{Event, Inbox, Outbox};

/// Stack of every helper thread: they only wait and copy.
pub(super) const STACK: usize = 64 * 1024;

/// Opens the host's pipe and checks that its server is the host (`--host-pid`).
pub(super) fn connect(name: &str, host_pid: u32) -> io::Result<Arc<OwnedHandle>> {
    let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
    // SAFETY: a NUL-terminated name; null security attributes (not inheritable). SQOS identification only:
    // whoever serves the pipe cannot impersonate the supervisor.
    let h = unsafe {
        CreateFileW(
            wide.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
            std::ptr::null_mut(),
        )
    };
    // SAFETY: `h` is INVALID_HANDLE_VALUE or a fresh handle owned by nobody else.
    let pipe = OwnedHandle::try_from(unsafe { HandleOrInvalid::from_raw_handle(h) })
        .map_err(|_| io::Error::last_os_error())?;
    let mut server = 0;
    // SAFETY: a valid pipe handle and a valid out pointer.
    if unsafe { GetNamedPipeServerProcessId(pipe.as_raw_handle(), &mut server) } == 0 {
        return Err(io::Error::last_os_error());
    }
    if server != host_pid {
        return Err(io::Error::other(format!(
            "the pipe is served by pid {server}, not the host {host_pid}"
        )));
    }
    Ok(Arc::new(pipe))
}

/// Starts the reader and writer threads.
pub(super) fn start(pipe: &Arc<OwnedHandle>, inbox: &Arc<Inbox>, out: &Arc<Outbox>) -> io::Result<()> {
    let (io, i) = (Overlapped::new(pipe.clone())?, inbox.clone());
    helper("channel-reader", move || read_requests(&io, &i))?;
    let (io, i, o) = (Overlapped::new(pipe.clone())?, inbox.clone(), out.clone());
    helper("channel-writer", move || write_replies(&io, &o, &i))
}

/// A small helper thread.
pub(super) fn helper(name: &str, f: impl FnOnce() + Send + 'static) -> io::Result<()> {
    std::thread::Builder::new()
        .name(name.into())
        .stack_size(STACK)
        .spawn(f)
        .map(drop)
}

fn read_requests(io: &Overlapped, inbox: &Inbox) {
    let (mut buf, mut start, mut chunk) = (Vec::new(), 0, vec![0u8; 64 * 1024]);
    loop {
        match omni_proto::decode(buf.get(start..).unwrap_or_default()) {
            Ok(Some((msg, used))) => {
                start += used;
                let request = matches!(
                    msg,
                    Msg::Spawn(_)
                        | Msg::Go { .. }
                        | Msg::Stop { .. }
                        | Msg::Resize { .. }
                        | Msg::List { .. }
                        | Msg::Release { .. }
                );
                // A supervisor-bound kind from the host is malformed: the host is gone.
                if !request || !inbox.request(msg) {
                    break;
                }
            }
            Ok(None) => {
                buf.drain(..start);
                start = 0;
                match io.read(&mut chunk) {
                    Ok(n) => buf.extend_from_slice(chunk.get(..n).unwrap_or_default()),
                    Err(_) => break,
                }
            }
            Err(_) => break,
        }
    }
    inbox.event(Event::HostGone);
}

fn write_replies(io: &Overlapped, out: &Outbox, inbox: &Inbox) {
    while let Some(frames) = out.take() {
        let mut rest = frames.as_slice();
        while !rest.is_empty() {
            match io.write(rest) {
                Ok(n) if n > 0 => rest = rest.get(n..).unwrap_or_default(),
                _ => {
                    out.close();
                    inbox.event(Event::HostGone);
                    return;
                }
            }
        }
        out.written();
        inbox.progress();
    }
}

/// One thread's side of the pipe: its own event, so reads and writes can overlap.
struct Overlapped {
    pipe: Arc<OwnedHandle>,
    event: OwnedHandle,
}

impl Overlapped {
    fn new(pipe: Arc<OwnedHandle>) -> io::Result<Overlapped> {
        // SAFETY: an anonymous manual-reset event, not inheritable; the result is checked for null.
        let e = unsafe { CreateEventW(std::ptr::null(), TRUE, 0, std::ptr::null()) };
        // SAFETY: `e` is null or a fresh handle owned by nobody else.
        let event = OwnedHandle::try_from(unsafe { HandleOrNull::from_raw_handle(e) })
            .map_err(|_| io::Error::last_os_error())?;
        Ok(Overlapped { pipe, event })
    }

    fn read(&self, buf: &mut [u8]) -> io::Result<usize> {
        let mut ov = OVERLAPPED {
            hEvent: self.event.as_raw_handle(),
            ..Default::default()
        };
        let len = u32::try_from(buf.len()).unwrap_or(u32::MAX);
        // SAFETY: `buf` and `ov` outlive the operation: `finish` waits for it to complete.
        let ok = unsafe {
            ReadFile(
                self.pipe.as_raw_handle(),
                buf.as_mut_ptr(),
                len,
                std::ptr::null_mut(),
                &mut ov,
            )
        };
        self.finish(ok, &ov)
    }

    fn write(&self, buf: &[u8]) -> io::Result<usize> {
        let mut ov = OVERLAPPED {
            hEvent: self.event.as_raw_handle(),
            ..Default::default()
        };
        let len = u32::try_from(buf.len()).unwrap_or(u32::MAX);
        // SAFETY: as in `read`.
        let ok = unsafe {
            WriteFile(
                self.pipe.as_raw_handle(),
                buf.as_ptr(),
                len,
                std::ptr::null_mut(),
                &mut ov,
            )
        };
        self.finish(ok, &ov)
    }

    /// Waits for the operation `ov` started; a message-mode partial read (`ERROR_MORE_DATA`) is data.
    fn finish(&self, ok: i32, ov: &OVERLAPPED) -> io::Result<usize> {
        let more = |e: &io::Error| e.raw_os_error() == Some(ERROR_MORE_DATA as i32);
        if ok == 0 {
            let e = io::Error::last_os_error();
            if e.raw_os_error() != Some(ERROR_IO_PENDING as i32) && !more(&e) {
                return Err(e); // nothing was queued
            }
        }
        let mut n = 0;
        // SAFETY: `ov` belongs to an operation queued on this pipe; waiting completes it before `ov` is dropped.
        if unsafe { GetOverlappedResult(self.pipe.as_raw_handle(), ov, &mut n, TRUE) } == 0 {
            let e = io::Error::last_os_error();
            if !more(&e) {
                return Err(e);
            }
        }
        Ok(n as usize)
    }
}
