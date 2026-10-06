//! The terminal side of PTYSYS-W, included as `term` by `windows_pty.rs`: a terminal spawn through W06's test
//! host (`windows_host.rs`), the host pulling its ends out of the supervisor, the output read on a thread and
//! searched for markers, and the program the tests run on the terminal (this test binary again, as
//! `pty_child`).
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "windows_host.rs"]
pub mod host;

use std::ffi::OsStr;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::windows::io::{AsRawHandle, OwnedHandle};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use host::os::{check, owned};
use host::{Host, Proc, Spec, T};
use omni_proto::{Msg, Slot, Spawn};
use windows_sys::Win32::Foundation::{
    DUPLICATE_CLOSE_SOURCE, DUPLICATE_SAME_ACCESS, DuplicateHandle, FALSE, HANDLE, TRUE,
};
use windows_sys::Win32::System::Console::{
    CONSOLE_SCREEN_BUFFER_INFO, CTRL_C_EVENT, CTRL_CLOSE_EVENT, GenerateConsoleCtrlEvent, GetConsoleScreenBufferInfo,
    GetStdHandle, STD_OUTPUT_HANDLE, SetConsoleCtrlHandler,
};
use windows_sys::Win32::System::Threading::GetCurrentProcess;

/// The arguments that select `pty_child` in `windows_pty.rs`'s binary, then `--`.
pub const PTY_CHILD: [&str; 5] = ["pty_child", "--exact", "--ignored", "--nocapture", "--"];

/// `STATUS_CONTROL_C_EXIT`: how a console program ends on a Ctrl+C or a hang-up it does not handle.
pub const CTRL_EXIT: u32 = 0xC000_013A;

/// A terminal tree, seen from the host.
pub struct Term {
    /// Tree id.
    pub id: u64,
    /// The root, seen by the OS.
    pub root: Proc,
    /// What the terminal shows.
    pub screen: Screen,
    input: File,
}

impl Term {
    /// Spawns `pty_child <args>` on a terminal of `size`, which must succeed.
    pub fn spawn(host: &mut Host, args: &[&str], size: (u16, u16)) -> Term {
        match spawn_reply(host, args, size) {
            Msg::Spawned {
                id,
                pid,
                pty_ends: [output, input],
                ..
            } => {
                // The output first: until someone reads it conhost blocks, and before 24H2 so does its close.
                let screen = Screen::new(File::from(pull(host, output)));
                Term {
                    id,
                    root: Proc::open(pid),
                    screen,
                    input: File::from(pull(host, input)),
                }
            }
            other => panic!("unexpected reply to a terminal Spawn: {other:?}"),
        }
    }

    /// Types `bytes` on the terminal.
    pub fn type_in(&mut self, bytes: &[u8]) {
        self.input.write_all(bytes).unwrap();
    }
}

/// Sends the `Spawn` of `pty_child <args>` on a terminal of `size` (no stdio handles) and returns the reply.
pub fn spawn_reply(host: &mut Host, args: &[&str], size: (u16, u16)) -> Msg {
    let all: Vec<&str> = PTY_CHILD.iter().chain(args).copied().collect();
    let spec = Spec::program(&std::env::current_exe().unwrap(), &all);
    let bytes = |s: &OsStr| s.as_encoded_bytes().to_vec();
    let req = host.req();
    host.send(&Msg::Spawn(Spawn {
        req,
        program: bytes(spec.program.as_os_str()),
        argv: spec.argv.iter().map(|a| bytes(a)).collect(),
        env: spec.env.iter().map(|(k, v)| (bytes(k), bytes(v))).collect(),
        cwd: bytes(spec.cwd.as_os_str()),
        pty: Some(size),
        stdin: Slot::Null,
        stderr: Slot::Pipe,
        grace_ms: spec.grace_ms,
        handles: [0; 3],
    }));
    host.reply(req)
}

/// Takes a handle out of the supervisor with `DUPLICATE_CLOSE_SOURCE`, as the host does with `pty_ends`.
fn pull(host: &Host, value: u64) -> OwnedHandle {
    assert_ne!(value, 0, "a terminal end is missing");
    let mut h = std::ptr::null_mut();
    // SAFETY: the supervisor's process handle (full access) and a valid out pointer; the call closes the source.
    let ok = unsafe {
        DuplicateHandle(
            host.sup.as_raw_handle(),
            value as HANDLE,
            GetCurrentProcess(),
            &mut h,
            0,
            FALSE,
            DUPLICATE_SAME_ACCESS | DUPLICATE_CLOSE_SOURCE,
        )
    };
    check(ok, "pull a terminal end");
    owned(h, "pull a terminal end")
}

#[derive(Default)]
struct Shown {
    raw: Vec<u8>,
    end: Option<Instant>,
    error: Option<String>,
}

/// The terminal's output, read on a thread from the moment of the spawn. Markers are searched in the visible
/// text (`visible`); each search starts after the previous match.
pub struct Screen {
    shown: Arc<(Mutex<Shown>, Condvar)>,
    from: std::cell::Cell<usize>,
}

impl Screen {
    fn new(mut r: File) -> Screen {
        let shown = Arc::new((Mutex::new(Shown::default()), Condvar::new()));
        let s = shown.clone();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 64 * 1024];
            loop {
                let read = r.read(&mut buf);
                let mut g = s.0.lock().unwrap();
                match read {
                    Ok(n) if n > 0 => g.raw.extend_from_slice(&buf[..n]),
                    // std reads a broken pipe as 0: conhost closed its end.
                    other => {
                        g.error = other.err().map(|e| e.to_string());
                        g.end = Some(Instant::now());
                    }
                }
                s.1.notify_all();
                if g.end.is_some() {
                    return;
                }
            }
        });
        Screen {
            shown,
            from: Default::default(),
        }
    }

    /// Waits (within `T`) until `find` matches the visible text after the last match: `Some((end, value))`.
    fn until<R>(&self, what: &str, find: impl Fn(&str) -> Option<(usize, R)>) -> R {
        let from = self.from.get();
        let g = self.shown.0.lock().unwrap();
        let (g, _) = self
            .shown
            .1
            .wait_timeout_while(g, T, |s| s.end.is_none() && find(&visible(&s.raw)[from..]).is_none())
            .unwrap();
        let text = visible(&g.raw);
        match find(&text[from..]) {
            Some((end, value)) => {
                self.from.set(from + end);
                value
            }
            None => panic!(
                "waiting for {what}: ended={:?}; the terminal showed {text:?}",
                g.end.is_some()
            ),
        }
    }

    /// The next `token`.
    pub fn wait(&self, token: &str) {
        self.until(token, |t| t.find(token).map(|i| (i + token.len(), ())));
    }

    /// The value of the next `<key>=<value>;`.
    pub fn value(&self, key: &str) -> String {
        let key = format!("{key}=");
        self.until(&key, |t| {
            let start = t.find(&key)? + key.len();
            let len = t[start..].find(';')?;
            Some((start + len + 1, t[start..start + len].to_string()))
        })
    }

    /// Waits (within `T`) for the end of the stream: when it ended, and everything it showed.
    pub fn end(&self) -> (Instant, String) {
        let g = self.shown.0.lock().unwrap();
        let (g, _) = self.shown.1.wait_timeout_while(g, T, |s| s.end.is_none()).unwrap();
        let text = visible(&g.raw);
        let end = g
            .end
            .unwrap_or_else(|| panic!("the stream did not end; the terminal showed {text:?}"));
        assert!(g.error.is_none(), "reading the terminal failed: {:?}", g.error);
        (end, text)
    }
}

/// The text of a ConPTY stream, for finding markers only: escape sequences dropped, `\r` dropped, a cursor move
/// right (CUF) as that many spaces and a cursor position (CUP) as a line break, since ConPTY renders blank cells
/// and line starts that way.
pub fn visible(raw: &[u8]) -> String {
    let s = String::from_utf8_lossy(raw);
    let (mut out, mut it) = (String::new(), s.chars());
    while let Some(c) = it.next() {
        match c {
            '\x1b' => match it.next() {
                Some('[') => {
                    let mut params = String::new();
                    for d in it.by_ref() {
                        match d {
                            'C' => out.extend(std::iter::repeat_n(' ', params.parse().unwrap_or(1).min(512))),
                            'H' | 'f' => out.push('\n'),
                            '@'..='~' => {}
                            _ => {
                                params.push(d);
                                continue;
                            }
                        }
                        break;
                    }
                }
                Some(']') => {
                    while let Some(d) = it.next() {
                        if d == '\x07' || (d == '\x1b' && it.next().is_some()) {
                            break;
                        }
                    }
                }
                _ => {}
            },
            '\r' => {}
            c => out.push(c),
        }
    }
    out
}

/// Prints one marker line with one write; a failed write is ignored (the terminal may be gone).
fn say(line: &str) {
    let _ = std::io::stdout().lock().write_all(format!("{line}\n").as_bytes());
}

/// The program on the terminal: one mode, then exit 0. Markers are `;`-terminated tokens without spaces.
/// - `burst <n>`: `LINE=<i>;` for i in 1..=n, then `END;`;
/// - `prompt`: `NAME?`, reads a line, `GOT=<line>;`;
/// - `hang`: `READY;`, then waits forever;
/// - `sizes`: `SIZE=<cols>x<rows>;` now and on every change (sampled every 2 ms), until it is stopped;
/// - `stubborn <root exits: 0|1>`: starts `writer`, waits until it is armed, `WRITER=<pid>;`, then exits or waits;
/// - `writer`: ignores Ctrl+C and Ctrl+Break, blocks in its CTRL_CLOSE handler, says `ARMED` on stderr, then
///   writes `TICK=<i>;` every 10 ms;
/// - `console-host`: the sub-host of `conpty_sessions_never_reach_the_hosts_console`.
pub fn run(args: &[String]) -> ! {
    let words: Vec<&str> = args.iter().map(String::as_str).collect();
    match words.as_slice() {
        ["burst", n] => {
            for i in 1..=n.parse::<u32>().unwrap() {
                say(&format!("LINE={i};"));
            }
            say("END;");
        }
        ["prompt"] => {
            let mut out = std::io::stdout().lock();
            out.write_all(b"NAME?").unwrap();
            out.flush().unwrap();
            drop(out);
            let mut line = String::new();
            std::io::stdin().read_line(&mut line).unwrap();
            say(&format!("GOT={};", line.trim()));
        }
        ["hang"] => {
            say("READY;");
            loop {
                std::thread::park();
            }
        }
        ["sizes"] => sizes(),
        ["stubborn", root_exits] => {
            let mut writer = Command::new(std::env::current_exe().unwrap())
                .args(PTY_CHILD)
                .arg("writer")
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            let mut armed = String::new();
            BufReader::new(writer.stderr.take().unwrap())
                .read_line(&mut armed)
                .unwrap();
            assert_eq!(armed.trim(), "ARMED");
            say(&format!("WRITER={};", writer.id()));
            if *root_exits == "1" {
                std::process::exit(0);
            }
            let _ = writer.wait(); // never returns: the writer does not end by itself
        }
        ["writer"] => {
            // SAFETY: a handler that lives as long as the process.
            unsafe { SetConsoleCtrlHandler(Some(resist), TRUE) };
            let _ = std::io::stderr().write_all(b"ARMED\n");
            let mut tick = 0u64;
            loop {
                say(&format!("TICK={tick};"));
                tick += 1;
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        ["console-host"] => console_host(),
        other => panic!("unknown terminal mode {other:?}"),
    }
    std::process::exit(0)
}

unsafe extern "system" fn resist(event: u32) -> i32 {
    if event >= CTRL_CLOSE_EVENT {
        // Returning would let the OS end the process now; blocking holds out until it gives up waiting (~5 s).
        loop {
            std::thread::park();
        }
    }
    TRUE
}

fn size() -> (i16, i16) {
    let mut info = CONSOLE_SCREEN_BUFFER_INFO::default();
    // SAFETY: this process's console output and a valid out pointer.
    check(
        unsafe { GetConsoleScreenBufferInfo(GetStdHandle(STD_OUTPUT_HANDLE), &mut info) },
        "GetConsoleScreenBufferInfo",
    );
    let w = info.srWindow;
    (w.Right - w.Left + 1, w.Bottom - w.Top + 1)
}

fn sizes() -> ! {
    let mut last = (0, 0);
    loop {
        let now = size();
        if now != last {
            say(&format!("SIZE={}x{};", now.0, now.1));
            last = now;
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}

static EVENTS: AtomicU32 = AtomicU32::new(0);
static EVENT: (Mutex<()>, Condvar) = (Mutex::new(()), Condvar::new());

unsafe extern "system" fn count(_: u32) -> i32 {
    EVENTS.fetch_add(1, Ordering::SeqCst);
    let _guard = EVENT.0.lock();
    EVENT.1.notify_all();
    TRUE
}

/// A host on its own console that handles Ctrl+C itself (ignore flag cleared, a handler counting every event)
/// runs two terminal sessions, then raises a Ctrl+C on its own console. Prints
/// `EVENTS during=<events during the sessions> control=<events from the control>`.
fn console_host() -> ! {
    // SAFETY: changes only this process's handler list; `count` lives as long as the process.
    unsafe {
        SetConsoleCtrlHandler(None, FALSE);
        SetConsoleCtrlHandler(Some(count), TRUE);
    }
    let mut host = Host::start();
    let mut t = Term::spawn(&mut host, &["hang"], (80, 24));
    t.screen.wait("READY;");
    t.type_in(b"\x03");
    assert_eq!(host.exited(t.id), CTRL_EXIT);
    t.screen.end();
    let s = Term::spawn(&mut host, &["stubborn", "0"], (80, 24));
    s.screen.value("WRITER");
    host.stop(s.id, 1000);
    s.screen.end();
    let during = EVENTS.load(Ordering::SeqCst);
    // SAFETY: plain call; group 0 = every process on this host's own console, i.e. this one.
    check(
        unsafe { GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0) },
        "GenerateConsoleCtrlEvent",
    );
    let guard = EVENT.0.lock().unwrap();
    drop(
        EVENT
            .1
            .wait_timeout_while(guard, T, |_| EVENTS.load(Ordering::SeqCst) == during),
    );
    say(&format!(
        "EVENTS during={during} control={}",
        EVENTS.load(Ordering::SeqCst) - during
    ));
    std::process::exit(0)
}
