//! Shared helpers of the Unix supervisor suite (SUP-U): a test host, the OS oracle and the child roles.
// Each test binary uses a different part of these helpers; the rest would warn as dead code there.
#![allow(dead_code)]

pub mod host;
pub mod host_role;
pub mod os;
pub mod role;
