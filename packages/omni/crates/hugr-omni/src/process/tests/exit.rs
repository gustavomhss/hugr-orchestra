//! C-EXIT-01: the pure `Exit` (precedence of `reason`, signal names) and the grace `stop` sends.

use std::time::Duration;

use crate::client::RootExit::{Code, Signal};
use crate::error::ErrorCode;
use crate::process::exit::{of, signal_name};
use crate::process::life::grace;
use crate::types::Reason::{self, Aborted, Killed, Timeout};

#[test]
fn reason_is_the_root_status_unless_the_library_acted_first() {
    let cases = [
        // The root's exit was observed first: its own status.
        (Code(0), None, Some(0), None, Reason::Exit),
        (Code(42), None, Some(42), None, Reason::Exit),
        (Code(3_221_225_786), None, Some(3_221_225_786), None, Reason::Exit),
        (Signal(15), None, None, Some("SIGTERM"), Reason::Signal),
        // The library acted first: its cause, with the root's native status kept.
        (Code(0), Some(Killed), Some(0), None, Killed),
        (Signal(9), Some(Timeout), None, Some("SIGKILL"), Timeout),
        (Code(u32::MAX), Some(Aborted), Some(u32::MAX), None, Aborted),
        // `Exit` and `Signal` are not library actions.
        (Code(7), Some(Reason::Exit), Some(7), None, Reason::Exit),
        (Signal(2), Some(Reason::Signal), None, Some("SIGINT"), Reason::Signal),
    ];
    for (root, cause, code, signal, reason) in cases {
        let exit = of(root, cause);
        let got = (exit.code, exit.signal.as_deref(), exit.reason);
        assert_eq!(got, (code, signal, reason), "{root:?} with {cause:?}");
        assert_eq!(exit.success(), reason == Reason::Exit && code == Some(0), "{exit:?}");
    }
}

#[test]
fn signal_names_follow_each_os_numbering() {
    let cases = [
        (15, "linux", "SIGTERM"),
        (15, "macos", "SIGTERM"),
        (9, "linux", "SIGKILL"),
        (9, "macos", "SIGKILL"),
        (10, "linux", "SIGUSR1"),
        (30, "macos", "SIGUSR1"),
        (7, "linux", "SIGBUS"),
        (10, "macos", "SIGBUS"),
        (7, "macos", "SIGEMT"),
        (31, "linux", "SIGSYS"),
        (12, "freebsd", "SIGSYS"),
        // Unnamed: a Linux real-time signal, one that never ends a process by default, and junk.
        (34, "linux", "SIG34"),
        (16, "macos", "SIG16"),
        (0, "linux", "SIG0"),
    ];
    for (num, os, name) in cases {
        assert_eq!(signal_name(num, os), name, "{num} on {os}");
    }
}

#[test]
fn grace_is_whole_milliseconds_rounded_up_and_bounded() {
    let ms = Duration::from_millis;
    assert_eq!(grace(Duration::ZERO).ok(), Some(ms(0)));
    assert_eq!(grace(Duration::from_micros(1500)).ok(), Some(ms(2)));
    assert_eq!(grace(Duration::from_nanos(1)).ok(), Some(ms(1)));
    assert_eq!(grace(ms(u64::from(u32::MAX))).ok(), Some(ms(u64::from(u32::MAX))));
    for over in [ms(u64::from(u32::MAX)) + Duration::from_nanos(1), Duration::MAX] {
        let e = grace(over).expect_err("over the limit");
        assert_eq!(e.code(), ErrorCode::InvalidArgument, "{e}");
        assert!(e.to_string().contains("graceMs"), "{e}");
    }
}
