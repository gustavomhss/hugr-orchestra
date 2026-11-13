# External Omni 393 — candidate index

## Scope

This candidate covers exactly 393 remaining blobs under native/omni at baseline 1cde2ff7a71bcf7aecb5d030917b577165135d38. The 33 exclusions are support-only and belong to the main coordination. Source-test descriptions are not executed outcomes. The original S5 scope, global integration and automatic acceptance are not claimed.

## Navigation

Use the stable keys below for a selected source-record batch. The complete path-to-record map is manifest.json; every source keeps its exact Git blob and SHA256. L2 notes are currently unreleased drafts; later accepted layers will add their own keys.

| Key | Records | Source range |
| --- | ---: | --- |
| omni393.core.records-01 | 6 | crates/hugr-omni/Cargo.toml → crates/hugr-omni/src/client/channel.rs |
| omni393.core.records-02 | 5 | crates/hugr-omni/src/client/channel/route.rs → crates/hugr-omni/src/client/start.rs |
| omni393.core.records-03 | 8 | crates/hugr-omni/src/client/tests/channel.rs → crates/hugr-omni/src/client/tests/lookup.rs |
| omni393.core.records-04 | 14 | crates/hugr-omni/src/client/tests/mod.rs → crates/hugr-omni/src/error/mod.rs |
| omni393.core.records-05 | 6 | crates/hugr-omni/src/io/collect.rs → crates/hugr-omni/src/io/stdin.rs |
| omni393.core.records-06 | 12 | crates/hugr-omni/src/io/tests/collect.rs → crates/hugr-omni/src/process/mod.rs |
| omni393.core.records-07 | 13 | crates/hugr-omni/src/process/run.rs → crates/hugr-omni/src/pty/tests.rs |
| omni393.core.records-08 | 11 | crates/hugr-omni/src/spawn/env.rs → crates/hugr-omni/tests/contract.rs |
| omni393.core.records-09 | 9 | crates/hugr-omni/tests/runner/command.rs → crates/hugr-omni/tests/runner/scenario.rs |
| omni393.core.records-10 | 3 | crates/hugr-omni/tests/runner/schema.rs → crates/hugr-omni/tests/teeth.rs |
| omni393.core.records-11 | 8 | crates/omni-supervisor/src/pty_unix/tests.rs → crates/omni-supervisor/src/windows/container/acl/sid.rs |
| omni393.core.records-12 | 5 | crates/omni-supervisor/src/windows/container/broker.rs → crates/omni-supervisor/src/windows/create.rs |
| omni393.core.records-13 | 7 | crates/omni-supervisor/src/windows/diag.rs → crates/omni-supervisor/src/windows/spawn.rs |
| omni393.core.records-14 | 4 | crates/omni-supervisor/src/windows/tests/job_lifetime.rs → crates/omni-supervisor/src/windows/tree.rs |
| omni393.core.records-15 | 8 | crates/omni-supervisor/tests/common/cmd.rs → crates/omni-supervisor/tests/unix_pid_reuse.rs |
| omni393.core.records-16 | 4 | crates/omni-supervisor/tests/unix_spawn.rs → crates/omni-supervisor/tests/unix_stop/member_states.rs |
| omni393.core.records-17 | 8 | crates/omni-supervisor/tests/windows_channel.rs → crates/omni-supervisor/tests/windows_pty_term/screen.rs |
| omni393.core.records-18 | 3 | crates/omni-supervisor/tests/windows_spawn/main.rs → crates/omni-supervisor/tests/windows_tree.rs |
| omni393.validation.records-01 | 15 | campaign/.gitignore → campaign/server-client.ts |
| omni393.validation.records-02 | 15 | campaign/test/omni-broker-sharing.test.ts → campaign/v10-natural-exit.ts |
| omni393.validation.records-03 | 12 | campaign/v2-kill.ts → campaign/windows-lifecycle.ts |
| omni393.validation.records-04 | 12 | conformance/FIXTURE.md → crates/omni-fixture/src/sys/windows.rs |
| omni393.validation.records-05 | 15 | conformance/scenarios/C-ENV-01.clean.json → conformance/scenarios/C-IO-01.live.json |
| omni393.validation.records-06 | 15 | conformance/scenarios/C-IO-01.merge.json → conformance/scenarios/C-PTY-02.interact.json |
| omni393.validation.records-07 | 15 | conformance/scenarios/C-PTY-03.output.json → conformance/scenarios/C-TMO-02.abort.json |
| omni393.validation.records-08 | 16 | qa/.gitignore → qa/src/control/tests.rs |
| omni393.validation.records-09 | 16 | qa/src/fetch.rs → qa/src/report/tests.rs |
| omni393.validation.records-10 | 16 | qa/src/rust/agent.rs → qa/workloads/shells.json |
| omni393.surface.records-01 | 16 | .cargo/config.toml → rustfmt.toml |
| omni393.surface.records-02 | 14 | bindings/node/index.d.ts → bindings/node/test/idioms.mjs |
| omni393.surface.records-03 | 16 | bindings/node/test/markers.mjs → bindings/node/test/worker.mjs |
| omni393.surface.records-04 | 16 | bindings/node/npm/README.md → scripts/readme-check/fixture/test.js |
| omni393.surface.records-05 | 16 | scripts/readme-check/check.test.mjs → LICENSE-MIT |
| omni393.surface.records-06 | 15 | skills/omni-conformance/SKILL.md → Cargo.lock |
| omni393.surface.records-07 | 10 | HANDOFF.md → docs/ux/WP9a-default-on.md |
| omni393.surface.records-08 | 4 | docs/adr/0004-packaging.md → docs/research/supervisor-review.md |
| omni393.surface.records-09 | 3 | docs/research/processkit-eval.md → docs/research/pain.md |
| omni393.surface.records-10 | 2 | docs/research/landscape.md → PLAN.md |

## Review and execution status

L1 production is complete and independently under review. A documentary checker accepted all 393 source bindings and rejected six deliberate artifact corruptions. Those checks are neither Omni product tests nor proof of runtime behavior. Binding, Atlas publication/read and consumers require separate exact receipts.
