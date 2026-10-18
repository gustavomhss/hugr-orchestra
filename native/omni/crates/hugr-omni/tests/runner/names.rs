//! What a scenario's steps require of each other, checked at load before anything runs: required fields and valid
//! combinations per action, every handle defined (and of the right kind) before use, every `${variable}` defined
//! before use, and the `files` table. A violation is a harness failure, never pending.

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use super::schema;

type Check = Result<(), String>;

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Pipe,
    Pty,
    /// A `run` started with `await: false`: only `wait` takes it.
    Run,
}

/// The handles and variables defined so far.
pub struct Names {
    handles: HashMap<String, Kind>,
    vars: HashSet<String>,
}

impl Names {
    pub fn new() -> Names {
        let vars = ["FIXTURE", "TMP", "EXE"].map(String::from).into();
        Names {
            handles: HashMap::new(),
            vars,
        }
    }

    /// `files`: name → text, both may use only the built-in variables (they exist before step 0).
    pub fn files(&self, files: Option<&Value>) -> Check {
        let Some(files) = files else { return Ok(()) };
        for (name, text) in files.as_object().ok_or("`files` must be an object of name → text")? {
            if name.is_empty() || !text.is_string() {
                return Err(format!(
                    "files: {name:?} must be a non-empty name with text, not {text}"
                ));
            }
            self.vars_in(&Value::String(name.clone()))?;
            self.vars_in(text)?;
        }
        Ok(())
    }

    /// Checks step `s` (action `name`, value `target`) against the earlier steps, then records what it defines.
    pub fn step(&mut self, name: &str, target: &Value, s: &Map<String, Value>) -> Check {
        schema::step(name, target, s)?;
        let has = |k: &str| s.contains_key(k);
        let flag = |k: &str| s.get(k).and_then(Value::as_bool);
        let kind = target.as_str().and_then(|h| self.handles.get(h).copied());
        let child = matches!(kind, Some(Kind::Pipe | Kind::Pty));
        let required: Result<(), &str> = match name {
            "run" if has("as") != (flag("await") == Some(false)) => {
                Err("`as` goes with `await: false`, and only with it")
            }
            "write" if !child => Err("needs an earlier spawned child"),
            // SPEC: `write` without `data` only closes stdin.
            "write" if !has("data") && flag("close") == Some(false) => Err("without `data` it closes stdin"),
            "write" if flag("close").unwrap_or(!has("data")) && kind == Some(Kind::Pty) => {
                Err("closes stdin, which a terminal does not have")
            }
            "read" | "stop" | "processes" if !child => Err("needs an earlier spawned child"),
            "read" if !has("until") => Err("needs `until`"),
            "wait" if kind.is_none() => Err("needs an earlier spawned child or `run` with `await: false`"),
            "resize" if kind != Some(Kind::Pty) => Err("needs an earlier spawned terminal child (`pty`)"),
            "resize" if !has("cols") || !has("rows") => Err("needs `cols` and `rows`"),
            "resize"
                if ["cols", "rows"]
                    .iter()
                    .any(|k| s[*k].as_u64().is_some_and(|n| n > u64::from(u16::MAX))) =>
            {
                Err("`cols` and `rows` must fit 16 bits")
            }
            "os" if !has("pids") => Err("needs `pids`"),
            _ => Ok(()),
        };
        required.map_err(|e| format!("`{name}` {e}"))?;
        for (key, v) in s.iter().filter(|(k, _)| *k != "expect") {
            self.vars_in(v).map_err(|e| format!("{key}: {e}"))?;
        }
        self.define(name, s);
        match s.get("expect") {
            Some(want) => self.vars_in(want).map_err(|e| format!("expect: {e}")),
            None => Ok(()),
        }
    }

    fn define(&mut self, name: &str, s: &Map<String, Value>) {
        if let Some(handle) = s.get("as").and_then(Value::as_str) {
            let pty = s
                .get("options")
                .and_then(|o| o.get("pty"))
                .is_some_and(|p| p != &Value::Bool(false));
            let kind = match (name, pty) {
                ("run", _) => Kind::Run,
                (_, true) => Kind::Pty,
                _ => Kind::Pipe,
            };
            self.handles.insert(handle.to_string(), kind);
            if kind != Kind::Run {
                self.vars.insert(format!("{handle}.pid"));
            }
        }
        match s.get("capture") {
            Some(Value::String(name)) => {
                self.vars.insert(name.clone());
            }
            Some(Value::Object(caps)) => self.vars.extend(caps.keys().cloned()),
            _ => {}
        }
    }

    /// Every `${name}` in `v` names a variable defined so far.
    fn vars_in(&self, v: &Value) -> Check {
        match v {
            Value::String(s) => {
                let mut rest = s.as_str();
                while let Some(at) = rest.find("${") {
                    let end = rest[at..].find('}').ok_or_else(|| format!("unclosed ${{ in {s:?}"))? + at;
                    let var = &rest[at + 2..end];
                    if !self.vars.contains(var) {
                        return Err(format!("${{{var}}} is not defined by an earlier step"));
                    }
                    rest = &rest[end + 1..];
                }
                Ok(())
            }
            Value::Array(a) => a.iter().try_for_each(|x| self.vars_in(x)),
            Value::Object(o) => o.values().try_for_each(|x| self.vars_in(x)),
            _ => Ok(()),
        }
    }
}
