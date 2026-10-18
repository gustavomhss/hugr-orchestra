//! `expect`: every listed field must match (SPEC "Expectations"); a field the step does not produce fails.
//! A mismatch is a `Fail::Product`; a malformed expectation is a `Fail::Harness`.

use std::collections::BTreeMap;
use std::time::Duration;

use hugr_omni::{Data, Error, Exit, ProcessInfo, Reason, RunOutput};
use serde_json::Value;

use super::command::hex_bytes;
use super::pattern::pattern;

/// The fields a step produced.
pub type Fields = BTreeMap<&'static str, Got>;

/// What a step returned: its fields, or the library's error.
pub type Outcome = Result<Fields, Error>;

/// Why a step failed. Only `Product` (the library's outcome differs from the expectation) may count as pending; a
/// `Harness` failure (malformed scenario, unknown variable, runner or OS-oracle error) always fails the suite. Every
/// error not built as `Product` is `Harness`, so an unclassified failure fails closed.
#[derive(Debug)]
pub enum Fail {
    Product(String),
    Harness(String),
}

impl From<String> for Fail {
    fn from(msg: String) -> Fail {
        Fail::Harness(msg)
    }
}

impl From<&str> for Fail {
    fn from(msg: &str) -> Fail {
        Fail::Harness(msg.to_string())
    }
}

impl Fail {
    /// The same kind of failure, with `at` in front of the message.
    pub fn at(self, at: &str) -> Fail {
        match self {
            Fail::Product(m) => Fail::Product(format!("{at}: {m}")),
            Fail::Harness(m) => Fail::Harness(format!("{at}: {m}")),
        }
    }
}

pub enum Got {
    Num(Option<f64>),
    Str(Option<String>),
    Bool(bool),
    Data(Data),
    Entries(Vec<ProcessInfo>),
    /// Lines mode: each item's byte length and `continues` flag, in order.
    Pieces(Vec<(u64, bool)>),
    Obj(Fields),
}

pub fn exit_fields(e: &Exit) -> Fields {
    let reason = match e.reason {
        Reason::Exit => "exit",
        Reason::Signal => "signal",
        Reason::Killed => "killed",
        Reason::Timeout => "timeout",
        Reason::Aborted => "aborted",
    };
    Fields::from([
        ("exitCode", Got::Num(e.code.map(f64::from))),
        ("signal", Got::Str(e.signal.clone())),
        ("reason", Got::Str(Some(reason.into()))),
        ("success", Got::Bool(e.success())),
    ])
}

pub fn run_fields(r: &RunOutput) -> Fields {
    let mut f = exit_fields(&r.exit);
    f.insert("stdout", Got::Data(r.stdout.clone()));
    f.insert("stderr", Got::Data(r.stderr.clone()));
    f
}

/// Checks `expect` against the outcome; `elapsedMs` is the step's own duration.
pub fn check(expect: &Value, got: &Outcome, elapsed: Duration) -> Result<(), Fail> {
    let want = expect.as_object().ok_or("`expect` must be an object")?;
    let product = |msg: String| Err(Fail::Product(msg));
    if let (Err(e), false) = (got, want.contains_key("error")) {
        return product(format!("unexpected error {e}"));
    }
    for (key, w) in want {
        match (key.as_str(), got) {
            ("elapsedMs", _) => {
                let ms = elapsed.as_secs_f64() * 1000.0;
                if !number(w, Some(ms))? {
                    return product(format!("elapsedMs: expected {w}, got {ms:.0}"));
                }
            }
            ("error", Ok(_)) => return product(format!("expected error {w}, got success")),
            ("error", Err(e)) => {
                let code = w.as_str().ok_or("`error` must be a code")?;
                if e.code().as_str() != code {
                    return product(format!("expected error {code}, got {e}"));
                }
            }
            ("message", Err(e)) => {
                let text = e.to_string();
                for part in w.as_array().map_or(vec![w], |a| a.iter().collect()) {
                    let part = part.as_str().ok_or("message parts must be strings")?;
                    if !text.contains(part) {
                        return product(format!("message {text:?} lacks {part:?}"));
                    }
                }
            }
            ("result", Err(e)) => match e.result() {
                Some(result) => fields(w, &run_fields(result)).map_err(|f| f.at("result"))?,
                None => return product(format!("error {e} carries no result")),
            },
            (_, Err(e)) => return product(format!("{key} expected, got error {e}")),
            (_, Ok(f)) => {
                let g = f
                    .get(key.as_str())
                    .ok_or_else(|| format!("{key}: not produced by this step"))?;
                field(w, g).map_err(|f| f.at(key))?;
            }
        }
    }
    Ok(())
}

fn fields(want: &Value, got: &Fields) -> Result<(), Fail> {
    for (key, w) in want.as_object().ok_or("want an object")? {
        let g = got.get(key.as_str()).ok_or_else(|| format!("{key}: no such field"))?;
        field(w, g).map_err(|f| f.at(key))?;
    }
    Ok(())
}

fn field(w: &Value, got: &Got) -> Result<(), Fail> {
    let (ok, shown) = match got {
        Got::Num(n) => (number(w, *n)?, n.map_or("null".into(), |n| n.to_string())),
        Got::Str(s) => (string(w, s.as_deref().map(|s| (s.as_bytes(), true)))?, format!("{s:?}")),
        Got::Bool(b) => (w.as_bool().ok_or("want true or false")? == *b, b.to_string()),
        Got::Data(Data::Text(t)) => (string(w, Some((t.as_bytes(), true)))?, shown(t.as_bytes())),
        Got::Data(Data::Bytes(b)) => (string(w, Some((b, false)))?, shown(b)),
        Got::Entries(list) => (entries(w, list)?, format!("{list:?}")),
        Got::Pieces(got) => {
            let want: Vec<(u64, bool)> = w
                .as_array()
                .ok_or("pieces: want a list")?
                .iter()
                .map(|p| {
                    (
                        p["bytes"].as_u64().unwrap_or(u64::MAX),
                        p["continues"].as_bool().unwrap_or(false),
                    )
                })
                .collect();
            (want == *got, format!("{got:?} (bytes, continues)"))
        }
        Got::Obj(f) => return fields(w, f),
    };
    if ok {
        Ok(())
    } else {
        Err(Fail::Product(format!("expected {w}, got {shown}")))
    }
}

fn shown(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    if text.len() <= 300 {
        return format!("{text:?}");
    }
    format!(
        "{:?}... ({} bytes)",
        &text[..text.floor_char_boundary(300)],
        bytes.len()
    )
}

/// An exact number, or `{ lt, lte, gt, gte }` (several may combine); `null` matches only null.
fn number(w: &Value, got: Option<f64>) -> Result<bool, String> {
    let Some(g) = got.filter(|_| !w.is_null()) else {
        return Ok(w.is_null() == got.is_none());
    };
    if let Some(n) = w.as_f64() {
        return Ok(n == g);
    }
    let mut ok = true;
    for (op, n) in w.as_object().ok_or_else(|| format!("bad number matcher {w}"))? {
        let n = n.as_f64().ok_or_else(|| format!("bad bound {op}"))?;
        ok &= match op.as_str() {
            "lt" => g < n,
            "lte" => g <= n,
            "gt" => g > n,
            "gte" => g >= n,
            _ => return Err(format!("unknown number matcher {op}")),
        };
    }
    Ok(ok)
}

/// Exact text, `{contains}`, `{regex}`, `{length}` (characters of text, bytes of binary) or `{hex}` (raw
/// bytes; UTF-8 for text); `null` matches only null. `got` is (bytes, is_text).
fn string(w: &Value, got: Option<(&[u8], bool)>) -> Result<bool, String> {
    let Some((bytes, is_text)) = got else {
        return Ok(w.is_null());
    };
    let text = String::from_utf8_lossy(bytes);
    Ok(match w {
        Value::Null => false,
        Value::String(s) => s.as_bytes() == bytes,
        Value::Object(o) if o.len() == 1 => match o.iter().next().ok_or("empty matcher")? {
            (op, Value::String(s)) if op == "contains" => text.contains(s.as_str()),
            (op, Value::String(r)) if op == "regex" => pattern(r)?.is_match(&text),
            (op, n) if op == "length" => {
                let n = n.as_u64().ok_or("length wants a number")?;
                n == if is_text { text.chars().count() } else { bytes.len() } as u64
            }
            (op, Value::String(h)) if op == "hex" => hex_bytes(h)? == bytes,
            _ => return Err(format!("unknown string matcher {w}")),
        },
        _ => return Err(format!("bad string matcher {w}")),
    })
}

/// Pids accepted by `pid`/`parentPid`: a number, a numeric string, or a list of them (a capture).
fn ids(v: &Value) -> Vec<f64> {
    match v {
        Value::Array(a) => a.iter().flat_map(ids).collect(),
        Value::String(s) => s.parse().into_iter().collect(),
        v => v.as_f64().into_iter().collect(),
    }
}

/// `entries`: an unordered list matched one to one.
fn entries(w: &Value, got: &[ProcessInfo]) -> Result<bool, String> {
    let want = w.as_array().ok_or("entries must be a list")?;
    let mut ok = vec![vec![false; got.len()]; want.len()];
    for (i, e) in want.iter().enumerate() {
        for (j, p) in got.iter().enumerate() {
            ok[i][j] = entry(e, p)?;
        }
    }
    Ok(want.len() == got.len() && assign(&ok, 0, &mut vec![false; got.len()]))
}

fn assign(ok: &[Vec<bool>], i: usize, used: &mut [bool]) -> bool {
    let Some(row) = ok.get(i) else { return true };
    for j in 0..row.len() {
        if row[j] && !used[j] {
            used[j] = true;
            if assign(ok, i + 1, used) {
                return true;
            }
            used[j] = false;
        }
    }
    false
}

fn entry(e: &Value, p: &ProcessInfo) -> Result<bool, String> {
    let mut ok = true;
    for (key, w) in e.as_object().ok_or("an entry must be an object")? {
        ok &= match key.as_str() {
            "pid" => ids(w).contains(&f64::from(p.pid)),
            "parentPid" if w.is_null() => p.parent_pid.is_none(),
            "parentPid" => p.parent_pid.is_some_and(|pp| ids(w).contains(&f64::from(pp))),
            "name" => string(w, p.name.as_deref().map(|n| (n.as_bytes(), true)))?,
            _ => return Err(format!("unknown entry key {key}")),
        };
    }
    Ok(ok)
}
