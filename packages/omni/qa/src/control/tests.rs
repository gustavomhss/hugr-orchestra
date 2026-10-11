//! Tests of K1's controls: a failed or fooled identification fails the run and never signals a stranger.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use super::{Held, control_with, identify, read_pids};
use crate::oracle;
use crate::setup::{Mode, Setup, test_fixture};

/// The fixture under a name of its own (at most 15 characters: Linux truncates names there), so the OS can tell
/// what a control started, and a setup that runs it.
fn named(name: &str) -> (PathBuf, Setup) {
    let fixture = test_fixture();
    let named = fixture.with_file_name(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    let _ = std::fs::remove_file(&named);
    std::fs::hard_link(&fixture, &named).unwrap();
    let setup = Setup {
        root: PathBuf::new(),
        fixture: named.clone(),
        cache: PathBuf::new(),
        mode: Mode::Quick,
        run: format!("q{name}"),
        inject: false,
    };
    (named, setup)
}

/// A stranger to the controls: started by the test, never by a control. It has no lifetime of its own: it reads its
/// stdin, which the test holds, to the end, so it outlives the control however long a loaded machine makes that, and
/// ends with the test (its stdin closes) even if the test fails first. A sleep (it was 20 s) lets it end on its own
/// under load, which the test then took for a signal.
fn outsider() -> Child {
    Command::new(test_fixture())
        .arg("count-stdin")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}

/// Whether the test's own child `c` is still running, asked of its handle: the test alone holds it, so nobody else
/// reaps it and its pid is not reused. An outsider cannot end on its own (`outsider`), so `Some` is a signal (or a
/// crash): the status says which.
fn ended(c: &mut Child) -> Option<String> {
    c.try_wait().unwrap().map(|status| status.to_string())
}

/// The processes alive under `name`.
fn alive(name: &str) -> Vec<u32> {
    oracle::snapshot()
        .unwrap()
        .into_iter()
        .filter(|p| p.name.starts_with(name))
        .map(|p| p.pid)
        .collect()
}

/// The probe: the tree's and the decoy's identifications each take a whole lifetime, so the stranger is born
/// that late, and only the stranger's identification fails. The control must fail (an error of the run), and
/// nothing it started may be left when it returns.
#[test]
fn a_failed_identification_fails_the_control_and_leaves_nothing() {
    let (named, setup) = named("omni-qa-ctl1");
    let life = Duration::from_secs(2);
    let failing = |log: &Path, held: &Held| {
        if log.to_string_lossy().contains("stranger") {
            return Err("probe: this identification fails".to_owned());
        }
        let found = identify(log, held);
        std::thread::sleep(life);
        found
    };
    let result = control_with(&setup, life, &failing);
    assert!(matches!(&result, Err(e) if e.contains("probe")), "{result:?}");
    let left = alive("omni-qa-ctl1");
    let _ = std::fs::remove_file(&named);
    assert!(left.is_empty(), "left behind: {left:?}");
}

/// Codex Q1 r11: a logged descendant of the tree has exited and a stranger got its pid before the identification.
/// The stranger is no descendant of anything the controls hold: it is never taken, the control fails (an error of
/// the run), and the stranger is not killed.
#[test]
fn a_logged_pid_reused_by_a_stranger_is_never_taken_nor_killed() {
    let (named, setup) = named("omni-qa-ctl2");
    let stranger: Mutex<Option<Child>> = Mutex::new(None);
    let reused = |log: &Path, held: &Held| {
        if log.to_string_lossy().contains("tree") {
            let other = outsider();
            let mut pids = read_pids(log);
            *pids.last_mut().unwrap() = other.id();
            let text: String = pids.iter().map(|p| format!("{p}\n")).collect();
            std::fs::write(log, text).unwrap();
            *stranger.lock().unwrap() = Some(other);
        }
        identify(log, held)
    };
    let result = control_with(&setup, Duration::from_secs(2), &reused);
    assert!(matches!(&result, Err(e) if e.contains("not proven")), "{result:?}");
    let mut other = stranger.lock().unwrap().take().unwrap();
    let ended = ended(&mut other);
    let _ = other.kill();
    let _ = other.wait();
    let left = alive("omni-qa-ctl2");
    let _ = std::fs::remove_file(&named);
    assert_eq!(ended, None, "the stranger was killed");
    assert!(left.is_empty(), "left behind: {left:?}");
}

/// Codex Q1 r12: even an identification fooled by a stale snapshot (here the tree's last descendant taken as C, a
/// stranger that got a logged pid) never makes the controls signal C: they signal only what they hold and wait for
/// the rest by identity. C outlives the lifetime, so the control fails (an error of the run) naming C, alive.
#[test]
fn a_wrongly_identified_stranger_is_never_signalled() {
    let (named, setup) = named("omni-qa-ctl3");
    let stranger: Mutex<Option<Child>> = Mutex::new(None);
    let fooled = |log: &Path, held: &Held| {
        let mut found = identify(log, held)?;
        if log.to_string_lossy().contains("tree") {
            let pid = stranger.lock().unwrap().insert(outsider()).id();
            *found.last_mut().unwrap() = oracle::snapshot()?.into_iter().find(|p| p.pid == pid).unwrap();
        }
        Ok(found)
    };
    let result = control_with(&setup, Duration::from_secs(2), &fooled);
    let mut other = stranger.lock().unwrap().take().unwrap();
    let c = other.id();
    let ended = ended(&mut other);
    let _ = other.kill();
    let _ = other.wait();
    let left = alive("omni-qa-ctl3");
    let _ = std::fs::remove_file(&named);
    assert_eq!(ended, None, "C was signalled");
    assert!(
        matches!(&result, Err(e) if e.contains(&format!("[{c}]")) && e.contains("still alive")),
        "{result:?}"
    );
    assert!(left.is_empty(), "left behind: {left:?}");
}
