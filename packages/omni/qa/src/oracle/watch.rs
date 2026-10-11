//! The oracle of one runner, on a thread of the orchestrator: asks arrive (checks, K6 figures, batch start and end)
//! and each answer goes back through its callback. Asks that arrive together share one OS snapshot; a check is always
//! answered from a snapshot that started after it was asked.

use std::collections::BTreeSet;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;

use super::rules::{self, Found, History, Who};
use super::{Probe, Proc, Victim, filetime_now, host_usage, reap, snapshot};

/// While a batch runs on Windows, a snapshot at least this often (the CIM query itself takes about as long), so that
/// parent links are seen before parents exit.
const SAMPLE: Duration = Duration::from_millis(250);

pub enum Ask {
    /// K1 for a task that returned (or ran out of time). `last`: no other task of its batch is still running.
    Check { probe: Probe, last: bool, batch_since: u64 },
    /// K6's figures for the host and its supervisor.
    Usage,
    /// A batch starts (`true`) or has ended (`false`).
    Arm(bool),
    /// Observe now, answering nothing but that it was done (the control).
    Sample,
    /// The runner has ended (any way): what its tasks left (`rules::leftovers`; `prefix` starts each task's marker).
    Final { prefix: String },
}

pub type Answer = Box<dyn FnOnce(Result<Value, String>) + Send>;

/// An ask, the moment past which it is expired (a snapshot that finishes later acts on nothing), and its answer.
type Asked = (Ask, Instant, Option<Answer>);

#[derive(Clone)]
pub struct Watch {
    tx: Sender<Asked>,
    /// Proven processes it did not kill because their link could not be confirmed (`reap`): left running.
    left: Arc<Mutex<Vec<u32>>>,
}

impl Watch {
    /// The oracle for `host`, the process that uses the library (a runner; the orchestrator for its control). On
    /// Windows its history keeps every process created from `start` on (`before_spawn()`, read before the host or
    /// anything observed was started).
    pub fn start(host: u32, start: u64) -> Watch {
        let (tx, rx) = mpsc::channel();
        let left = Arc::new(Mutex::new(Vec::new()));
        let shared = left.clone();
        std::thread::spawn(move || serve(host, start, &rx, &shared));
        Watch { tx, left }
    }

    /// The proven processes left running so far (link unconfirmable), each once.
    pub fn left_running(&self) -> Vec<u32> {
        self.left.lock().map(|l| l.clone()).unwrap_or_default()
    }

    /// Queues `ask`, valid for `within`; `answer` gets the result. An ask whose snapshot finishes after that is
    /// expired: it kills nothing and answers an error. If the oracle thread is gone, the answer never comes: callers
    /// bound their wait.
    pub fn ask(&self, ask: Ask, within: Duration, answer: Option<Answer>) {
        let _ = self.tx.send((ask, Instant::now() + within, answer));
    }

    /// Asks and waits at most `within` for the answer.
    pub fn ask_now(&self, ask: Ask, within: Duration) -> Result<Value, String> {
        let (tx, rx) = mpsc::channel();
        let answer: Answer = Box::new(move |result| {
            let _ = tx.send(result);
        });
        self.ask(ask, within, Some(answer));
        rx.recv_timeout(within)
            .map_err(|_| format!("the oracle did not answer within {within:?}"))?
    }
}

fn serve(host: u32, start: u64, rx: &Receiver<Asked>, left: &Mutex<Vec<u32>>) {
    let who = Who {
        host,
        me: std::process::id(),
    };
    let windows = cfg!(windows);
    let mut hist = History::default();
    // The roots named by the checks of the batch so far: on its last check, none of them is "the batch's".
    let mut named = BTreeSet::new();
    let mut armed = false;
    // Windows: the first snapshot pins the host's identity, while the orchestrator still holds its handle.
    // The time is read before the snapshot, as for every later sample: `last_seen` is when the observation began.
    if windows {
        let at = filetime_now();
        if let Ok(snap) = snapshot() {
            hist.record(&snap, start, at, host);
        }
    }
    loop {
        let first = if armed && windows {
            match rx.recv_timeout(SAMPLE) {
                Ok(ask) => Some(ask),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        } else {
            match rx.recv() {
                Ok(ask) => Some(ask),
                Err(_) => return,
            }
        };
        let mut pending = Vec::new();
        for (ask, until, answer) in first.into_iter().chain(rx.try_iter()) {
            match ask {
                Ask::Arm(on) => {
                    armed = on;
                    if on {
                        named.clear();
                    }
                }
                ask => pending.push((ask, until, answer)),
            }
        }
        if pending.is_empty() && !(armed && windows) {
            continue;
        }
        let at = filetime_now();
        let snap = snapshot();
        if let (Ok(snap), true) = (&snap, windows) {
            hist.record(snap, start, at, host);
        }
        for (ask, until, answer) in pending {
            if Instant::now() > until {
                if let Some(answer) = answer {
                    answer(Err(
                        "expired: the snapshot finished after the ask's deadline; nothing was done".into(),
                    ));
                }
                continue;
            }
            let result = match (ask, &snap) {
                (Ask::Check { .. } | Ask::Final { .. }, Err(e)) => Err(format!("K1 not observed: {e}")),
                (
                    Ask::Check {
                        probe,
                        last,
                        batch_since,
                    },
                    Ok(snap),
                ) => {
                    named.extend(probe.roots.iter().map(|r| r.pid));
                    let found = if windows {
                        rules::windows(snap, &hist, &probe, last.then_some((batch_since, &named)), who)
                    } else {
                        rules::unix(snap, &probe, who)
                    };
                    if last {
                        named.clear();
                    }
                    // Killed only on strong evidence: the task's marker (Unix) or root identity (Windows), or live
                    // links up to it; a batch's processes, live links up to the supervisor.
                    let mut victims = if windows {
                        let root = |p: &Proc| probe.roots.iter().any(|r| r.is(p.pid, p.created));
                        rules::victims(snap, &found.proven, &root, &|_| false)
                    } else {
                        let marked = |p: &Proc| p.tag.as_deref() == Some(probe.tag.as_str());
                        rules::victims(snap, &found.proven, &marked, &|_| false)
                    };
                    victims.extend(rules::victims(snap, &found.batch, &|_| false, &|p| hist.is_anchor(p)));
                    kill(&victims, left);
                    serde_json::to_value(found).map_err(|e| e.to_string())
                }
                (Ask::Final { prefix }, Ok(snap)) => {
                    let found = rules::leftovers(snap, &hist, &prefix, who, windows);
                    let marked = |p: &Proc| p.tag.as_deref().is_some_and(|t| t.starts_with(prefix.as_str()));
                    let victims = if windows {
                        rules::victims(snap, &found, &|_| false, &|p| hist.is_anchor(p))
                    } else {
                        rules::victims(snap, &found, &marked, &|_| false)
                    };
                    kill(&victims, left);
                    serde_json::to_value(Found {
                        proven: found,
                        ..Found::default()
                    })
                    .map_err(|e| e.to_string())
                }
                (Ask::Usage, _) => host_usage(host).and_then(|u| serde_json::to_value(u).map_err(|e| e.to_string())),
                (Ask::Sample | Ask::Arm(_), _) => Ok(Value::Null),
            };
            if let Some(answer) = answer {
                answer(result);
            }
        }
    }
}

/// Kills the `victims` that are confirmed again (`reap`); records those left running.
fn kill(victims: &[Victim], left: &Mutex<Vec<u32>>) {
    let reaped = reap(victims);
    if let Ok(mut left) = left.lock() {
        for pid in reaped.left {
            if !left.contains(&pid) {
                left.push(pid);
            }
        }
    }
}
