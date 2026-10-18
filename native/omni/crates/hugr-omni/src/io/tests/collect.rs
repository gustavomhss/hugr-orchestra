//! `collect`, the output half of `run()`: complete, or the limit named with each stream's first bytes.

use std::io::{self, Write};
use std::time::{Duration, Instant};

use super::super::queue::{DRAIN, UNATTACHED};
use super::{LIMIT, MIB, after_first_poll, bare, bounded, child, pattern, runtime, write_and_close};
use crate::error::{Error, ErrorCode};
use crate::types::{Data, Stream};

/// More than the unattached budget, all of it, both streams, once every holder closed the pipes.
#[test]
fn collect_keeps_everything_to_the_end() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    let data = pattern(3 * MIB);
    let sent = data.clone();
    let collect = after_first_poll(pumps.collect(4 * MIB, LIMIT), || {
        write_and_close(out, sent);
        write_and_close(err, b"E".to_vec());
    });
    let got = bounded(&rt, collect).unwrap();
    assert!(got.stdout == Data::Bytes(data), "stdout differs");
    assert_eq!((got.stderr, got.over_limit), (Data::Bytes(b"E".to_vec()), None));
    assert_eq!(pumps.dropped().stdout, 0);
}

/// Over the limit it returns at once, though the pipe stays open, with each stream's first `max` bytes.
#[test]
fn collect_stops_at_the_limit() {
    let rt = runtime();
    for stream in [Stream::Stdout, Stream::Stderr] {
        let (pumps, mut out, mut err) = child(&rt, true);
        let bulk = if stream == Stream::Stdout { &mut out } else { &mut err };
        let collect = after_first_poll(pumps.collect(1000, LIMIT), || {
            bulk.write_all(b"HEAD").unwrap();
            bulk.write_all(&vec![b'z'; 5000]).unwrap();
        });
        let got = bounded(&rt, collect).unwrap();
        let (bulk, other) = if stream == Stream::Stdout {
            (got.stdout, got.stderr)
        } else {
            (got.stderr, got.stdout)
        };
        assert_eq!(got.over_limit, Some(stream));
        assert_eq!(bulk, Data::Text(format!("HEAD{}", "z".repeat(996))));
        assert_eq!(other, Data::Text(String::new()));
    }
}

/// After `end()` it still takes what arrives until the pipes close, and returns `within` after `end()` when
/// something keeps them open.
#[test]
fn collect_waits_within_after_end() {
    let rt = runtime();
    let (pumps, mut out, err) = child(&rt, true);
    out.write_all(b"ROOT\n").unwrap();
    let got = bounded(&rt, async {
        after_first_poll(pumps.collect(MIB, LIMIT), || {
            pumps.end();
            out.write_all(b"late\n").unwrap();
            drop(out);
            drop(err);
        })
        .await
        .unwrap()
    });
    assert_eq!(got.stdout, Data::Text("ROOT\nlate\n".into()));

    let (pumps, mut out, _err) = child(&rt, true);
    out.write_all(b"ROOT\n").unwrap();
    let within = Duration::from_millis(200);
    let start = Instant::now();
    let got = bounded(&rt, after_first_poll(pumps.collect(MIB, within), || pumps.end()));
    assert!(start.elapsed() >= within);
    assert_eq!(got.unwrap().stdout, Data::Text("ROOT\n".into()));
}

/// A stream over the limit does not end the batch already taken: the other stream keeps what was queued
/// with it, and what follows on the stream over the limit (its drops included) is no failure.
#[test]
fn the_limit_keeps_the_rest_of_the_batch() {
    let rt = runtime();
    let (pumps, shared) = bare(&rt);
    let collect = pumps.collect(5, LIMIT);
    shared.accept(0, b"0123456789");
    shared.finish(0, None); // its end reports the 4 bytes dropped beyond `max + 1`
    shared.accept(1, b"abc");
    let got = bounded(&rt, collect).unwrap();
    assert_eq!((got.over_limit, got.failed.is_none()), (Some(Stream::Stdout), true));
    assert_eq!(
        (got.stdout, got.stderr),
        (Data::Text("01234".into()), Data::Text("abc".into()))
    );
}

/// A read failure ends the collection with what each stream had before it, and the error.
#[test]
fn a_read_failure_keeps_the_prefixes() {
    let rt = runtime();
    let (pumps, shared) = bare(&rt);
    let collect = pumps.collect(MIB, LIMIT);
    shared.accept(0, b"out");
    shared.accept(1, b"err");
    shared.finish(0, Some(Error::read_failed(Stream::Stdout, &io::Error::other("boom"))));
    shared.accept(1, b"after");
    shared.finish(1, None);
    let got = bounded(&rt, collect).unwrap();
    assert_eq!(got.failed.unwrap().code(), ErrorCode::Io);
    assert_eq!(
        (got.stdout, got.stderr, got.over_limit),
        (Data::Text("out".into()), Data::Text("err".into()), None)
    );
}

/// Output dropped before the collection began (more than the unattached budget) ends it with the prefix
/// before the drop and the error: a result with a hole would look complete.
#[test]
fn a_drop_before_collecting_keeps_the_prefix() {
    let rt = runtime();
    let (pumps, shared) = bare(&rt);
    shared.accept(0, &vec![b'a'; UNATTACHED]);
    shared.accept(0, b"zz");
    let collect = pumps.collect(4 * MIB, LIMIT);
    shared.accept(0, b"after");
    shared.finish(0, None);
    shared.finish(1, None);
    let got = bounded(&rt, collect).unwrap();
    let failed = got.failed.unwrap();
    assert_eq!(failed.code(), ErrorCode::Io);
    assert!(failed.to_string().contains("2 bytes of the child's stdout"), "{failed}");
    assert_eq!(got.stdout, Data::Text("a".repeat(UNATTACHED)));
    assert_eq!(pumps.dropped().stdout, 2);
}

/// The claim is made when `collect` is called, before its future is polled; dropping the future unpolled
/// detaches the consumer.
#[test]
fn collect_claims_when_called() {
    let rt = runtime();
    let (pumps, _shared) = bare(&rt);
    let collect = pumps.collect(MIB, LIMIT);
    assert_eq!(pumps.output().unwrap_err().code(), ErrorCode::InvalidArgument);
    drop(collect);
    assert_eq!(pumps.lines().unwrap_err().code(), ErrorCode::InvalidArgument);
    let again = bounded(&rt, pumps.collect(MIB, LIMIT));
    assert_eq!(again.unwrap_err().code(), ErrorCode::InvalidArgument);
}

/// A drop still pending when the output ends without an end of file (something outside the tree holds the
/// pipe) is a hole all the same, whether `within` or the drain after `end()` ends the collection.
#[test]
fn a_pending_drop_at_a_bounded_end_is_a_failure() {
    let rt = runtime();
    for (within, at_least) in [(Duration::from_millis(50), Duration::ZERO), (LIMIT, DRAIN)] {
        let (pumps, shared) = bare(&rt);
        shared.accept(0, &vec![b'a'; UNATTACHED]);
        shared.accept(0, b"zz");
        let collect = pumps.collect(4 * MIB, within);
        let start = Instant::now();
        pumps.end();
        let got = bounded(&rt, collect).unwrap();
        assert!(start.elapsed() >= at_least);
        let failed = got.failed.unwrap();
        assert_eq!(failed.code(), ErrorCode::Io);
        assert!(failed.to_string().contains("2 bytes of the child's stdout"), "{failed}");
        assert_eq!((got.stdout, got.over_limit), (Data::Text("a".repeat(UNATTACHED)), None));
    }
}
