//! Unix: signal dispositions, `raise`, `setsid`, the terminal size, closing stdin.

use std::sync::atomic::{AtomicPtr, Ordering};

const NAMES: &[(&str, libc::c_int)] = &[
    ("SIGHUP", libc::SIGHUP),
    ("SIGINT", libc::SIGINT),
    ("SIGQUIT", libc::SIGQUIT),
    ("SIGABRT", libc::SIGABRT),
    ("SIGKILL", libc::SIGKILL),
    ("SIGSEGV", libc::SIGSEGV),
    ("SIGPIPE", libc::SIGPIPE),
    ("SIGALRM", libc::SIGALRM),
    ("SIGTERM", libc::SIGTERM),
    ("SIGUSR1", libc::SIGUSR1),
    ("SIGUSR2", libc::SIGUSR2),
];

/// The number of a terminating signal by name (`SIGTERM`).
pub fn signal_number(name: &str) -> Option<i32> {
    NAMES.iter().find(|(n, _)| *n == name).map(|&(_, s)| s)
}

/// Raises `sig` with the default disposition, unblocked, so it takes effect now.
pub fn raise(sig: i32) {
    // SAFETY: plain libc calls on a valid signal number and a zero-initialized, then emptied, sigset_t.
    unsafe {
        libc::signal(sig, libc::SIG_DFL);
        let mut set: libc::sigset_t = std::mem::zeroed();
        libc::sigemptyset(&mut set);
        libc::sigaddset(&mut set, sig);
        libc::pthread_sigmask(libc::SIG_UNBLOCK, &set, std::ptr::null_mut());
        libc::raise(sig);
    }
}

fn set_term(handler: libc::sighandler_t) {
    for sig in [libc::SIGTERM, libc::SIGHUP] {
        // SAFETY: `handler` is SIG_IGN, SIG_DFL or an async-signal-safe `extern "C" fn(c_int)`.
        unsafe { libc::signal(sig, handler) };
    }
}

/// Ignores SIGTERM and SIGHUP (inherited across exec, which is the point for `tree=<n>:resist`).
pub fn ignore_term() {
    set_term(libc::SIG_IGN);
}

/// Restores SIGTERM and SIGHUP to their defaults (a descendant must not inherit an ignore by accident).
pub fn default_term() {
    set_term(libc::SIG_DFL);
}

/// What `on-term` prints, published as one immutable record behind one atomic pointer, so the handler can never
/// pair one text's pointer with another's length. Records are leaked, never freed (the fixture is short-lived).
struct Farewell {
    text: &'static [u8],
}

static FAREWELL: AtomicPtr<Farewell> = AtomicPtr::new(std::ptr::null_mut());

extern "C" fn on_term_handler(_: libc::c_int) {
    let record = FAREWELL.load(Ordering::Acquire);
    // SAFETY: this runs in the signal handler. `record` is null or points to a leaked `Farewell` that is never
    // freed and never changed after its Release store (made before the handler was installed), so dereferencing it
    // here is sound whenever the signal lands; the atomic load is lock-free, and write(2) and _exit(2) are
    // async-signal-safe.
    unsafe {
        if let Some(farewell) = record.as_ref() {
            libc::write(1, farewell.text.as_ptr().cast(), farewell.text.len());
        }
        libc::_exit(0);
    }
}

/// On SIGTERM or SIGHUP: print `text`, exit 0.
pub fn on_term(text: Vec<u8>) {
    let record: &'static mut Farewell = Box::leak(Box::new(Farewell {
        text: Box::leak(text.into_boxed_slice()),
    }));
    FAREWELL.store(record, Ordering::Release);
    set_term(on_term_handler as *const () as libc::sighandler_t);
}

/// Leaves the session (and the process group) of the parent.
pub fn setsid() {
    // SAFETY: setsid(2) has no memory arguments; it fails harmlessly for a group leader.
    unsafe { libc::setsid() };
}

/// Closes fd 0, so the writer of the stdin pipe sees it closed while this process lives.
pub fn close_stdin() {
    // SAFETY: closing fd 0 affects no Rust-owned object; std's stdin then reads EBADF.
    unsafe { libc::close(0) };
}

/// The size of the terminal on stdout, stdin or stderr; `(0, 0)` without one.
pub fn term_size() -> (u16, u16) {
    for fd in [1, 0, 2] {
        // SAFETY: TIOCGWINSZ writes one `winsize` into the zero-initialized local passed by pointer.
        let size = unsafe {
            let mut ws: libc::winsize = std::mem::zeroed();
            (libc::ioctl(fd, libc::TIOCGWINSZ, &mut ws) == 0).then_some((ws.ws_col, ws.ws_row))
        };
        if let Some(size) = size {
            return size;
        }
    }
    (0, 0)
}
