//! Exercises the owner while a real Job inventory result is held back by the worker.

use std::io;
use std::sync::mpsc::{self, Sender};
use std::time::Duration;

use omni_proto::{Ack, Msg};

use super::{Looped, until};
use crate::windows::job::Probe;
use crate::windows::{inventory, job};

#[test]
fn observation_leaves_spawn_and_stop_responsive_and_discards_a_gone_sample() {
    let mut l = Looped::new();
    let (id, pid) = l.spawn(&["pause"], true);
    let (pending, finish) = hold_observation(&mut l, id, pid);

    let (other, other_pid) = l.spawn(&["pause"], true);
    let busy = l.request(|req| Msg::Observe { req, id: other });
    assert_eq!(
        reply(&mut l, busy),
        Msg::Ack {
            req: busy,
            id: other,
            result: Ack::Error
        }
    );
    let stop = l.stop(id, 0);
    l.stopped(stop);
    let gone = l.request(|req| Msg::Observe { req, id });
    assert_eq!(
        reply(&mut l, gone),
        Msg::Processes {
            req: gone,
            id,
            list: Vec::new()
        }
    );

    finish.send(()).unwrap();
    assert_eq!(
        reply(&mut l, pending),
        Msg::Processes {
            req: pending,
            id,
            list: Vec::new()
        }
    );
    let fresh = l.request(|req| Msg::Observe { req, id: other });
    let Msg::Processes { id, list, .. } = reply(&mut l, fresh) else {
        panic!("fresh observation did not return a process list");
    };
    assert_eq!(id, other);
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].pid, other_pid);
    assert_eq!(list[0].ppid, None);
    assert!(
        list[0]
            .name
            .as_deref()
            .is_some_and(|name| name.eq_ignore_ascii_case("cmd.exe"))
    );
    let stop = l.stop(other, 0);
    l.stopped(stop);
}

#[test]
fn an_observation_of_a_released_tree_replies_unknown() {
    let mut l = Looped::new();
    let (id, pid) = l.spawn(&["pause"], true);
    let (pending, finish) = hold_observation(&mut l, id, pid);
    let release = l.request(|req| Msg::Release { req, id });
    assert_eq!(
        reply(&mut l, release),
        Msg::Ack {
            req: release,
            id,
            result: Ack::Ok
        }
    );
    finish.send(()).unwrap();
    assert_eq!(
        reply(&mut l, pending),
        Msg::Ack {
            req: pending,
            id,
            result: Ack::Unknown
        }
    );
    let released = l.request(|req| Msg::Observe { req, id });
    assert_eq!(
        reply(&mut l, released),
        Msg::Ack {
            req: released,
            id,
            result: Ack::Unknown
        }
    );
}

#[test]
fn a_held_observation_preserves_kill_on_last_job_close() {
    let mut l = Looped::new();
    let (id, pid) = l.spawn(&["pause"], true);
    let job = l.sup.trees[&id].inventory_job().unwrap();
    assert!(job::bounded_member_pids(job, 0).is_err());
    assert_eq!(job::bounded_member_pids(job, 1).unwrap(), [pid]);
    let Probe::Member(root) = job::probe(job, pid).unwrap() else {
        panic!("root process did not join its Job");
    };
    let (pending, finish) = hold_observation(&mut l, id, pid);

    // Drop the tree without calling Stop: only closing the last Job handle can kill the live root.
    drop(l.sup.trees.remove(&id).unwrap());
    assert!(until(|| job::exited(&root)), "the observation kept the Job alive");
    finish.send(()).unwrap();
    assert_eq!(
        reply(&mut l, pending),
        Msg::Ack {
            req: pending,
            id,
            result: Ack::Unknown
        }
    );
}

fn hold_observation(l: &mut Looped, id: u64, pid: u32) -> (u64, Sender<()>) {
    let (sampled, sample) = mpsc::channel::<Vec<u32>>();
    let (finish, wait) = mpsc::channel();
    l.next_req += 1;
    let req = l.next_req;
    assert!(
        l.sup
            .observe(req, id, move |held| {
                let list = inventory::scan(held)?;
                sampled
                    .send(list.iter().map(|p| p.pid).collect())
                    .map_err(io::Error::other)?;
                wait.recv_timeout(Duration::from_secs(30)).map_err(io::Error::other)?;
                Ok(list)
            })
            .is_none()
    );
    assert_eq!(sample.recv_timeout(Duration::from_secs(10)).unwrap(), [pid]);
    (req, finish)
}

fn reply(l: &mut Looped, want: u64) -> Msg {
    l.until(|m| matches!(m, Msg::Ack { req, .. } | Msg::Processes { req, .. } if *req == want))
        .1
}
