//! From a `run`/`spawn` step to a `hugr_omni::Command` (SPEC: options use the TS names).

use std::time::Duration;

use hugr_omni::{CancellationToken, Command, PtySize, Stdin};
use serde_json::Value;

/// The command and whether it asks for a terminal.
pub fn build(argv: &Value, options: Option<&Value>, token: &CancellationToken) -> Result<(Command, bool), String> {
    let argv: Vec<&str> = argv
        .as_array()
        .and_then(|a| a.iter().map(Value::as_str).collect())
        .ok_or("`run`/`spawn` takes [command, ...args] as strings")?;
    let (program, args) = argv.split_first().ok_or("`run`/`spawn` needs a command")?;
    let mut cmd = Command::new(program);
    cmd.args(args).cancel_on(token.clone());
    let mut pty = false;
    let empty = serde_json::Map::new();
    let options = match options {
        None => &empty,
        Some(o) => o.as_object().ok_or("`options` must be an object")?,
    };
    for (key, v) in options {
        let bad = || format!("option {key}: unexpected value {v}");
        match key.as_str() {
            "cwd" => {
                cmd.cwd(v.as_str().ok_or_else(bad)?);
            }
            "env" => {
                for (k, val) in v.as_object().ok_or_else(bad)? {
                    match val {
                        Value::Null => cmd.env_remove(k),
                        Value::String(s) => cmd.env(k, s),
                        _ => return Err(bad()),
                    };
                }
            }
            "inheritEnv" => {
                cmd.inherit_env(v.as_bool().ok_or_else(bad)?);
            }
            "timeoutMs" => {
                cmd.timeout(duration(key, v)?);
            }
            "graceMs" => {
                cmd.grace(duration(key, v)?);
            }
            "text" => {
                cmd.text(v.as_bool().ok_or_else(bad)?);
            }
            "mergeStderr" => {
                cmd.merge_stderr(v.as_bool().ok_or_else(bad)?);
            }
            "input" => {
                cmd.input(bytes(v)?);
            }
            "maxOutputBytes" => {
                let n = v.as_u64().ok_or_else(|| inexpressible(key, v))?;
                cmd.max_output_bytes(usize::try_from(n).map_err(|_| inexpressible(key, v))?);
            }
            "stdin" => {
                cmd.stdin(match v.as_str() {
                    Some("pipe") => Stdin::Pipe,
                    Some("closed") => Stdin::Closed,
                    _ => return Err(bad()),
                });
            }
            "pty" => {
                pty = true;
                cmd.pty(pty_size(v)?);
            }
            _ => return Err(format!("unknown option {key}")),
        }
    }
    Ok((cmd, pty))
}

fn inexpressible(key: &str, v: &Value) -> String {
    format!("option {key} = {v} cannot be expressed in Rust (set `langs` on the scenario)")
}

/// A duration in milliseconds: a non-negative finite number (a fraction stays exact to the nanosecond).
pub fn duration(key: &str, v: &Value) -> Result<Duration, String> {
    if let Some(ms) = v.as_u64() {
        return Ok(Duration::from_millis(ms));
    }
    match v.as_f64() {
        Some(ms) if ms.is_finite() && ms >= 0.0 => Ok(Duration::from_secs_f64(ms / 1000.0)),
        _ => Err(inexpressible(key, v)),
    }
}

fn pty_size(v: &Value) -> Result<PtySize, String> {
    let mut size = PtySize::default();
    match v {
        Value::Bool(true) => {}
        Value::Object(o) => {
            for (key, n) in o {
                let n = n
                    .as_u64()
                    .and_then(|n| u16::try_from(n).ok())
                    .ok_or_else(|| inexpressible(key, n))?;
                match key.as_str() {
                    "cols" => size.cols = n,
                    "rows" => size.rows = n,
                    _ => return Err(format!("unknown pty key {key}")),
                }
            }
        }
        _ => return Err(format!("option pty: unexpected value {v}")),
    }
    Ok(size)
}

/// Text (its UTF-8 bytes) or `{ "hex": "..." }`.
pub fn bytes(v: &Value) -> Result<Vec<u8>, String> {
    if let Some(s) = v.as_str() {
        return Ok(s.as_bytes().to_vec());
    }
    let hex = v
        .get("hex")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("want text or {{\"hex\"}}: {v}"))?;
    hex_bytes(hex)
}

pub fn hex_bytes(hex: &str) -> Result<Vec<u8>, String> {
    let digits: Vec<char> = hex.chars().filter(|c| !c.is_whitespace()).collect();
    digits
        .chunks(2)
        .map(|p| {
            let pair: String = p.iter().collect();
            u8::from_str_radix(&pair, 16).map_err(|_| format!("bad hex {hex:?}"))
        })
        .collect()
}
