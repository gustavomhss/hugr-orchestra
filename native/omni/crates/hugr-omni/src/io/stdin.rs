//! The child's input (contract §9): one writer thread per child applies the writes in the order they were
//! queued, each `write` resolving once the OS took all of its bytes. W10.
//!
//! The thread blocks in the OS write (that is the backpressure), so nothing can interrupt it: `abandon`
//! settles the write in progress and every queued one at once, and the thread leaves when its write returns
//! (the child's end closes when the tree is gone). Writing to a pipe nobody reads any more fails with
//! EPIPE, which needs SIGPIPE ignored: Rust's std, Node, Python, Bun and Deno all ignore it.

use std::collections::VecDeque;
use std::fs::File;
use std::io::{ErrorKind, Write};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread;

use tokio::sync::oneshot;

use super::Pipe;
use super::queue::STACK;
use crate::error::Error;

type Reply = oneshot::Sender<Result<(), Error>>;

const BY_CLOSE: &str = "closeStdin() already closed it";
const BY_CHILD: &str = "the child closed its end of the pipe";
const BY_EXIT: &str = "the child exited or its tree was stopped";
const BY_FAILURE: &str = "an earlier write to it failed";

#[derive(Debug)]
enum Job {
    Write(Vec<u8>, Reply),
    Close(Reply),
}

#[derive(Debug)]
struct Jobs {
    queue: VecDeque<Job>,
    /// The reply of the write in progress.
    current: Option<Reply>,
    /// Why nothing more is written, once that is so.
    shut: Option<&'static str>,
    /// Abandoned: the thread leaves.
    gone: bool,
}

#[derive(Debug)]
pub(super) struct Writer {
    jobs: Mutex<Jobs>,
    wake: Condvar,
}

impl Writer {
    pub(super) fn start(sink: Pipe) -> Result<Arc<Writer>, Error> {
        let writer = Arc::new(Writer {
            jobs: Mutex::new(Jobs {
                queue: VecDeque::new(),
                current: None,
                shut: None,
                gone: false,
            }),
            wake: Condvar::new(),
        });
        let thread = Arc::clone(&writer);
        thread::Builder::new()
            .name("hugr-omni-in".into())
            .stack_size(STACK)
            .spawn(move || thread.run(File::from(sink)))
            .map_err(|e| Error::io_thread("the stdin writer", &e))?;
        Ok(writer)
    }

    fn lock(&self) -> MutexGuard<'_, Jobs> {
        self.jobs.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) async fn write(&self, data: &[u8]) -> Result<(), Error> {
        let (reply, done) = oneshot::channel();
        {
            let mut jobs = self.lock();
            if let Some(why) = jobs.shut {
                return Err(Error::stdin_closed(why));
            }
            jobs.queue.push_back(Job::Write(data.to_vec(), reply));
        }
        self.wake.notify_one();
        done.await.unwrap_or_else(|_| Err(Error::stdin_closed(BY_EXIT)))
    }

    pub(super) async fn close(&self) -> Result<(), Error> {
        let (reply, done) = oneshot::channel();
        {
            let mut jobs = self.lock();
            if jobs.shut.is_some() {
                return Ok(());
            }
            jobs.queue.push_back(Job::Close(reply));
        }
        self.wake.notify_one();
        done.await.unwrap_or(Ok(()))
    }

    pub(super) fn abandon(&self) {
        {
            let mut jobs = self.lock();
            jobs.gone = true;
            if let Some(reply) = jobs.current.take() {
                let _ = reply.send(Err(Error::stdin_closed(BY_EXIT)));
            }
            shut(&mut jobs, BY_EXIT);
        }
        self.wake.notify_all();
    }

    /// The thread: one job at a time, in order, until stdin is closed, broken or abandoned.
    fn run(&self, mut sink: File) {
        loop {
            let (data, close) = {
                let mut jobs = self.lock();
                loop {
                    if jobs.gone {
                        return;
                    }
                    match jobs.queue.pop_front() {
                        Some(Job::Write(data, reply)) => {
                            jobs.current = Some(reply);
                            break (data, None);
                        }
                        Some(Job::Close(reply)) => break (Vec::new(), Some(reply)),
                        None => jobs = self.wake.wait(jobs).unwrap_or_else(PoisonError::into_inner),
                    }
                }
            };
            if let Some(reply) = close {
                drop(sink);
                shut(&mut self.lock(), BY_CLOSE);
                let _ = reply.send(Ok(()));
                return;
            }
            let wrote = sink.write_all(&data);
            let mut jobs = self.lock();
            let reply = jobs.current.take();
            let (result, stop) = match wrote {
                Ok(()) => (Ok(()), None),
                Err(e) if e.kind() == ErrorKind::BrokenPipe => (Err(Error::stdin_closed(BY_CHILD)), Some(BY_CHILD)),
                Err(e) => (Err(Error::write_failed(&e)), Some(BY_FAILURE)),
            };
            if let Some(reply) = reply {
                let _ = reply.send(result);
            }
            if let Some(why) = stop {
                shut(&mut jobs, why);
                return;
            }
        }
    }
}

/// Nothing more is written: queued writes fail with `why`, queued closes succeed. The first reason stays.
fn shut(jobs: &mut Jobs, why: &'static str) {
    let why = *jobs.shut.get_or_insert(why);
    for job in jobs.queue.drain(..) {
        let _ = match job {
            Job::Write(_, reply) => reply.send(Err(Error::stdin_closed(why))),
            Job::Close(reply) => reply.send(Ok(())),
        };
    }
}
