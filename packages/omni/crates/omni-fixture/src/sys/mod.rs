//! The OS calls of the fixture: signals and console events, the terminal size, `setsid`, closing stdin.
//! Every `unsafe` block of this crate lives here (INV-11).

use std::io::IsTerminal;

#[cfg(unix)]
mod unix;
#[cfg(unix)]
pub use unix::*;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

/// Whether standard handle `fd` (0, 1, 2) is a terminal.
pub fn is_tty(fd: u8) -> bool {
    match fd {
        0 => std::io::stdin().is_terminal(),
        1 => std::io::stdout().is_terminal(),
        _ => std::io::stderr().is_terminal(),
    }
}
