//! The runner's side of the oracle protocol (`qa/src/invoke.rs`): asks are printed on stdout like records, answers
//! come back on stdin, matched by id. Every ask is bounded: no answer in time is an error, never a wait.

use std::collections::HashMap;
use std::io::BufRead;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use tokio::sync::oneshot;

use crate::oracle::{Found, HostUsage, Probe};

/// An answer takes one snapshot started after the ask (each tool bounded by `TOOL_BOUND`) and the kill.
const ANSWER: Duration = Duration::from_secs(90);

type Waiting = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;

pub struct Oracle {
    next: AtomicU64,
    waiting: Waiting,
}

impl Oracle {
    /// Starts reading the answers from stdin.
    pub fn start() -> Arc<Oracle> {
        let waiting: Waiting = Arc::default();
        let answers = waiting.clone();
        std::thread::spawn(move || {
            for line in std::io::stdin().lock().lines().map_while(Result::ok) {
                let Ok(answer) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                let Some(id) = answer["id"].as_u64() else { continue };
                let result = match answer.get("error") {
                    Some(e) => Err(e.as_str().unwrap_or("the oracle failed").to_owned()),
                    None => Ok(answer["ok"].clone()),
                };
                if let Some(tx) = answers.lock().ok().and_then(|mut w| w.remove(&id)) {
                    let _ = tx.send(result);
                }
            }
        });
        Arc::new(Oracle {
            next: AtomicU64::new(1),
            waiting,
        })
    }

    async fn ask(&self, mut line: Value) -> Result<Value, String> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.waiting
            .lock()
            .map_err(|_| "the oracle's state is poisoned")?
            .insert(id, tx);
        line["id"] = json!(id);
        println!("{line}");
        match tokio::time::timeout(ANSWER, rx).await {
            Ok(Ok(result)) => result,
            _ => Err(format!("the oracle did not answer within {ANSWER:?}")),
        }
    }

    /// K1 for a task that returned. `last`: no other task of its batch is running.
    pub async fn check(&self, probe: &Probe, last: bool, batch_since: u64) -> Result<Found, String> {
        let ask = json!({ "kind": "check", "probe": probe, "last": last, "batch_since": batch_since });
        serde_json::from_value(self.ask(ask).await?).map_err(|e| e.to_string())
    }

    /// K6's figures for this process and its supervisor.
    pub async fn usage(&self) -> Result<HostUsage, String> {
        serde_json::from_value(self.ask(json!({ "kind": "usage" })).await?).map_err(|e| e.to_string())
    }

    /// A batch starts (`true`) or has ended (`false`).
    pub fn arm(&self, on: bool) {
        println!("{}", json!({ "kind": "arm", "on": on }));
    }
}
