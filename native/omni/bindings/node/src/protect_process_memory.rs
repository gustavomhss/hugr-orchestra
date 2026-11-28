//! Adapter for the hidden Linux host credential protection hook.
use napi_derive::napi;

#[napi]
pub fn protect_process_memory() -> bool {
    hugr_omni::binding::protect_process_memory()
}
