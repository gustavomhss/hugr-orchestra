//! Lines: `\n` and `\r\n`, the last unterminated line, pieces of long lines, gaps, `end()`.

use std::io::Write;
use std::sync::Arc;

use super::super::Lines;
use super::super::queue::{Claim, Shared, UNATTACHED};
use super::{MIB, bare, bounded, child, done, feed, pending, runtime, until};
use crate::types::{Line, Stream};

async fn drain(lines: &mut Lines) -> Vec<Line> {
    let mut all = Vec::new();
    while let Some(line) = lines.next().await {
        all.push(line.unwrap());
    }
    all
}

/// (stream, text length, lost_before, continues) of each line.
fn shape(lines: &[Line]) -> Vec<(Stream, usize, Option<u64>, bool)> {
    lines
        .iter()
        .map(|l| (l.stream, l.text.len(), l.lost_before, l.continues))
        .collect()
}

#[test]
fn lines_split_on_newlines_and_keep_the_last() {
    let rt = runtime();
    let (pumps, mut out, err) = child(&rt, false);
    let mut lines = pumps.lines().unwrap();
    bounded(&rt, async {
        out.write_all(b"one\r\ntwo\n\nthree\r").unwrap();
        for want in ["one", "two", ""] {
            assert_eq!(lines.next().await.unwrap().unwrap().text, want);
        }
        out.write_all(b"\nlast").unwrap();
        drop((out, err));
        let rest: Vec<_> = drain(&mut lines)
            .await
            .into_iter()
            .map(|l| (l.text, l.continues))
            .collect();
        assert_eq!(rest, [("three".to_owned(), false), ("last".to_owned(), false)]);
    });
}

/// A line over 1 MiB comes in pieces, each the longest prefix of at most 1 MiB that ends at a character
/// boundary, every piece but the last marked `continues` (the pieces of `C-IO-01.lines`).
#[test]
fn long_lines_come_in_pieces() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, true);
    let mut lines = pumps.lines().unwrap();
    let mut long = b"x".to_vec();
    long.extend("é".repeat(600_000).bytes());
    long.extend_from_slice(b"\nEND\n");
    let out = feed(out, long);
    drop(err);
    let got = bounded(&rt, async {
        drop(done(out));
        drain(&mut lines).await
    });
    let got: Vec<_> = shape(&got).into_iter().map(|l| (l.0, l.1, l.3)).collect();
    let stdout = Stream::Stdout;
    assert_eq!(
        got,
        [(stdout, 1_048_575, true), (stdout, 151_426, false), (stdout, 3, false)]
    );
}

/// A `\r` that ends what has arrived may still be the line end: a line of exactly 1 MiB whose `\r` and
/// `\n` arrive in separate reads is one piece. Fed item by item, so the read boundary is exact.
#[test]
fn a_1_mib_line_split_before_its_newline_is_one_piece() {
    let shared = Arc::new(Shared::new(true, [Stream::Stdout, Stream::Stderr], [true, false]));
    shared.claim(Claim::Attached).unwrap();
    let mut lines = Lines::new(Arc::clone(&shared));
    shared.accept(0, &vec![b'a'; MIB]);
    shared.accept(0, b"\r");
    assert!(pending(lines.next()), "a piece was cut before the line end arrived");
    shared.accept(0, b"\nEND\n");
    shared.finish(0, None);
    let got = bounded(&runtime(), drain(&mut lines));
    let got: Vec<_> = shape(&got).into_iter().map(|l| (l.1, l.3)).collect();
    assert_eq!(got, [(MIB, false), (3, false)]);
}

/// A gap cuts the line in progress, which is yielded as it was (its incomplete character as U+FFFD); the
/// next line reports the gap, and a gap right before the end comes as a final empty line.
#[test]
fn a_gap_cuts_the_line() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    let mut first = b"L1\n".to_vec();
    first.resize(UNATTACHED - 1, b'p');
    first.push(0xc3);
    let mut out = done(feed(out, first));
    out.write_all(b"DROP").unwrap();
    let mut errs = vec![b'e'; UNATTACHED];
    errs.extend_from_slice(b"zz");
    drop(done(feed(err, errs)));
    until(|| pumps.dropped().stdout == 4 && pumps.dropped().stderr == 2);
    let mut lines = pumps.lines().unwrap();
    out.write_all(b"rest\nlast").unwrap();
    drop(out);
    let got = bounded(&rt, drain(&mut lines));
    let cut = got.iter().find(|l| l.text.starts_with('p')).unwrap();
    assert!(cut.text.ends_with("pp\u{FFFD}"));
    let pick = |stream| -> Vec<_> {
        shape(&got)
            .into_iter()
            .filter(|l| l.0 == stream)
            .map(|l| (l.1, l.2))
            .collect()
    };
    assert_eq!(
        pick(Stream::Stdout),
        [(2, None), (UNATTACHED - 4 + 3, None), (4, Some(4)), (4, None)]
    );
    assert_eq!(pick(Stream::Stderr), [(UNATTACHED, None), (0, Some(2))]);
    assert!(got.iter().all(|l| !l.continues));
}

/// `end()` yields the line in progress, then the end, though the pipe is still open.
#[test]
fn end_yields_the_line_in_progress() {
    let rt = runtime();
    let (pumps, mut out, _err) = child(&rt, true);
    let mut lines = pumps.lines().unwrap();
    bounded(&rt, async {
        out.write_all(b"a\nb").unwrap();
        assert_eq!(lines.next().await.unwrap().unwrap().text, "a");
        pumps.end();
        assert_eq!(lines.next().await.unwrap().unwrap().text, "b");
        assert!(lines.next().await.is_none());
    });
}

/// Dropping the view counts what it took and never yielded: the rest of the item and the line in progress,
/// as raw bytes (`\r\n` included).
#[test]
fn dropping_lines_counts_what_they_held() {
    let rt = runtime();
    let (pumps, shared) = bare(&rt);
    let mut lines = pumps.lines().unwrap();
    shared.accept(0, b"one\ntwo\r\npar");
    assert_eq!(bounded(&rt, lines.next()).unwrap().unwrap().text, "one");
    assert_eq!(pumps.dropped().stdout, 0);
    drop(lines);
    assert_eq!(pumps.dropped().stdout, 5 + 3);
}
