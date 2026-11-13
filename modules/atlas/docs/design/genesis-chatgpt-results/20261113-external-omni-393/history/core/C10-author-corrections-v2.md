# C10 author correction request

Original author: CORE producer. This request consolidates the two independent documentary L1 opinions for `authors/core/records-10.json` (14,688 bytes, SHA256 `8f776990fc5d8bb5141ffa034d5fae8d5707d8e72077ee4bb2d4fde7c3805e63`) at source baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Required correction — union of both judges

**C10-F1: `/1/behavior/2`, record `native/omni/crates/hugr-omni/tests/runner/suite.rs`.**

The current description calls `ran` an executed-scenario count. In the source, `sum.ran` increments after both a valid applicable scenario's `super::run` call and a read/load/validation failure classified as `Fail::Harness`. Only a valid nonapplicable case increments `other` and takes the earlier `continue`. Describe `ran` as covering every nonfiltered case, explicitly including failures before scenario execution. Preserve the passed/pending counts, valid-inapplicable `other`, discovered JSON-path count and ledger-error behavior.

Decisive baseline evidence: `runner/suite.rs:48–78`; `tests/teeth.rs:38–105` defines the regression with eleven counted cases and ten bad-scenario errors. Those are unexecuted source assertions, not measured totals.

Both judges require this correction. There is no pending decisive evidence request.

## Optional suggestions, separate from the required change

J1 suggested clarifying `/2/behavior/1`: malformed later steps are placed after an initial step that would produce a product failure, but whole-scenario validation rejects the malformed cases before that first action executes. J2 suggested clarifying `/1/behavior/1`: failed loads also contribute false to item-success aggregation, while valid nonapplicable cases are excluded. These are optional and are not additional mandatory edits.

## Deliverables and boundaries

Produce `authors/core/records-10.v2.json` and `authors/core/delta-10-v2.json`, retaining all earlier versions. Prefer the required single-field change; preserve every unrelated field and complete unchanged record objects. The delta must identify exact before/after text, changed pointers, both artifact identities, unchanged records, and literal support with baseline paths, Git blobs, SHA256 and line ranges. Update the author's delivery selection after producing the correction.

Do not edit product sources, run tests, change the unreleased L2 draft, or declare acceptance. The same two judges will independently review the corrected body.

The root operator's E1B transport errors and canonical replay are separate history. They are not defects in the author body or source baseline and require no author edit.
