//! Bootstrap (R7): the supervisor's own console, the host-death watch, the channel and `Ready`; and the helper
//! thread that waits on a process handle.

use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrNull, OwnedHandle};
use std::sync::Arc;

use omni_proto::{INFO_PIDFD_HOST, Msg, VERSION};
use windows_sys::Win32::Foundation::{FALSE, TRUE};
use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
use windows_sys::Win32::System::Threading::{INFINITE, OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject};

use super::diag::Diag;
use super::members::Members;
use super::queues::{Event, Inbox, Outbox};
use super::{Supervisor, channel};
use crate::Args;

/// Bootstrap (R7): own console, host-death watch, then the channel, then `Ready`. Nothing here is inherited.
pub(super) fn start(args: &Args) -> io::Result<Supervisor> {
    own_console();
    let name = args.pipe.as_deref().ok_or_else(|| io::Error::other("missing --pipe"))?;
    // SAFETY: a plain open by pid, not inheritable; checked for null.
    let host = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, FALSE, args.host_pid) };
    // SAFETY: `host` is null or a fresh handle owned by nobody else.
    let host = OwnedHandle::try_from(unsafe { HandleOrNull::from_raw_handle(host) })
        .map_err(|_| io::Error::last_os_error())?;
    let inbox = Arc::new(Inbox::default());
    let out = Arc::new(Outbox::default());
    // Armed before the channel exists, so it is armed before Ready.
    watch(host, &inbox, |_| Event::HostGone)?;
    let members = Members::start(&inbox)?;
    let diag = Arc::new(Diag::default());
    diag.start(io::stderr())?;
    // The pipe's server must be the host: the handle above then names the live host, not a reused pid.
    let pipe = channel::connect(name, args.host_pid)?;
    channel::start(&pipe, &inbox, &out)?;
    let sup = Supervisor::new(inbox, out, members, diag, pipe.as_raw_handle() as usize);
    sup.send(&Msg::Ready {
        version: VERSION,
        pid: std::process::id(),
        info: INFO_PIDFD_HOST, // the host is watched through its process handle
    });
    Ok(sup)
}

/// The supervisor runs on its own console (the host starts it with `CREATE_NO_WINDOW`), so its
/// CTRL_BREAKs never reach the host and nothing here changes the host's console state. Children inherit
/// the ignore-Ctrl+C flag from their creator, so it is cleared here (a terminal child must be
/// interruptible); the supervisor itself ignores every console event.
fn own_console() {
    unsafe extern "system" fn ignore(_event: u32) -> i32 {
        TRUE
    }
    // SAFETY: changes only this process's handler list; `ignore` lives as long as the process.
    unsafe {
        SetConsoleCtrlHandler(None, FALSE);
        SetConsoleCtrlHandler(Some(ignore), TRUE);
    }
}

/// Waits for `handle` on a helper thread, then queues `event(&handle)`.
pub(super) fn watch(
    handle: OwnedHandle,
    inbox: &Arc<Inbox>,
    event: impl FnOnce(&OwnedHandle) -> Event + Send + 'static,
) -> io::Result<()> {
    let inbox = inbox.clone();
    channel::helper("watch", move || {
        // SAFETY: a valid process handle owned by this thread.
        unsafe { WaitForSingleObject(handle.as_raw_handle(), INFINITE) };
        inbox.event(event(&handle));
    })
}
