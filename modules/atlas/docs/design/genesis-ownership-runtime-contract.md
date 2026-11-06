# Session-input pilot — runtime contract and closure gate

Status: IMPLEMENTING; not published, CI-accepted or consumer-accepted.
Research bytes: [accepted chain](genesis-ownership-results/README.md).
Scope: Session input admission/promotion only. No repository-wide coverage claim.

## Axioms and invariants

1. One CAS and the existing governed emit door; no parallel trust service or new fact family.
2. Publication requires existing truth, actor/scope, incumbent and full ratification gates. Review
   records in CAS are evidence, not credentials: their presence alone cannot publish anything.
3. The carrier is an advisory in the existing `ownership` slot. Its claim is exactly
   `Scoped ownership manifest for ${scope}` and its optional `ownership` field is the manifest CAS hash.
   Bodies do not enter ordinary one-line claim bands. Door-derived `composed` only removes the fast path;
   it does not invent contention, lower risk or change ordinary advisory governance.
4. Read publication comes only from per-claim receipts in the existing provenance-filtered projection.
   Low-level `readOwnership(store, hash, ...)` is a CAS validator, **not** a governed publication API.
5. Manifest entries select exact artifact hashes. Required dependencies bind **result** hashes, whereas
   navigation links are consultation aids, never build edges. Required closure cycles refuse.
6. A result binds body **bytes**, authority, `validity`, gaps and evidence. Do not use CAS-excluded
   `status`, `grounding` or `freshness` fields for semantic identity. Strict shapes reject extra keys.
7. A receipt binds a contract, named input versions, required dependency results and at least two distinct
   reviewer identities with matching PASS criteria/result/input bindings. These structural checks do not
   authenticate a reviewer or prove semantic correctness; governed ratification remains necessary.
8. Host input versions are computed, never echoed from a receipt. `file:` means source/recipe/contract
   bytes; `members:` means Git-visible scope membership. Unknown, unreadable or empty membership holds.
9. Current reads validate the complete required closure. Historical reads are explicitly labelled and
   skip current-input comparison only, not integrity, scope, review or dependency checks.
10. Exact bodies/sections either fit the requested byte budget or refuse; no silent truncation.

## Inputs and outputs

Input objects are the version-1 closed shapes in `knowledge/src/ownership/types.ts` and `shape.ts`:
body, result, contract, review, receipt, artifact and manifest. Every reference uses kernel CAS identity.
The corpus importer must preserve accepted producer bytes and identify any lead-authored adapters.
It must not represent a new review of transformed bindings as a historical research decision.

The runtime exposes `ownership.index(scope, need)` and `ownership.read({ scope, need | key, section?,
maxBytes, historical? })`. The index returns metadata only; it explicitly admits that local body bytes
were verified. A missing publication, untrusted projection, malformed carrier, unavailable input,
drift, changed required result, blocked validity, wrong selection or over-budget body returns HOLD.

## Executable acceptance spine

| ID | Required proof | Existing or planned oracle |
| --- | --- | --- |
| RP-1 | Exact bytes, identity, review/input bindings, closure and section boundaries | `knowledge/test/ownership-read.test.ts` |
| RP-2 | Raw CAS cannot publish; refusal before untrusted reads | real disk governed-access tests |
| RP-3 | Authorized/no-token, unauthorized, malformed and stale publications refuse; ordinary authored fast path survives | actual emit/check parity tests and `fastpath-promotion-origin.test.ts` |
| RP-4 | Composed runtime uses the same store/provenance/input oracle for check, emit, promote and reads | composition path and remote typecheck/tests |
| RP-5 | Source, recipe and membership drift hold; same-result receipt renewal reuses downstream; changed result propagates; independent scope stays reusable | core controls plus real-entry integration run |
| RP-6 | Accepted pilot bodies are imported exactly and published only by the existing door | bounded importer receipt and exact body comparison |
| RP-7 | Cold consumer answers calibration/reserved needs without source discovery, with actual read traces | withheld `genesis-ownership-oracle.md`, same persistent Terra judges |
| RP-8 | Independent review of contract/diff, grouped remote tests, guards and final integrated epic | exact request/run/head/result receipts |

## Stopping conditions and DoD

Do not expand mining, install a live skill, claim repository ownership or call the pilot closed until
RP-1..8 have actual evidence. Missing owner policy is not authorization to alter the running store;
use an isolated real store/policy for the bounded experiment and label that limit. Any failed gate is
a named blocker; fix it without rewriting accepted producer bodies or silently replacing the judges.
Run grouped scoped CI during development and one integrated epic only after implementation/review closes.

## Reviewer allocation — owner steering

The owner questioned duplicating the entire audit in both Terra sessions. Going forward the same
persistent judges have complementary briefs: Terra 1 owns technical correctness, authority and refusal
paths (RP-1..4); Terra 2 owns consumer usefulness, coverage and incremental reconstruction/reuse
(RP-5..7). RP-8's actual run/head/receipt verification remains the lead's obligation. Shared critical
binding/integrity questions or a disagreement may receive a second opinion; ordinary checks are not
automatically repeated. Previous dual decisions remain intact, not retrospectively reclassified.
The existing structural review gate is not silently weakened by this work allocation: a PASS record
must still state exactly what its bound criterion and review actually establish.
