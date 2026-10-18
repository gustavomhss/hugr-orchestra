//! The blocking reader threads: one per source, each feeding `Shared` (see `queue`).

use std::fs::File;
use std::io::{ErrorKind, Read};
use std::sync::{Arc, mpsc};
use std::thread;

use super::{CHUNK, STACK, Shared};
use crate::error::Error;
use crate::io::Pipe;

/// Starts the reader of `slot`. A terminal's reader is running when this returns, so the held root may
/// exec (ADR-0005 R9): a terminal drops what nobody read once its session leader exits (macOS).
pub(in crate::io) fn read(shared: &Arc<Shared>, slot: usize, source: Pipe, pty: bool) -> Result<(), Error> {
    let shared = Arc::clone(shared);
    let (running, started) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("hugr-omni-out".into())
        .stack_size(STACK)
        .spawn(move || {
            let _ = running.send(());
            pump(&shared, slot, File::from(source), pty);
        })
        .map_err(|e| Error::io_thread("an output reader", &e))?;
    if pty {
        let _ = started.recv();
    }
    Ok(())
}

fn pump(shared: &Shared, slot: usize, mut source: File, pty: bool) {
    let mut buf = vec![0; CHUNK];
    loop {
        match source.read(&mut buf) {
            Ok(0) => break shared.finish(slot, None),
            Ok(n) => {
                if !shared.accept(slot, &buf[..n]) {
                    break;
                }
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => {}
            // Linux reports the end of a terminal's output as EIO once its last holder closed it.
            Err(e) if pty && is_eio(&e) => break shared.finish(slot, None),
            Err(e) => break shared.finish(slot, Some(Error::read_failed(shared.streams[slot], &e))),
        }
    }
}

#[cfg(unix)]
fn is_eio(e: &std::io::Error) -> bool {
    e.raw_os_error() == Some(libc::EIO)
}

#[cfg(windows)]
fn is_eio(_: &std::io::Error) -> bool {
    false
}
