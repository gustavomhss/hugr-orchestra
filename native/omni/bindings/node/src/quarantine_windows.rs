//! Async Node adapter for the internal Windows quarantine binding.

use hugr_omni::binding::quarantine_windows;
use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Task};
use napi_derive::napi;

pub struct QuarantineTask {
    source: String,
    destination: Option<String>,
    expected: Option<String>,
}
impl Task for QuarantineTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> napi::Result<String> {
        quarantine_windows::operate(&self.source, self.destination.as_deref(), self.expected.as_deref())
            .map_err(napi::Error::from_reason)
    }
    fn resolve(&mut self, _: Env, value: String) -> napi::Result<String> {
        Ok(value)
    }
}

#[napi]
pub fn quarantine_identity(source: String) -> AsyncTask<QuarantineTask> {
    AsyncTask::new(QuarantineTask {
        source,
        destination: None,
        expected: None,
    })
}
#[napi]
pub fn quarantine_rename(source: String, destination: String, expected: String) -> AsyncTask<QuarantineTask> {
    AsyncTask::new(QuarantineTask {
        source,
        destination: Some(destination),
        expected: Some(expected),
    })
}

pub struct QuarantineInspectTask {
    source: String,
}
impl Task for QuarantineInspectTask {
    type Output = Option<String>;
    type JsValue = Option<String>;
    fn compute(&mut self) -> napi::Result<Option<String>> {
        quarantine_windows::inspect(&self.source).map_err(napi::Error::from_reason)
    }
    fn resolve(&mut self, _: Env, value: Option<String>) -> napi::Result<Option<String>> {
        Ok(value)
    }
}

#[napi]
pub fn quarantine_inspect(source: String) -> AsyncTask<QuarantineInspectTask> {
    AsyncTask::new(QuarantineInspectTask { source })
}

pub struct QuarantineDisposeTask {
    source: String,
    expected: String,
}
impl Task for QuarantineDisposeTask {
    type Output = ();
    type JsValue = ();
    fn compute(&mut self) -> napi::Result<()> {
        quarantine_windows::dispose(&self.source, &self.expected).map_err(napi::Error::from_reason)
    }
    fn resolve(&mut self, _: Env, _: ()) -> napi::Result<()> {
        Ok(())
    }
}

#[napi]
pub fn quarantine_dispose(source: String, expected: String) -> AsyncTask<QuarantineDisposeTask> {
    AsyncTask::new(QuarantineDisposeTask { source, expected })
}

#[napi(object)]
pub struct QuarantineBatchItem {
    pub path: String,
    pub identity: String,
}

pub struct QuarantineBatchTask {
    items: Vec<(String, String)>,
}
impl Task for QuarantineBatchTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> napi::Result<String> {
        Ok(quarantine_windows::dispose_batch(&self.items).to_owned())
    }
    fn resolve(&mut self, _: Env, value: String) -> napi::Result<String> {
        Ok(value)
    }
}

#[napi]
pub fn quarantine_dispose_batch(items: Vec<QuarantineBatchItem>) -> AsyncTask<QuarantineBatchTask> {
    AsyncTask::new(QuarantineBatchTask {
        items: items.into_iter().map(|item| (item.path, item.identity)).collect(),
    })
}
