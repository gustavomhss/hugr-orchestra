use omni_proto::{Exit, ProcEntry};

use super::{
    Ack, Duration, Inventory, MAX_MEMBERS, MAX_NAME_BYTES, Msg, Observation, Pending, Trees, ack, complete, empty,
    project, sync_channel,
};
use crate::unix::procs::{Exiting, Member};
use crate::unix::trees::Exec;

const ROOT: i32 = 100;
const CHILD: i32 = ROOT + 1;

#[test]
fn stalled_worker_keeps_its_slot_without_blocking_the_owner() {
    let mut trees = Trees::new(false);
    let id = trees.insert(ROOT, None, 0, Exec::Running);
    let (release, stalled) = sync_channel::<()>(0);
    let (send, result) = sync_channel(1);
    let worker = std::thread::spawn(move || {
        let _ = stalled.recv_timeout(Duration::from_secs(5));
        let _ = send.try_send(None);
    });
    let mut observation = Observation(Some(Pending {
        req: 1,
        id,
        pid: ROOT,
        footprint: false,
        worker,
        result,
    }));
    assert!(observation.poll(&trees).is_none());
    assert_eq!(observation.start(2, id, &trees), Some(ack(2, id, Ack::Error)));
    assert_eq!(observation.start(3, 0, &trees), Some(ack(3, 0, Ack::Unknown)));
    let gone = trees.insert(CHILD, None, 0, Exec::Running);
    trees.map.entry(gone).and_modify(|t| t.gone = true);
    assert_eq!(observation.start(4, gone, &trees), Some(empty(4, gone)));
    drop(release);
}

#[test]
fn validates_current_ownership_before_publishing_inventory() {
    let mut trees = Trees::new(false);
    let id = trees.insert(ROOT, None, 0, Exec::Running);
    let inventory = Inventory {
        members: [(ROOT, vec![member(ROOT, 1, true)])].into(),
        exiting: Vec::new(),
    };
    let sample = || project(ROOT, &inventory);
    assert_eq!(complete(1, id, CHILD, &trees, sample()), ack(1, id, Ack::Unknown));
    trees.map.entry(id).and_modify(|t| t.gone = true);
    assert_eq!(complete(2, id, ROOT, &trees, sample()), empty(2, id));
    trees.release(3, id, &mut Vec::new());
    assert_eq!(complete(4, id, ROOT, &trees, sample()), ack(4, id, Ack::Unknown));
}

#[test]
fn requires_complete_root_accounting_and_reports_only_live_members() {
    let mut trees = Trees::new(false);
    let id = trees.insert(ROOT, None, 0, Exec::Running);
    assert_eq!(complete(1, id, ROOT, &trees, None), ack(1, id, Ack::Error));
    let mut inventory = Inventory::default();
    inventory.members.insert(ROOT, vec![member(CHILD, ROOT, true)]);
    assert_eq!(
        complete(2, id, ROOT, &trees, project(ROOT, &inventory)),
        ack(2, id, Ack::Error)
    );

    let expected_child = ProcEntry {
        pid: CHILD.cast_unsigned(),
        ppid: None,
        name: Some("fixture".into()),
    };
    let sample = |root: Member| Inventory {
        members: [(ROOT, vec![root, member(CHILD, ROOT, true)])].into(),
        exiting: Vec::new(),
    };
    assert_eq!(
        complete(3, id, ROOT, &trees, project(ROOT, &sample(member(ROOT, 1, false)))),
        Msg::Processes {
            req: 3,
            id,
            list: vec![expected_child.clone()],
        }
    );
    assert_eq!(
        complete(4, id, ROOT, &trees, project(ROOT, &sample(member(ROOT, 1, true)))),
        Msg::Processes {
            req: 4,
            id,
            list: vec![
                ProcEntry {
                    pid: ROOT.cast_unsigned(),
                    ppid: None,
                    name: Some("fixture".into()),
                },
                ProcEntry {
                    ppid: Some(ROOT.cast_unsigned()),
                    ..expected_child.clone()
                },
            ],
        }
    );
    let mut inventory = Inventory {
        members: [(ROOT, vec![member(CHILD, ROOT, true)])].into(),
        exiting: vec![Exiting {
            pid: ROOT,
            pgid: ROOT,
            ppid: 1,
        }],
    };
    assert_eq!(
        complete(5, id, ROOT, &trees, project(ROOT, &inventory)),
        Msg::Processes {
            req: 5,
            id,
            list: vec![expected_child.clone()],
        }
    );
    inventory.exiting.clear();
    trees.map.entry(id).and_modify(|t| t.exit = Some(Exit::Code(0)));
    assert_eq!(
        complete(6, id, ROOT, &trees, project(ROOT, &inventory)),
        Msg::Processes {
            req: 6,
            id,
            list: vec![expected_child],
        }
    );
}

#[test]
fn rejects_oversized_samples_instead_of_truncating() {
    let mut inventory = Inventory {
        members: [(ROOT, vec![member(ROOT, 1, false); MAX_MEMBERS])].into(),
        exiting: Vec::new(),
    };
    assert!(project(ROOT, &inventory).is_some());
    inventory
        .members
        .entry(ROOT)
        .or_default()
        .push(member(CHILD, ROOT, true));
    assert!(project(ROOT, &inventory).is_none());

    let mut root = member(ROOT, 1, true);
    root.name = Some("é".repeat(MAX_NAME_BYTES / 2));
    inventory.members.insert(ROOT, vec![root.clone()]);
    assert!(project(ROOT, &inventory).is_some());
    root.name = Some("é".repeat(MAX_NAME_BYTES / 2 + 1));
    inventory.members.insert(ROOT, vec![root]);
    assert!(project(ROOT, &inventory).is_none());
}

#[cfg(target_os = "linux")]
#[test]
fn worker_fd_table_is_private() -> std::io::Result<()> {
    use std::os::fd::AsRawFd;
    use std::process::Command;

    const PROBE: &str = "HUGR_OMNI_OBSERVE_FD_PROBE";
    if std::env::var_os(PROBE).is_none() {
        // A regression in the close flags can only close descriptors in this disposable probe.
        let output = Command::new(std::env::current_exe()?)
            .args(["--exact", "unix::observe::tests::worker_fd_table_is_private"])
            .env(PROBE, "1")
            .output()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(output.status.success() && stdout.contains("1 passed"), "{stdout}");
        return Ok(());
    }
    let (marker, _write) = crate::unix::sys::pipe()?;
    let fd = marker.as_raw_fd();
    // SAFETY: F_GETFD only queries the calling thread's descriptor table.
    let is_open = move || unsafe { libc::fcntl(fd, libc::F_GETFD) } >= 0;
    assert!(is_open());
    let worker = std::thread::spawn(move || super::isolate_fds() && !is_open());
    assert_eq!(worker.join().ok(), Some(true));
    assert!(is_open());
    Ok(())
}

fn member(pid: i32, ppid: i32, live: bool) -> Member {
    Member {
        pid,
        ppid,
        pgid: ROOT,
        live,
        name: Some("fixture".into()),
    }
}
