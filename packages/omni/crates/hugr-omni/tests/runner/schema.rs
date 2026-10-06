//! The full schema of a step, checked when the scenario loads, before anything runs: the action's value, every
//! extra key, and every expectation and matcher. A scenario that breaks it is a harness failure, never pending.

use serde_json::{Map, Value};

use super::command::hex_bytes;
use super::pattern::pattern;

type Check = Result<(), String>;

const CODES: [&str; 8] = [
    "NOT_FOUND",
    "NOT_EXECUTABLE",
    "INVALID_CWD",
    "INVALID_ARGUMENT",
    "ABORTED",
    "OUTPUT_LIMIT",
    "CLOSED",
    "IO",
];
const REASONS: [&str; 5] = ["exit", "signal", "killed", "timeout", "aborted"];
const EXIT: [&str; 4] = ["exitCode", "signal", "reason", "success"];
const STREAMS: [&str; 3] = ["stdout", "stderr", "pty"];

/// Checks step `s`, whose action is `name` with value `target`.
pub fn step(name: &str, target: &Value, s: &Map<String, Value>) -> Check {
    match name {
        "run" | "spawn" => match target.as_array() {
            Some(argv) if !argv.is_empty() && argv.iter().all(Value::is_string) => Ok(()),
            _ => Err(format!("`{name}` takes [command, ...args] as strings")),
        },
        "os" => one_of(target, &["alive", "dead"]),
        _ => text(target),
    }?;
    for (key, v) in s.iter().filter(|(k, _)| *k != name) {
        match key.as_str() {
            "timeoutMs" | "withinMs" | "graceMs" | "cols" | "rows" => count(v),
            "as" => text(v),
            "capture" if name == "processes" => text(v),
            "capture" => object(v)?.values().try_for_each(regex),
            "await" | "close" | "detach" | "lines" => boolean(v),
            "data" => data(v),
            "until" => until(v),
            "pids" => match v {
                Value::Array(a) if !a.is_empty() && a.iter().all(|p| p.is_string() || p.is_u64()) => Ok(()),
                Value::String(_) => Ok(()),
                _ => Err("want a capture or a non-empty list of pids".into()),
            },
            "options" => options(v),
            "expect" => expect(name, s, v),
            _ => Err("unknown key".into()),
        }
        .map_err(|e| format!("{key}: {e}"))?;
    }
    Ok(())
}

fn expect(name: &str, s: &Map<String, Value>, v: &Value) -> Check {
    let want = object(v)?;
    let lines = s.get("lines") == Some(&Value::Bool(true));
    for (key, w) in want {
        let allowed = match (name, key.as_str()) {
            (_, "error" | "elapsedMs") => true,
            (_, "message" | "result") => want.contains_key("error"),
            ("run" | "wait", k) => EXIT.contains(&k) || k == "stdout" || k == "stderr",
            ("stop", k) => EXIT.contains(&k),
            ("read", "pieces") => lines,
            ("read", k) => STREAMS.contains(&k) || ["chunks", "lostBefore", "continues", "droppedBytes"].contains(&k),
            ("processes", "entries") => true,
            _ => false,
        };
        if !allowed {
            return Err(format!("`{name}` cannot expect `{key}` (here)"));
        }
        match key.as_str() {
            "error" => one_of(w, &CODES),
            "message" => match w {
                Value::String(_) => Ok(()),
                Value::Array(a) if !a.is_empty() && a.iter().all(Value::is_string) => Ok(()),
                _ => Err("want text or a list of texts".into()),
            },
            "result" => object(w)?.iter().try_for_each(|(k, m)| result_field(k, m)),
            "droppedBytes" => object(w)?.iter().try_for_each(|(k, m)| match k.as_str() {
                "stdout" | "stderr" => number(m),
                _ => Err(format!("unknown stream {k}")),
            }),
            "pieces" => object(w)?.iter().try_for_each(|(k, list)| pieces(k, list)),
            "entries" => w.as_array().ok_or("want a list")?.iter().try_for_each(entry),
            k if STREAMS.contains(&k) => string(w),
            k => result_field(k, w),
        }
        .map_err(|e| format!("{key}: {e}"))?;
    }
    Ok(())
}

/// A field of an `Exit` or `RunResult` (or a numeric field of `read`).
fn result_field(key: &str, w: &Value) -> Check {
    match key {
        "exitCode" | "chunks" | "lostBefore" | "continues" | "elapsedMs" => number(w),
        "signal" => string(w),
        "reason" => one_of(w, &REASONS),
        "success" => boolean(w),
        "stdout" | "stderr" => string(w),
        _ => Err(format!("unknown field {key}")),
    }
}

fn pieces(stream: &str, list: &Value) -> Check {
    if !STREAMS.contains(&stream) {
        return Err(format!("unknown stream {stream}"));
    }
    for piece in list.as_array().ok_or("want a list of pieces")? {
        let p = object(piece)?;
        if p.len() != 2
            || !p.get("bytes").is_some_and(Value::is_u64)
            || !p.get("continues").is_some_and(Value::is_boolean)
        {
            return Err(format!("a piece is {{\"bytes\": n, \"continues\": bool}}, not {piece}"));
        }
    }
    Ok(())
}

fn entry(e: &Value) -> Check {
    for (k, w) in object(e)? {
        let ids = |w: &Value| match w {
            Value::String(_) => true,
            Value::Array(a) => a.iter().all(|x| x.is_string() || x.is_u64()),
            w => w.is_u64(),
        };
        match k.as_str() {
            "pid" if ids(w) => {}
            "parentPid" if w.is_null() || ids(w) => {}
            "name" => string(w)?,
            _ => return Err(format!("bad entry key {k}: {w}")),
        }
    }
    Ok(())
}

fn options(v: &Value) -> Check {
    for (k, o) in object(v)? {
        match k.as_str() {
            "cwd" => text(o),
            "env" => match object(o)?.values().all(|x| x.is_string() || x.is_null()) {
                true => Ok(()),
                false => Err("env values are text or null".into()),
            },
            "inheritEnv" | "text" | "mergeStderr" => boolean(o),
            "timeoutMs" | "graceMs" | "maxOutputBytes" => match o {
                Value::Number(_) => Ok(()),
                Value::Object(t) if t.len() == 1 => one_of(
                    t.get("$number").unwrap_or(&Value::Null),
                    &["NaN", "Infinity", "-Infinity"],
                ),
                _ => Err("want a number or {\"$number\": ...}".into()),
            },
            "input" => data(o),
            "stdin" => one_of(o, &["pipe", "closed"]),
            "pty" if o == &Value::Bool(true) => Ok(()),
            "pty" => object(o)?
                .iter()
                .try_for_each(|(d, n)| match (d.as_str(), n.is_number()) {
                    ("cols" | "rows", true) => Ok(()),
                    _ => Err(format!("bad pty {d}: {n}")),
                }),
            _ => Err("unknown option".into()),
        }
        .map_err(|e| format!("{k}: {e}"))?;
    }
    Ok(())
}

fn until(v: &Value) -> Check {
    if v.as_str() == Some("end") {
        return Ok(());
    }
    let u = object(v)?;
    match (u.get("match"), u.get("count").map(|c| c.as_u64().filter(|&c| c > 0))) {
        (Some(re), None | Some(Some(_))) if u.keys().all(|k| k == "match" || k == "count") => regex(re),
        _ => Err(format!("want \"end\" or {{\"match\", \"count\" > 0}}, not {v}")),
    }
}

/// A string matcher: text, or exactly one of `contains`, `regex`, `length`, `hex`; or null.
fn string(w: &Value) -> Check {
    match w {
        Value::Null | Value::String(_) => Ok(()),
        Value::Object(o) if o.len() == 1 => match o.iter().next() {
            Some((k, Value::String(_))) if k == "contains" => Ok(()),
            Some((k, re)) if k == "regex" => regex(re),
            Some((k, n)) if k == "length" && n.is_u64() => Ok(()),
            Some((k, Value::String(h))) if k == "hex" => hex_bytes(h).map(drop),
            _ => Err(format!("bad string matcher {w}")),
        },
        _ => Err(format!("bad string matcher {w}")),
    }
}

/// A number matcher: a number, null, or a non-empty `{lt, lte, gt, gte}` of numbers.
fn number(w: &Value) -> Check {
    match w {
        Value::Null | Value::Number(_) => Ok(()),
        Value::Object(o)
            if !o.is_empty()
                && o.iter()
                    .all(|(k, n)| ["lt", "lte", "gt", "gte"].contains(&k.as_str()) && n.is_number()) =>
        {
            Ok(())
        }
        _ => Err(format!("bad number matcher {w}")),
    }
}

fn data(v: &Value) -> Check {
    match v {
        Value::String(_) => Ok(()),
        Value::Object(o) if o.len() == 1 => {
            hex_bytes(o.get("hex").and_then(Value::as_str).ok_or("want {\"hex\"}")?).map(drop)
        }
        _ => Err(format!("want text or {{\"hex\"}}, not {v}")),
    }
}

fn regex(re: &Value) -> Check {
    pattern(re.as_str().ok_or("a regex is a string")?).map(drop)
}

fn object(v: &Value) -> Result<&Map<String, Value>, String> {
    v.as_object().ok_or_else(|| format!("want an object, not {v}"))
}

fn text(v: &Value) -> Check {
    v.as_str().map(drop).ok_or_else(|| format!("want text, not {v}"))
}

fn boolean(v: &Value) -> Check {
    v.as_bool()
        .map(drop)
        .ok_or_else(|| format!("want true or false, not {v}"))
}

fn count(v: &Value) -> Check {
    v.as_u64()
        .map(drop)
        .ok_or_else(|| format!("want a whole number, not {v}"))
}

fn one_of(v: &Value, allowed: &[&str]) -> Check {
    match v.as_str() {
        Some(s) if allowed.contains(&s) => Ok(()),
        _ => Err(format!("want one of {allowed:?}, not {v}")),
    }
}
