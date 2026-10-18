//! From arguments to steps (FIXTURE.md). Every bad step is reported before anything runs.

use std::ffi::OsString;
use std::path::PathBuf;

use crate::out::Stream;
use crate::sys;

/// One step of the command line.
pub enum Step {
    Out(Stream, Vec<u8>),
    Bytes(Stream, u64),
    Lines(Stream, u64),
    Repeat(Stream, u64, Vec<u8>),
    Ready,
    Sleep(u64),
    Hang,
    Exit(u32),
    Signal(i32),
    Argv(Vec<OsString>),
    Env,
    Getenv(String),
    Cwd,
    Cat,
    CountStdin,
    ReadLine,
    Prompt(Vec<u8>),
    CloseStdin,
    IgnoreTerm,
    OnTerm(Vec<u8>),
    Tree {
        n: u32,
        resist: bool,
    },
    /// Internal: level `k` of a chain of `n` started by `tree`.
    Level {
        k: u32,
        n: u32,
        resist: bool,
    },
    Hold(u64),
    Escape,
    /// Internal: the descendant started by `escape`.
    Escaped,
    Pidlog(PathBuf),
    Watch(Stream, u64, PathBuf),
    Tty,
    Sizes,
    CopySelf(PathBuf),
}

/// Parses every argument; `argv` takes the rest verbatim.
pub fn steps(args: impl Iterator<Item = OsString>) -> Result<Vec<Step>, String> {
    let mut args = args.peekable();
    let mut steps = Vec::new();
    while let Some(arg) = args.next() {
        if arg == "argv" {
            steps.push(Step::Argv(args.by_ref().collect()));
            break;
        }
        let arg = arg
            .into_string()
            .map_err(|a| format!("argument is not valid Unicode: {a:?}"))?;
        steps.push(step(&arg)?);
    }
    Ok(steps)
}

fn step(arg: &str) -> Result<Step, String> {
    let (verb, value) = match arg.split_once('=') {
        Some((verb, value)) => (verb, Some(value)),
        None => (arg, None),
    };
    let need = || value.ok_or_else(|| format!("{verb} needs a value ({verb}=...)"));
    let bare = |s: Step| match value {
        None => Ok(s),
        Some(_) => Err(format!("{verb} takes no value: {arg}")),
    };
    match verb {
        "out" => Ok(Step::Out(Stream::Stdout, text(need()?)?)),
        "err" => Ok(Step::Out(Stream::Stderr, text(need()?)?)),
        "bytes" => stream_count(need()?).map(|(s, n)| Step::Bytes(s, n)),
        "lines" => stream_count(need()?).map(|(s, n)| Step::Lines(s, n)),
        "repeat" => {
            let value = need()?;
            let mut parts = value.splitn(3, ':');
            let (Some(s), Some(n), Some(txt)) = (parts.next(), parts.next(), parts.next()) else {
                return Err(format!("repeat wants <stdout|stderr>:<n>:<text>: {arg}"));
            };
            let (s, n) = stream_count(&format!("{s}:{n}"))?;
            Ok(Step::Repeat(s, n, text(txt)?))
        }
        "ready" => bare(Step::Ready),
        "sleep" => Ok(Step::Sleep(number(need()?)?)),
        "hang" => bare(Step::Hang),
        "exit" => Ok(Step::Exit(number(need()?)?)),
        "signal" => {
            let name = need()?;
            sys::signal_number(name)
                .map(Step::Signal)
                .ok_or_else(|| format!("unknown signal on this OS: {name}"))
        }
        "env" => bare(Step::Env),
        "getenv" => Ok(Step::Getenv(need()?.to_string())),
        "cwd" => bare(Step::Cwd),
        "cat" => bare(Step::Cat),
        "count-stdin" => bare(Step::CountStdin),
        "read-line" => bare(Step::ReadLine),
        "prompt" => Ok(Step::Prompt(text(need()?)?)),
        "close-stdin" => bare(Step::CloseStdin),
        "ignore-term" => bare(Step::IgnoreTerm),
        "on-term" => Ok(Step::OnTerm(text(need()?)?)),
        "tree" => {
            let (n, resist) = resist(need()?)?;
            Ok(Step::Tree { n: number(n)?, resist })
        }
        "_level" => {
            let (kn, resist) = resist(need()?)?;
            let (k, n) = kn.split_once(':').ok_or_else(|| format!("bad level: {arg}"))?;
            Ok(Step::Level {
                k: number(k)?,
                n: number(n)?,
                resist,
            })
        }
        "hold" => Ok(Step::Hold(number(need()?)?)),
        "escape" => bare(Step::Escape),
        "_escaped" => bare(Step::Escaped),
        "pidlog" => Ok(Step::Pidlog(PathBuf::from(need()?))),
        "watch" => {
            let value = need()?;
            let mut parts = value.splitn(3, ':');
            let (Some(s), Some(n), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
                return Err(format!("watch wants <stdout|stderr>:<n>:<path>: {arg}"));
            };
            let (s, n) = stream_count(&format!("{s}:{n}"))?;
            Ok(Step::Watch(s, n, PathBuf::from(path)))
        }
        "tty" => bare(Step::Tty),
        "sizes" => bare(Step::Sizes),
        "copy-self" => Ok(Step::CopySelf(PathBuf::from(need()?))),
        _ => Err(format!("unknown verb: {arg}")),
    }
}

fn number<T: std::str::FromStr>(s: &str) -> Result<T, String> {
    s.parse().map_err(|_| format!("not a valid number: {s:?}"))
}

fn stream_count(value: &str) -> Result<(Stream, u64), String> {
    let (stream, n) = value
        .split_once(':')
        .ok_or_else(|| format!("want <stdout|stderr>:<n>: {value}"))?;
    let stream = match stream {
        "stdout" => Stream::Stdout,
        "stderr" => Stream::Stderr,
        _ => return Err(format!("not a stream: {stream}")),
    };
    Ok((stream, number(n)?))
}

fn resist(value: &str) -> Result<(&str, bool), String> {
    match value.split_once(":resist") {
        Some((head, "")) => Ok((head, true)),
        Some(_) => Err(format!("bad value: {value}")),
        None => Ok((value, false)),
    }
}

/// A text value with the escapes `\n \r \t \\ \xHH`; `\xHH` is a raw byte.
fn text(value: &str) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::with_capacity(value.len());
    let mut rest = value.as_bytes();
    while let Some((&b, tail)) = rest.split_first() {
        rest = tail;
        if b != b'\\' {
            bytes.push(b);
            continue;
        }
        let (&e, tail) = rest.split_first().ok_or_else(|| format!("dangling \\ in {value:?}"))?;
        rest = tail;
        match e {
            b'n' => bytes.push(b'\n'),
            b'r' => bytes.push(b'\r'),
            b't' => bytes.push(b'\t'),
            b'\\' => bytes.push(b'\\'),
            b'x' => {
                let hex = rest
                    .get(..2)
                    .and_then(|h| std::str::from_utf8(h).ok())
                    .and_then(|h| u8::from_str_radix(h, 16).ok())
                    .ok_or_else(|| format!("bad \\x escape in {value:?}"))?;
                bytes.push(hex);
                rest = &rest[2..];
            }
            _ => return Err(format!("unknown escape \\{} in {value:?}", e as char)),
        }
    }
    Ok(bytes)
}
