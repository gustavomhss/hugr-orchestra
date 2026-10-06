//! ConPTY in the supervisor (W12w): flags 0, PTY-side ends closed after creation, explicit null standard
//! handles; `ClosePseudoConsole` on a worker thread with an independent deadline (ADR-0003, ADR-0005).
//! `CreateProcessW` with the `PSEUDOCONSOLE` attribute is the event loop's (`windows`, W06).
//!
//! SEAM (frozen in W00): `ConPty`, `ConPtyEnds`, `create` and the `ConPty` methods. Bodies belong to W12w.
//!
//! One terminal, from its creation to the end of its stream (ADR-0003 Q1–Q6, ADR-0005 §2 and §6):
//! 1. `create` starts the closer thread before anything else exists. If it cannot start, `create` fails with
//!    nothing to undo, so no pseudoconsole ever exists without its closer, and `ClosePseudoConsole` can only
//!    run there (by construction, not by a fallback).
//! 2. Two anonymous pipes, neither inheritable: input (the host writes, conhost reads) and output (conhost
//!    writes what the terminal shows, the host reads).
//! 3. `CreatePseudoConsole` with flags 0. Never `PSEUDOCONSOLE_INHERIT_CURSOR`: with it conhost asks the terminal
//!    for the cursor position (`ESC[6n`) and holds back every byte of output until someone answers. On success
//!    the closer receives the pseudoconsole; on any failure it is left with nothing and exits without a close.
//! 4. The PTY-side ends (input read, output write) are closed at once. Conhost holds its own copies; ours would
//!    keep the output pipe open after conhost exits, and the host would never read the end of the stream.
//! 5. `windows::spawn` creates the root with one attribute list {`JOB_LIST`, `PSEUDOCONSOLE`}, so it is born in
//!    its Job; `STARTF_USESTDHANDLES` with null standard handles (without it the root writes to the supervisor's
//!    stdout, not to the terminal); `bInheritHandles = FALSE`; no `CREATE_NEW_PROCESS_GROUP`, which would make
//!    it ignore Ctrl+C. The supervisor cleared its own ignore-Ctrl+C flag at start, so the root inherits it
//!    cleared and `"\x03"` written to the input interrupts it.
//! 6. The host pulls both ends out of the supervisor (`DUPLICATE_CLOSE_SOURCE`) and reads the output from then
//!    on, on a thread of its own.
//! 7. The hang-up, at root exit or as the graceful step of a stop, drops the `ConPty`: the closer thread calls
//!    `ClosePseudoConsole`. Conhost sends CTRL_CLOSE to every process still on the terminal, writes its last
//!    frame and exits; the host then reads the end of the stream. Before Windows 11 24H2 (build 26100) the call
//!    waits for all of that, about 5 s while a process blocks in its CTRL_CLOSE handler (the OS ends it then).
//!    This is why it never runs on the owner thread.
//! 8. At the stop deadline the owner thread terminates the Job, whether or not the close has returned. Once the
//!    terminal's processes are gone conhost exits, the stream ends and a waiting close returns.

use std::io;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::sync::mpsc::{self, Sender};
use std::time::Instant;

use windows_sys::Win32::System::Console::{COORD, ClosePseudoConsole, CreatePseudoConsole, HPCON, ResizePseudoConsole};
use windows_sys::Win32::System::Pipes::CreatePipe;

/// The closer thread only waits and calls `ClosePseudoConsole`.
const STACK: usize = 64 * 1024;

/// A pseudoconsole owned by the supervisor.
#[derive(Debug)]
pub(crate) struct ConPty {
    hpc: HPCON,
    /// The closer's channel: it carried `hpc` (step 3); dropped with the `ConPty`, it wakes the closer (step 7).
    _hang_up: Sender<HPCON>,
}

/// The host's ends, to be transferred with `DUPLICATE_CLOSE_SOURCE`.
#[derive(Debug)]
pub(crate) struct ConPtyEnds {
    /// What the terminal shows (host reads).
    pub output: OwnedHandle,
    /// What is typed (host writes).
    pub input: OwnedHandle,
}

/// Creates a pseudoconsole of `cols` x `rows`.
pub(crate) fn create(cols: u16, rows: u16) -> io::Result<(ConPty, ConPtyEnds)> {
    let size = coord(cols, rows)?;
    // Step 1: from here on, every early return drops `hang_up`, and the closer exits without a close.
    let (hang_up, hung_up) = mpsc::channel::<HPCON>();
    std::thread::Builder::new()
        .name("conpty-close".into())
        .stack_size(STACK)
        .spawn(move || {
            // The pseudoconsole, if `create` made one; then wait until the `ConPty` is gone (its sender with it).
            if let Ok(hpc) = hung_up.recv() {
                let _ = hung_up.recv();
                // SAFETY: the pseudoconsole `create` made, closed only here, once; nothing uses it any more.
                unsafe { ClosePseudoConsole(hpc) };
            }
        })?;
    // Step 2.
    let (pty_input, input) = pipe()?;
    let (output, pty_output) = pipe()?;
    let mut hpc: HPCON = 0;
    // SAFETY: two valid pipe ends and a valid out pointer; flags 0 (step 3).
    let hr = unsafe { CreatePseudoConsole(size, pty_input.as_raw_handle(), pty_output.as_raw_handle(), 0, &mut hpc) };
    // Step 4, on every path.
    drop((pty_input, pty_output));
    check(hr)?;
    // Cannot fail: the closer keeps its receiver until it has received this. Were it gone, the pseudoconsole
    // would stay open (never a close here, on the caller's thread).
    let _ = hang_up.send(hpc);
    let pty = ConPty { hpc, _hang_up: hang_up };
    Ok((pty, ConPtyEnds { output, input }))
}

impl ConPty {
    /// For the `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE` attribute.
    pub(crate) fn handle(&self) -> HPCON {
        self.hpc
    }

    /// `ResizePseudoConsole`.
    pub(crate) fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        let size = coord(cols, rows)?;
        // SAFETY: a live pseudoconsole: it is closed only after `self` is gone.
        check(unsafe { ResizePseudoConsole(self.hpc, size) })
    }

    /// Closes on a worker thread; the caller enforces `deadline` independently (the close can block).
    pub(crate) fn close(self, deadline: Instant) {
        // Dropping `self` wakes the closer (step 7). Nothing here waits, so the deadline stays the caller's (step 8).
        let _ = deadline;
        drop(self);
    }
}

/// An anonymous pipe, both ends not inheritable: (read, write).
fn pipe() -> io::Result<(OwnedHandle, OwnedHandle)> {
    let (mut r, mut w) = (std::ptr::null_mut(), std::ptr::null_mut());
    // SAFETY: valid out pointers, null attributes (not inheritable), the default buffer size.
    if unsafe { CreatePipe(&mut r, &mut w, std::ptr::null(), 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: two fresh handles owned by nobody else.
    Ok(unsafe { (OwnedHandle::from_raw_handle(r), OwnedHandle::from_raw_handle(w)) })
}

/// A size conhost takes: 1..=32767 cells each way.
fn coord(cols: u16, rows: u16) -> io::Result<COORD> {
    match (i16::try_from(cols), i16::try_from(rows)) {
        (Ok(x @ 1..), Ok(y @ 1..)) => Ok(COORD { X: x, Y: y }),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("terminal size {cols}x{rows} is outside 1..=32767 cells each way"),
        )),
    }
}

/// An `HRESULT` as a result; a wrapped Win32 error (`HRESULT_FROM_WIN32`) comes back as that error's code.
fn check(hr: i32) -> io::Result<()> {
    if hr >= 0 {
        return Ok(());
    }
    let hr = hr as u32;
    let code = if hr >> 16 == 0x8007 { hr & 0xFFFF } else { hr };
    Err(io::Error::from_raw_os_error(code as i32))
}
