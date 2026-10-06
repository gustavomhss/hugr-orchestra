//! `OmniError` (contract §8, §11): every error of the core reaches JS as an instance of the `OmniError` class that
//! `index.js` defines and hands over at load (`setup`), with its `code`, its message and, from `run()`, its `result`.
//! So does a JS value of a type `index.d.ts` does not allow (`refused`): only JS can pass one, so its text lives here.

use napi::bindgen_prelude::{FnArgs, Function, FunctionRef, JsValue, Unknown};
use napi::{Env, ValueType};
use napi_derive::napi;

use crate::convert::{self, RunResultJs};
use crate::exec;

/// `new OmniError(code, message, result)`.
type Args = FnArgs<(String, String, Option<RunResultJs>)>;
type Ctor = FunctionRef<Args, ()>;

/// Called once by `index.js` as it loads: keeps its `OmniError` class for this JS environment (a worker has its own),
/// and starts the thread that polls the binding's futures.
#[napi]
pub fn setup(env: Env, omni_error: Function<'_, Args, ()>) -> napi::Result<()> {
    exec::start().map_err(|e| napi::Error::from_reason(format!("hugr-omni: cannot start its thread: {e}")))?;
    env.set_instance_data(omni_error.create_ref()?, (), |_| {})
}

/// The `OmniError` for `e`, ready to throw or to reject with (it keeps the JS object itself).
pub(crate) fn omni(env: &Env, e: &hugr_omni::Error) -> napi::Error {
    let result = e.result().cloned().map(convert::run_result);
    make(env, e.code().as_str(), e.to_string(), result)
}

/// `INVALID_ARGUMENT` for `field`, whose JS value `value` is not `want` (contract §3: nothing has started).
pub(crate) fn refused(env: &Env, field: &str, value: &Unknown<'_>, want: &str) -> napi::Error {
    let message = format!(
        "INVALID_ARGUMENT: {field} is {}, which index.d.ts does not allow there; pass {want} instead.",
        shown(value)
    );
    make(env, "INVALID_ARGUMENT", message, None)
}

fn make(env: &Env, code: &str, message: String, result: Option<RunResultJs>) -> napi::Error {
    let made = || -> napi::Result<napi::Error> {
        let ctor = env
            .get_instance_data::<Ctor>()?
            .ok_or_else(|| napi::Error::from_reason("hugr-omni: index.js did not call setup()"))?;
        let args = FnArgs::from((code.to_owned(), message, result));
        Ok(napi::Error::from(ctor.borrow_back(env)?.new_instance(args)?))
    };
    made().unwrap_or_else(|failed| failed)
}

/// A JS value as a message shows it: a string quoted (and cut at 80 characters), a number, `true`, `null`, or its kind.
/// Only primitives are read, so no user code runs.
fn shown(value: &Unknown<'_>) -> String {
    let read = || -> napi::Result<String> {
        Ok(match value.get_type()? {
            ValueType::String => {
                let text = convert::text_of(value).unwrap_or_default();
                match text.char_indices().nth(80) {
                    Some((cut, _)) => format!("{:?}...", &text[..cut]),
                    None => format!("{text:?}"),
                }
            }
            ValueType::Number => value.coerce_to_number()?.get_double()?.to_string(),
            ValueType::Boolean => value.coerce_to_bool()?.to_string(),
            ValueType::Null => "null".to_owned(),
            ValueType::Undefined => "undefined".to_owned(),
            ValueType::Object if value.is_array()? => "an array".to_owned(),
            ValueType::Object => "an object".to_owned(),
            ValueType::Function => "a function".to_owned(),
            ValueType::Symbol => "a symbol".to_owned(),
            ValueType::BigInt => "a bigint".to_owned(),
            _ => "a value of another kind".to_owned(),
        })
    };
    read().unwrap_or_else(|_| "a value that cannot be shown".to_owned())
}
