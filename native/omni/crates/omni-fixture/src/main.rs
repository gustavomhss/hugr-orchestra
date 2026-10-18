//! `omni-fixture`: the test program of the contract scenarios and the QA harness. Its command line is
//! `conformance/FIXTURE.md`. W01.
//!
//! Every argument is one step. All steps are parsed before the first one runs, so a typo in a scenario fails
//! with `FIXTURE-ERROR` (exit 99) before anything happens.

mod descend;
mod out;
mod parse;
mod sys;

use std::io::{BufRead, Read};
use std::process::ExitCode;
use std::time::Duration;

use out::{Out, Stream};
use parse::Step;

/// The exit code of a fixture failure (FIXTURE.md).
const FIXTURE_ERROR: u8 = 99;

fn main() -> ExitCode {
    let mut out = Out::new();
    let result = parse::steps(std::env::args_os().skip(1)).and_then(|steps| run(steps, &mut out));
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(reason) => {
            out.write(Stream::Stderr, format!("FIXTURE-ERROR {reason}\n").as_bytes());
            ExitCode::from(FIXTURE_ERROR)
        }
    }
}

fn run(steps: Vec<Step>, out: &mut Out) -> Result<(), String> {
    // The pid log descendants started from here on append to as well (`pidlog`).
    let mut log: Option<std::path::PathBuf> = None;
    for step in steps {
        let log_ref = log.as_deref();
        match step {
            Step::Out(stream, text) => out.write(stream, &text),
            Step::Bytes(stream, n) => out.pattern(stream, n),
            Step::Lines(stream, n) => out.lines(stream, n),
            Step::Repeat(stream, n, text) => out.repeat(stream, n, &text),
            Step::Ready => out.write(Stream::Stdout, b"READY\n"),
            Step::Sleep(ms) => std::thread::sleep(Duration::from_millis(ms)),
            Step::Hang => hang(),
            Step::Exit(code) => exit(code),
            Step::Signal(number) => sys::raise(number),
            Step::Argv(rest) => {
                let items: Vec<String> = rest.iter().map(|a| out::json_str(&a.to_string_lossy())).collect();
                out.write(Stream::Stdout, format!("[{}]\n", items.join(",")).as_bytes());
                exit(0);
            }
            Step::Env => out.write(Stream::Stdout, env_json().as_bytes()),
            Step::Getenv(name) => out.write(Stream::Stdout, getenv(&name).as_bytes()),
            Step::Cwd => {
                let dir = std::env::current_dir().map_err(|e| format!("cwd: {e}"))?;
                out.write(Stream::Stdout, format!("{}\n", dir.display()).as_bytes());
            }
            Step::Cat => cat(out)?,
            Step::CountStdin => {
                let mut all = Vec::new();
                std::io::stdin()
                    .lock()
                    .read_to_end(&mut all)
                    .map_err(|e| format!("stdin: {e}"))?;
                out.write(Stream::Stdout, format!("STDIN {}\n", all.len()).as_bytes());
            }
            Step::ReadLine => read_line(out)?,
            Step::Prompt(text) => {
                out.write(Stream::Stdout, &text);
                read_line(out)?;
            }
            Step::CloseStdin => sys::close_stdin(),
            Step::IgnoreTerm => sys::ignore_term(),
            Step::OnTerm(text) => sys::on_term(text),
            Step::Tree { n, resist } => descend::level(1, n, resist, log_ref)?,
            Step::Level { k, n, resist } => {
                if resist {
                    sys::ignore_term();
                } else {
                    sys::default_term();
                }
                out.write(Stream::Stdout, format!("PID {k} {}\n", std::process::id()).as_bytes());
                if k < n {
                    descend::level(k + 1, n, resist, log_ref)?;
                }
                hang();
            }
            Step::Hold(ms) => descend::hold(ms, log_ref)?,
            Step::Escape => descend::escape(out, log_ref)?,
            Step::Escaped => {
                sys::setsid();
                if cfg!(unix) {
                    out.write(Stream::Stdout, format!("ESCAPED {}\n", std::process::id()).as_bytes());
                }
                // Bounded, so a correct run never leaks it for long: it is out of the tree by design.
                std::thread::sleep(descend::ESCAPEE_LIFETIME);
            }
            Step::Pidlog(path) => {
                pidlog(&path)?;
                log = Some(path);
            }
            Step::Watch(stream, n, path) => watch(out, stream, n, &path),
            Step::Tty => {
                let (cols, rows) = sys::term_size();
                let json = format!(
                    "{{\"stdin\":{},\"stdout\":{},\"stderr\":{},\"cols\":{cols},\"rows\":{rows}}}\n",
                    sys::is_tty(0),
                    sys::is_tty(1),
                    sys::is_tty(2)
                );
                out.write(Stream::Stdout, json.as_bytes());
            }
            Step::Sizes => sizes(out),
            Step::CopySelf(path) => descend::copy_self(&path)?,
        }
    }
    Ok(())
}

fn exit(code: u32) -> ! {
    // Windows keeps the full 32-bit value (ExitProcess takes a u32); Unix keeps the low 8 bits.
    std::process::exit(code as i32)
}

fn hang() -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(3600));
    }
}

fn env_json() -> String {
    let mut vars: Vec<(String, String)> = std::env::vars_os()
        .map(|(k, v)| (k.to_string_lossy().into_owned(), v.to_string_lossy().into_owned()))
        .collect();
    vars.sort();
    let items: Vec<String> = vars
        .iter()
        .map(|(k, v)| format!("{}:{}", out::json_str(k), out::json_str(v)))
        .collect();
    format!("{{{}}}\n", items.join(","))
}

/// `<name>=<JSON value>` for every variable named `name` ignoring ASCII case (sorted), or `<name> unset`.
fn getenv(name: &str) -> String {
    let mut found: Vec<String> = std::env::vars_os()
        .map(|(k, v)| (k.to_string_lossy().into_owned(), v))
        .filter(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(k, v)| format!("{k}={}\n", out::json_str(&v.to_string_lossy())))
        .collect();
    found.sort();
    if found.is_empty() {
        format!("{name} unset\n")
    } else {
        found.concat()
    }
}

fn cat(out: &mut Out) -> Result<(), String> {
    let mut buf = vec![0u8; 64 * 1024];
    let mut input = std::io::stdin().lock();
    loop {
        match input.read(&mut buf) {
            Ok(0) => return Ok(()),
            Ok(n) => out.write(Stream::Stdout, &buf[..n]),
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(format!("stdin: {e}")),
        }
    }
}

fn read_line(out: &mut Out) -> Result<(), String> {
    let mut line = Vec::new();
    std::io::stdin()
        .lock()
        .read_until(b'\n', &mut line)
        .map_err(|e| format!("stdin: {e}"))?;
    while matches!(line.last(), Some(b'\n' | b'\r')) {
        line.pop();
    }
    let mut msg = b"GOT ".to_vec();
    msg.extend_from_slice(&line);
    msg.push(b'\n');
    out.write(Stream::Stdout, &msg);
    Ok(())
}

/// Waits until `path` holds at least `n` lines, then prints `LOGGED <line>` for each of the first `n`. The file
/// is polled every 5 ms: it is written by other processes (`pidlog`), so there is nothing to wait on.
fn watch(out: &mut Out, stream: Stream, n: u64, path: &std::path::Path) {
    loop {
        let text = std::fs::read_to_string(path).unwrap_or_default();
        // Only complete lines count: a writer may be half-way through its line.
        let lines: Vec<&str> = text
            .split_inclusive('\n')
            .filter_map(|l| l.strip_suffix('\n'))
            .collect();
        if lines.len() as u64 >= n {
            let report: String = lines.iter().take(n as usize).map(|l| format!("LOGGED {l}\n")).collect();
            out.write(stream, report.as_bytes());
            return;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}

fn pidlog(path: &std::path::Path) -> Result<(), String> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("pidlog {}: {e}", path.display()))?;
    f.write_all(format!("{}\n", std::process::id()).as_bytes())
        .map_err(|e| format!("pidlog {}: {e}", path.display()))
}

/// `SIZE <cols> <rows>` now and on every change, until stdin ends. The size is sampled every 5 ms: the
/// scenario waits for each `SIZE` line before it resizes again, so no change is missed.
fn sizes(out: &mut Out) {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    let ended = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&ended);
    std::thread::spawn(move || {
        let mut buf = [0u8; 1024];
        let mut input = std::io::stdin().lock();
        while matches!(input.read(&mut buf), Ok(n) if n > 0) {}
        flag.store(true, Ordering::SeqCst);
    });
    let mut last = sys::term_size();
    out.write(Stream::Stdout, format!("SIZE {} {}\n", last.0, last.1).as_bytes());
    while !ended.load(Ordering::SeqCst) {
        std::thread::sleep(Duration::from_millis(5));
        let now = sys::term_size();
        if now != last {
            last = now;
            out.write(Stream::Stdout, format!("SIZE {} {}\n", now.0, now.1).as_bytes());
        }
    }
}
