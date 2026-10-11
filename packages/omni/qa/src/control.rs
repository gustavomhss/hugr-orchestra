//! K1's controls, run before anything is measured, through the same `Watch` the runners use:
//! - positive: a std tree whose root is killed leaves two descendants; the oracle must count (and kill) exactly those
//!   two, the pids they logged themselves;
//! - negative: a sentinel the harness started outside the task, a stranger descendant whose parent exits during
//!   the task, and a decoy (the task's marker only in its argv and under another variable's name, in a group of its
//!   own with a descendant that has no marker) must be neither counted nor killed.
//!
//! If either fails, no K1 figure of the run is believed. Every process the controls start lives at most `LIFE` on its
//! own, and is identified (pid and start time) as soon as it logged itself, before its parent ends, and proven the
//! controls' own (`ours`) before it is taken, for counting and assertions only. The controls signal nothing but the
//! processes they hold a `Child` of, through that handle (it never reaches a reused pid); everything else ends on its
//! own, and the controls wait for that by identity, without a signal. A process still listed after its lifetime, or
//! an identity that cannot be taken, means the controls cannot vouch for the harness: an error of the run (exit 2),
//! raised once the processes it would have covered have ended.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::oracle::{self, Ask, Found, MARKER, Probe, Proc, Root, Watch};
use crate::setup::Setup;

const ANSWER: Duration = Duration::from_secs(60);
/// How long a control process lives on its own: past the controls' few snapshots, short enough to end with the run.
const LIFE: Duration = Duration::from_secs(15);
/// How much longer than a lifetime the controls wait for what they started to end on its own.
const MARGIN: Duration = Duration::from_secs(1);
/// How often the controls look whether what they started has ended.
const POLL: Duration = Duration::from_millis(250);

type Identify<'a> = &'a dyn Fn(&Path, &Held) -> Result<Vec<Proc>, String>;

/// The processes the controls hold a `Child` of (a held pid cannot be given to another process), and the sentinel's
/// start (in the OS's own units), taken as it was started first: no process of the controls was created before it.
pub struct Held {
    pids: Vec<u32>,
    first: u64,
}

/// What the controls share: the setup, the oracle, their files (the tree's log, the stranger's log, the stranger's go
/// signal, the decoy's log), the task's marker and start, the sentinel's pid, the lifetime in ms, and how identities
/// are taken.
struct Ctl<'a> {
    setup: &'a Setup,
    watch: Watch,
    files: [PathBuf; 4],
    tag: String,
    since: u64,
    sentinel: u32,
    first: u64,
    ms: String,
    identify: Identify<'a>,
}

/// `Ok(verdict)`, or `Err` when the controls could not identify what they started (the run stops).
pub fn control(setup: &Setup) -> Result<Result<String, String>, String> {
    control_with(setup, LIFE, &identify)
}

fn control_with(setup: &Setup, life: Duration, identify: Identify) -> Result<Result<String, String>, String> {
    let tag = format!("{}-control-", setup.run);
    let files = [
        log(&tag, "tree"),
        log(&tag, "stranger"),
        log(&tag, "go"),
        log(&tag, "decoy"),
    ];
    let watch = Watch::start(std::process::id(), oracle::before_spawn());
    let since = oracle::filetime_now();
    let ms = life.as_millis().to_string();
    let mut sentinel = start(Command::new(&setup.fixture).arg(format!("sleep={ms}")), "sentinel")?;
    // Its start bounds every other process of the controls from below (held, so its pid is its own).
    let first = oracle::snapshot().and_then(|snap| {
        snap.iter()
            .find(|p| p.pid == sentinel.id())
            .map(|p| p.created)
            .ok_or_else(|| "the OS does not list it".to_owned())
    });
    let first = match first {
        Ok(first) => first,
        Err(e) => {
            let _ = sentinel.kill();
            let _ = sentinel.wait();
            return Err(format!("the sentinel could not be identified: {e}"));
        }
    };
    let mut identified = Vec::new();
    let mut others = Vec::new();
    let ctl = Ctl {
        setup,
        watch,
        files,
        tag,
        since,
        sentinel: sentinel.id(),
        first,
        ms,
        identify,
    };
    let from = oracle::filetime_now();
    let result = start(&mut tree(&ctl), "tree").and_then(|mut root| {
        let tree_root = Root {
            pid: root.id(),
            from,
            to: oracle::filetime_now(),
        };
        let checked = observe(&ctl, (&mut root, tree_root), &mut others, &mut identified);
        let _ = root.kill();
        let _ = root.wait();
        checked
    });
    // Signalled: only what the controls hold, through its handle.
    for child in std::iter::once(&mut sentinel).chain(&mut others) {
        let _ = child.kill();
        let _ = child.wait();
    }
    // Every parent the controls started has ended (the tree's root above), each after every spawn: no control
    // process can be born after this instant, and each ends on its own within `life` of its birth.
    let deadline = Instant::now() + life + MARGIN;
    for path in &ctl.files {
        let _ = std::fs::remove_file(path);
    }
    let outlived = outlive(&identified, deadline);
    if result.is_err() || outlived.is_err() {
        // A lost identity, or a wait that could not observe: whatever it would have covered ends on its own by
        // `deadline`, so wait that out (signalling nothing) before the run stops.
        std::thread::sleep(deadline.saturating_duration_since(Instant::now()));
    }
    result.and_then(|verdict| outlived.map(|()| verdict))
}

/// Waits, signalling nothing, until none of `procs` (identities) is listed any more; one still listed at `deadline`
/// is an error that names it.
fn outlive(procs: &[Proc], deadline: Instant) -> Result<(), String> {
    loop {
        let snap = oracle::snapshot()?;
        let still: Vec<u32> = procs
            .iter()
            .filter(|p| snap.iter().any(|q| q.pid == p.pid && q.created == p.created))
            .map(|p| p.pid)
            .collect();
        if still.is_empty() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "control processes {still:?} still alive after their lifetime (the controls never signal what they \
                 do not hold)"
            ));
        }
        std::thread::sleep(POLL);
    }
}

/// The processes listed in `log`, as the OS shows them right after they logged themselves (pid and start time). Every
/// one must be listed and proven the controls' own (`ours`: a logged pid may have been reused by the time the OS is
/// asked), or the identification failed.
fn identify(log: &Path, held: &Held) -> Result<Vec<Proc>, String> {
    let snap = oracle::snapshot()?;
    read_pids(log)
        .into_iter()
        .map(|pid| match snap.iter().find(|p| p.pid == pid) {
            None => Err(format!(
                "{pid} logged itself in {} but the OS does not list it",
                log.display()
            )),
            Some(p) if ours(p, &snap, held) => Ok(p.clone()),
            Some(p) => Err(format!(
                "{pid} ({}) is not proven the controls' own: its pid may have been reused",
                p.name
            )),
        })
        .collect()
}

/// Whether `p` is the controls' own: created no earlier than the sentinel, and up its parents (each listed, none
/// younger than its child, none created before the sentinel either) to a process the controls hold.
fn ours(p: &Proc, snap: &[Proc], held: &Held) -> bool {
    let mut cur = p;
    for _ in 0..=snap.len() {
        if cur.created < held.first {
            return false;
        }
        if held.pids.contains(&cur.pid) {
            return true;
        }
        match snap.iter().find(|q| q.pid == cur.ppid && q.created <= cur.created) {
            Some(parent) => cur = parent,
            None => return false,
        }
    }
    false
}

fn log(tag: &str, what: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("omni-qa-{tag}{what}.log"));
    let _ = std::fs::remove_file(&path);
    path
}

/// The positive control's tree: marked, in a group of its own, logging its pids; a root with two descendants, each
/// living at most the controls' lifetime.
fn tree(ctl: &Ctl) -> Command {
    let mut cmd = Command::new(&ctl.setup.fixture);
    let life = |verb: &str| format!("{verb}={}", ctl.ms);
    let log = format!("pidlog={}", ctl.files[0].display());
    cmd.args([log, life("hold"), life("hold"), life("sleep")])
        .env(MARKER, &ctl.tag);
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    cmd
}

/// The decoy: this run's marker, but only as an argument and under another variable's name, in a group of its own
/// with a descendant (`hold`) that carries no marker at all; both log their pids and live at most the lifetime.
fn decoy(ctl: &Ctl) -> Command {
    let mut cmd = Command::new(&ctl.setup.fixture);
    cmd.args([
        format!("pidlog={}", ctl.files[3].display()),
        format!("hold={}", ctl.ms),
        format!("sleep={}", ctl.ms),
        "argv".into(),
        format!("{MARKER}={}", ctl.tag),
    ])
    .env(format!("OTHER_{MARKER}"), &ctl.tag);
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    cmd
}

fn start(cmd: &mut Command, what: &str) -> Result<Child, String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("{what}: {e}"))
}

fn observe(
    ctl: &Ctl,
    (root, tree_root): (&mut Child, Root),
    others: &mut Vec<Child>,
    identified: &mut Vec<Proc>,
) -> Result<Result<String, String>, String> {
    let (files, identify) = (&ctl.files, ctl.identify);
    let root_pid = root.id();
    // What the controls hold right now: each identification is proven against it.
    let held = |others: &[Child]| Held {
        pids: [ctl.sentinel, root_pid]
            .into_iter()
            .chain(others.iter().map(Child::id))
            .collect(),
        first: ctl.first,
    };
    let tree = match logged(&files[0], 3) {
        Ok(tree) => tree,
        Err(e) => return Ok(Err(e)),
    };
    identified.extend(
        identify(&files[0], &held(others)).map_err(|e| format!("the control tree could not be identified: {e}"))?,
    );
    others.push(start(&mut decoy(ctl), "decoy")?);
    let decoys = match logged(&files[3], 2) {
        Ok(pids) => pids,
        Err(e) => return Ok(Err(e)),
    };
    identified
        .extend(identify(&files[3], &held(others)).map_err(|e| format!("the decoy could not be identified: {e}"))?);
    // The stranger: started by the harness outside the task (no marker, the harness's own group), it starts a child
    // and exits once that child is identified, so the child's parent is gone when the task is checked.
    let parent = Command::new(&ctl.setup.fixture)
        .args([
            format!("pidlog={}", files[1].display()),
            format!("hold={}", ctl.ms),
            format!("watch=stdout:1:{}", files[2].display()),
            "exit=0".into(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("stranger: {e}"))?;
    others.push(parent);
    let strangers = match logged(&files[1], 2) {
        Ok(pids) => pids,
        Err(e) => return Ok(Err(e)),
    };
    identified
        .extend(identify(&files[1], &held(others)).map_err(|e| format!("the stranger could not be identified: {e}"))?);
    std::fs::write(&files[2], "go\n").map_err(|e| format!("{}: {e}", files[2].display()))?;
    if let Some(parent) = others.last_mut() {
        let _ = parent.wait();
    }
    Ok(verdict(
        ctl,
        (root, tree_root),
        &tree,
        [strangers[1], decoys[0], decoys[1]],
    ))
}

/// With the tree's root killed and the stranger's parent gone: what the oracle counts. `others`: the stranger, the
/// decoy and its descendant.
fn verdict(ctl: &Ctl, (root, tree_root): (&mut Child, Root), tree: &[u32], others: [u32; 3]) -> Result<String, String> {
    let (watch, since, sentinel) = (&ctl.watch, ctl.since, ctl.sentinel);
    watch.ask_now(Ask::Sample, ANSWER)?;
    let _ = root.kill();
    let _ = root.wait();
    let probe = Probe {
        tag: ctl.tag.clone(),
        roots: vec![tree_root],
        since,
    };
    let check = || Ask::Check {
        probe: probe.clone(),
        last: true,
        batch_since: since,
    };
    let found: Found = serde_json::from_value(watch.ask_now(check(), ANSWER)?).map_err(|e| e.to_string())?;
    let mut counted = [found.proven, found.batch].concat();
    counted.sort_unstable();
    let mut left = tree[1..].to_vec();
    left.sort_unstable();
    if counted != left || !found.incomplete.is_empty() {
        return Err(format!(
            "the oracle counted {counted:?} (incomplete {:?}); the tree left {left:?}",
            found.incomplete
        ));
    }
    let alive: Vec<u32> = oracle::snapshot()?.iter().map(|p| p.pid).collect();
    let [stranger, decoy, held] = others;
    let dead: Vec<u32> = [sentinel, stranger, decoy, held]
        .into_iter()
        .filter(|pid| !alive.contains(pid))
        .collect();
    if !dead.is_empty() {
        return Err(format!(
            "the oracle killed {dead:?}, not the task's (sentinel {sentinel}, stranger {stranger}, decoy {decoy} and \
             its descendant {held})"
        ));
    }
    // Killed: the descendants carry the marker (Unix). On Windows their only evidence is the link to the root, which
    // was killed: counted, left running and reported so.
    let again: Found = serde_json::from_value(watch.ask_now(check(), ANSWER)?).map_err(|e| e.to_string())?;
    let running = watch.left_running();
    let still: Vec<u32> = [again.proven, again.batch, again.incomplete]
        .concat()
        .into_iter()
        .filter(|p| !running.contains(p) || !cfg!(windows))
        .collect();
    if !still.is_empty() {
        return Err(format!(
            "still counted after the oracle's kill: {still:?} (left running: {running:?})"
        ));
    }
    Ok(format!(
        "counted the 2 descendants a killed std root left ({left:?}) and killed those its evidence allows (left \
         running, link unconfirmable: {running:?}); neither counted nor killed the sentinel ({sentinel}), a stranger \
         whose parent had exited ({stranger}), nor a decoy with the marker only in argv and under another name \
         ({decoy}) and its unmarked group-mate ({held})"
    ))
}

/// The pids in `log` once it holds `n` lines (each fixture process appends its own as it starts).
fn logged(log: &Path, n: usize) -> Result<Vec<u32>, String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let pids = read_pids(log);
        if pids.len() >= n {
            return Ok(pids);
        }
        if Instant::now() >= deadline {
            return Err(format!("{} logged {pids:?}, not {n} pids", log.display()));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// The complete lines of `log`, as pids.
fn read_pids(log: &Path) -> Vec<u32> {
    let text = std::fs::read_to_string(log).unwrap_or_default();
    text.split_inclusive('\n')
        .filter_map(|l| l.strip_suffix('\n')?.trim().parse().ok())
        .collect()
}

#[cfg(test)]
mod tests {
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

    /// A stranger to the controls: started by the test, never by a control, sleeping past every lifetime.
    fn sleeper() -> Child {
        Command::new(test_fixture())
            .arg("sleep=20000")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }

    /// Whether `pid` is listed alive (a killed child of the test would be a zombie, which is not listed).
    fn listed(pid: u32) -> bool {
        oracle::snapshot().unwrap().iter().any(|p| p.pid == pid)
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
                let other = sleeper();
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
        let spared = listed(other.id());
        let _ = other.kill();
        let _ = other.wait();
        let left = alive("omni-qa-ctl2");
        let _ = std::fs::remove_file(&named);
        assert!(spared, "the stranger was killed");
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
                let pid = stranger.lock().unwrap().insert(sleeper()).id();
                *found.last_mut().unwrap() = oracle::snapshot()?.into_iter().find(|p| p.pid == pid).unwrap();
            }
            Ok(found)
        };
        let result = control_with(&setup, Duration::from_secs(2), &fooled);
        let mut other = stranger.lock().unwrap().take().unwrap();
        let c = other.id();
        let spared = listed(c);
        let _ = other.kill();
        let _ = other.wait();
        let left = alive("omni-qa-ctl3");
        let _ = std::fs::remove_file(&named);
        assert!(spared, "C was signalled");
        assert!(
            matches!(&result, Err(e) if e.contains(&format!("[{c}]")) && e.contains("still alive")),
            "{result:?}"
        );
        assert!(left.is_empty(), "left behind: {left:?}");
    }
}
