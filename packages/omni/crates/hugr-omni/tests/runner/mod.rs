//! Runs one scenario of `conformance/scenarios` (DSL: `conformance/SPEC.md`) through the public Rust API.

pub mod command;
pub mod expect;
pub mod ledger;
mod names;
pub mod os;
pub mod pattern;
mod read;
mod scenario;
mod schema;
mod suite;

use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};

use hugr_omni::{CancellationToken, Child, Error, PipeChild, PtyChild, PtySize, RunOutput};
use serde_json::{Map, Value};
use tokio::task::JoinHandle;

pub use expect::Fail;
use expect::{Fields, Got, Outcome, exit_fields, run_fields};
use scenario::{Scenario, action};
pub use suite::suite;

enum Kid {
    Pipe(PipeChild),
    Pty(PtyChild),
}

impl Kid {
    fn child(&self) -> &Child {
        match self {
            Kid::Pipe(c) => c,
            Kid::Pty(c) => c,
        }
    }
}

/// The state of one scenario run.
pub struct Ctx {
    vars: HashMap<String, Vec<String>>,
    kids: HashMap<String, Kid>,
    runs: HashMap<String, JoinHandle<Result<RunOutput, Error>>>,
    readers: HashMap<String, read::Reader>,
    token: CancellationToken,
}

/// Runs `s` in a fresh `${TMP}`; `Err` names the failing step, its action, and expected vs got.
pub async fn run(s: &Scenario, fixture: &Path, seq: usize) -> Result<(), Fail> {
    let tmp = os::tmp(seq);
    let mut ctx = Ctx {
        vars: HashMap::from([
            ("FIXTURE".into(), vec![fixture.display().to_string()]),
            ("TMP".into(), vec![tmp.display().to_string()]),
            ("EXE".into(), vec![std::env::consts::EXE_SUFFIX.into()]),
        ]),
        kids: HashMap::new(),
        runs: HashMap::new(),
        readers: HashMap::new(),
        token: CancellationToken::new(),
    };
    let result = ctx.steps(s, &tmp).await;
    // Clean up whatever is left: cancel pending runs, drop (force-kill) every child.
    ctx.token.cancel();
    ctx.runs.values().for_each(JoinHandle::abort);
    drop(ctx);
    let _ = std::fs::remove_dir_all(&tmp);
    result
}

impl Ctx {
    async fn steps(&mut self, s: &Scenario, tmp: &Path) -> Result<(), Fail> {
        for (name, content) in s.files() {
            let path = tmp.join(self.text(name)?);
            let content = self.text(content.as_str().ok_or("file contents must be text")?)?;
            std::fs::create_dir_all(path.parent().unwrap_or(tmp)).map_err(|e| e.to_string())?;
            std::fs::write(&path, content).map_err(|e| format!("files: {e}"))?;
        }
        for (i, step) in s.steps().enumerate() {
            let (name, _) = action(step)?;
            self.step(step).await.map_err(|f| f.at(&format!("step {i} ({name})")))?;
        }
        Ok(())
    }

    async fn step(&mut self, step: &Value) -> Result<(), Fail> {
        let (name, target) = action(step)?;
        let s = step.as_object().ok_or("a step must be an object")?;
        let limit = s.get("timeoutMs").and_then(Value::as_u64).unwrap_or(10_000);
        let started = Instant::now();
        let outcome = match tokio::time::timeout(Duration::from_millis(limit), self.act(name, target, s)).await {
            Ok(outcome) => outcome?,
            // Every action but `os` waits on the library; an `os` timeout is the oracle hanging.
            Err(_) if name == "os" => return Err(Fail::Harness(format!("the OS oracle timed out after {limit} ms"))),
            Err(_) => return Err(Fail::Product(format!("timed out after {limit} ms"))),
        };
        match s.get("expect") {
            Some(want) => expect::check(&self.resolve(want)?, &outcome, started.elapsed()),
            None => outcome
                .map(drop)
                .map_err(|e| Fail::Product(format!("unexpected error {e}"))),
        }
    }

    async fn act(&mut self, action: &str, target: &Value, s: &Map<String, Value>) -> Result<Outcome, Fail> {
        let handle = || target.as_str().ok_or_else(|| format!("`{action}` takes a handle name"));
        let none = || Ok(Ok(Fields::new()));
        match action {
            "run" | "spawn" => {
                let options = s.get("options").map(|o| self.resolve(o)).transpose()?;
                let (cmd, pty) = command::build(&self.resolve(target)?, options.as_ref(), &self.token)?;
                let name = s.get("as").and_then(Value::as_str).map(str::to_string);
                if action == "run" {
                    if s.get("await") != Some(&Value::Bool(false)) {
                        return Ok(cmd.run().await.map(|r| run_fields(&r)));
                    }
                    let name = name.ok_or("`await: false` needs `as`")?;
                    self.runs
                        .insert(name, tokio::task::spawn_local(async move { cmd.run().await }));
                    return none();
                }
                let kid = if pty {
                    cmd.spawn_pty().map(Kid::Pty)
                } else {
                    cmd.spawn().map(Kid::Pipe)
                };
                let kid = match kid {
                    Ok(kid) => kid,
                    Err(e) => return Ok(Err(e)),
                };
                if let Some(name) = name {
                    self.vars
                        .insert(format!("{name}.pid"), vec![kid.child().pid().to_string()]);
                    self.kids.insert(name, kid);
                }
                none()
            }
            "write" => {
                let data = s
                    .get("data")
                    .map(|d| self.resolve(d).and_then(|d| command::bytes(&d)))
                    .transpose()?;
                // SPEC: `write` without `data` only closes stdin.
                let close = s.get("close").and_then(Value::as_bool).unwrap_or(data.is_none());
                if data.is_none() && !close {
                    return Err("`write` needs `data` or `close: true`".into());
                }
                let kid = self.kid(handle()?)?;
                if let Some(data) = data
                    && let Err(e) = kid.child().write(data).await
                {
                    return Ok(Err(e));
                }
                if close {
                    let Kid::Pipe(pipe) = kid else {
                        return Err("`close` needs a pipe child".into());
                    };
                    if let Err(e) = pipe.close_stdin().await {
                        return Ok(Err(e));
                    }
                }
                none()
            }
            "read" => read::read(self, handle()?, s).await,
            "wait" => {
                if let Some(run) = self.runs.remove(handle()?) {
                    let done = run.await.map_err(|e| format!("run task failed: {e}"))?;
                    return Ok(done.map(|r| run_fields(&r)));
                }
                Ok(self.kid(handle()?)?.child().wait().await.map(|e| exit_fields(&e)))
            }
            "stop" => {
                let grace = s.get("graceMs").map(|v| command::duration("graceMs", v)).transpose()?;
                Ok(self.kid(handle()?)?.child().stop(grace).await.map(|e| exit_fields(&e)))
            }
            "abort" => {
                self.token.cancel();
                none()
            }
            "resize" => {
                let Kid::Pty(pty) = self.kid(handle()?)? else {
                    return Err("`resize` needs a PTY child".into());
                };
                let dim = |k: &str| s.get(k).and_then(Value::as_u64).and_then(|n| u16::try_from(n).ok());
                let (Some(cols), Some(rows)) = (dim("cols"), dim("rows")) else {
                    return Err("`resize` needs cols and rows that fit a u16".into());
                };
                Ok(pty.resize(PtySize { cols, rows }).map(|()| Fields::new()))
            }
            "processes" => {
                let list = match self.kid(handle()?)?.child().processes().await {
                    Ok(list) => list,
                    Err(e) => return Ok(Err(e)),
                };
                if let Some(name) = s.get("capture").and_then(Value::as_str) {
                    let pids = list.iter().map(|p| p.pid.to_string());
                    self.vars.entry(name.into()).or_default().extend(pids);
                }
                Ok(Ok(Fields::from([("entries", Got::Entries(list))])))
            }
            "os" => self.os(target, s).await,
            _ => Err(format!("unknown action {action}").into()),
        }
    }

    fn kid(&self, name: &str) -> Result<&Kid, String> {
        self.kids.get(name).ok_or_else(|| format!("no child named {name:?}"))
    }

    /// `os`: every pid alive / dead per the OS, now or within `withinMs`.
    async fn os(&self, want: &Value, s: &Map<String, Value>) -> Result<Outcome, Fail> {
        let alive = match want.as_str() {
            Some("alive") => true,
            Some("dead") => false,
            _ => return Err("`os` is \"alive\" or \"dead\"".into()),
        };
        let pids = self.resolve(s.get("pids").ok_or("`os` needs pids")?)?;
        let pids: Vec<u32> = flat(&pids)
            .iter()
            .map(|p| p.parse().map_err(|_| format!("bad pid {p:?}")))
            .collect::<Result<_, _>>()?;
        if pids.is_empty() {
            return Err("no pids to check".into());
        }
        let within = Duration::from_millis(s.get("withinMs").and_then(Value::as_u64).unwrap_or(0));
        os::expect(pids, alive, within).await.map(|()| Ok(Fields::new()))
    }

    /// Substitutes `${...}`: a string that is exactly one capture becomes its list (when it is not one value);
    /// inside a longer string, a variable is its first value.
    fn resolve(&self, v: &Value) -> Result<Value, String> {
        Ok(match v {
            Value::String(s) => {
                let whole = s
                    .strip_prefix("${")
                    .and_then(|r| r.strip_suffix('}'))
                    .filter(|n| !n.contains('}'));
                match whole.map(|n| self.var(n)).transpose()? {
                    Some(vals) if vals.len() != 1 => Value::Array(vals.iter().cloned().map(Value::String).collect()),
                    _ => Value::String(self.text(s)?),
                }
            }
            Value::Array(a) => Value::Array(a.iter().map(|x| self.resolve(x)).collect::<Result<_, _>>()?),
            Value::Object(o) => Value::Object(
                o.iter()
                    .map(|(k, x)| Ok((k.clone(), self.resolve(x)?)))
                    .collect::<Result<_, String>>()?,
            ),
            other => other.clone(),
        })
    }

    fn text(&self, s: &str) -> Result<String, String> {
        let mut out = String::new();
        let mut rest = s;
        while let Some(at) = rest.find("${") {
            let end = rest[at..].find('}').ok_or_else(|| format!("unclosed ${{ in {s:?}"))? + at;
            out.push_str(&rest[..at]);
            let vals = self.var(&rest[at + 2..end])?;
            out.push_str(
                vals.first()
                    .ok_or_else(|| format!("{} has no value yet", &rest[at..=end]))?,
            );
            rest = &rest[end + 1..];
        }
        out.push_str(rest);
        Ok(out)
    }

    fn var(&self, name: &str) -> Result<&Vec<String>, String> {
        self.vars
            .get(name)
            .ok_or_else(|| format!("unknown variable ${{{name}}}"))
    }
}

/// Every string or number in a value, flattened.
fn flat(v: &Value) -> Vec<String> {
    match v {
        Value::Array(a) => a.iter().flat_map(flat).collect(),
        Value::String(s) => vec![s.clone()],
        other => vec![other.to_string()],
    }
}
