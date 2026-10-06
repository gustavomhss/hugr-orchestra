//! Unit tests of the owner loop and of the member record, on states the end-to-end suite cannot force: a full
//! reply budget with an empty inbox, pids that name processes outside the Job (the stand-in for a reused
//! pid), a member that cannot be inspected, a lost Job notification, a stderr that blocks or fails, and the
//! tree cap.

use std::fs::File;
use std::io::Read;
use std::os::windows::io::{AsRawHandle, FromRawHandle, IntoRawHandle, OwnedHandle};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use omni_proto::{Ack, FailCode, Msg, ProcEntry, Slot, Spawn};
use windows_sys::Win32::Storage::FileSystem::WriteFile;
use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
use windows_sys::Win32::System::Pipes::{CreatePipe, PIPE_NOWAIT, PIPE_WAIT, SetNamedPipeHandleState};

use super::diag::{self, Diag};
use super::members::{Members, Proof};
use super::queues::{Event, Inbox, Item, MAX_REPLIES, Outbox};
use super::{Supervisor, inventory, job};

/// Polls `f` until it holds, for at most 10 s.
fn until(mut f: impl FnMut() -> bool) -> bool {
    let end = Instant::now() + Duration::from_secs(10);
    while Instant::now() < end {
        if f() {
            return true;
        }
        std::thread::yield_now();
    }
    false
}

fn cmd_exe() -> PathBuf {
    PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join(r"System32\cmd.exe")
}

/// `cmd /c pause` reading a pipe nobody writes: alive until killed.
fn pause() -> Child {
    Command::new(cmd_exe())
        .args(["/d", "/c", "pause"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap()
}

fn assign(job: &OwnedHandle, child: &Child) {
    // SAFETY: valid Job and process handles.
    let ok = unsafe { AssignProcessToJobObject(job.as_raw_handle(), child.as_raw_handle()) };
    assert_ne!(ok, 0);
}

/// An anonymous pipe: (read, write).
fn pipe() -> (OwnedHandle, OwnedHandle) {
    let (mut r, mut w) = (std::ptr::null_mut(), std::ptr::null_mut());
    // SAFETY: valid out pointers, null attributes.
    assert_ne!(unsafe { CreatePipe(&mut r, &mut w, std::ptr::null(), 4096) }, 0);
    // SAFETY: fresh handles owned by nobody else.
    unsafe { (OwnedHandle::from_raw_handle(r), OwnedHandle::from_raw_handle(w)) }
}

/// A pipe nobody reads, filled beforehand: every further write blocks. Returns (write end, read end to keep).
fn full_pipe() -> (File, OwnedHandle) {
    let (r, w) = pipe();
    let set = |mode| {
        let null = std::ptr::null();
        // SAFETY: the write end of a pipe and a valid mode pointer.
        let ok = unsafe { SetNamedPipeHandleState(w.as_raw_handle(), &mode, null, null) };
        assert_ne!(ok, 0, "SetNamedPipeHandleState: {}", std::io::Error::last_os_error());
    };
    set(PIPE_NOWAIT);
    // A non-blocking write that does not fit writes nothing: halve the size down to one byte, so not even
    // one more byte fits afterwards.
    let (chunk, mut total, mut size) = ([0u8; 4096], 0, 4096);
    while size > 0 {
        let mut n = 0;
        // SAFETY: a valid buffer; a non-blocking write returns at once.
        let ok = unsafe { WriteFile(w.as_raw_handle(), chunk.as_ptr(), size, &mut n, std::ptr::null_mut()) };
        if ok == 0 || n == 0 {
            size /= 2;
        }
        total += n;
    }
    assert!(total > 0, "the pipe was not filled");
    set(PIPE_WAIT);
    (File::from(w), r)
}

/// The owner loop driven by the test itself (it is its own host), every frame timed as it came out.
struct Looped {
    sup: Supervisor,
    inbox: Arc<Inbox>,
    out: Arc<Outbox>,
    members: Arc<Members>,
    diag: Arc<Diag>,
    seen: Vec<(Instant, Msg)>,
    next_req: u64,
    /// The host's ends of every child's pipes, kept open (nobody writes the stdins).
    ends: Vec<File>,
}

impl Looped {
    /// A supervisor whose diagnostics stay queued (nothing drains them unless the test starts it).
    fn new() -> Looped {
        let (inbox, out, diag) = (
            Arc::new(Inbox::default()),
            Arc::new(Outbox::default()),
            Arc::new(Diag::default()),
        );
        let members = Members::start(&inbox).unwrap();
        let sup = Supervisor::new(inbox.clone(), out.clone(), members.clone(), diag.clone(), 0);
        Looped {
            sup,
            inbox,
            out,
            members,
            diag,
            seen: Vec::new(),
            next_req: 0,
            ends: Vec::new(),
        }
    }

    fn request(&mut self, make: impl FnOnce(u64) -> Msg) -> u64 {
        self.next_req += 1;
        assert!(self.inbox.request(make(self.next_req)));
        self.next_req
    }

    /// Steps the loop until a frame matching `want` came out (other frames are kept), within 10 s.
    fn until(&mut self, want: impl Fn(&Msg) -> bool) -> (Instant, Msg) {
        let end = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(i) = self.seen.iter().position(|(_, m)| want(m)) {
                return self.seen.remove(i);
            }
            assert!(
                Instant::now() < end,
                "the owner loop never sent the frame; sent: {:?}",
                self.seen
            );
            if self.out.len() > 0 {
                let (frames, at) = (self.out.take().unwrap(), Instant::now());
                self.out.written();
                let mut rest = frames.as_slice();
                while let Some((m, n)) = omni_proto::decode(rest).unwrap() {
                    self.seen.push((at, m));
                    rest = &rest[n..];
                }
            } else {
                assert!(self.sup.step().is_none());
            }
        }
    }

    /// Spawns `cmd /d /c <args>` (stdout: a fresh pipe; stdin: a pipe nobody writes, or NUL). Returns (id, pid).
    fn spawn(&mut self, args: &[&str], stdin_pipe: bool) -> (u64, u32) {
        let mut give = |child_reads: bool| {
            let (r, w) = pipe();
            let (ours, theirs) = if child_reads { (w, r) } else { (r, w) };
            self.ends.push(File::from(ours));
            theirs.into_raw_handle() as u64
        };
        let out = give(false);
        let (slot, inh) = if stdin_pipe {
            (Slot::Pipe, give(true))
        } else {
            (Slot::Null, 0)
        };
        let cmd = cmd_exe().into_os_string().into_encoded_bytes();
        let argv = std::iter::once(cmd.clone()).chain(["/d", "/c"].iter().chain(args).map(|a| a.as_bytes().to_vec()));
        let req = self.request(|req| {
            Msg::Spawn(Spawn {
                req,
                program: cmd,
                argv: argv.collect(),
                env: std::env::vars_os()
                    .map(|(k, v)| (k.into_encoded_bytes(), v.into_encoded_bytes()))
                    .collect(),
                cwd: std::env::current_dir().unwrap().into_os_string().into_encoded_bytes(),
                pty: None,
                stdin: slot,
                stderr: Slot::Merge,
                grace_ms: 0,
                handles: [inh, out, 0],
            })
        });
        match self.until(|m| matches!(m, Msg::Spawned { req: r, .. } | Msg::SpawnFailed { req: r, .. } if *r == req)) {
            (_, Msg::Spawned { id, pid, .. }) => (id, pid),
            other => panic!("{other:?}"),
        }
    }

    fn stop(&mut self, id: u64, grace_ms: u32) -> u64 {
        self.request(|req| Msg::Stop { req, id, grace_ms })
    }

    /// When `Stopped` for request `req` came out.
    fn stopped(&mut self, req: u64) -> Instant {
        self.until(|m| matches!(m, Msg::Stopped { req: r, .. } if *r == req)).0
    }

    /// When the root of `id` was reported exited.
    fn exited(&mut self, id: u64) -> Instant {
        self.until(|m| matches!(m, Msg::Exited { id: i, .. } if *i == id)).0
    }
}

#[test]
fn a_full_reply_budget_with_an_empty_inbox_recovers_when_the_writer_drains() {
    let Looped {
        mut sup, inbox, out, ..
    } = Looped::new();
    // Nobody writes: MAX_REPLIES answered requests fill the reply budget, and the inbox is empty.
    for req in 0..MAX_REPLIES as u64 {
        assert!(inbox.request(Msg::Go { req, id: 7 }));
        assert!(sup.step().is_none());
    }
    assert_eq!(out.len(), MAX_REPLIES);
    std::thread::spawn(move || {
        loop {
            let _ = sup.step();
        }
    });
    assert!(until(|| inbox.owner_waiting()), "the owner never blocked");
    // A request arrives while nothing can be admitted; then the writer drains everything.
    assert!(inbox.request(Msg::Go { req: 9999, id: 7 }));
    assert!(out.take().is_some());
    out.written();
    inbox.progress();
    assert!(
        until(|| out.len() == 1),
        "the owner never admitted the request after the writer drained"
    );
    let frame = out.take().unwrap();
    let reply = omni_proto::decode(&frame).unwrap().unwrap().0;
    assert_eq!(
        reply,
        Msg::Ack {
            req: 9999,
            id: 7,
            result: Ack::Unknown
        }
    );
}

/// `Stopped` for a tree whose Job emptied at `emptied` came out at `at`: through the 1 s fallback.
fn through_the_fallback(emptied: Instant, at: Instant) {
    let took = at - emptied;
    assert!(
        took >= Duration::from_millis(900),
        "Stopped came before the bound: {took:?}"
    );
    assert!(took < Duration::from_secs(2), "Stopped came late: {took:?}");
}

#[test]
fn a_member_that_cannot_be_inspected_holds_stopped_back_one_second_at_most() {
    let mut l = Looped::new();
    let (id, pid) = l.spawn(&["exit", "0"], false);
    // Only this test steps the loop, so nothing settles before the root's probe is made to fail.
    l.members.blind(pid);
    let emptied = l.exited(id); // the root was the only member: its exit empties the Job
    let req = l.stop(id, 0);
    through_the_fallback(emptied, l.stopped(req));
    assert!(
        l.diag.queued().iter().any(|d| d.contains("cannot be inspected")),
        "{:?}",
        l.diag.queued()
    );
}

#[test]
fn a_lost_job_notification_sends_stopped_through_the_fallback_and_says_so() {
    let mut l = Looped::new();
    l.members.suppress_next(); // the root's NEW_PROCESS; the flush marker still works
    let (id, _) = l.spawn(&["exit", "0"], false);
    let emptied = l.exited(id);
    let req = l.stop(id, 0);
    through_the_fallback(emptied, l.stopped(req));
    assert!(
        l.diag.queued().iter().any(|d| d.contains("lost job notification")),
        "{:?}",
        l.diag.queued()
    );
}

#[test]
fn a_stderr_that_blocks_or_fails_holds_back_neither_stopped_nor_another_trees_deadline() {
    let (full, _reader) = full_pipe();
    let broken = File::from(pipe().1); // its read end is closed at once
    for (case, sink) in [("full", full), ("broken", broken)] {
        let mut l = Looped::new();
        l.diag.start(sink).unwrap();
        // Lines ahead of the fallback's: the drain thread is stuck on them (full) or failing (broken).
        for i in 0..100 {
            l.diag.report(format!("filler {i}"));
        }
        let (a, a_pid) = l.spawn(&["exit", "0"], false);
        l.members.blind(a_pid);
        let (b, _) = l.spawn(&["pause"], true); // alive until stopped
        let emptied = l.exited(a);
        let (stop_b, asked) = (l.stop(b, 300), Instant::now());
        let stop_a = l.stop(a, 0);
        let b_at = l.stopped(stop_b);
        assert!(
            b_at - asked < Duration::from_secs(1),
            "{case}: a deadline was held back: {:?}",
            b_at - asked
        );
        through_the_fallback(emptied, l.stopped(stop_a));
        if case == "full" {
            // The drain is stuck on its first line: the queue stays at its bound, the rest were dropped.
            assert_eq!(
                l.diag.queued().len(),
                diag::CAPACITY,
                "the drain thread was not blocked"
            );
        }
    }
}

#[test]
fn a_spawn_over_the_tree_cap_is_refused_and_its_handles_are_closed() {
    let mut l = Looped::new();
    l.sup.max_trees = 1;
    l.spawn(&["exit", "0"], false);
    let (r, w) = pipe();
    let me = cmd_exe().into_os_string().into_encoded_bytes();
    let req = l.request(|req| {
        Msg::Spawn(Spawn {
            req,
            program: me.clone(),
            argv: vec![me],
            env: Vec::new(),
            cwd: b"C:\\".to_vec(),
            pty: None,
            stdin: Slot::Null,
            stderr: Slot::Merge,
            grace_ms: 0,
            handles: [0, w.into_raw_handle() as u64, 0],
        })
    });
    match l
        .until(|m| matches!(m, Msg::SpawnFailed { req: r, .. } | Msg::Spawned { req: r, .. } if *r == req))
        .1
    {
        Msg::SpawnFailed {
            code: FailCode::Io,
            msg,
            ..
        } => assert!(msg.contains("limit of 1 trees"), "{msg}"),
        other => panic!("the cap did not hold: {other:?}"),
    }
    // The refused Spawn's stdout was closed: its read end reaches EOF at once.
    let (tx, rx) = std::sync::mpsc::channel();
    let mut refused = File::from(r);
    std::thread::spawn(move || tx.send(refused.read_to_end(&mut Vec::new()).map(|n| n == 0)));
    assert!(
        rx.recv_timeout(Duration::from_secs(10)).unwrap().unwrap(),
        "the refused handle was kept"
    );
}

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
