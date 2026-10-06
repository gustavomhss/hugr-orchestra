//! Windows: console control events, the console size, closing stdin. There are no signals and no sessions.

use std::io::Write;
use std::sync::OnceLock;
use std::time::Duration;

use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::System::Console::{
    CONSOLE_SCREEN_BUFFER_INFO, CTRL_BREAK_EVENT, CTRL_C_EVENT, CTRL_CLOSE_EVENT, GetConsoleScreenBufferInfo,
    GetStdHandle, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, SetConsoleCtrlHandler,
};
use windows_sys::core::BOOL;

/// Windows has no signals: `signal=` is a bad value here.
pub fn signal_number(_name: &str) -> Option<i32> {
    None
}

/// Never reached: `signal=` does not parse on Windows.
pub fn raise(_sig: i32) {}

unsafe extern "system" fn ignore_handler(event: u32) -> BOOL {
    if event >= CTRL_CLOSE_EVENT {
        // Returning would let the OS end the process; blocking is how a program resists a close.
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    }
    1
}

/// Ignores CTRL_C, CTRL_BREAK and CTRL_CLOSE.
pub fn ignore_term() {
    // SAFETY: registers a handler with the signature the API expects; it touches no shared state.
    unsafe { SetConsoleCtrlHandler(Some(ignore_handler), 1) };
}

/// Nothing to restore: handlers are not inherited by a new process.
pub fn default_term() {}

static TEXT: OnceLock<Vec<u8>> = OnceLock::new();

unsafe extern "system" fn on_term_handler(event: u32) -> BOOL {
    if event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT || event == CTRL_CLOSE_EVENT {
        let mut out = std::io::stdout().lock();
        let _ = out.write_all(TEXT.get().map_or(&[], Vec::as_slice));
        let _ = out.flush();
        std::process::exit(0);
    }
    0
}

/// On CTRL_C, CTRL_BREAK or CTRL_CLOSE: print `text`, exit 0.
pub fn on_term(text: Vec<u8>) {
    let _ = TEXT.set(text);
    // SAFETY: registers a handler with the signature the API expects; it reads only the OnceLock above.
    unsafe { SetConsoleCtrlHandler(Some(on_term_handler), 1) };
}

/// No sessions on Windows.
pub fn setsid() {}

/// Closes the stdin handle, so the writer of the stdin pipe sees it closed while this process lives.
pub fn close_stdin() {
    // SAFETY: closes this process's own standard input handle; nothing in this program uses it afterwards.
    unsafe { CloseHandle(GetStdHandle(STD_INPUT_HANDLE)) };
}

/// The visible window of the console on stdout; `(0, 0)` without one.
pub fn term_size() -> (u16, u16) {
    // SAFETY: the API writes one CONSOLE_SCREEN_BUFFER_INFO into the zero-initialized local.
    unsafe {
        let mut info: CONSOLE_SCREEN_BUFFER_INFO = std::mem::zeroed();
        if GetConsoleScreenBufferInfo(GetStdHandle(STD_OUTPUT_HANDLE), &mut info) == 0 {
            return (0, 0);
        }
        let w = info.srWindow;
        ((w.Right - w.Left + 1) as u16, (w.Bottom - w.Top + 1) as u16)
    }
}
