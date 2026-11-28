use omni_proto::{Ack, ControlMember, FreezeOutcome, Msg};
use super::trees::Trees;

#[cfg(target_os = "linux")]
pub(super) fn list(trees: &mut Trees, req: u64, id: u64, out: &mut Vec<Msg>) {
    let Some(tree) = trees.map.get(&id).filter(|t| !t.released) else {
        out.push(Msg::Ack { req, id, result: Ack::Unknown });
        return;
    };
    let Some(member) = tree.member.as_ref().filter(|_| !tree.gone) else {
        out.push(Msg::Ack { req, id, result: Ack::Error });
        return;
    };
    let identity = (|| -> std::io::Result<Option<ControlMember>> {
        let Some(birth) = super::procs::member_birth(tree.pid, tree.pid)? else { return Ok(None) };
        let Some(_pin) = super::watch::pin_session_member(tree.pid, tree.pid, Some(birth))? else { return Ok(None) };
        if !member.matches(tree.pid) { return Ok(None) }
        Ok(Some(ControlMember { pid: tree.pid.cast_unsigned(), birth }))
    })();
    match identity {
        Ok(member) => out.push(Msg::ControlMembers { req, id, members: member.into_iter().collect() }),
        Err(_) => out.push(Msg::Ack { req, id, result: Ack::Error }),
    }
}

#[cfg(target_os = "linux")]
pub(super) fn freeze(trees: &mut Trees, req: u64, id: u64, identity: ControlMember, paused: bool, out: &mut Vec<Msg>) {
    let outcome = (|| {
        let tree = trees.map.get_mut(&id).filter(|t| !t.released && !t.gone)?;
        let pid = i32::try_from(identity.pid).ok()?;
        if pid != tree.pid { return None }
        let member = tree.member.as_mut()?;
        let _pin = super::watch::pin_session_member(pid, tree.pid, Some(identity.birth)).ok()??;
        if !member.matches(pid) { return None }
        Some(match member.set_paused(paused) {
            super::isolated::PauseResult::Changed => FreezeOutcome::Changed,
            super::isolated::PauseResult::Refused => FreezeOutcome::Refused,
            super::isolated::PauseResult::Unknown => FreezeOutcome::Unknown,
        })
    })().unwrap_or(FreezeOutcome::Unknown);
    out.push(Msg::ControlFreezeResult { req, id, outcome });
}

#[cfg(target_os = "macos")]
pub(super) fn list(_: &mut Trees, req: u64, id: u64, out: &mut Vec<Msg>) {
    out.push(Msg::Ack { req, id, result: Ack::Error });
}

#[cfg(target_os = "macos")]
pub(super) fn freeze(_: &mut Trees, req: u64, id: u64, _: ControlMember, _: bool, out: &mut Vec<Msg>) {
    out.push(Msg::Ack { req, id, result: Ack::Error });
}
