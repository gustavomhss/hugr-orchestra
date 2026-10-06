//! Chunks: budgets, drops reported in order, decoding across reads and gaps, the single consumer, the end.

use std::io::Write;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use super::super::queue::{ATTACHED, DRAIN, UNATTACHED};
use super::super::{Output, Pumps, Source};
use super::{LIMIT, MIB, bare, bounded, bytes, child, done, feed, losses, pattern, pending, pipe, runtime, until};
use crate::error::ErrorCode;
use crate::types::{Chunk, Data, Stream};

async fn drain(out: &mut Output) -> Vec<Chunk> {
    let mut all = Vec::new();
    while let Some(chunk) = out.next().await {
        all.push(chunk.unwrap());
    }
    all
}

async fn next(out: &mut Output) -> Chunk {
    out.next().await.unwrap().unwrap()
}

fn text(chunk: &Chunk) -> &str {
    match &chunk.data {
        Data::Text(t) => t,
        Data::Bytes(_) => panic!("bytes in text mode"),
    }
}

/// 50 MiB with nobody reading: the writer finishes; the first 1 MiB waits for a later consumer, the rest is
/// counted, and the consumer learns of it on a final empty chunk.
#[test]
fn a_flood_without_a_consumer_never_blocks_the_writer() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    let data = pattern(50 * MIB);
    drop(done(feed(out, data.clone())));
    drop(err);
    bounded(&rt, pumps.ended());
    let dropped = (50 * MIB - UNATTACHED) as u64;
    assert_eq!((pumps.dropped().stdout, pumps.dropped().stderr), (dropped, 0));

    let chunks = bounded(&rt, drain(&mut pumps.output().unwrap()));
    assert_eq!(bytes(&chunks), data[..UNATTACHED]);
    let (last, kept) = chunks.split_last().unwrap();
    assert!(
        kept.iter()
            .all(|c| c.lost_before.is_none() && c.stream == Stream::Stdout)
    );
    assert_eq!(
        (last.data.clone(), last.lost_before),
        (Data::Bytes(Vec::new()), Some(dropped))
    );
}

/// An attached consumer that does not read gets 16 MiB kept for it; the writer still finishes.
#[test]
fn a_paused_consumer_gets_16_mib_and_the_drop_count() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    let mut output = pumps.output().unwrap();
    let data = pattern(20 * MIB);
    drop(done(feed(out, data.clone())));
    drop(err);
    bounded(&rt, pumps.ended());

    let chunks = bounded(&rt, drain(&mut output));
    let dropped = (20 * MIB - ATTACHED) as u64;
    assert_eq!(bytes(&chunks), data[..ATTACHED]);
    assert_eq!(losses(&chunks).iter().sum::<u64>(), dropped);
    assert_eq!(chunks.last().unwrap().lost_before, Some(dropped));
    assert_eq!(pumps.dropped().stdout, dropped);
}

/// A consumer that keeps up never loses a byte: 64 MiB with at most 8 MiB in flight arrive exactly.
#[test]
fn a_consumer_that_keeps_up_loses_nothing() {
    let rt = runtime();
    let (pumps, mut out, err) = child(&rt, false);
    let mut output = pumps.output().unwrap();
    let data = pattern(64 * MIB);
    let (ack, acked) = mpsc::channel::<()>();
    let sent = data.clone();
    let writer = thread::spawn(move || {
        for (i, block) in sent.chunks(MIB).enumerate() {
            if i >= 8 {
                acked.recv_timeout(LIMIT).unwrap();
            }
            out.write_all(block).unwrap();
        }
    });
    let mut got = Vec::new();
    bounded(&rt, async {
        while got.len() < data.len() {
            let chunk = next(&mut output).await;
            assert_eq!(chunk.lost_before, None);
            let before = got.len() / MIB;
            got.extend_from_slice(&bytes(&[chunk]));
            for _ in before..got.len() / MIB {
                let _ = ack.send(());
            }
        }
    });
    writer.join().unwrap();
    drop(err);
    assert!(got == data, "the bytes differ");
    assert_eq!(pumps.dropped().stdout, 0);
}

/// A character split across reads decodes whole; invalid bytes and an incomplete end become U+FFFD; the
/// two streams arrive separately, each labelled.
#[test]
fn text_decodes_across_reads() {
    let rt = runtime();
    let (pumps, mut out, mut err) = child(&rt, true);
    let mut output = pumps.output().unwrap();
    bounded(&rt, async {
        out.write_all(b"A\xc3").unwrap();
        assert_eq!(text(&next(&mut output).await), "A");
        out.write_all(b"\xa9\xff\n").unwrap();
        assert_eq!(text(&next(&mut output).await), "é\u{FFFD}\n");
        err.write_all(b"E").unwrap();
        let chunk = next(&mut output).await;
        assert_eq!((chunk.stream, text(&chunk)), (Stream::Stderr, "E"));
        out.write_all(b"\xe2\x82").unwrap();
        drop((out, err));
        let rest = drain(&mut output).await;
        assert_eq!(rest.len(), 1);
        assert_eq!((rest[0].stream, text(&rest[0])), (Stream::Stdout, "\u{FFFD}"));
    });
}

#[test]
fn bytes_mode_is_exact() {
    let rt = runtime();
    let (pumps, mut out, err) = child(&rt, false);
    let raw = b"\x00\xff\xc3\r\n";
    out.write_all(raw).unwrap();
    drop((out, err));
    let chunks = bounded(&rt, drain(&mut pumps.output().unwrap()));
    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].data, Data::Bytes(raw.to_vec()));
}

/// The bytes dropped before an item are reported on it; an incomplete character before the gap reads as
/// U+FFFD and is never joined with the bytes after it.
#[test]
fn decoding_restarts_at_a_gap() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, true);
    let mut first = vec![b'a'; UNATTACHED - 1];
    first.push(0xc3);
    let mut out = done(feed(out, first));
    out.write_all(b"zzzz").unwrap();
    until(|| pumps.dropped().stdout == 4);
    let mut output = pumps.output().unwrap();
    bounded(&rt, async {
        let mut seen = 0;
        while seen < UNATTACHED - 1 {
            let chunk = next(&mut output).await;
            assert_eq!(chunk.lost_before, None);
            seen += text(&chunk).len();
        }
        out.write_all(b"\xa9tail\n").unwrap();
        drop((out, err));
        let rest = drain(&mut output).await;
        let got: Vec<_> = rest.iter().map(|c| (text(c), c.lost_before)).collect();
        assert_eq!(got, [("\u{FFFD}", None), ("\u{FFFD}tail\n", Some(4))]);
    });
}

/// `output` and `lines()` are one consumer: a second claim fails, and leaving it detaches for good (what
/// comes after is dropped and counted).
#[test]
fn there_is_a_single_consumer() {
    let rt = runtime();
    let (pumps, mut out, _err) = child(&rt, true);
    let output = pumps.output().unwrap();
    assert_eq!(pumps.lines().unwrap_err().code(), ErrorCode::InvalidArgument);
    assert_eq!(pumps.output().unwrap_err().code(), ErrorCode::InvalidArgument);
    drop(output);
    assert_eq!(pumps.output().unwrap_err().code(), ErrorCode::InvalidArgument);
    let collect = bounded(&rt, pumps.collect(MIB, LIMIT));
    assert_eq!(collect.unwrap_err().code(), ErrorCode::InvalidArgument);
    out.write_all(b"after").unwrap();
    until(|| pumps.dropped().stdout == 5);
}

/// The output stays open while any holder of the pipe (a descendant) has it, and ends when the last closes.
#[test]
fn the_output_ends_when_every_holder_closed_it() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, true);
    let mut output = pumps.output().unwrap();
    let mut holder = out.try_clone().unwrap();
    drop((out, err));
    bounded(&rt, async {
        holder.write_all(b"late").unwrap();
        assert_eq!(text(&next(&mut output).await), "late");
        assert!(pending(pumps.ended()));
        drop(holder);
        assert!(output.next().await.is_none());
        pumps.ended().await;
    });
}

/// `end()` while something outside the tree still holds the pipe: after the bounded drain the consumer gets
/// what is queued, the unreported gap, then the end; later bytes are dropped and counted.
#[test]
fn end_stops_at_what_is_queued() {
    let rt = runtime();
    let (pumps, out, _err) = child(&rt, false);
    let mut data = pattern(UNATTACHED);
    data.push(b'x');
    let mut out = done(feed(out, data.clone()));
    until(|| pumps.dropped().stdout == 1);
    let start = Instant::now();
    pumps.end();
    bounded(&rt, pumps.ended());
    let chunks = bounded(&rt, drain(&mut pumps.output().unwrap()));
    assert!(start.elapsed() >= DRAIN - Duration::from_millis(50));
    assert_eq!(bytes(&chunks), data[..UNATTACHED]);
    assert_eq!(chunks.last().unwrap().lost_before, Some(1));
    out.write_all(b"more").unwrap();
    until(|| pumps.dropped().stdout == 5);
}

/// `end()` loses nothing the pipe still holds (a dead tree's last words, e.g. printed on SIGTERM): bytes the
/// reader had not taken yet when it was called (written right after it here, which is indistinguishable)
/// come before the end, and the end of file ends the output.
#[test]
fn end_delivers_what_the_pipe_still_holds() {
    let rt = runtime();
    let (pumps, mut out, err) = child(&rt, true);
    let mut output = pumps.output().unwrap();
    bounded(&rt, async {
        out.write_all(b"READY\n").unwrap();
        assert_eq!(text(&next(&mut output).await), "READY\n");
        out.write_all(b"before\n").unwrap();
        pumps.end();
        out.write_all(b"CLEANUP\n").unwrap();
        drop((out, err));
        assert_eq!(bytes(&drain(&mut output).await), b"before\nCLEANUP\n");
    });
}

/// Terminal output is labelled `pty` and counts as stdout.
#[test]
fn terminal_output_is_one_stream() {
    let rt = runtime();
    let (output, mut writer) = pipe();
    let pumps = Pumps::start(rt.handle(), Source::Pty { output }, true).unwrap();
    writer.write_all(&vec![b'p'; UNATTACHED + 3]).unwrap();
    until(|| pumps.dropped().stdout == 3);
    drop(writer);
    let chunks = bounded(&rt, drain(&mut pumps.output().unwrap()));
    assert!(chunks.iter().all(|c| c.stream == Stream::Pty));
    assert_eq!(bytes(&chunks).len(), UNATTACHED);
    assert_eq!(pumps.dropped().stderr, 0);
}

/// Dropping the view counts what it took and never yielded, as raw bytes: an incomplete character, and a
/// chunk made but not yet taken (here the one after the U+FFFD that ends the stream before a gap).
#[test]
fn dropping_output_counts_what_it_held() {
    let rt = runtime();
    let (pumps, shared) = bare(&rt);
    let mut output = pumps.output().unwrap();
    shared.accept(0, b"ab\xc3");
    assert_eq!(text(&bounded(&rt, next(&mut output))), "ab");
    drop(output);
    assert_eq!(pumps.dropped().stdout, 1);

    let (pumps, shared) = bare(&rt);
    let mut first = vec![b'a'; UNATTACHED - 1];
    first.push(0xc3);
    shared.accept(0, &first);
    shared.accept(0, b"zzz");
    let mut output = pumps.output().unwrap();
    shared.accept(0, b"xyz");
    assert_eq!(text(&bounded(&rt, next(&mut output))).len(), UNATTACHED - 1);
    assert_eq!(text(&bounded(&rt, next(&mut output))), "\u{FFFD}");
    assert_eq!(pumps.dropped().stdout, 3);
    drop(output);
    assert_eq!(pumps.dropped().stdout, 3 + 3);
}
