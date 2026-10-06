//! Frame codec: the byte layout of `docs/protocol.md`. A pure function pair; every malformed frame is an error.

mod wire;

#[cfg(test)]
mod tests;

use crate::{Ack, Exit, FailCode, MAX_FRAME, Msg, ProcEntry, ProtoError, Slot, Spawn};
use wire::{Reader, Writer};

const SPAWN: u8 = 0x01;
const GO: u8 = 0x02;
const STOP: u8 = 0x03;
const RESIZE: u8 = 0x04;
const LIST: u8 = 0x05;
const RELEASE: u8 = 0x06;
const READY: u8 = 0x81;
const SPAWNED: u8 = 0x82;
const SPAWN_FAILED: u8 = 0x83;
const EXITED: u8 = 0x84;
const STOPPED: u8 = 0x85;
const PROCESSES: u8 = 0x86;
const ACK: u8 = 0x87;

/// Appends one frame for `msg` to `out`. Fails (and appends nothing) if the frame would be malformed:
/// over `MAX_FRAME`, a slot not allowed for its field, or a signal outside 1..=127.
pub fn encode(msg: &Msg, out: &mut Vec<u8>) -> Result<(), ProtoError> {
    let mut w = Writer::default();
    match msg {
        Msg::Spawn(s) => {
            if !matches!(s.stdin, Slot::Null | Slot::Pipe) || !matches!(s.stderr, Slot::Pipe | Slot::Merge) {
                return Err(ProtoError("invalid stdio slot".into()));
            }
            w.u8(SPAWN).u64(s.req).bytes(&s.program)?;
            w.u32(len(s.argv.len())?);
            for a in &s.argv {
                w.bytes(a)?;
            }
            w.u32(len(s.env.len())?);
            for (k, v) in &s.env {
                w.bytes(k)?.bytes(v)?;
            }
            w.bytes(&s.cwd)?;
            let (pty, (cols, rows)) = match s.pty {
                Some(size) => (true, size),
                None => (false, (0, 0)),
            };
            w.bool(pty)
                .u16(cols)
                .u16(rows)
                .u8(slot(s.stdin))
                .u8(slot(s.stderr))
                .u32(s.grace_ms);
            for h in s.handles {
                w.u64(h);
            }
        }
        Msg::Go { req, id } => _ = w.u8(GO).u64(*req).u64(*id),
        Msg::Stop { req, id, grace_ms } => _ = w.u8(STOP).u64(*req).u64(*id).u32(*grace_ms),
        Msg::Resize { req, id, cols, rows } => _ = w.u8(RESIZE).u64(*req).u64(*id).u16(*cols).u16(*rows),
        Msg::List { req, id } => _ = w.u8(LIST).u64(*req).u64(*id),
        Msg::Release { req, id } => _ = w.u8(RELEASE).u64(*req).u64(*id),
        Msg::Ready { version, pid, info } => _ = w.u8(READY).u32(*version).u32(*pid).u32(*info),
        Msg::Spawned { req, id, pid, pty_ends } => {
            w.u8(SPAWNED)
                .u64(*req)
                .u64(*id)
                .u32(*pid)
                .u64(pty_ends[0])
                .u64(pty_ends[1]);
        }
        Msg::SpawnFailed { req, code, errno, msg } => {
            w.u8(SPAWN_FAILED)
                .u64(*req)
                .u8(fail_code(*code))
                .i32(*errno)
                .bytes(msg.as_bytes())?;
        }
        Msg::Exited { id, exit } => {
            let (kind, value) = match *exit {
                Exit::Code(c) => (0, c),
                Exit::Signal(s @ 1..=127) => (1, s.unsigned_abs()),
                Exit::Signal(s) => return Err(ProtoError(format!("signal {s} outside 1..=127"))),
            };
            w.u8(EXITED).u64(*id).u8(kind).u32(value);
        }
        Msg::Stopped { req, id } => _ = w.u8(STOPPED).u64(*req).u64(*id),
        Msg::Processes { req, id, list } => {
            w.u8(PROCESSES).u64(*req).u64(*id).u32(len(list.len())?);
            for p in list {
                w.u32(p.pid)
                    .u32(p.ppid.unwrap_or(0))
                    .bytes(p.name.as_deref().unwrap_or("").as_bytes())?;
            }
        }
        Msg::Ack { req, id, result } => _ = w.u8(ACK).u64(*req).u64(*id).u8(ack(*result)),
    }
    let body = w.finish();
    if body.len() > MAX_FRAME {
        return Err(ProtoError(format!(
            "frame of {} bytes is over the 1 MiB limit",
            body.len()
        )));
    }
    out.extend_from_slice(&len(body.len())?.to_le_bytes());
    out.extend_from_slice(&body);
    Ok(())
}

/// Decodes one frame from the front of `buf`: `Ok(None)` = need more bytes; `Ok(Some((msg, used)))`.
pub fn decode(buf: &[u8]) -> Result<Option<(Msg, usize)>, ProtoError> {
    let Some(head) = buf.first_chunk::<4>() else {
        return Ok(None);
    };
    let n = u32::from_le_bytes(*head) as usize;
    if n == 0 || n > MAX_FRAME {
        return Err(ProtoError(format!("bad frame length {n}")));
    }
    let Some(body) = buf.get(4..4 + n) else { return Ok(None) };
    let mut r = Reader::new(body);
    let msg = match r.u8()? {
        SPAWN => Msg::Spawn(spawn(&mut r)?),
        GO => Msg::Go {
            req: r.u64()?,
            id: r.u64()?,
        },
        STOP => Msg::Stop {
            req: r.u64()?,
            id: r.u64()?,
            grace_ms: r.u32()?,
        },
        RESIZE => Msg::Resize {
            req: r.u64()?,
            id: r.u64()?,
            cols: r.u16()?,
            rows: r.u16()?,
        },
        LIST => Msg::List {
            req: r.u64()?,
            id: r.u64()?,
        },
        RELEASE => Msg::Release {
            req: r.u64()?,
            id: r.u64()?,
        },
        READY => Msg::Ready {
            version: r.u32()?,
            pid: r.u32()?,
            info: r.u32()?,
        },
        SPAWNED => Msg::Spawned {
            req: r.u64()?,
            id: r.u64()?,
            pid: r.u32()?,
            pty_ends: [r.u64()?, r.u64()?],
        },
        SPAWN_FAILED => Msg::SpawnFailed {
            req: r.u64()?,
            code: match r.u8()? {
                1 => FailCode::NotFound,
                2 => FailCode::NotExecutable,
                3 => FailCode::BadCwd,
                4 => FailCode::Invalid,
                5 => FailCode::Io,
                c => return Err(ProtoError(format!("bad SpawnFailed code {c}"))),
            },
            errno: r.i32()?,
            msg: r.string()?,
        },
        EXITED => {
            let id = r.u64()?;
            let exit = match (r.u8()?, r.u32()?) {
                (0, code) => Exit::Code(code),
                (1, s @ 1..=127) => Exit::Signal(s as i32),
                (k, v) => return Err(ProtoError(format!("bad Exited kind {k} value {v}"))),
            };
            Msg::Exited { id, exit }
        }
        STOPPED => Msg::Stopped {
            req: r.u64()?,
            id: r.u64()?,
        },
        PROCESSES => {
            let (req, id) = (r.u64()?, r.u64()?);
            let mut list = Vec::new();
            for _ in 0..r.count(12)? {
                let (pid, ppid) = (r.u32()?, r.u32()?);
                let name = r.string()?;
                list.push(ProcEntry {
                    pid,
                    ppid: (ppid != 0).then_some(ppid),
                    name: (!name.is_empty()).then_some(name),
                });
            }
            Msg::Processes { req, id, list }
        }
        ACK => Msg::Ack {
            req: r.u64()?,
            id: r.u64()?,
            result: match r.u8()? {
                0 => Ack::Ok,
                2 => Ack::Unknown,
                3 => Ack::Error,
                4 => Ack::Closed,
                a => return Err(ProtoError(format!("bad Ack result {a}"))),
            },
        },
        k => return Err(ProtoError(format!("unknown kind 0x{k:02x}"))),
    };
    r.end()?;
    Ok(Some((msg, 4 + n)))
}

fn spawn(r: &mut Reader<'_>) -> Result<Spawn, ProtoError> {
    let req = r.u64()?;
    let program = r.bytes()?;
    let mut argv = Vec::new();
    for _ in 0..r.count(4)? {
        argv.push(r.bytes()?);
    }
    let mut env = Vec::new();
    for _ in 0..r.count(8)? {
        env.push((r.bytes()?, r.bytes()?));
    }
    let cwd = r.bytes()?;
    let (pty, cols, rows) = (r.bool()?, r.u16()?, r.u16()?);
    if !pty && (cols, rows) != (0, 0) {
        return Err(ProtoError("terminal size without a terminal".into()));
    }
    let stdin = match r.u8()? {
        0 => Slot::Null,
        1 => Slot::Pipe,
        s => return Err(ProtoError(format!("bad stdin slot {s}"))),
    };
    let stderr = match r.u8()? {
        1 => Slot::Pipe,
        2 => Slot::Merge,
        s => return Err(ProtoError(format!("bad stderr slot {s}"))),
    };
    let grace_ms = r.u32()?;
    let handles = [r.u64()?, r.u64()?, r.u64()?];
    let pty = pty.then_some((cols, rows));
    Ok(Spawn {
        req,
        program,
        argv,
        env,
        cwd,
        pty,
        stdin,
        stderr,
        grace_ms,
        handles,
    })
}

fn len(n: usize) -> Result<u32, ProtoError> {
    u32::try_from(n).map_err(|_| ProtoError(format!("length {n} does not fit a frame")))
}

fn slot(s: Slot) -> u8 {
    match s {
        Slot::Null => 0,
        Slot::Pipe => 1,
        Slot::Merge => 2,
    }
}

fn fail_code(c: FailCode) -> u8 {
    match c {
        FailCode::NotFound => 1,
        FailCode::NotExecutable => 2,
        FailCode::BadCwd => 3,
        FailCode::Invalid => 4,
        FailCode::Io => 5,
    }
}

fn ack(a: Ack) -> u8 {
    match a {
        Ack::Ok => 0,
        Ack::Unknown => 2,
        Ack::Error => 3,
        Ack::Closed => 4,
    }
}
