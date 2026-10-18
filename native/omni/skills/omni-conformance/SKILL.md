---
name: omni-conformance
description: "Procedure for hugr-omni's contract scenarios and the fixture - who may edit them (INV-13, the lead only), the JSON scenario format and its 10 steps, the shared regex subset, synchronizing on fixture markers, adding a fixture verb, the pending ledger, and running both runners (Rust and TypeScript on Node, Bun and Deno) plus their teeth. Use when a contract scenario fails, when a contract change needs a new or amended scenario, when a scenario needs something the fixture cannot do yet, or when reviewing changes under conformance/, crates/omni-fixture or the runners."
---

# Contract scenarios and the fixture

The contract is proven by one set of JSON scenarios that every language runner executes. The format is
[conformance/SPEC.md](../../conformance/SPEC.md). The test program is
[conformance/FIXTURE.md](../../conformance/FIXTURE.md). This skill is the procedure around them.

## When to use

- A scenario is red, and you must tell a product bug from a runner bug.
- The lead amends the contract, and a scenario must prove the amendment.
- A scenario needs a behavior the fixture does not have yet.
- Reviewing changes under `conformance/`, `crates/omni-fixture`, `crates/hugr-omni/tests` or `bindings/node/test`.

## When not to use

- Unit tests inside a module, and the supervisor's own suites: they follow the module's owner (`omni-core-change`).
- Language idioms such as `await using` and host-death behavior (C-TS-01, C-RS-01, C-HOST-01). These are written per
  language beside the runner, not as scenarios.

## Who may edit what

- **Scenarios (`conformance/scenarios/*.json`) and `crates/hugr-omni/tests` are read-only for implementers**
  (INV-13). Only the lead writes or changes them. An implementer who believes a scenario is wrong stops and reports
  it, with the evidence. Never edit the scenario to match the code.
- **`conformance/pending.txt`** is the lead's. It lists items that cannot pass yet. A pending item that passes fails
  the suite until its line is removed, and the file must be empty for a release.
- **The fixture** (`crates/omni-fixture`) may gain a verb when a contract item needs one. Every verb is listed in
  FIXTURE.md in the same change.
- **GUARANTEES.md** must list every scenario's item. `node scripts/guarantees-check/check.mjs` fails on a scenario
  file whose item no row names.

## Writing a scenario (the lead)

1. **Name it by the item it proves:** `C-<AREA>-<NN>.<what>.json`. `id` starts with the item from
   [docs/acceptance.md](../../docs/acceptance.md).
2. **Use the steps of SPEC.md**, with exactly one action key per step: `run`, `spawn`, `write`, `read`, `wait`,
   `stop`, `abort`, `resize`, `processes` and `os`. `options` use the TypeScript names (`timeoutMs`, `inheritEnv`,
   `mergeStderr`, ...). Each runner maps them.
3. **Synchronize on markers, never on time.** A `read` with `until: { match, count }` waits for fixture lines such as
   `READY`, `PID <level> <pid>`, `GOT <line>` or `LOGGED <line>`. `os` steps ask the OS, never the library, with
   `withinMs` to poll. There is no sleep step, by design.
4. **Use only the shared regex subset.** It has no look-around, no backreferences, no named groups, no flags, and no
   `\s`, `\b` or `\p`. `\d` and `\w` are ASCII. Matching is by code point, on complete lines.
   `conformance/regex-table.json` is the definition, and every runner checks itself against it first.
5. **Expect only what the contract promises.** List the fields that matter. Unlisted fields are ignored. Use matchers
   (`contains`, `regex`, `lt`/`gt`) where the contract gives a range, not an exact value. Timing expectations prove a
   bound, not a latency.
6. **Limit it to an OS or language only when the input cannot exist there.** Examples: `os` for a Unix signal,
   `langs` for a NaN duration in Rust. A runner never skips a scenario meant for it, and `skipped` counts as a
   failure.
7. **Make it fail first.** Run it against the code before the fix, or with the fix reverted, and see it red for the
   right reason.

## Adding a fixture verb

- A verb is `verb` or `verb=value`. It prints only ASCII markers, each written with a single write call, and never
  sleeps to synchronize.
- It behaves the same on every OS, or states its per-OS behavior in FIXTURE.md (as `signal` and `escape` do).
- Descendants are the fixture itself, started without a shell.
- Code that needs the OS lives in `crates/omni-fixture/src/sys`, one of the places where `unsafe` is allowed.

## Running

The runners need the fixture and the supervisor built, and `cargo test` alone does not build them:

```text
cargo build --workspace --bins
cargo test -p hugr-omni --test contract
cargo test -p hugr-omni --test teeth
cargo build -p hugr-omni-node
node bindings/node/test/contract.mjs
node bindings/node/test/teeth.mjs
npx -y bun@1 bindings/node/test/contract.mjs
npx -y deno@2 run -A bindings/node/test/contract.mjs
```

- Each runner prints one line per scenario, then `contract: N passed, M pending, K failed`. Only K greater than 0
  fails.
- **Teeth** prove that the runner can fail: a loose matcher, a missing step or a harness error must each be caught.
  Run them whenever a runner changes.
- Both runners read the same files. A scenario green in Rust and red in TypeScript (or the reverse) is a binding or
  runner bug, not a contract question.
- `node scripts/ci.mjs` runs the Rust suite and the Node 22 contract in the fast gate. Node 24, Bun and Deno run
  under `--release` (see the `omni-gates` skill).

## Reading a failure

A failure prints the scenario id, the step index, its action, and expected against got. Then:

1. A `read ... until` that timed out never saw its marker. Look at what was read: a missing marker usually means the
   child failed to start (an error on stderr) or the fixture got a bad verb (`FIXTURE-ERROR`, exit 99).
2. An `os` step that failed under load: check for PID reuse before suspecting a leak (`omni-gates` skill, triage
   step 3).
3. An `elapsedMs` bound missed only on a slow runner: the bound may include process start-up. Report it to the
   lead. Never widen it yourself.
