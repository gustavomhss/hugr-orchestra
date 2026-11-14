# S4 shared release selection — 2026-11-14

## Decision

**Selected reusable release pin: `20261111-v3-fresh-s4-r3`.**

This is the only exact S4 runtime release currently published in the shared discovery location. Select it as the **interim, bounded shared runtime pin**, not as a claim that S4 is complete or that r3 supports every source in the 2,220-path S4 population.

- Discovery branch: `genesis-fresh-s4`
- Discovery snapshot / release-file commit: `6f643bc05245ebe912d52cbdd8347ce1e5b0046e`
- Release path: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json`
- Release file Git blob: `7513fcca63664ca02094e9ed9b8fab090c20295d`
- Release ID: `20261111-v3-fresh-s4-r3`
- Runtime code candidate: `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`
- Shared controls candidate: `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553`
- Shared controls receipt commit: `8a041ca66982dcc2b89aaed46ebe347cb3de57db`; receipt SHA-256 `56358fb679b28f9f06b15f6c06959058c5aa9a65aec13674fb148b964586f330`

Consumers must pin the release-file commit and read the exact release file; do not follow a moving branch head or silently substitute another candidate. Each consuming session still uses isolated state and must establish its own exact package/binding/authority as required by the protocol.

## Why r3, and what it proves

The r3 manifest records separate `PROVEN` capabilities and receipts for:
- native import/prepare of one real L1A artifact;
- runtime binding for that exact prepared candidate;
- governed publication in the isolated authorized state;
- index and read of that artifact;
- common cache/reuse, affected rebuild and failure/resume controls on candidate `7102f2e...`.

The bounded operation receipts are in commits `283b6e5efeadfef99f202f18eab72435ef7d9771` (prepare) and `6e43247103ac36e5adb635f2fccde2e61480c56d` (binding and isolated publish/index/read). The shared-control receipt is in `8a041ca66982dcc2b89aaed46ebe347cb3de57db`.

These are capability proofs at their stated candidates and scopes. They do **not** mean the entire S4 package was admitted, that the four L4 artifacts are indexed, or that an independent ownership consumer and full-package maintenance have passed. The r3 manifest itself explicitly limits the sample operations to one native L1A artifact and the common controls to synthetic fixture producers/reviewers. It also excludes claims of arbitrary power-loss, distributed concurrency and a universal chronological producer-version fence.

## Compared S4 candidates

| Candidate | Exact evidence observed | Selection |
|---|---|---|
| `genesis-fresh-s4` | Current branch contains the r3 release plus later R4 source-delta work. The release file remains byte-identical (blob `7513fcca...`). | Selected only through the immutable r3 release pin above; branch HEAD is not the release identity. |
| `genesis-s4-resume-unit-20261114` | Two commits ahead of its recorded starting S4 HEAD `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`; adds `evaluation-admission-maintenance-20261114.md` and `resume-handoff-20261114.md`. It leaves `runtime-release.json` and `handoff.json` byte-identical to the existing S4 state. Its own handoff says r3 remains current and no release upgrade was made. | Not a new runtime candidate; reuse its maintenance note as supplemental documentation only. |
| R4 large-input source delta on `genesis-fresh-s4` | `producers/runtime-r4/candidate-manifest.json` blob `996de7fc4665905b98e4d34c73bda73a403d5999`; base `6f643bc05245ebe912d52cbdd8347ce1e5b0046e`; patch SHA-256 `fd2aa021204689cdf844fe5a70f0be37db0d335eedf59e6a78226a67f190e0ff`. Dossier blob `4a82fac6c0b0464bbacbd5ccbbb1a09b5557aabc` labels it `SOURCE_DELTA_DELIVERED_RUNTIME_NOT_RUN`; product tests are `NOT_RUN`, generated files were not edited, and remote writes were false. | Not selectable as a shared release yet. It is a source delta, not an executed, bound, reviewed and published runtime release. |
| R4 checkpoint `22815b6821dce26562624b4711c705c7cd786268` | Adds the S4 `handoff.json` checkpoint. The handoff still has `candidate_revision: null`, status `R4_SOURCE_CANDIDATE_PENDING_ACTIONS_AND_INDEPENDENT_REVIEW`, and open obligations. Reconciliation REPORT records Actions run `43154719978` as completed/success on this commit. | The green hosted run is reusable evidence for that exact checkpoint/gate only; it does not turn the null R4 candidate into a published release. No CI was run by this task. |

## Compatibility boundary and required follow-through

R3's native input observer retains the existing 256,000-byte source-observation bound. The R4 dossier proposes a 2,097,152-byte bound for the ownership-input path while keeping the generic 8 MiB native read cap and the maintenance driver's 256,000-byte self-read cap unchanged. The larger-source delta matters to S4's full corpus, but its manifest/dossier explicitly say runtime/product validation remains unrun. Therefore:

1. Other slices may reuse r3 only for source inputs and operations demonstrably within r3's recorded bounds, and must cite the exact release pin and its limitations.
2. Do not represent r3 as sufficient for the entire 2,220-path S4 population or as the final shared implementation for large inputs.
3. The S4 owner must finish the R4 candidate as an exact Git commit, run the required hosted Actions gates including generated parity/guards, obtain independent runtime binding decisions for the exact candidate, reconcile affected knowledge versions, and publish a new versioned `runtime-release.json` with receipts before consumers migrate.
4. Independently close the S4 knowledge package and obligations: final J1 disposition after the supplement, all 15 artifacts (including four L4) in the exact package, prepare and two exact bindings, governed full-package publish/index/read, independent consumers, own maintenance, and final seal. The current S4 handoff still lists these open.

## Ownership / duplicate-work check

- The control reconciliation REPORT at commit `85f10964d08feb09b9971cf2c25702cd40fc6078` records the S4 resume branch as PARTIAL and the active conversation state as UNKNOWN.
- The resume handoff confirms it did not upgrade r3.
- Branch search found `genesis-fresh-s4` and `genesis-s4-resume-unit-20261114`; no pre-existing `genesis-s4-release-selection-20261114` branch was found.
- Private conversation/session activity is not observable through the GitHub evidence used here. UNKNOWN is preserved as UNKNOWN; no inference of inactivity or completion is made.

## Protocol basis

Read the S4-specific `fatia-4.md` at protocol commit `ee2521a5b966bd505cc95bd1c733e09e12f33531` (blob `ec4698de9d693688a280d729d29b10cea02ef4ee`), plus the applicable release/transport/runtime/integration/handoff sections:
- `references/transport.md`: shared package shape, exact references, review/binding distinction, and S4's common adapter responsibility.
- `references/runtime.md`: S4 release discovery path; each release must pin source and candidate commits, capabilities and receipts; consumers pin exact release commits; PROVEN is limited to stated receipts.
- `references/integration.md`: ROOT selects sealed handoffs by SHA and uses the real S4 release, without inheriting pilot PASS as global acceptance.
- `references/handoffs.md`: candidate_revision is the actual executed implementation commit; null is not approval; exact refs and limits must be preserved.

## Scope exclusions

This was a finite documentary selection only. No implementation, test, CI, runtime operation, binding, publication, semantic review, merge, deployment, branch mutation outside this branch, or access to private data was performed.
