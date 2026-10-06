//! IO-01..04: the pumps and stdin on real OS pipes, with the test (or a thread of it) as the child at the
//! other end. No process is started; every wait is bounded, and running out of time fails the test.

mod collect;
mod lines;
mod output;
mod stdin;

use std::future::{Future, poll_fn};
use std::io::{PipeWriter, Write};
use std::pin::pin;
use std::sync::{Arc, mpsc};
use std::task::Poll;
use std::thread;
use std::time::{Duration, Instant};

use tokio::runtime::Runtime;

use super::queue::Shared;
use super::{Pipe, Pumps, Source};
use crate::types::{Chunk, Data, Stream};

/// Every wait of a test fails after this.
const LIMIT: Duration = Duration::from_secs(20);
const MIB: usize = 1 << 20;

fn runtime() -> Runtime {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_time()
        .build()
        .unwrap()
}

/// Runs `f` to completion on `rt`; more than `LIMIT` fails the test.
fn bounded<F: Future>(rt: &Runtime, f: F) -> F::Output {
    rt.block_on(async { tokio::time::timeout(LIMIT, f).await.expect("timed out") })
}

fn pipe() -> (Pipe, PipeWriter) {
    let (read, write) = std::io::pipe().unwrap();
    (Pipe::from(read), write)
}

/// A pipe child: its pumps, and the writing ends of its stdout and stderr.
fn child(rt: &Runtime, text: bool) -> (Pumps, PipeWriter, PipeWriter) {
    let ((out, out_w), (err, err_w)) = (pipe(), pipe());
    let source = Source::Pipes {
        stdout: out,
        stderr: Some(err),
    };
    (Pumps::start(rt.handle(), source, text).unwrap(), out_w, err_w)
}

/// Pumps without reader threads: the test plays the readers (`accept`, `finish`), so the queue holds exactly
/// what it pushed.
fn bare(rt: &Runtime) -> (Pumps, Arc<Shared>) {
    let shared = Arc::new(Shared::new(true, [Stream::Stdout, Stream::Stderr], [true, true]));
    let pumps = Pumps {
        shared: Arc::clone(&shared),
        rt: rt.handle().clone(),
    };
    (pumps, shared)
}

/// `n` bytes of a pattern that a shifted or reordered copy cannot match.
fn pattern(n: usize) -> Vec<u8> {
    (0..n).map(|i| (i % 251) as u8).collect()
}

/// Writes `data` from a thread, as a child would; join with `done`.
fn feed(mut to: PipeWriter, data: Vec<u8>) -> mpsc::Receiver<PipeWriter> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        to.write_all(&data).unwrap();
        let _ = tx.send(to);
    });
    rx
}

/// Writes `data` from a thread, as a child would, then closes the pipe.
fn write_and_close(mut to: PipeWriter, data: Vec<u8>) {
    thread::spawn(move || to.write_all(&data).unwrap());
}

/// The writer of `feed` once it wrote everything: it never blocked for good.
fn done(writer: mpsc::Receiver<PipeWriter>) -> PipeWriter {
    writer.recv_timeout(LIMIT).expect("the writer blocked")
}

/// Polls until `cond` holds (a reader thread got that far); more than `LIMIT` fails the test.
fn until(mut cond: impl FnMut() -> bool) {
    let start = Instant::now();
    while !cond() {
        assert!(start.elapsed() < LIMIT, "condition never held");
        thread::sleep(Duration::from_millis(1));
    }
}

/// Polls `fut` once, runs `then` (e.g. starts a writer once a claim was made), then awaits `fut`.
async fn after_first_poll<F: Future>(fut: F, then: impl FnOnce()) -> F::Output {
    let mut fut = pin!(fut);
    let mut then = Some(then);
    poll_fn(|cx| {
        let polled = fut.as_mut().poll(cx);
        if let Some(then) = then.take() {
            then();
        }
        polled
    })
    .await
}

/// Is `fut` still pending after one poll?
fn pending<F: Future>(fut: F) -> bool {
    let mut fut = pin!(fut);
    let mut cx = std::task::Context::from_waker(std::task::Waker::noop());
    matches!(fut.as_mut().poll(&mut cx), Poll::Pending)
}

fn bytes(chunks: &[Chunk]) -> Vec<u8> {
    let mut all = Vec::new();
    for chunk in chunks {
        match &chunk.data {
            Data::Bytes(b) => all.extend_from_slice(b),
            Data::Text(t) => all.extend_from_slice(t.as_bytes()),
        }
    }
    all
}

/// The `lost_before` of every chunk, in order (`0` for none).
fn losses(chunks: &[Chunk]) -> Vec<u64> {
    chunks.iter().map(|c| c.lost_before.unwrap_or(0)).collect()
}

/// Every future of io can move to another thread (`tokio::spawn`, a binding's runtime).
#[test]
fn the_futures_are_send() {
    fn send<T: Send>(_: &T) {}
    let rt = runtime();
    let ((pumps, _out, _err), (more, _o, _e)) = (child(&rt, true), child(&rt, true));
    let (mut output, mut lines) = (pumps.output().unwrap(), more.lines().unwrap());
    send(&output.next());
    send(&lines.next());
    send(&pumps.collect(1, LIMIT));
    send(&pumps.ended());
    let (_read, write) = std::io::pipe().unwrap();
    let stdin = super::Stdin::start(rt.handle(), Pipe::from(write)).unwrap();
    send(&stdin.write(b"x"));
    send(&stdin.close());
}
