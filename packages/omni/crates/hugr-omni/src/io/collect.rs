//! `run()`'s side of the output (contract §6): every byte up to the limit, or the limit named. W10.
//!
//! While collecting, `max + 1` bytes per stream fit the queue, so within the limit nothing is ever dropped;
//! a drop seen here happened before the claim (more than the unattached budget was written before
//! `collect()` was called). A drop or a read failure ends the collection with what was kept so far (each
//! stream a prefix without holes) and the error in `failed`, so `run()` can reject with that partial output.
//! Of the events queued, the first one wins: the limit, a drop or a failure.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tokio::runtime::Handle;
use tokio::task::JoinHandle;

use super::Collected;
use super::queue::{Claim, Shared, What};
use crate::error::Error;
use crate::types::{Data, Stream};

/// Claims the consumer at once (when `collect()` is called, not when its future is first polled).
pub(super) fn claim(shared: &Shared, max: usize) -> Result<Release<'_>, Error> {
    shared.claim(Claim::Collecting(max)).map(|()| Release(shared))
}

pub(super) async fn collect(
    shared: &Arc<Shared>,
    rt: &Handle,
    max: usize,
    within: Duration,
    claim: Result<Release<'_>, Error>,
) -> Result<Collected, Error> {
    let _release = claim?;
    let mut kept: [Vec<u8>; 2] = Default::default();
    let mut deadline: Option<Deadline> = None;
    loop {
        let changed = shared.changed.notified();
        let (items, over, ended, pending) = {
            let mut st = shared.lock();
            (st.take_all(), st.over(), st.ended(), st.pending())
        };
        // The batch is taken out of the queue, so it is finished even past the limit.
        let mut limit: Option<Stream> = None;
        for item in items {
            let stream = shared.streams[item.slot];
            if limit == Some(stream) {
                continue; // beyond the limit: what follows on this stream (incl. its drops) is not kept
            }
            let failure = match item.what {
                _ if item.lost > 0 => Some(Error::output_lost(stream, item.lost)),
                What::Failed(err) => Some(err),
                What::Data(bytes) => {
                    let buf = &mut kept[item.slot];
                    let room = max.saturating_add(1).saturating_sub(buf.len());
                    buf.extend_from_slice(&bytes[..room.min(bytes.len())]);
                    if buf.len() > max && limit.is_none() {
                        limit = Some(stream);
                    }
                    None
                }
                What::Eof => None,
            };
            if let Some(err) = failure {
                if limit.is_some() {
                    break; // the limit came first; the other stream keeps its prefix
                }
                return Ok(collected(shared.text, kept, None, Some(err)));
            }
        }
        if limit.is_some() {
            for buf in &mut kept {
                buf.truncate(max);
            }
            return Ok(collected(shared.text, kept, limit, None));
        }
        if over {
            return Ok(finished(shared, kept, pending));
        }
        if ended {
            // The drain after `end()` cuts the output within 1 s; `within` may end the wait sooner.
            match &deadline {
                None => deadline = Some(Deadline::start(rt, shared, within)),
                Some(d) if d.passed.load(Ordering::SeqCst) => return Ok(finished(shared, kept, pending)),
                Some(_) => {}
            }
        }
        changed.await;
    }
}

/// The output is over. An end bounded by the drain or by `within` comes without the end of file that would
/// report a drop still pending on a stream: it is a hole all the same.
fn finished(shared: &Shared, kept: [Vec<u8>; 2], pending: [u64; 2]) -> Collected {
    let failed = (0..2)
        .find(|&slot| pending[slot] > 0)
        .map(|slot| Error::output_lost(shared.streams[slot], pending[slot]));
    collected(shared.text, kept, None, failed)
}

fn collected(
    text: bool,
    [stdout, stderr]: [Vec<u8>; 2],
    over_limit: Option<Stream>,
    failed: Option<Error>,
) -> Collected {
    let data = |bytes: Vec<u8>| {
        if text {
            Data::Text(String::from_utf8(bytes).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into()))
        } else {
            Data::Bytes(bytes)
        }
    };
    Collected {
        stdout: data(stdout),
        stderr: data(stderr),
        over_limit,
        failed,
    }
}

/// The claim of a collection: once it is over (returned, or its future dropped, even unpolled), the output
/// has no consumer any more.
pub(super) struct Release<'a>(&'a Shared);

impl Drop for Release<'_> {
    fn drop(&mut self) {
        self.0.detach([0; 2]);
    }
}

/// `within` after `end()`, on the library's runtime (the caller's executor may have no timer).
struct Deadline {
    passed: Arc<AtomicBool>,
    task: JoinHandle<()>,
}

impl Deadline {
    fn start(rt: &Handle, shared: &Arc<Shared>, within: Duration) -> Deadline {
        let passed = Arc::new(AtomicBool::new(false));
        let (flag, shared) = (Arc::clone(&passed), Arc::clone(shared));
        let task = rt.spawn(async move {
            tokio::time::sleep(within).await;
            flag.store(true, Ordering::SeqCst);
            shared.changed.notify_waiters();
        });
        Deadline { passed, task }
    }
}

impl Drop for Deadline {
    fn drop(&mut self) {
        self.task.abort();
    }
}
