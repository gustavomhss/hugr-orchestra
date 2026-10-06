//! The native addon behind `bindings/node/index.js`: the Node/Bun/Deno binding of hugr-omni (W13).
//!
//! It converts types and the async model, nothing more (INV-01): every rule of `docs/api-contract.md` is the Rust
//! core's (`hugr_omni`), and `index.js` only adapts the JS idioms (async iteration, `AbortSignal`, `await using`).
//!
//! - **Async:** each promise is a napi `JsDeferred` settled on the JS thread; the future behind it is the core's and
//!   is polled by `exec` (one thread, no runtime of its own: the core's runtime and reader threads wake it).
//! - **Event loop:** a pending promise holds the loop (its threadsafe function is referenced). `index.js` asks for the
//!   root's exit at spawn, so a Child holds the loop until its root exits; after that only a pending read does.
//! - **GC never kills a child** (`child`): a collected Child goes to a keeper until its tree is gone.
//! - **No signal handler, no exit hook:** when the host dies, the supervisor stops the trees (ADR-0005 §9).
//! - **Never blocking the JS thread** except `spawn`, which blocks for the core's bounded round trips.

// napi-derive registers the exports only outside `cfg(test)`, and this cdylib has no Rust tests (`test = false`; its
// proof is the TS suite on Node, Bun and Deno): its test build, which `clippy --all-targets` still checks, is empty.
#![cfg(not(test))]

mod child;
mod convert;
mod error;
mod exec;
mod run;
