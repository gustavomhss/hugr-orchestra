//! Output: every value is written with a single write call (no line buffering), so a marker line never
//! interleaves with another process's and a value that ends mid-character arrives as one piece.

use std::fs::File;
use std::io::{IsTerminal, Write};

/// stdout or stderr.
#[derive(Clone, Copy)]
pub enum Stream {
    Stdout,
    Stderr,
}

/// The two output streams.
pub struct Out {
    stdout: Sink,
    stderr: Sink,
}

enum Sink {
    /// A duplicate of the standard handle: one `write` per call.
    File(File),
    /// Windows console: std converts UTF-8 to the console's UTF-16 (a raw write would use the code page).
    Stdout(std::io::Stdout),
    Stderr(std::io::Stderr),
}

impl Out {
    pub fn new() -> Out {
        let stdout = std::io::stdout();
        let stderr = std::io::stderr();
        Out {
            stdout: if cfg!(windows) && stdout.is_terminal() {
                Sink::Stdout(stdout)
            } else {
                dup(&stdout).map_or(Sink::Stdout(stdout), Sink::File)
            },
            stderr: if cfg!(windows) && stderr.is_terminal() {
                Sink::Stderr(stderr)
            } else {
                dup(&stderr).map_or(Sink::Stderr(stderr), Sink::File)
            },
        }
    }

    /// Writes `data` at once; a failed write ends the fixture with exit 99.
    pub fn write(&mut self, stream: Stream, data: &[u8]) {
        let sink = match stream {
            Stream::Stdout => &mut self.stdout,
            Stream::Stderr => &mut self.stderr,
        };
        let done = match sink {
            Sink::File(f) => f.write_all(data),
            Sink::Stdout(s) => s.lock().write_all(data).and_then(|()| s.lock().flush()),
            Sink::Stderr(s) => s.lock().write_all(data),
        };
        if let Err(e) = done {
            let _ = std::io::stderr().write_all(format!("FIXTURE-ERROR write: {e}\n").as_bytes());
            std::process::exit(99);
        }
    }

    /// `n` bytes of `abc...z` repeated.
    pub fn pattern(&mut self, stream: Stream, n: u64) {
        // 65520 = 26 * 2520: every block starts with `a`, so the pattern continues across blocks.
        let block: Vec<u8> = (b'a'..=b'z').cycle().take(65520).collect();
        let mut left = n;
        while left > 0 {
            let k = left.min(block.len() as u64) as usize;
            self.write(stream, &block[..k]);
            left -= k as u64;
        }
    }

    /// `n` lines `line <i>\n`, i from 1.
    pub fn lines(&mut self, stream: Stream, n: u64) {
        let mut buf = Vec::new();
        for i in 1..=n {
            buf.extend_from_slice(format!("line {i}\n").as_bytes());
            if buf.len() >= 60_000 {
                self.write(stream, &buf);
                buf.clear();
            }
        }
        if !buf.is_empty() {
            self.write(stream, &buf);
        }
    }

    /// `text` written `n` times, no newline added.
    pub fn repeat(&mut self, stream: Stream, n: u64, text: &[u8]) {
        let per = (60_000 / text.len().max(1)).max(1) as u64;
        let mut left = n;
        while left > 0 {
            let k = left.min(per);
            self.write(stream, &text.repeat(k as usize));
            left -= k;
        }
    }
}

#[cfg(unix)]
fn dup(s: &impl std::os::fd::AsFd) -> Option<File> {
    s.as_fd().try_clone_to_owned().ok().map(File::from)
}

#[cfg(windows)]
fn dup(s: &impl std::os::windows::io::AsHandle) -> Option<File> {
    s.as_handle().try_clone_to_owned().ok().map(File::from)
}

/// A JSON string literal, ASCII only: `"` `\` and control characters escaped, every non-ASCII character as
/// `\uXXXX` (UTF-16, lowercase hex), so the output is identical on every OS and console code page.
pub fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ' '..='~' => out.push(c),
            _ => {
                let mut units = [0u16; 2];
                for unit in c.encode_utf16(&mut units) {
                    out.push_str(&format!("\\u{unit:04x}"));
                }
            }
        }
    }
    out.push('"');
    out
}
