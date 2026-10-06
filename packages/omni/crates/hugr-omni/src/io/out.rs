//! The consumer side of a child's output (contract §4). W10.
//!
//! Both views take queued items one at a time, so what waits for the consumer stays within the budget of
//! the queue. Chunks decode text per stream, keeping an incomplete character for the next item; lines keep
//! the raw bytes of the line in progress and decode each line (or piece) whole. A gap (bytes dropped before
//! an item) or the end turns an incomplete character into U+FFFD, so nothing is stitched across a gap. The
//! bytes dropped right before an item are reported on the next chunk or line of its stream, or on a final
//! empty one when the stream ends first.
//!
//! Every raw byte a view took from the queue is either yielded or, when the view is dropped, counted as
//! dropped (INV-05): what it still holds (items not yet yielded, a line in progress, an incomplete
//! character) is credited to its stream.

use std::collections::VecDeque;
use std::mem::take;
use std::sync::Arc;

use super::queue::{Item, Shared, What};
use crate::error::Error;
use crate::types::{Chunk, Data, Line};

/// A line longer than this is yielded in pieces of at most this many bytes.
const PIECE: usize = 1 << 20;

/// An item a view made and has not yielded yet: the raw bytes of `slot` it stands for.
#[derive(Debug)]
struct Ready<T> {
    item: Result<T, Error>,
    slot: usize,
    raw: u64,
}

/// The raw bytes per stream still held in `ready`.
fn held<T>(ready: &VecDeque<Ready<T>>) -> [u64; 2] {
    let mut held = [0; 2];
    for r in ready {
        held[r.slot] += r.raw;
    }
    held
}

/// The single output consumer, as chunks. Dropping it detaches for good.
#[derive(Debug)]
pub struct Output {
    feed: Feed,
    ready: VecDeque<Ready<Chunk>>,
    /// Bytes dropped per stream, not yet reported.
    lost: [u64; 2],
}

impl Output {
    pub(super) fn new(shared: Arc<Shared>) -> Output {
        Output {
            feed: Feed::new(shared),
            ready: VecDeque::new(),
            lost: [0; 2],
        }
    }

    /// The next chunk; `None` when the output ended.
    pub async fn next(&mut self) -> Option<Result<Chunk, Error>> {
        loop {
            if let Some(ready) = self.ready.pop_front() {
                return Some(ready.item);
            }
            let Item { slot, lost, what } = self.feed.next().await?;
            match what {
                What::Data(bytes) if !self.feed.text => {
                    let raw = bytes.len() as u64;
                    self.chunk(slot, Data::Bytes(bytes), lost, raw);
                }
                What::Data(bytes) => {
                    if lost > 0 {
                        self.flush(slot);
                    }
                    self.lost[slot] += lost;
                    let (text, raw) = self.feed.decode(slot, &bytes);
                    if !text.is_empty() {
                        self.chunk(slot, Data::Text(text), 0, raw);
                    }
                }
                What::Eof => self.end(slot, lost),
                What::Failed(err) => {
                    self.end(slot, lost);
                    self.ready.push_back(Ready {
                        item: Err(err),
                        slot,
                        raw: 0,
                    });
                }
            }
        }
    }

    fn chunk(&mut self, slot: usize, data: Data, lost: u64, raw: u64) {
        let lost = take(&mut self.lost[slot]) + lost;
        let stream = self.feed.shared.streams[slot];
        let lost_before = (lost > 0).then_some(lost);
        let item = Ok(Chunk {
            stream,
            data,
            lost_before,
        });
        self.ready.push_back(Ready { item, slot, raw });
    }

    /// An incomplete character cut by a gap or the end becomes U+FFFD.
    fn flush(&mut self, slot: usize) {
        let raw = self.feed.flush(slot);
        if raw > 0 {
            self.chunk(slot, Data::Text(char::REPLACEMENT_CHARACTER.into()), 0, raw);
        }
    }

    fn end(&mut self, slot: usize, lost: u64) {
        if self.feed.text {
            self.flush(slot);
        }
        if self.lost[slot] + lost > 0 {
            let empty = if self.feed.text {
                Data::Text(String::new())
            } else {
                Data::Bytes(Vec::new())
            };
            self.chunk(slot, empty, lost, 0);
        }
    }
}

impl Drop for Output {
    fn drop(&mut self) {
        let [out, err] = held(&self.ready);
        let tail = self.feed.tail.each_ref().map(|t| t.len() as u64);
        self.feed.shared.detach([out + tail[0], err + tail[1]]);
    }
}

/// The single output consumer, as lines. Dropping it detaches for good.
#[derive(Debug)]
pub struct Lines {
    feed: Feed,
    ready: VecDeque<Ready<Line>>,
    /// The raw bytes of the line in progress, per stream.
    partial: [Vec<u8>; 2],
    /// Bytes dropped per stream, not yet reported.
    lost: [u64; 2],
}

impl Lines {
    pub(super) fn new(shared: Arc<Shared>) -> Lines {
        Lines {
            feed: Feed::new(shared),
            ready: VecDeque::new(),
            partial: Default::default(),
            lost: [0; 2],
        }
    }

    /// The next line; `None` when the output ended.
    pub async fn next(&mut self) -> Option<Result<Line, Error>> {
        loop {
            if let Some(ready) = self.ready.pop_front() {
                return Some(ready.item);
            }
            let Item { slot, lost, what } = self.feed.next().await?;
            match what {
                What::Data(bytes) => {
                    if lost > 0 {
                        self.gap(slot, lost);
                    }
                    self.data(slot, &bytes);
                }
                What::Eof => self.end(slot, lost),
                What::Failed(err) => {
                    self.end(slot, lost);
                    self.ready.push_back(Ready {
                        item: Err(err),
                        slot,
                        raw: 0,
                    });
                }
            }
        }
    }

    fn data(&mut self, slot: usize, mut bytes: &[u8]) {
        while let Some(at) = bytes.iter().position(|&b| b == b'\n') {
            let mut line = take(&mut self.partial[slot]);
            line.extend_from_slice(&bytes[..at]);
            let raw = line.len() + 1;
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            self.line(slot, &line, raw - line.len());
            bytes = &bytes[at + 1..];
        }
        self.partial[slot].extend_from_slice(bytes);
        // A trailing `\r` may still turn out to be the line end, so it does not count yet.
        while self.partial[slot].len() - usize::from(self.partial[slot].ends_with(b"\r")) > PIECE {
            let (text, used) = piece(&self.partial[slot]);
            self.partial[slot].drain(..used);
            self.push(slot, text, true, used);
        }
    }

    /// Bytes were dropped (or the stream ends): the line in progress is yielded as it was, and the next
    /// line reports the gap.
    fn gap(&mut self, slot: usize, lost: u64) {
        let partial = take(&mut self.partial[slot]);
        if !partial.is_empty() {
            self.line(slot, &partial, 0);
        }
        self.lost[slot] += lost;
    }

    /// The stream ended: the last line even without `\n`, then a final empty one if a gap is unreported.
    fn end(&mut self, slot: usize, lost: u64) {
        self.gap(slot, lost);
        if self.lost[slot] > 0 {
            self.push(slot, String::new(), false, 0);
        }
    }

    /// A whole line (`end`: the raw bytes of its line end): pieces of at most `PIECE` bytes of text, all
    /// but the last marked `continues`.
    fn line(&mut self, slot: usize, mut raw: &[u8], end: usize) {
        loop {
            let (text, used) = piece(raw);
            raw = &raw[used..];
            if raw.is_empty() {
                return self.push(slot, text, false, used + end);
            }
            self.push(slot, text, true, used);
        }
    }

    fn push(&mut self, slot: usize, text: String, continues: bool, raw: usize) {
        let lost = take(&mut self.lost[slot]);
        let stream = self.feed.shared.streams[slot];
        let lost_before = (lost > 0).then_some(lost);
        let item = Ok(Line {
            stream,
            text,
            lost_before,
            continues,
        });
        self.ready.push_back(Ready {
            item,
            slot,
            raw: raw as u64,
        });
    }
}

impl Drop for Lines {
    fn drop(&mut self) {
        let [out, err] = held(&self.ready);
        let partial = self.partial.each_ref().map(|p| p.len() as u64);
        self.feed.shared.detach([out + partial[0], err + partial[1]]);
    }
}

/// The longest prefix of `raw` whose text (invalid bytes read as U+FFFD) is at most `PIECE` bytes and ends
/// at a character: the text, and the raw bytes it took.
fn piece(raw: &[u8]) -> (String, usize) {
    let mut text = String::with_capacity(raw.len().min(PIECE));
    let mut used = 0;
    for chunk in raw.utf8_chunks() {
        let (valid, invalid) = (chunk.valid(), chunk.invalid());
        let room = PIECE - text.len();
        if valid.len() > room {
            let mut at = room;
            while !valid.is_char_boundary(at) {
                at -= 1;
            }
            text.push_str(&valid[..at]);
            return (text, used + at);
        }
        text.push_str(valid);
        used += valid.len();
        if !invalid.is_empty() {
            if text.len() + char::REPLACEMENT_CHARACTER.len_utf8() > PIECE {
                return (text, used);
            }
            text.push(char::REPLACEMENT_CHARACTER);
            used += invalid.len();
        }
    }
    (text, used)
}

/// What both views share: the claim, the queue, and (for chunks) the incomplete character kept per stream.
#[derive(Debug)]
struct Feed {
    shared: Arc<Shared>,
    text: bool,
    done: bool,
    tail: [Vec<u8>; 2],
}

impl Feed {
    fn new(shared: Arc<Shared>) -> Feed {
        Feed {
            text: shared.text,
            shared,
            done: false,
            tail: Default::default(),
        }
    }

    /// The next item; `None` once the queue is empty and the output is over (then the consumer detaches;
    /// it holds nothing by then).
    async fn next(&mut self) -> Option<Item> {
        while !self.done {
            let changed = self.shared.changed.notified();
            {
                let mut st = self.shared.lock();
                if let Some(item) = st.pop() {
                    return Some(item);
                }
                self.done = st.over();
            }
            if self.done {
                self.shared.detach([0; 2]);
            } else {
                changed.await;
            }
        }
        None
    }

    /// `bytes` decoded after the incomplete character kept for `slot`, and the raw bytes the text stands for;
    /// a new incomplete end is kept.
    fn decode(&mut self, slot: usize, bytes: &[u8]) -> (String, u64) {
        let tail = &mut self.tail[slot];
        let joined;
        let mut input = bytes;
        if !tail.is_empty() {
            tail.extend_from_slice(bytes);
            joined = take(tail);
            input = &joined;
        }
        let total = input.len();
        let mut text = String::with_capacity(total);
        loop {
            match std::str::from_utf8(input) {
                Ok(valid) => break text.push_str(valid),
                Err(e) => {
                    let (valid, rest) = input.split_at(e.valid_up_to());
                    text.push_str(std::str::from_utf8(valid).unwrap_or_default());
                    match e.error_len() {
                        Some(bad) => {
                            text.push(char::REPLACEMENT_CHARACTER);
                            input = &rest[bad..];
                        }
                        None => break tail.extend_from_slice(rest),
                    }
                }
            }
        }
        (text, (total - tail.len()) as u64)
    }

    /// Drops the incomplete character of `slot` (it reads as U+FFFD); its raw length, 0 if there was none.
    fn flush(&mut self, slot: usize) -> u64 {
        let raw = self.tail[slot].len() as u64;
        self.tail[slot].clear();
        raw
    }
}
