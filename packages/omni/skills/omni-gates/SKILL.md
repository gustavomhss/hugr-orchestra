---
name: omni-gates
description: "Procedure for running hugr-omni's gates and triaging red or flaky results - the gate order from AGENTS.md, the fast gate versus --release in scripts/ci.mjs, Linux in Docker with --privileged, the Windows clippy target, TEST_FILTER reruns, and how to read a flaky test (a timeout is a failure; synchronize on fixture markers; suspect PID and descriptor reuse first). Use when about to push or hand over omni work, when CI or a local gate is red, when a test passes locally but fails on a CI OS, or when tempted to add a sleep, a retry or a looser bound to make a test pass."
---

# Running and triaging omni's gates

[AGENTS.md](../../AGENTS.md#gates-run-all-before-you-push) is the rule source: which gates exist, and that all of them
run before a push. This skill is the procedure around them. If the two disagree, AGENTS.md wins. Work from the
package root (`packages/omni` inside Orchestra): `scripts/ci.mjs` uses paths relative to it.

## When to use

- Before you push or hand over a work package that touched omni.
- A gate is red, locally or on CI, and you have to decide whether the product or the test is wrong.
- A test is "flaky", and you are tempted to add a sleep, a retry or a looser bound.

## When not to use

- Writing or changing a contract scenario: use the `omni-conformance` skill.
- An OS-level symptom with a known cause (a lost PTY output, EMSGSIZE, a hung ConPTY close): use the
  `omni-os-traps` skill first, then come back here to prove the fix.
- Cutting a release: use the `omni-release` skill (it runs `--release`).

## Order

Run the cheap, static gates first. Each one fails in seconds, and a later gate's failure is often a symptom of an
earlier one.

```text
python3 scripts/file-size-guard.py
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings
cargo build --workspace --bins
cargo test --workspace
node scripts/ci.mjs
```

- `cargo test` alone never builds another package's binaries (`omni-fixture`, `hugr-omni-supervisor`). Run
  `cargo build --workspace --bins` first, or the contract runner fails loudly.
- The Windows clippy target checks that the Windows code compiles on a Mac or Linux machine. CI runs only the
  native clippy on each OS, so this local step is the only cross check before Windows CI. It needs
  `rustup target add x86_64-pc-windows-msvc --toolchain 1.98.0` once.
- At most two heavy Rust builds run at once on the lead's machine. Delete your worktree's `target/` when you stop.

## Fast gate and release gate

`node scripts/ci.mjs` is the one CI script. GitHub Actions runs it on Linux, macOS and Windows, and so does anyone by
hand. Read its header for the authoritative step list.

| | Fast (every push to main, bundle/**, PRs) | `--release` (a `v*` tag, `RELEASE=1`, or by hand) |
|---|---|---|
| Static checks (Linux only) | file size, plan sections, rustfmt, surface parity, binding surface, guarantees ledger, docs blocks (static), tsc | plus the surface and guarantees checks' own tests |
| Rust | clippy, build, `cargo test --workspace` | plus the musl supervisor (static), the supervisor suite on musl, K4 on a release build |
| TypeScript | runner teeth, contract and idioms on Node 22 | plus Node 24, Bun and Deno |
| Docs | static rules | every docs block run for real |
| Packages | none | K9: build, pack and clean-install the npm package of this OS with npm, Bun and Deno |

- The script stops at the first failing step and prints how long each step took.
- `TEST_FILTER` is passed to `cargo test`, for example `TEST_FILTER=stopped_arrives node scripts/ci.mjs`. On GitHub,
  start Orchestra's `omni.yml` by hand with the `ref` and `test_filter` inputs. Use it to rerun one suspect test on the OS where it
  failed, several times, before you change anything.

## Linux in Docker

On a Mac, prove Linux in Docker. The target directory is a volume, not your worktree:

```text
docker run --rm --privileged -v "$PWD":/w -w /w -v omni-cargo:/usr/local/cargo/registry -v omni-target:/w/target -v omni-rustup:/usr/local/rustup rust:1.96 cargo test --workspace
```

- `--privileged` is required for the supervisor tests. The Linux PID-reuse test steers `ns_last_pid`, and without
  privilege it fails rather than skips.
- GitHub's Ubuntu runner also needs unprivileged user namespaces (`kernel.apparmor_restrict_unprivileged_userns=0`).
  `omni.yml` sets this.
- Use your own target volume per work package (`omni-target-<WP>`), so parallel agents do not share a build.

## Triage: is the product wrong or the test?

1. **A timeout is a failure.** It never counts as "probably slow". A test that timed out did not observe what it
   claims. Find what it was waiting for.
2. **Did the test synchronize on a marker?** Tests wait for fixture output (`READY`, `PID <level> <pid>`, `GOT`,
   `LOGGED`), never for time. Any `sleep` used to wait for a state is the bug. Replace it with a marker
   ([FIXTURE.md](../../conformance/FIXTURE.md)).
3. **Suspect reuse before suspecting the product.**
   - PID reuse: Windows hands a freed pid to the next process within moments, often to another test's
     `omni-fixture`. An oracle that says "pid X is alive" must check that X is still *our* process (a nonce or a
     log path in its command line), not just that the number exists.
   - Descriptor reuse: other tests open files at the same time and get the same fd numbers. Compare identities
     (device and inode), not numbers.
4. **Is the bound honest under load?** A 2-vCPU CI runner can take seconds to start a process. A bound that
   includes the root's start-up must allow for it ("under two graces", not "under one grace plus 50 ms"). A bound is
   there to prove that a hang is bounded, not to measure latency.
5. **Reproduce on the failing OS with `TEST_FILTER`**, several runs in a row, before and after the fix.
6. **Never loosen an assertion, add a retry, or skip on an OS without a lead decision.** A skip counts as a failure
   in the contract runners. When an OS limit is real, declare it in GUARANTEES with the measured number.

[references/ci-history.md](references/ci-history.md) lists the CI failures this project already paid for, with
their causes. Read it when a failure looks familiar.

## Before you hand over

- Every gate in the order above is green locally. Linux is green in Docker with `--privileged`.
- `git diff --name-only <baseline>...HEAD` shows only your write-set.
- Your report names any test you could not run on an OS, and says why. Never write "green" for something not run.
