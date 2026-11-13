# C07 — original-author correction request v2

Execution: `b5970766-80d8-4664-a9a8-1db37d6485af` (local execution identifier).
Source baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Original candidate: `authors/core/records-07.json`, 44,189 bytes, SHA256 `7e1431eb75856196e74ea764eacab2618d63223e543c065b7f18f89d7f41d661`, thirteen records.
Original author: `/root/omni_core_author`. Both persistent judges evaluated the complete candidate; this request conveys their mandatory author findings, not reserved consumer cases or answers. No author may approve their own correction.

## Mandatory corrections

1. `/1/behavior/1`, `native/omni/crates/hugr-omni/src/process/tests/agent_loop.rs`: the source asserts `pids.len() >= started`, an aggregate lower bound on complete PID-log entries. Descendant entries can satisfy that bound without identifying every expected started root individually. Preserve the per-command five-second bound. Describe the aggregate count and the subsequent `assert_dead_logged` checks on the PIDs actually recorded; do not claim that the test establishes individual coverage of every expected root. This was a mandatory finding from both judges.

2. `/2/behavior/0` and `/2/behavior/1`, `native/omni/crates/hugr-omni/src/process/tests/big.rs`: distinguish the actual 64 KiB `OMNI_BIG` input from the source comment's rationale comparing it with an 8 KiB socket buffer and Linux's 128 KiB per-string limit. The test does not measure or configure socket-buffer capacity, establish that EMSGSIZE occurred, or directly prove the fallback branch ran. Its output assertions require successful exit, `text.starts_with("OMNI_BIG=\"xxx")`, and `text.trim_end().len() == big.len() + 11`. They do not compare the complete returned value or validate the full framing. State the configured 30-second command timeout without turning it into a runtime result. J1 classified this precision improvement as optional; J2 requires it, so it is mandatory under the union of findings. The literal source uses `trim_end`, not `trim`.

## Versioning and evidence

Read the exact relevant source blobs and preserve all existing versions and deltas, including C06v2. Write `authors/core/records-07.v2.json` and `authors/core/delta-07-v2.json`; do not overwrite C07v1. Keep the thirteen paths, source identities, quotations and all unaffected fields unchanged. If a necessary correction extends beyond the three fields identified above, explain the exact dependency and include it explicitly in the delta; do not make unrelated edits.

The delta must bind old/new full-body hashes and byte counts, identify each changed JSON pointer with old/new text, list retained record decisions by unchanged identity, and provide decisive literal baseline excerpts with path, Git blob, SHA256, byte count and LF-based line coordinates. Check any affected L2 draft claims and either version a correction or explain why the draft remains accurate. Update the existing delivery report without erasing prior production history.

Do not access `private/`, reserved cases or judge session captures. Do not edit product sources, public staging, protocol, workflows or GitHub. Do not execute product tests. Return the actual new paths, hashes, changed fields, excerpt checks and limits. Root will verify the bytes and return the delta to the same two judges; no acceptance is implied by this request.

## Separate transport and evidence matters

The GRACE definition missing from the first source supplement is now supplied separately. Root/courier transmission escapes, wrapper text and line-coordinate corrections are operator history, not author defects. Do not alter the candidate to match a mistyped transport copy.
