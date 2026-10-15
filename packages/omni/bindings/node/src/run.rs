//! `run()` (contract §6): the core's `Command::run`, settled as a promise.

use napi::Env;
use napi::bindgen_prelude::Object;
use napi_derive::napi;

use crate::convert::{self, Cancel, Js};
use crate::exec;

/// Runs to completion. An argument refused while it is converted is thrown; `index.js` turns that into a rejection.
#[napi]
pub fn run<'env>(
    env: &'env Env,
    command: Js<'_, String>,
    args: Js<'_, Vec<Js<'_, String>>>,
    options: Option<Js<'_, Object<'_>>>,
    cancel: Option<&Cancel>,
) -> napi::Result<Object<'env>> {
    let (cmd, _) = convert::command(env, command, args, options, cancel)?;
    exec::promise(env, async move { cmd.run().await }, convert::run_result)
}
