//! Root exits: `waitid(WNOWAIT)` reads a root's exit without reaping it, and `Exited` is sent once for a root
//! that exec'd.

use omni_proto::{Exit, Msg};

use super::trees::{Exec, Tree};

/// Sends `Exited` once, for a root that exec'd and whose exit is recorded.
pub(super) fn exited_msg(id: u64, t: &mut Tree, out: &mut Vec<Msg>) {
    if let (Some(exit), Exec::Running, false) = (t.exit, &t.exec, t.exited_sent) {
        t.exited_sent = true;
        out.push(Msg::Exited { id, exit });
    }
}

/// `waitid(WEXITED | WNOHANG | WNOWAIT)`: the root's exit, leaving it a zombie that pins its numbers. Only
/// `CLD_EXITED`/`CLD_KILLED`/`CLD_DUMPED` count: macOS also reports a merely stopped child here.
pub(super) fn wait_exit(pid: i32) -> std::io::Result<Option<Exit>> {
    // SAFETY: siginfo_t is plain old data; all-zero is valid and means "no child changed state".
    let mut si: libc::siginfo_t = unsafe { std::mem::zeroed() };
    let id = libc::id_t::try_from(pid).map_err(std::io::Error::other)?;
    // SAFETY: `si` is writable storage for the result.
    let r = unsafe {
        libc::waitid(
            libc::P_PID,
            id,
            &raw mut si,
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    super::sys::cvt(r)?;
    // SAFETY: waitid filled `si` (or left it zeroed); these accessors read its plain fields.
    let (who, status) = unsafe { (si.si_pid(), si.si_status()) };
    if who != pid {
        return Ok(None);
    }
    Ok(match si.si_code {
        libc::CLD_EXITED => Some(Exit::Code(status.cast_unsigned() & 0xff)),
        libc::CLD_KILLED | libc::CLD_DUMPED => Some(Exit::Signal(status)),
        _ => None,
    })
}
