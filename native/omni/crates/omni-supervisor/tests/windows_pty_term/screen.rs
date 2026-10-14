//! The terminal's output as the host sees it: read on a thread from the moment of the spawn, and searched for
//! markers in its visible text.

use std::fs::File;
use std::io::Read;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Instant;

use super::host::T;

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
    pub(super) fn new(mut r: File) -> Screen {
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
