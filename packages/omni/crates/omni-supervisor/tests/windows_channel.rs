//! SUP-W, the channel under pressure (ADR-0005 R1, R5): a host that stops reading while a burst of spawns and
//! exits piles up in the supervisor, and service resuming once the host reads again. (The tree cap itself is a
//! unit test of the supervisor, with the cap lowered: 4096 spawns are too slow for CI.)
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "windows_host.rs"]
pub mod host;

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use host::{Host, Spec};
use omni_proto::{Ack, Msg, Slot};

/// Twice the supervisor's reply budget (`queues::MAX_REPLIES`, 1024) in frames: Spawned + Exited per tree.
const BURST: usize = 1024;

/// `hostname.exe`: a program that starts and ends at once.
fn quick() -> Spec {
    let root: OsString = std::env::var_os("SystemRoot").unwrap();
    let mut spec = Spec::program(&PathBuf::from(&root).join(r"System32\hostname.exe"), &[]);
    spec.stderr = Slot::Merge;
    spec.env = vec![("SystemRoot".into(), root)];
    spec
}

#[test]
fn a_burst_to_a_host_that_does_not_read_is_delivered_and_service_resumes() {
    let mut host = Host::start();
    let (mut frames, mut reqs) = (Vec::new(), Vec::new());
    for _ in 0..BURST {
        // The host's read end goes with `p`: a child may fail its write, which changes nothing here.
        let p = host.prepare(quick());
        reqs.push(p.req);
        frames.extend(host::frame(&p.msg));
    }
    // The host writes every Spawn and reads nothing: Spawned and Exited frames pile up in the supervisor until
    // it stops admitting requests, and the host's write stalls.
    let writer = host.writer();
    let (stalled_tx, stalled) = mpsc::channel();
    let w = std::thread::spawn(move || {
        writer.write(&frames, Duration::from_secs(1), move || {
            let _ = stalled_tx.send(());
        })
    });
    // ~2048 reply frames against 4 KiB of host-side buffering and a budget of 1024: the supervisor must stop
    // admitting, and so stop reading, before the host has written everything.
    assert!(
        stalled.recv_timeout(Duration::from_secs(60)).is_ok(),
        "the host was never held back"
    );
    // The host reads again: every request gets its reply, every tree its Exited.
    let mut ids = Vec::new();
    for &req in &reqs {
        match host.reply(req) {
            Msg::Spawned { id, .. } => ids.push(id),
            other => panic!("{other:?}"),
        }
    }
    for &id in &ids {
        host.exited(id);
    }
    w.join().unwrap();
    // Service resumed: new requests complete.
    host.stop(ids[0], 0);
    let released = host.call(|req| Msg::Release { req, id: ids[0] });
    assert!(matches!(released, Msg::Ack { result: Ack::Ok, .. }), "{released:?}");
    assert!(host.spawn(quick()).is_ok());
}
