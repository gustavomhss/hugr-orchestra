//! Codec for Windows selective process control messages.

use crate::{ControlMember, FreezeOutcome, Msg, ProtoError, SelectiveStopOutcome};

use super::len;
use super::wire::{Reader, Writer};

pub(super) const CONTROL_LIST: u8 = 0x09;
pub(super) const CONTROL_STOP: u8 = 0x0a;
pub(super) const CONTROL_MEMBERS: u8 = 0x89;
pub(super) const CONTROL_RESULTS: u8 = 0x8a;
pub(super) const CONTROL_FREEZE: u8 = 0x0b;
pub(super) const CONTROL_FREEZE_RESULT: u8 = 0x8b;
const MAX_MEMBERS: usize = 256;

pub(super) fn encode_list(w: &mut Writer, req: u64, id: u64) {
    w.u8(CONTROL_LIST).u64(req).u64(id);
}

pub(super) fn encode_stop(w: &mut Writer, req: u64, id: u64, members: &[ControlMember]) -> Result<(), ProtoError> {
    require_nonempty(members.len())?;
    w.u8(CONTROL_STOP).u64(req).u64(id).u32(len(members.len())?);
    for member in members {
        w.u32(member.pid).u64(member.birth);
    }
    Ok(())
}

pub(super) fn encode_freeze(w: &mut Writer, req: u64, id: u64, member: ControlMember, paused: bool) {
    w.u8(CONTROL_FREEZE)
        .u64(req)
        .u64(id)
        .u32(member.pid)
        .u64(member.birth)
        .bool(paused);
}

pub(super) fn encode_freeze_result(w: &mut Writer, req: u64, id: u64, outcome: FreezeOutcome) {
    w.u8(CONTROL_FREEZE_RESULT).u64(req).u64(id).u8(match outcome {
        FreezeOutcome::Changed => 0,
        FreezeOutcome::Refused => 1,
        FreezeOutcome::Unknown => 2,
    });
}

pub(super) fn decode_freeze(r: &mut Reader<'_>) -> Result<Msg, ProtoError> {
    Ok(Msg::ControlFreeze {
        req: r.u64()?,
        id: r.u64()?,
        member: ControlMember {
            pid: r.u32()?,
            birth: r.u64()?,
        },
        paused: r.bool()?,
    })
}

pub(super) fn decode_freeze_result(r: &mut Reader<'_>) -> Result<Msg, ProtoError> {
    let (req, id, value) = (r.u64()?, r.u64()?, r.u8()?);
    let outcome = match value {
        0 => FreezeOutcome::Changed,
        1 => FreezeOutcome::Refused,
        2 => FreezeOutcome::Unknown,
        n => return Err(ProtoError(format!("bad freeze outcome {n}"))),
    };
    Ok(Msg::ControlFreezeResult { req, id, outcome })
}

pub(super) fn encode_members(w: &mut Writer, req: u64, id: u64, members: &[ControlMember]) -> Result<(), ProtoError> {
    require_max(members.len())?;
    w.u8(CONTROL_MEMBERS).u64(req).u64(id).u32(len(members.len())?);
    for member in members {
        w.u32(member.pid).u64(member.birth);
    }
    Ok(())
}

pub(super) fn encode_results(
    w: &mut Writer,
    req: u64,
    id: u64,
    outcomes: &[SelectiveStopOutcome],
) -> Result<(), ProtoError> {
    require_nonempty(outcomes.len())?;
    w.u8(CONTROL_RESULTS).u64(req).u64(id).u32(len(outcomes.len())?);
    for outcome in outcomes {
        w.bool(*outcome == SelectiveStopOutcome::Exited);
    }
    Ok(())
}

pub(super) fn decode_stop(r: &mut Reader<'_>) -> Result<Msg, ProtoError> {
    let (req, id) = (r.u64()?, r.u64()?);
    let count = member_count(r, true, 12)?;
    let mut members = Vec::with_capacity(count);
    for _ in 0..count {
        members.push(ControlMember {
            pid: r.u32()?,
            birth: r.u64()?,
        });
    }
    Ok(Msg::ControlStop { req, id, members })
}

pub(super) fn decode_members(r: &mut Reader<'_>) -> Result<Msg, ProtoError> {
    let (req, id) = (r.u64()?, r.u64()?);
    let count = member_count(r, false, 12)?;
    let mut members = Vec::with_capacity(count);
    for _ in 0..count {
        members.push(ControlMember {
            pid: r.u32()?,
            birth: r.u64()?,
        });
    }
    Ok(Msg::ControlMembers { req, id, members })
}

pub(super) fn decode_results(r: &mut Reader<'_>) -> Result<Msg, ProtoError> {
    let (req, id) = (r.u64()?, r.u64()?);
    let count = member_count(r, true, 1)?;
    let mut outcomes = Vec::with_capacity(count);
    for _ in 0..count {
        outcomes.push(if r.bool()? {
            SelectiveStopOutcome::Exited
        } else {
            SelectiveStopOutcome::Unknown
        });
    }
    Ok(Msg::ControlResults { req, id, outcomes })
}

fn require_nonempty(count: usize) -> Result<(), ProtoError> {
    if count == 0 {
        return Err(ProtoError("control member list must not be empty".into()));
    }
    require_max(count)
}

fn require_max(count: usize) -> Result<(), ProtoError> {
    if count > MAX_MEMBERS {
        return Err(ProtoError("too many control members".into()));
    }
    Ok(())
}

fn member_count(r: &mut Reader<'_>, nonempty: bool, item_size: usize) -> Result<usize, ProtoError> {
    let count = r.u32()? as usize;
    require_max(count)?;
    if nonempty && count == 0 {
        return Err(ProtoError("control member list must not be empty".into()));
    }
    if count.saturating_mul(item_size) > r.remaining() {
        return Err(ProtoError("control member list cannot fit in frame".into()));
    }
    Ok(count)
}
