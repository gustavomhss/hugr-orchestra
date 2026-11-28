use super::{assign, pause, until};
use crate::windows::{inventory, job, selective_stop};

#[test]
fn terminates_only_selected_pinned_member() {
    let job = job::create().unwrap();
    let (mut selected, mut retained) = (pause(), pause());
    assign(&job, &selected);
    assign(&job, &retained);
    let held = inventory::pin_observed(&job, None).unwrap();
    let identity = selective_stop::Member {
        pid: selected.id(),
        birth: inventory::created(held.get(&selected.id()).unwrap()).unwrap(),
    };
    let result = selective_stop::stop(&job, &[identity]).unwrap();
    assert_eq!(result.len(), 1);
    assert!(until(|| selected.try_wait().unwrap().is_some()));
    assert!(retained.try_wait().unwrap().is_none());
    retained.kill().unwrap();
    retained.wait().unwrap();
}

#[test]
fn rejects_entire_set_before_effect_when_identity_is_wrong() {
    let job = job::create().unwrap();
    let (mut first, mut second) = (pause(), pause());
    assign(&job, &first);
    assign(&job, &second);
    let held = inventory::pin_observed(&job, None).unwrap();
    let first_id = selective_stop::Member {
        pid: first.id(),
        birth: inventory::created(held.get(&first.id()).unwrap()).unwrap(),
    };
    let wrong = selective_stop::Member { pid: second.id(), birth: 0 };
    assert!(selective_stop::stop(&job, &[first_id, wrong]).is_err());
    assert!(first.try_wait().unwrap().is_none());
    assert!(second.try_wait().unwrap().is_none());
    first.kill().unwrap();
    second.kill().unwrap();
    first.wait().unwrap();
    second.wait().unwrap();
}

#[test]
fn supervisor_control_targets_only_selected_job_member() {
    use omni_proto::Msg;
    use super::Looped;
    use crate::windows::tree::Tree;

    let mut owner = Looped::new();
    let job = job::create().unwrap();
    let (mut selected, mut retained) = (pause(), pause());
    assign(&job, &selected);
    assign(&job, &retained);
    let job::Probe::Member(root) = job::probe(&job, retained.id()).unwrap() else { panic!("root not in Job") };
    owner.sup.trees.insert(42, Tree::new(42, retained.id(), root, job, None, 0));
    let req = owner.request(|req| Msg::ControlList { req, id: 42 });
    let (_, reply) = owner.until(|msg| matches!(msg, Msg::ControlMembers { req: r, .. } if *r == req));
    let Msg::ControlMembers { members, .. } = reply else { unreachable!() };
    let member = members.into_iter().find(|member| member.pid == selected.id()).unwrap();
    let req = owner.request(|req| Msg::ControlStop { req, id: 42, members: vec![member] });
    let (_, reply) = owner.until(|msg| matches!(msg, Msg::ControlResults { req: r, .. } if *r == req));
    let Msg::ControlResults { outcomes, .. } = reply else { unreachable!() };
    assert_eq!(outcomes.len(), 1);
    assert!(until(|| selected.try_wait().unwrap().is_some()));
    assert!(retained.try_wait().unwrap().is_none());
    retained.kill().unwrap();
    retained.wait().unwrap();
}
