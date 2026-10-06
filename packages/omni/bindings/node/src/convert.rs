//! Between JS values and the core: the options of `run`/`spawn` (contract §1, §3) become a `hugr_omni::Command`, and
//! the core's values become the plain objects of `index.d.ts`. The number rules that only JS can break (NaN, negative,
//! fraction) are the core's own (`hugr_omni::binding`), so their errors read the same in every language. A value of a
//! type `index.d.ts` does not allow is `INVALID_ARGUMENT` too (`error::refused`); an exception thrown by a getter of the
//! caller's object passes through unchanged.

use napi::bindgen_prelude::{
    Either, Either3, FromNapiValue, JsValue, Object, TypeName, Uint8Array, Uint8ArraySlice, Unknown, ValidateNapiValue,
};
use napi::{Env, ValueType};
use napi_derive::napi;

use hugr_omni::{
    CancellationToken, Chunk, Command, Data, DroppedBytes, Exit, Line, ProcessInfo, PtySize, Reason, RunOutput, Stdin,
    Stream, binding,
};

use crate::error;

/// The cancellation behind one `AbortSignal`: `index.js` makes one per signal and cancels it when the signal aborts.
#[napi]
#[derive(Default)]
pub struct Cancel(CancellationToken);

#[napi]
impl Cancel {
    /// A token nothing has cancelled yet.
    #[napi(constructor)]
    pub fn new() -> Cancel {
        Cancel::default()
    }

    /// Cancels every run and child started with this token (contract §8).
    #[napi]
    pub fn cancel(&self) {
        self.0.cancel();
    }
}

/// A JS value that should be a `T`; any other value is kept, to be named in the error.
pub(crate) type Js<'a, T> = Either<T, Unknown<'a>>;
/// Text (as UTF-8) or bytes, as `write()` and the `input` option take them.
pub(crate) type Bytes<'a> = Either3<String, Uint8ArraySlice<'a>, Unknown<'a>>;

/// `T`, or the `INVALID_ARGUMENT` that names `field`, its value and what it must be (QS-05).
pub(crate) fn one<T>(env: &Env, field: &str, value: Js<'_, T>, want: &str) -> napi::Result<T> {
    match value {
        Either::A(value) => Ok(value),
        Either::B(other) => Err(error::refused(env, field, &other, want)),
    }
}

/// An optional value: `undefined` and `null` leave it out.
pub(crate) fn opt<T>(env: &Env, field: &str, value: Option<Js<'_, T>>, want: &str) -> napi::Result<Option<T>> {
    match value {
        Some(Either::B(other)) if nullish(&other) => Ok(None),
        Some(value) => one(env, field, value, want).map(Some),
        None => Ok(None),
    }
}

/// The bytes of `data`: a string's UTF-8, or a `Uint8Array`'s content.
pub(crate) fn bytes(env: &Env, field: &str, data: Bytes<'_>) -> napi::Result<Vec<u8>> {
    match data {
        Either3::A(text) => Ok(text.into_bytes()),
        Either3::B(raw) => Ok(raw.to_vec()),
        Either3::C(other) => Err(error::refused(env, field, &other, "a string or a Uint8Array")),
    }
}

/// A string's text; `None` for any other value (read without running user code).
pub(crate) fn text_of(value: &Unknown<'_>) -> Option<String> {
    match value.get_type() {
        Ok(ValueType::String) => value.coerce_to_string().and_then(|s| s.into_utf8()?.into_owned()).ok(),
        _ => None,
    }
}

fn nullish(value: &Unknown<'_>) -> bool {
    matches!(value.get_type(), Ok(ValueType::Null | ValueType::Undefined))
}

/// Option `key` of `o` as a `T`; left out when `undefined` or `null`.
fn field<T>(env: &Env, o: &Object<'_>, key: &str, want: &str) -> napi::Result<Option<T>>
where
    T: FromNapiValue + ValidateNapiValue + TypeName,
{
    opt(env, key, o.get::<Js<T>>(key)?, want)
}

/// The command of `run(command, args, options)` / `spawn(...)`, and whether it asks for a terminal. Options that the
/// other function does not take are ignored by the core (`input` and `maxOutputBytes` by `spawn`, `stdin` by `run`).
pub(crate) fn command(
    env: &Env,
    program: Js<'_, String>,
    args: Js<'_, Vec<Js<'_, String>>>,
    options: Option<Js<'_, Object<'_>>>,
    cancel: Option<&Cancel>,
) -> napi::Result<(Command, bool)> {
    let mut cmd = Command::new(one(env, "command", program, "a string, the program to run")?);
    for (i, arg) in one(env, "args", args, "an array of strings")?.into_iter().enumerate() {
        cmd.arg(one(env, &format!("args[{i}]"), arg, "a string")?);
    }
    let Some(o) = opt(env, "options", options, "an options object")? else {
        return Ok((cmd, false));
    };
    let omni = |e: hugr_omni::Error| error::omni(env, &e);
    let millis = |key: &str| match field::<f64>(env, &o, key, "a number of milliseconds")? {
        Some(ms) => binding::millis(key, ms).map(Some).map_err(omni),
        None => Ok(None),
    };
    match cancel {
        Some(cancel) => _ = cmd.cancel_on(cancel.0.clone()),
        // `index.js` hands over the cancellation of every AbortSignal: anything else here is not one.
        None => match o.get::<Unknown>("signal")? {
            Some(signal) if !nullish(&signal) => return Err(error::refused(env, "signal", &signal, "an AbortSignal")),
            _ => {}
        },
    }
    if let Some(cwd) = field::<String>(env, &o, "cwd", "a string, the path of a directory")? {
        cmd.cwd(cwd);
    }
    if let Some(vars) = field::<Object>(env, &o, "env", "an object of strings")? {
        for key in Object::keys(&vars)? {
            match vars.get::<Js<String>>(&key)? {
                Some(Either::A(value)) => _ = cmd.env(key, value),
                Some(Either::B(other)) if nullish(&other) => _ = cmd.env_remove(key),
                Some(Either::B(other)) => {
                    return Err(error::refused(
                        env,
                        &format!("env.{key}"),
                        &other,
                        "a string, or null to remove it",
                    ));
                }
                None => {} // `undefined`: as if absent
            }
        }
    }
    if let Some(inherit) = field::<bool>(env, &o, "inheritEnv", "true or false")? {
        cmd.inherit_env(inherit);
    }
    if let Some(timeout) = millis("timeoutMs")? {
        cmd.timeout(timeout);
    }
    if let Some(grace) = millis("graceMs")? {
        cmd.grace(grace);
    }
    if let Some(text) = field::<bool>(env, &o, "text", "true or false")? {
        cmd.text(text);
    }
    if let Some(merge) = field::<bool>(env, &o, "mergeStderr", "true or false")? {
        cmd.merge_stderr(merge);
    }
    if let Some(stdin) = o.get::<Unknown>("stdin")?.filter(|v| !nullish(v)) {
        cmd.stdin(match text_of(&stdin).as_deref() {
            Some("pipe") => Stdin::Pipe,
            Some("closed") => Stdin::Closed,
            _ => return Err(error::refused(env, "stdin", &stdin, "\"closed\" or \"pipe\"")),
        });
    }
    if let Some(input) = o.get::<Bytes>("input")? {
        cmd.input(bytes(env, "input", input)?);
    }
    if let Some(max) = field::<f64>(env, &o, "maxOutputBytes", "a number of bytes")? {
        cmd.max_output_bytes(binding::byte_limit("maxOutputBytes", max).map_err(omni)?);
    }
    let pty = match o.get::<Either3<bool, Object, Unknown>>("pty")? {
        None | Some(Either3::A(false)) => false,
        Some(Either3::C(other)) if nullish(&other) => false,
        Some(Either3::A(true)) => {
            cmd.pty(PtySize::default());
            true
        }
        Some(Either3::B(size)) => {
            let side = |key: &str, default: u16| {
                let name = format!("pty.{key}");
                match opt(env, &name, size.get::<Js<f64>>(key)?, "a number of cells")? {
                    Some(n) => binding::pty_side(&name, n).map_err(omni),
                    None => Ok(default),
                }
            };
            cmd.pty(PtySize {
                cols: side("cols", 80)?,
                rows: side("rows", 24)?,
            });
            true
        }
        Some(Either3::C(other)) => return Err(error::refused(env, "pty", &other, "true, or { cols, rows }")),
    };
    Ok((cmd, pty))
}

/// `Exit` (contract §7).
#[napi(object, object_from_js = false, use_nullable = true)]
pub struct ExitJs {
    pub exit_code: Option<u32>,
    pub signal: Option<String>,
    pub reason: &'static str,
    pub success: bool,
}

/// `RunResult`: an `Exit` with the complete output (contract §6).
#[napi(object, object_from_js = false, use_nullable = true)]
pub struct RunResultJs {
    pub exit_code: Option<u32>,
    pub signal: Option<String>,
    pub reason: &'static str,
    pub success: bool,
    pub stdout: Either<String, Uint8Array>,
    pub stderr: Either<String, Uint8Array>,
}

/// `ProcessInfo` (contract §5).
#[napi(object, object_from_js = false, use_nullable = true)]
pub struct ProcessInfoJs {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: Option<String>,
}

/// `Chunk`; `lostBefore` only after a gap (contract §4).
#[napi(object, object_from_js = false)]
pub struct ChunkJs {
    pub stream: &'static str,
    pub data: Either<String, Uint8Array>,
    pub lost_before: Option<f64>,
}

/// `Line`; `lostBefore` only after a gap, `continues: true` only on a piece of a longer line (contract §4).
#[napi(object, object_from_js = false)]
pub struct LineJs {
    pub stream: &'static str,
    pub text: String,
    pub lost_before: Option<f64>,
    pub continues: Option<bool>,
}

/// `droppedBytes` (contract §4).
#[napi(object, object_from_js = false)]
pub struct DroppedJs {
    pub stdout: f64,
    pub stderr: f64,
}

pub(crate) fn exit(e: Exit) -> ExitJs {
    ExitJs {
        success: e.success(),
        reason: reason(e.reason),
        exit_code: e.code,
        signal: e.signal,
    }
}

pub(crate) fn run_result(out: RunOutput) -> RunResultJs {
    let ExitJs {
        exit_code,
        signal,
        reason,
        success,
    } = exit(out.exit);
    RunResultJs {
        exit_code,
        signal,
        reason,
        success,
        stdout: data(out.stdout),
        stderr: data(out.stderr),
    }
}

pub(crate) fn processes(list: Vec<ProcessInfo>) -> Vec<ProcessInfoJs> {
    list.into_iter()
        .map(|p| ProcessInfoJs {
            pid: p.pid,
            parent_pid: p.parent_pid,
            name: p.name,
        })
        .collect()
}

pub(crate) fn chunk(c: Chunk) -> ChunkJs {
    ChunkJs {
        stream: stream(c.stream),
        data: data(c.data),
        lost_before: c.lost_before.map(|n| n as f64),
    }
}

pub(crate) fn line(l: Line) -> LineJs {
    LineJs {
        stream: stream(l.stream),
        text: l.text,
        lost_before: l.lost_before.map(|n| n as f64),
        continues: l.continues.then_some(true),
    }
}

pub(crate) fn dropped(d: DroppedBytes) -> DroppedJs {
    DroppedJs {
        stdout: d.stdout as f64,
        stderr: d.stderr as f64,
    }
}

fn data(d: Data) -> Either<String, Uint8Array> {
    match d {
        Data::Text(text) => Either::A(text),
        Data::Bytes(raw) => Either::B(Uint8Array::new(raw)),
    }
}

fn reason(r: Reason) -> &'static str {
    match r {
        Reason::Exit => "exit",
        Reason::Signal => "signal",
        Reason::Killed => "killed",
        Reason::Timeout => "timeout",
        Reason::Aborted => "aborted",
    }
}

fn stream(s: Stream) -> &'static str {
    match s {
        Stream::Stdout => "stdout",
        Stream::Stderr => "stderr",
        Stream::Pty => "pty",
    }
}
