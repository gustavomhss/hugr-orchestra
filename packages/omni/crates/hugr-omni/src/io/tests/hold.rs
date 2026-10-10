//! WP-H H7b, backpressure: an attached consumer that falls behind holds the writer back instead of losing
//! output, and ending the output or detaching lets the writer go.

use std::sync::mpsc::RecvTimeoutError;
use std::time::Duration;

use super::super::queue::ATTACHED;
use super::{MIB, bounded, bytes, child, done, feed, losses, pattern, runtime, until};

/// 40 MiB into a consumer that has not read yet: the queue fills to the 16 MiB budget and the writer waits
/// (it has not finished); once the consumer reads, every byte arrives in order with no gap and nothing dropped.
#[test]
fn a_full_stream_holds_the_writer_back_and_loses_nothing() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    drop(err);
    pumps.hold();
    let mut output = pumps.output().unwrap();
    let data = pattern(40 * MIB);
    let writer = feed(out, data.clone());
    let shared = &pumps.shared;
    until(|| shared.queued(0) + 64 * 1024 > ATTACHED);
    // Held: the reader waits for room, so the writer is stuck on a full pipe.
    assert!(matches!(
        writer.recv_timeout(Duration::from_millis(200)),
        Err(RecvTimeoutError::Timeout)
    ));
    assert_eq!(pumps.dropped().stdout, 0);
    let mut chunks = Vec::new();
    let read = async {
        let mut got = 0;
        while got < data.len() {
            let chunk = output.next().await.unwrap().unwrap();
            got += bytes(std::slice::from_ref(&chunk)).len();
            chunks.push(chunk);
        }
    };
    bounded(&rt, read);
    drop(done(writer));
    assert_eq!(bytes(&chunks), data);
    assert!(losses(&chunks).iter().all(|&l| l == 0), "a gap under backpressure");
    assert_eq!(pumps.dropped().stdout, 0);
}

/// The tree is stopped (`end()`) while the writer is held: the reader lets go and drops as usual, so nothing
/// waits for a consumer that does not read.
#[test]
fn ending_the_output_releases_a_held_writer() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    drop(err);
    pumps.hold();
    let _output = pumps.output().unwrap();
    let writer = feed(out, pattern(40 * MIB));
    let shared = &pumps.shared;
    until(|| shared.queued(0) + 64 * 1024 > ATTACHED);
    pumps.end();
    drop(done(writer));
    bounded(&rt, pumps.ended());
    assert!(
        pumps.dropped().stdout > 0,
        "past the budget, the rest is dropped once the output ended"
    );
}

/// The consumer detaches while the writer is held: the writer goes on, and the rest is dropped.
#[test]
fn detaching_releases_a_held_writer() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    drop(err);
    pumps.hold();
    let output = pumps.output().unwrap();
    let writer = feed(out, pattern(40 * MIB));
    let shared = &pumps.shared;
    until(|| shared.queued(0) + 64 * 1024 > ATTACHED);
    drop(output);
    drop(done(writer));
    assert!(pumps.dropped().stdout >= ATTACHED as u64);
}

/// Without a claim, backpressure changes nothing: the unattached budget applies and the writer never waits.
#[test]
fn with_no_consumer_the_usual_budget_applies() {
    let rt = runtime();
    let (pumps, out, err) = child(&rt, false);
    drop(err);
    pumps.hold();
    drop(done(feed(out, pattern(20 * MIB))));
    bounded(&rt, pumps.ended());
    assert!(pumps.dropped().stdout > 0);
}
