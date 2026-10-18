//! The Job's inventory and the member record, outside the owner loop: pids outside the Job (the stand-in for a
//! reused pid) and pids already gone are left out, and a member is proven gone only once it exited.

use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};

use omni_proto::ProcEntry;

use super::{assign, cmd_exe, pause, until};
use crate::windows::members::{Members, Proof};
use crate::windows::queues::{Event, Inbox, Item};
use crate::windows::{inventory, job};

#[test]
fn list_keeps_live_members_and_leaves_out_pids_outside_the_job_or_gone() {
    let job = job::create().unwrap();
    let (mut member, mut outsider) = (pause(), pause());
    assign(&job, &member);
    let gone = {
        let mut c = Command::new(cmd_exe()).args(["/d", "/c", "exit"]).spawn().unwrap();
        c.wait().unwrap();
        c.id()
    };
    let list = inventory::of(&job, &[member.id(), outsider.id(), gone]).unwrap();
    assert_eq!(
        list,
        [ProcEntry {
            pid: member.id(),
            ppid: None,
            name: Some("cmd.exe".into())
        }]
    );
    job::terminate(&job);
    member.wait().unwrap();
    assert_eq!(inventory::of(&job, &[member.id()]).unwrap(), []);
    outsider.kill().unwrap();
    outsider.wait().unwrap();
}

#[test]
fn members_are_recorded_as_they_start_and_proven_gone_only_once_exited() {
    let inbox = Arc::new(Inbox::default());
    let members = Members::start(&inbox).unwrap();
    let job = job::create().unwrap();
    members.watch(7, &job).unwrap();
    let (mut member, mut outsider) = (pause(), pause());
    assign(&job, &member);
    // From the completion port, with no poll.
    assert!(until(|| members.recorded(7).contains(&member.id())));
    // A recorded pid that names a live process outside the Job (a reused pid) never blocks the proof.
    members.insert(7, outsider.id());
    assert!(
        matches!(members.prove(7, &job), Proof::Pending(_)),
        "the flush marker goes out first"
    );
    match inbox.next(false, Some(Instant::now() + Duration::from_secs(10))) {
        Some(Item::Event(Event::Settle { id: 7 })) => {}
        other => panic!("{other:?}"),
    }
    let live = members.prove(7, &job);
    assert_eq!(
        live,
        Proof::Pending(format!("pid {} is still exiting", member.id())),
        "a live member blocks it"
    );
    job::terminate(&job);
    member.wait().unwrap();
    assert_eq!(members.prove(7, &job), Proof::Gone);
    assert!(outsider.try_wait().unwrap().is_none(), "the outsider is untouched");
    outsider.kill().unwrap();
    outsider.wait().unwrap();
}
