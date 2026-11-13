# C08 — original-author correction request v2

Execution: `b5970766-80d8-4664-a9a8-1db37d6485af` (local execution identifier).
Source baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Original candidate: `authors/core/records-08.json`, 44,316 bytes, SHA256 `8674ea3f7227ce47cbefef5aaa26144cdf9fa09c47fd2281684e8b26460223d9`, eleven records.
Original author: `/root/omni_core_author`. Both persistent judges evaluated the complete candidate. This request conveys their actual author finding, not reserved consumer cases or answers. The author does not judge the correction.

## Mandatory correction

Correct only `/10/behavior/2` for `native/omni/crates/hugr-omni/tests/contract.rs`. The statement “Only suite errors fail the test” is unconditional and omits failure paths outside the suite error list. The test also requires successful setup, required binaries and fixture warm-up, and complete scenario accounting. Ledger-listed product failures may remain pending without entering `sum.errors`; successful completion additionally requires an empty suite error list. Preserve that distinction rather than presenting the source module comment as a complete inventory of test failure conditions.

Decisive source locations are `contract.rs:12–22` (setup and warm-up), `23–48` (ledger, runtime, accounting and errors), and `51–63` (required binaries). J1 accepted the original batch with this point optional; J2 requires this correction. The union of the actual findings therefore makes it mandatory. No new runtime execution or additional source evidence is requested by either judge.

## Versioning and evidence

Read the exact relevant baseline blob and preserve all prior versions and deltas. Write `authors/core/records-08.v2.json` and `authors/core/delta-08-v2.json`; do not overwrite C08v1. Keep all eleven paths, source identities, evidence quotations and unaffected fields unchanged. Any necessary extension beyond the one identified field must have an explicit dependency explanation and delta; avoid unrelated edits.

The delta must bind old/new full-body hashes and byte counts, identify every changed JSON pointer with old/new text, identify unchanged record objects, and provide decisive literal baseline excerpts with path, Git blob, SHA256, byte count and LF-based line coordinates. Check the L2 draft for affected claims and either version its correction or explain why it remains accurate. Update the delivery report without erasing prior production history.

Do not access `private/`, reserved cases or judge session captures. Do not edit product sources, public staging, protocols, workflows or GitHub. Do not run product tests. Return the actual new paths, hashes, changed fields, excerpt checks and limits. Root will verify the bytes and return the delta to the same two judges. This request grants no acceptance.
