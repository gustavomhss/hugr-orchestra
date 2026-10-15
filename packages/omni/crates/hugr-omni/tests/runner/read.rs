//! `read`: claims the single consumer (first time, or again after `detach` or in the other mode: the library
//! decides whether that is allowed), reads until `until`, and reports what this step read.
//!
//! `until.match` and `capture` see complete lines, kept across steps: in chunks mode the runner splits on `\n`
//! (dropping a trailing `\r`); in lines mode a line is the library's text as is, with `continues` pieces joined.
//! A gap (`lostBefore`) ends the partial line, and the end of the output ends the last one. A step consumes
//! whole items, so lines that arrive in the same chunk as its `until` match are read by that step. In lines
//! mode the step's `stdout`/`stderr`/`pty` is each line's text followed by `\n` unless it continues.

use std::collections::HashMap;

use hugr_omni::{Data, Lines, Output, Stream};
use serde_json::{Map, Value};

use super::expect::{Fail, Fields, Got, Outcome};
use regex::Regex;

use super::pattern::pattern;
use super::{Ctx, Kid};

/// The consumer of one child, kept between `read` steps.
#[derive(Default)]
pub struct Reader {
    src: Option<Src>,
    lines: bool,
    /// The partial line of stdout, stderr, pty.
    pending: [Vec<u8>; 3],
}

enum Src {
    Chunks(Output),
    Lines(Lines),
}

/// Lines seen by this step: captures and the `until` count.
struct Pass<'a> {
    until: Option<(Regex, u64)>,
    captures: Vec<(String, Regex)>,
    vars: &'a mut HashMap<String, Vec<String>>,
    matched: u64,
}

impl Pass<'_> {
    fn line(&mut self, line: Vec<u8>) {
        let line = String::from_utf8_lossy(&line);
        for (name, re) in &self.captures {
            if let Some(groups) = re.captures(&line) {
                let value = groups.get(1).or_else(|| groups.get(0)).map_or("", |m| m.as_str());
                self.vars.entry(name.clone()).or_default().push(value.to_string());
            }
        }
        if let Some((re, _)) = &self.until
            && re.is_match(&line)
        {
            self.matched += 1;
        }
    }

    fn done(&self) -> bool {
        self.until.as_ref().is_some_and(|(_, n)| self.matched >= *n)
    }
}

pub async fn read(ctx: &mut Ctx, name: &str, s: &Map<String, Value>) -> Result<Outcome, Fail> {
    let lines = s.get("lines") == Some(&Value::Bool(true));
    let until = match s.get("until") {
        None => None,
        Some(Value::String(end)) if end == "end" => None,
        Some(u) => {
            let re = u
                .get("match")
                .and_then(Value::as_str)
                .ok_or("until: want \"end\" or {match, count}")?;
            Some((pattern(re)?, u.get("count").and_then(Value::as_u64).unwrap_or(1)))
        }
    };
    let mut captures = Vec::new();
    for (k, re) in s.get("capture").and_then(Value::as_object).into_iter().flatten() {
        captures.push((k.clone(), pattern(re.as_str().ok_or("capture regexes are strings")?)?));
    }
    let kid: &Kid = ctx.kids.get(name).ok_or_else(|| format!("no child named {name:?}"))?;
    let child = kid.child();
    let reader = ctx.readers.entry(name.to_string()).or_default();
    if reader.src.is_none() || reader.lines != lines {
        let claimed = if lines {
            child.lines().map(Src::Lines)
        } else {
            child.output().map(Src::Chunks)
        };
        match claimed {
            Ok(src) => (reader.src, reader.lines) = (Some(src), lines),
            Err(e) => return Ok(Err(e)),
        }
    }
    let mut pass = Pass {
        until,
        captures,
        vars: &mut ctx.vars,
        matched: 0,
    };
    let (mut data, mut text, mut chunks, mut lost, mut continues) = ([vec![], vec![], vec![]], true, 0u64, 0u64, 0u64);
    // Lines mode: every item as it came (bytes, continues), per stream, for the `pieces` expectation.
    let mut pieces: [Vec<(u64, bool)>; 3] = Default::default();
    let src = reader.src.as_mut().expect("claimed above");
    while !pass.done() {
        let item = match src {
            Src::Chunks(o) => o
                .next()
                .await
                .map(|r| r.map(|c| (c.stream, c.lost_before, c.data, None))),
            Src::Lines(l) => l
                .next()
                .await
                .map(|r| r.map(|l| (l.stream, l.lost_before, Data::Text(l.text), Some(l.continues)))),
        };
        let Some(item) = item else {
            for pending in &mut reader.pending {
                if !pending.is_empty() {
                    pass.line(std::mem::take(pending));
                }
            }
            if let (Some((_, n)), false) = (&pass.until, pass.done()) {
                return Err(Fail::Product(format!(
                    "output ended after {} of {n} matching lines",
                    pass.matched
                )));
            }
            break;
        };
        let (stream, gap, piece, cont) = match item {
            Ok(item) => item,
            Err(e) => return Ok(Err(e)),
        };
        let k = match stream {
            Stream::Stdout => 0,
            Stream::Stderr => 1,
            Stream::Pty => 2,
        };
        chunks += 1;
        lost += gap.unwrap_or(0);
        let pending = &mut reader.pending[k];
        if gap.unwrap_or(0) > 0 && !pending.is_empty() {
            pass.line(std::mem::take(pending));
        }
        let bytes = match piece {
            Data::Text(t) => t.into_bytes(),
            Data::Bytes(b) => {
                text = false;
                b
            }
        };
        data[k].extend_from_slice(&bytes);
        if let Some(c) = cont {
            pieces[k].push((bytes.len() as u64, c));
        }
        pending.extend_from_slice(&bytes);
        match cont {
            Some(true) => continues += 1,
            Some(false) => {
                data[k].push(b'\n');
                pass.line(std::mem::take(pending));
            }
            // Only a piece with a newline completes lines (no rescan of a long partial line).
            None if bytes.contains(&b'\n') => {
                for piece in std::mem::take(pending).split_inclusive(|&b| b == b'\n') {
                    match piece.strip_suffix(b"\n") {
                        Some(line) => pass.line(line.strip_suffix(b"\r").unwrap_or(line).to_vec()),
                        None => *pending = piece.to_vec(),
                    }
                }
            }
            None => {}
        }
    }
    if s.get("detach") == Some(&Value::Bool(true)) {
        reader.src = None;
    }
    let dropped = child.dropped_bytes();
    let [out, err, pty] = data.map(|b| {
        Got::Data(if text {
            Data::Text(String::from_utf8_lossy(&b).into_owned())
        } else {
            Data::Bytes(b)
        })
    });
    let num = |n: u64| Got::Num(Some(n as f64));
    Ok(Ok(Fields::from([
        ("stdout", out),
        ("stderr", err),
        ("pty", pty),
        ("chunks", num(chunks)),
        ("lostBefore", num(lost)),
        ("continues", num(continues)),
        (
            "pieces",
            Got::Obj(
                ["stdout", "stderr", "pty"]
                    .into_iter()
                    .zip(pieces.map(Got::Pieces))
                    .collect(),
            ),
        ),
        (
            "droppedBytes",
            Got::Obj(Fields::from([
                ("stdout", num(dropped.stdout)),
                ("stderr", num(dropped.stderr)),
            ])),
        ),
    ])))
}
