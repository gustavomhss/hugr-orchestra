//! Async adapter for the protected Linux quarantine primitive.
use crate::protected_linux;
use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Task};
use napi_derive::napi;

pub struct Available { root: String }
impl Task for Available {
    type Output = bool;
    type JsValue = bool;
    fn compute(&mut self) -> napi::Result<bool> { Ok(protected_linux::available(&self.root).unwrap_or(false)) }
    fn resolve(&mut self, _: Env, value: bool) -> napi::Result<bool> { Ok(value) }
}
#[napi]
pub fn quarantine_protected_available(root: String) -> AsyncTask<Available> { AsyncTask::new(Available { root }) }

pub struct Inspect { root: String, path: String }
impl Task for Inspect {
    type Output = Option<String>;
    type JsValue = Option<String>;
    fn compute(&mut self) -> napi::Result<Option<String>> { protected_linux::inspect(&self.root, &self.path).map_err(|e| napi::Error::from_reason(e.to_string())) }
    fn resolve(&mut self, _: Env, value: Option<String>) -> napi::Result<Option<String>> { Ok(value) }
}
#[napi]
pub fn quarantine_protected_inspect(root: String, path: String) -> AsyncTask<Inspect> { AsyncTask::new(Inspect { root, path }) }

pub struct Rename { root: String, source: String, destination: String, expected: String }
impl Task for Rename {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> napi::Result<String> { Ok(protected_linux::rename(&self.root, &self.source, &self.destination, &self.expected).to_owned()) }
    fn resolve(&mut self, _: Env, value: String) -> napi::Result<String> { Ok(value) }
}
#[napi]
pub fn quarantine_protected_rename(root: String, source: String, destination: String, expected: String) -> AsyncTask<Rename> {
    AsyncTask::new(Rename { root, source, destination, expected })
}
