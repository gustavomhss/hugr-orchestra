//! A scenario file: parsed and fully validated (`schema`, `names`) before it runs, so a mistake fails loudly, never
//! vacuously and never hidden behind a product failure.

use serde_json::{Map, Value};

use super::names::Names;
use super::os;
use super::pattern::pattern;

/// The 10 actions and the extra keys each accepts (every step may also set `timeoutMs`).
const ACTIONS: [(&str, &[&str]); 10] = [
    ("run", &["options", "as", "await", "expect"]),
    ("spawn", &["options", "as", "expect"]),
    ("write", &["data", "close", "expect"]),
    ("read", &["lines", "until", "detach", "capture", "expect"]),
    ("wait", &["expect"]),
    ("stop", &["graceMs", "expect"]),
    ("abort", &[]),
    ("resize", &["cols", "rows", "expect"]),
    ("processes", &["capture", "expect"]),
    ("os", &["pids", "withinMs"]),
];

const OSES: [&str; 3] = ["linux", "macos", "windows"];
const LANGS: [&str; 3] = ["rust", "ts", "py"];

/// A parsed, validated scenario file.
pub struct Scenario {
    json: Map<String, Value>,
}

impl Scenario {
    /// Parses and validates a scenario; `stem` is its file name without `.json`, which must equal the id.
    pub fn load(text: &str, stem: &str) -> Result<Scenario, String> {
        let json: Map<String, Value> = serde_json::from_str(text).map_err(|e| format!("bad JSON: {e}"))?;
        if let Some(key) = json
            .keys()
            .find(|k| !["id", "os", "langs", "files", "steps"].contains(&k.as_str()))
        {
            return Err(format!("unknown key {key}"));
        }
        let id = json.get("id").and_then(Value::as_str).ok_or("missing id")?;
        if id != stem || !pattern(r"^C-[A-Z]+-\d\d\.[a-z0-9-]+$")?.is_match(id) {
            return Err(format!("id {id:?} must be `<item>.<name>` and equal the file name"));
        }
        for (key, allowed) in [("os", &OSES), ("langs", &LANGS)] {
            if let Some(v) = json.get(key) {
                let list = v.as_array().ok_or_else(|| format!("{key} must be a list"))?;
                if list.is_empty() || !list.iter().all(|x| x.as_str().is_some_and(|x| allowed.contains(&x))) {
                    return Err(format!("{key} must list some of {allowed:?}"));
                }
            }
        }
        let mut names = Names::new();
        names.files(json.get("files"))?;
        let steps = json
            .get("steps")
            .and_then(Value::as_array)
            .filter(|s| !s.is_empty())
            .ok_or("missing steps")?;
        for (i, step) in steps.iter().enumerate() {
            let (name, target) = action(step).map_err(|e| format!("step {i}: {e}"))?;
            let obj = step.as_object().ok_or_else(|| format!("step {i}: not an object"))?;
            names
                .step(name, target, obj)
                .map_err(|e| format!("step {i} ({name}): {e}"))?;
        }
        Ok(Scenario { json })
    }

    /// Whether this scenario is meant for this OS and for Rust.
    pub fn applies(&self) -> bool {
        let has = |key: &str, me: &str| {
            self.json
                .get(key)
                .and_then(Value::as_array)
                .is_none_or(|l| l.iter().any(|x| x.as_str() == Some(me)))
        };
        has("os", os::OS) && has("langs", "rust")
    }

    /// `files`: name → text, created under `${TMP}` before the first step.
    pub fn files(&self) -> impl Iterator<Item = (&String, &Value)> {
        self.json.get("files").and_then(Value::as_object).into_iter().flatten()
    }

    pub fn steps(&self) -> impl Iterator<Item = &Value> {
        self.json.get("steps").and_then(Value::as_array).into_iter().flatten()
    }
}

/// The step's action name and value; any other key must be one this action accepts.
pub fn action(step: &Value) -> Result<(&str, &Value), String> {
    let obj = step.as_object().ok_or("a step must be an object")?;
    let mut found = obj.iter().filter(|(k, _)| ACTIONS.iter().any(|(a, _)| a == k));
    let (Some((name, value)), None) = (found.next(), found.next()) else {
        return Err("a step needs exactly one action".into());
    };
    let (_, extra) = ACTIONS.iter().find(|(a, _)| a == name).ok_or("unknown action")?;
    if let Some(key) = obj
        .keys()
        .find(|k| *k != name && *k != "timeoutMs" && !extra.contains(&k.as_str()))
    {
        return Err(format!("`{name}` does not take `{key}`"));
    }
    Ok((name, value))
}
