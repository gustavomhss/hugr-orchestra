//! Kernel handle lifetime through the real owner loop: the Job closes at settle, the root pid stays
//! pinned until Release. A separate test process prevents parallel tests from reusing the numeric handle.
//! The mutation retains Tree's original Job at the production close boundary; the same OS oracle must fail.

use std::io;
use std::os::windows::io::{AsRawHandle, RawHandle};
use std::process::Command;
use std::time::Instant;

use omni_proto::{Ack, Msg};
use windows_sys::Win32::Foundation::{ERROR_INVALID_HANDLE, GetHandleInformation, WAIT_OBJECT_0};
use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
use windows_sys::Win32::System::Threading::{GetProcessId, WaitForSingleObject};

use super::{Looped, pause, through_the_fallback, until};

const FILTER: &str = "windows::tests::job_lifetime::native_job_closes_before_stopped_and_release";
const CASE: &str = "HUGR_OMNI_TEST_JOB_LIFETIME_CASE";

#[test]
fn native_job_closes_before_stopped_and_release() {
    if let Ok(case) = std::env::var(CASE) {
        exercise(&case);
        return;
    }
    for case in ["stop", "natural", "descendant", "unknown", "mutation"] {
        let output = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", FILTER, "--nocapture", "--test-threads=1"])
            .env(CASE, case)
            .output()
            .unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if case == "mutation" {
            assert!(
                !output.status.success(),
                "omitting the production close escaped the OS oracle"
            );
            assert!(
                stderr.contains("owned Job must close before Stopped and client Release"),
                "mutation failed for the wrong reason:\n{stdout}\n{stderr}"
            );
            println!("native Job mutation control: original owned handle stayed valid; OS oracle rejected it");
            continue;
        }
        assert!(output.status.success(), "{case}:\n{stdout}\n{stderr}");
        println!("native Job lifetime control: {case} passed");
    }
}

fn exercise(case: &str) {
    assert!(["stop", "natural", "descendant", "unknown", "mutation"].contains(&case));
    let mut l = Looped::new();
    let (id, pid) = l.spawn(&["pause"], true);
    let (job, process) = l.sup.trees[&id].raw_handles();
    let job = job.unwrap(); // exact original owned Job, not a duplicate that would extend its lifetime
    assert!(
        handle_information(job).is_ok(),
        "positive control: live Job handle must be valid"
    );
    assert!(
        handle_information(process).is_ok(),
        "positive control: root handle must be valid"
    );
    assert!(
        until(|| l.members.recorded(id).contains(&pid)),
        "real root never joined member record"
    );
    let tree = l.sup.trees.get_mut(&id).unwrap();
    tree.retain_job_on_gone = case == "mutation";
    assert_eq!(tree.list().unwrap().iter().map(|p| p.pid).collect::<Vec<_>>(), [pid]);
    if case == "unknown" {
        l.members.blind(pid);
    }
    let mut descendant = (case == "descendant").then(|| {
        let child = pause();
        // SAFETY: the original Job is still owned by the live tree, and child owns its process handle.
        assert_ne!(unsafe { AssignProcessToJobObject(job, child.as_raw_handle()) }, 0);
        assert!(until(|| l.members.recorded(id).contains(&child.id())));
        child
    });

    if let Some(child) = &mut descendant {
        drop(l.ends.pop().unwrap());
        l.exited(id);
        l.sup.enforce(Instant::now());
        assert!(
            !l.sup.trees[&id].gone,
            "root exit must not close a live descendant's Job"
        );
        assert!(
            handle_information(job).is_ok(),
            "Job must remain valid while descendants live"
        );
        assert!(
            child.try_wait().unwrap().is_none(),
            "closing the Job killed a live descendant"
        );
        assert_eq!(
            l.sup.trees[&id]
                .list()
                .unwrap()
                .iter()
                .map(|p| p.pid)
                .collect::<Vec<_>>(),
            [child.id()]
        );
    }

    if case == "natural" || case == "unknown" {
        // Closing the real root's stdin releases cmd /c pause: no Stop or Release causes this exit.
        drop(l.ends.pop().unwrap());
        let emptied = l.exited(id);
        assert!(until(|| {
            l.sup.enforce(Instant::now());
            l.sup.trees[&id].gone
        }));
        assert_closed(job, "owned Job must close at natural settle before client Release");
        if case == "unknown" {
            through_the_fallback(emptied, Instant::now());
            assert!(l.diag.queued().iter().any(|d| d.contains("cannot be inspected")));
        }
    }

    let first = l.stop(id, 0);
    let second = l.stop(id, 0);
    l.stopped(first);
    assert_closed(job, "owned Job must close before Stopped and client Release");
    if let Some(child) = &mut descendant {
        assert!(
            child.try_wait().unwrap().is_some(),
            "Stopped preceded the real descendant's exit"
        );
    }
    l.stopped(second);
    let tree = &l.sup.trees[&id];
    assert!(
        tree.gone && !tree.released,
        "completed tree must remain until client Release"
    );
    assert_eq!(tree.raw_handles(), (None, process));
    assert!(
        handle_information(process).is_ok(),
        "exited root's original PROCESS handle must stay pinned"
    );
    // SAFETY: query the original root handle, proven valid above; no additional handle pins the pid.
    assert_eq!(unsafe { GetProcessId(process) }, pid);
    // SAFETY: poll the same valid process handle; the real OS, not Tree::exit, confirms root exit.
    assert_eq!(unsafe { WaitForSingleObject(process, 0) }, WAIT_OBJECT_0);

    let listed = l.request(|req| Msg::List { req, id });
    assert_eq!(
        l.until(|m| matches!(m, Msg::Processes { req, .. } if *req == listed)).1,
        Msg::Processes {
            req: listed,
            id,
            list: Vec::new()
        }
    );
    let again = l.stop(id, 0);
    l.stopped(again); // idempotent after the owned Job has closed
    assert_closed(job, "idempotent Stop must not recreate the Job");
    assert!(handle_information(process).is_ok());

    let released = l.request(|req| Msg::Release { req, id });
    assert_eq!(
        l.until(|m| matches!(m, Msg::Ack { req, .. } if *req == released)).1,
        Msg::Ack {
            req: released,
            id,
            result: Ack::Ok
        }
    );
    l.sup.enforce(Instant::now()); // production retain path drops the released, gone record
    assert!(!l.sup.trees.contains_key(&id));
    assert_closed(process, "Release must close the original root PROCESS pin");
}

fn handle_information(handle: RawHandle) -> io::Result<u32> {
    let mut flags = 0;
    // SAFETY: GetHandleInformation accepts numeric handle values, including closed handles, without
    // dereferencing them. No ownership is reconstructed; last_os_error is captured before another OS call.
    if unsafe { GetHandleInformation(handle, &mut flags) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(flags)
}

fn assert_closed(handle: RawHandle, message: &str) {
    assert_eq!(
        handle_information(handle).err().and_then(|e| e.raw_os_error()),
        Some(ERROR_INVALID_HANDLE as i32),
        "{message}"
    );
}
