---
name: team-stack-compiled-rust
description: "Rust ownership, unsafe and concurrency facts for the assigned component."
when: "The assigned component is Rust."
not-when: "Rust appears only in an unrelated dependency or lockfile."
---

# Rust

Read the component's actual compiler, edition, workspace, features and target; do not infer its build system from a lockfile alone. Cargo manifests suggest a Cargo path, but Bazel, Buck or Nix can own the build even when Cargo metadata exists. Treat those as negative signals for assuming a Cargo-based review; confirm the actual build from project evidence.

- Trace `unsafe` operations to their stated safety invariants and callers: raw-pointer validity, alignment, aliasing and FFI ABI matter. An `unsafe` marker does not establish that these obligations hold. Rust's ownership model does not rule out deadlocks, logic races or leaks. Sources: https://doc.rust-lang.org/nomicon/what-unsafe-does.html and https://doc.rust-lang.org/book/ch16-03-shared-state.html
- Follow a lock guard's lifetime through asynchronous suspension and callers. A held lock may block another operation needed for progress; name the competing path before asserting a deadlock. A guard releases on drop, not merely when the last source-level use appears.
- Compare cancellation and early-return paths with resource ownership and cleanup. A task or future existing is not evidence it completed or that a transaction committed.

No-build analysis may inspect source and available host results; compiler, tests and instrumented runs need a host-supported build lane and the project's dependencies. If unavailable, record not-run, not a pass. Never install or fetch a toolchain or dependencies during review; language facts do not grant tool calls.
