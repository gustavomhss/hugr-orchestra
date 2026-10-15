//! stdin: order, backpressure, close, abandon, and a child that closed its end (EPIPE) as `Closed`.

use std::future::{Future, poll_fn};
use std::io::{PipeReader, Read};
use std::pin::pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::task::Poll;
use std::thread;

use super::super::{Pipe, Stdin};
use super::{LIMIT, MIB, bounded, runtime};
use crate::error::{Error, ErrorCode};

fn stdin(rt: &tokio::runtime::Runtime) -> (Stdin, PipeReader) {
    let (read, write) = std::io::pipe().unwrap();
    (Stdin::start(rt.handle(), Pipe::from(write)).unwrap(), read)
}

/// Reads to end of file on a thread, as a child would; `count` follows its progress.
fn child_reads(mut from: PipeReader, count: Arc<AtomicUsize>) -> mpsc::Receiver<Vec<u8>> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let (mut all, mut buf) = (Vec::new(), vec![0; 64 << 10]);
        loop {
            match from.read(&mut buf).unwrap() {
                0 => break,
                n => {
                    all.extend_from_slice(&buf[..n]);
                    count.fetch_add(n, Ordering::SeqCst);
                }
            }
        }
        let _ = tx.send(all);
    });
    rx
}

/// Polls `a` then `b` each round, so what `a` queues comes first.
async fn in_order<A: Future, B: Future>(a: A, b: B) -> (A::Output, B::Output) {
    let (mut a, mut b) = (pin!(a), pin!(b));
    let (mut ra, mut rb) = (None, None);
    poll_fn(|cx| {
        if ra.is_none()
            && let Poll::Ready(r) = a.as_mut().poll(cx)
        {
            ra = Some(r);
        }
        if rb.is_none()
            && let Poll::Ready(r) = b.as_mut().poll(cx)
        {
            rb = Some(r);
        }
        match (ra.take(), rb.take()) {
            (Some(x), Some(y)) => Poll::Ready((x, y)),
            (x, y) => {
                (ra, rb) = (x, y);
                Poll::Pending
            }
        }
    })
    .await
}

fn closed(result: Result<(), Error>) -> String {
    let err = result.unwrap_err();
    assert_eq!(err.code(), ErrorCode::Closed, "{err}");
    err.to_string()
}

/// Concurrent writes larger than the pipe apply whole, in the order they were queued; `close` flushes
/// them, is idempotent, and a later write is `Closed`.
#[test]
fn writes_apply_in_order_and_close_flushes() {
    let rt = runtime();
    let (stdin, read) = stdin(&rt);
    let got = child_reads(read, Arc::default());
    let (a, b) = (vec![b'a'; 2 * MIB], vec![b'b'; 2 * MIB]);
    bounded(&rt, async {
        let (ra, rb) = in_order(stdin.write(&a), stdin.write(&b)).await;
        ra.unwrap();
        rb.unwrap();
        stdin.write(b"c").await.unwrap();
        let (r1, r2) = in_order(stdin.close(), stdin.close()).await;
        r1.unwrap();
        r2.unwrap();
        stdin.close().await.unwrap();
        assert!(closed(stdin.write(b"late").await).contains("closeStdin()"));
    });
    let got = got.recv_timeout(LIMIT).unwrap();
    assert!(
        got == [a, b, b"c".to_vec()].concat(),
        "the writes were reordered or interleaved"
    );
}

/// `write` resolves only once the OS took its bytes: by then the child read all but what fits the pipe.
#[test]
fn write_waits_for_the_pipe() {
    let rt = runtime();
    let (stdin, read) = stdin(&rt);
    let count = Arc::new(AtomicUsize::new(0));
    let _got = child_reads(read, Arc::clone(&count));
    bounded(&rt, stdin.write(&vec![b'w'; 8 * MIB])).unwrap();
    assert!(
        count.load(Ordering::SeqCst) >= 7 * MIB,
        "write resolved before the child read the bytes"
    );
}

/// The child exited (or its tree was stopped) while a write waits on a full pipe: every pending and later
/// write settles with `Closed`, and `close` succeeds.
#[test]
fn abandon_settles_pending_writes() {
    let rt = runtime();
    let (stdin, read) = stdin(&rt);
    let (big, more) = (vec![b'x'; 4 * MIB], vec![b'y'; 10]);
    bounded(&rt, async {
        let (r1, r2) = in_order(in_order(stdin.write(&big), stdin.write(&more)), async {
            stdin.abandon();
            stdin.abandon();
        })
        .await
        .0;
        assert!(closed(r1).contains("exited"));
        closed(r2);
        closed(stdin.write(b"z").await);
        stdin.close().await.unwrap();
    });
    drop(read);
}

/// A child that closed its stdin: the write is `Closed` (EPIPE), not a crash, and so is every later one.
#[test]
fn a_closed_pipe_is_closed() {
    let rt = runtime();
    let (stdin, read) = stdin(&rt);
    drop(read);
    bounded(&rt, async {
        assert!(closed(stdin.write(b"x").await).contains("closed its end"));
        closed(stdin.write(b"y").await);
        stdin.close().await.unwrap();
    });
}

/// Dropping stdin closes the child's end once queued writes are done.
#[test]
fn dropping_stdin_closes_the_child_end() {
    let rt = runtime();
    let (stdin, read) = stdin(&rt);
    let got = child_reads(read, Arc::default());
    bounded(&rt, stdin.write(b"last")).unwrap();
    drop(stdin);
    assert_eq!(got.recv_timeout(LIMIT).unwrap(), b"last");
}
