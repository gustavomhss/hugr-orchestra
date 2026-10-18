//! One runner invocation (the runner protocol of `qa/README.md`): records come on its stdout, its asks to the
//! oracle too (`check`, `usage`, `arm`); a `Watch` serves them and the answers go to its stdin. All of it within a
//! deadline: a runner that does not finish in time is ended and counted as hung, and the records it printed are kept.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::oracle::{self, Ask, Found, Watch};
use crate::record::Record;
use crate::report::{Ended, Invocation};

/// After a runner ended, how long its stdout may stay open (a leftover holding it) before the records are taken.
const DRAIN: Duration = Duration::from_secs(5);
/// The final observation of what a runner left: one snapshot and the kills.
pub const FINAL: Duration = Duration::from_secs(20);
/// Windows: how often the runner's tree is observed while it runs, besides the batches' own sampling.
const SAMPLE: Duration = Duration::from_secs(2);
/// How long a runner's ask stays valid: less than the runner's own wait (90 s, `rust/ask.rs`, `node/runner.mjs`), so
/// an answer it no longer waits for never acts.
const ASKED: Duration = Duration::from_secs(60);

pub fn invoke(
    lang: &str,
    workload: &str,
    arm: &str,
    cmd: &mut Command,
    log: &Path,
    (bound, prefix): (Duration, &str),
) -> Result<Invocation, String> {
    let file = std::fs::File::create(log).map_err(|e| format!("{}: {e}", log.display()))?;
    let start = oracle::before_spawn();
    let mut child = cmd
        .env("HUGR_QA_BOUND_MS", bound.as_millis().to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(file)
        .spawn()
        .map_err(|e| format!("{lang} runner: {e}"))?;
    let stdout = child.stdout.take().ok_or("no runner stdout")?;
    let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("no runner stdin")?));
    let watch = Watch::start(child.id(), start);
    let records = Arc::new(Mutex::new(Vec::new()));
    let (done, drained) = mpsc::channel();
    let seen = records.clone();
    let asks = watch.clone();
    std::thread::spawn(move || {
        let mut junk = Vec::new();
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let value: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
            match ask_of(&value) {
                Some((ask, id)) => asks.ask(ask, ASKED, id.map(|id| answer(id, stdin.clone()))),
                None => match serde_json::from_value::<Record>(value) {
                    Ok(record) if !record.kind.is_empty() => seen.lock().map(|mut r| r.push(record)).unwrap_or(()),
                    _ => junk.push(line),
                },
            }
        }
        let _ = done.send(junk);
    });
    let started = Instant::now();
    let mut sampled = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break Some(status);
        }
        if started.elapsed() > bound {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        // Windows: observe the runner's tree now and then, so that what it leaves can be traced to it after it ends.
        if cfg!(windows) && sampled.elapsed() >= SAMPLE {
            sampled = Instant::now();
            watch.ask(Ask::Sample, SAMPLE, None);
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    match drained.recv_timeout(DRAIN) {
        Ok(junk) if !junk.is_empty() => eprintln!(
            "qa/run: {lang} {workload} {arm} printed non-record lines: {:?}",
            &junk[..junk.len().min(3)]
        ),
        Ok(_) => {}
        Err(_) => {
            eprintln!("qa/run: {lang} {workload} {arm}: its stdout stayed open after it ended; records so far kept")
        }
    }
    // However it ended (finished, crashed, killed at its limit), one bounded observation of what its tasks left: the
    // proven leftovers are counted and killed.
    let final_ask = Ask::Final {
        prefix: prefix.to_owned(),
    };
    let leftovers = watch
        .ask_now(final_ask, FINAL)
        .and_then(|found| serde_json::from_value::<Found>(found).map_err(|e| e.to_string()))
        .map(|found| found.proven);
    let records = records.lock().map(|r| r.clone()).unwrap_or_default();
    let ended_well = records.iter().any(|r| r.kind == "end");
    let ended = match status {
        None => Ended::Hung(format!("the runner did not finish within {bound:?}")),
        Some(s) if s.success() && ended_well => Ended::Ok,
        // Exit 3: the runner stopped itself with an error it reported (its log says which).
        Some(s) if s.code() == Some(3) => {
            Ended::Error(format!("the runner reported an error (exit 3): {}", log.display()))
        }
        Some(s) => Ended::Crash(format!("{s}, {}", log.display())),
    };
    Ok(Invocation {
        lang: lang.into(),
        workload: workload.into(),
        arm: arm.into(),
        records,
        ended,
        leftovers,
        left_running: watch.left_running(),
        seconds: started.elapsed().as_secs_f64(),
    })
}

/// A line that asks the oracle: `{"kind":"check","id":n,"probe":{..},"last":b,"batch_since":t}`,
/// `{"kind":"usage","id":n}` or `{"kind":"arm","on":b}`.
fn ask_of(line: &Value) -> Option<(Ask, Option<u64>)> {
    let id = line["id"].as_u64();
    let ask = match line["kind"].as_str()? {
        "check" => Ask::Check {
            probe: serde_json::from_value(line["probe"].clone()).ok()?,
            last: line["last"].as_bool()?,
            batch_since: line["batch_since"].as_u64()?,
        },
        "usage" => Ask::Usage,
        "arm" => Ask::Arm(line["on"].as_bool()?),
        _ => return None,
    };
    Some((ask, id))
}

/// The answer to ask `id`, as one line on the runner's stdin: `{"id":n,"ok":..}` or `{"id":n,"error":".."}`.
fn answer(id: u64, stdin: Arc<Mutex<ChildStdin>>) -> crate::oracle::Answer {
    Box::new(move |result| {
        let line = match result {
            Ok(value) => json!({ "id": id, "ok": value }),
            Err(e) => json!({ "id": id, "error": e }),
        };
        if let Ok(mut stdin) = stdin.lock() {
            let _ = writeln!(stdin, "{line}").and_then(|()| stdin.flush());
        }
    })
}

#[cfg(test)]
mod tests {
    use std::process::Command;
    use std::time::Duration;

    use super::invoke;
    use crate::oracle::{self, MARKER};
    use crate::report::Ended;
    use crate::setup::test_fixture as fixture;

    /// A runner that blocks with live descendants of its own (as a std task leaves them) is ended at its limit; the
    /// final observation proves, counts and kills those descendants, so nothing it started outlives the invocation.
    #[test]
    fn a_blocked_runners_descendants_are_counted_and_killed_after_its_limit() {
        let tmp = std::env::temp_dir();
        let (log, pids) = (
            tmp.join("omni-qa-invoke-test.log"),
            tmp.join("omni-qa-invoke-test.pids"),
        );
        let _ = std::fs::remove_file(&pids);
        let mut runner = Command::new(fixture());
        runner
            .args([format!("pidlog={}", pids.display()), "tree=2".into(), "hang".into()])
            .env(MARKER, "qtest1i0-std-1-");
        let inv = invoke(
            "rust",
            "QA-X",
            "std",
            &mut runner,
            &log,
            (Duration::from_secs(3), "qtest1i0-"),
        )
        .unwrap();
        assert!(matches!(inv.ended, Ended::Hung(_)));
        let logged: Vec<u32> = std::fs::read_to_string(&pids)
            .unwrap()
            .lines()
            .map(|l| l.trim().parse().unwrap())
            .collect();
        let (mut left, mut want) = (inv.leftovers.unwrap(), logged[1..].to_vec());
        left.sort_unstable();
        want.sort_unstable();
        assert_eq!(
            left, want,
            "the runner's descendants (the runner itself was {})",
            logged[0]
        );
        let alive: Vec<u32> = oracle::snapshot().unwrap().iter().map(|p| p.pid).collect();
        assert!(want.iter().all(|p| !alive.contains(p)), "still alive: {want:?}");
        let _ = std::fs::remove_file(&pids);
        let _ = std::fs::remove_file(&log);
    }
}
