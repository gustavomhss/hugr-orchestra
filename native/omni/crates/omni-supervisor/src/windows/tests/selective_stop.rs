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
