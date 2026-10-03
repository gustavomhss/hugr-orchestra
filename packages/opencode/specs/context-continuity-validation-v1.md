# Context Continuity v1: Final Validation Record

Historical checkpoint. Current runtime, recovered evidence and remaining blockers
are recorded in [recovered bundle validation](context-continuity-validation-recovery.md).

Date: 2026-10-01. Runtime source pin:
`26db4aca2cd21060e10aefe435c0fa6c8e33bac3`.

**Implemented v1. Mechanical validation and real private UI flows are verified
within the evidence scope below. Production Luna quality/adoption is BLOCKED.**
This record does not approve a merge, production readiness or a SOTA claim.
Typed Luna v1–v4 produced no accepted artifacts and no candidate semantic QA.
The earlier [r3 validation](context-continuity-validation.md) is historical evidence
for its own source/framing; it cannot certify this checkpoint.

## What Is Implemented

- The maintenance fork is ephemeral background model execution, with an independent
  producer ID but no stored child session or public maintenance timeline. The parent
  continues its own work; continuity state is instance-local memory.
- `src/continuity/prompt.txt` supplies the dedicated producer protocol.
  `fork.ts` appends the body schema and receiver-specific host rules.
  `purpose: "context-maintenance"` locks trusted role/data/parameters after hooks,
  with `tools: {}` and `toolChoice: "none"`. Parent persona, skills and tools are
  not producer instructions. The reader keeps its active role and permissions.
- The producer returns one closed JSON object with exactly `status`, `exact`,
  `notes`, `reference_only`, `omissions`, `issues`. Host-owned envelopes/provenance
  and exact values are not authored by the model. `ready` denotes eligibility,
  not completion of the parent's task or quality approval.
- `Source.input` groups shared host provenance; per-unit flat source IDs, paths,
  extent, values/digests and costs remain selectors. Prior envelope/body and prior
  protected values are combined with the disjoint incremental head. Native tail
  and evaluation questions/gold are not producer input in the quality harness.
- The host copies selected eligible values from that same parent catalogue.
  Decoded strings remain exact; structured-value equality does not preserve JSON
  lexical formatting. Only full user sources can be constraints; previews can be
  qualified identifiers/evidence. Unknown-extent wrappers are not exact material.
- `exactTokens:null` marks ineligibility. Non-null costs do not confer authority.
  `citationTokens` covers a non-exact active descriptor; exact frames already
  contain provenance. Request `budget.fixedTokens` plus exact costs, unique active
  non-exact citations and notes/reference JSON are planning hints. `Token.estimate`
  rounds string length / 4; the final host render must fit the 6000 estimate limit.
  These are not exact provider tokens or a fit guarantee.
- Host rendering has closed `continuity_exact_v1` frames, non-exact provenance,
  coverage/reader framing and a five-field canonical body without `omissions`.
  Producer output and rendered reader memory are different interfaces.
- Tail selection targets eight native messages, moves to a user boundary and keeps
  complete turns/tool exchanges; it need not contain exactly eight messages.
- Parent `context_recall` performs read-only own-session lookup or bounded literal
  search. Effective availability requires filtered tool presence, model tool-call
  capability and session-specific `Permission.evaluate("context_recall", sessionID, ...)`.
  Denial/removal makes `canRecall` false. An artifact with reference-only dependencies
  then falls back to full history rather than promise unavailable recovery.
- Failed, incomplete, tool-attempting, timed-out or stale maintenance does not apply.
  Protected prior exact content must carry or meet source-backed retirement checks.
  Local schema/provenance/eligibility checks do not prove entailment, complete
  selection, attribution, or genuine verification of arbitrary objectives/receipts.

Runtime interfaces: `src/continuity/{source,artifact,fork,context,service}.ts`,
`src/session/{prompt,llm}.ts`, `src/session/llm/request.ts` and
`src/tool/context-recall.ts`. See [contract](context-continuity-contract.md) and
[actual prompt pointer](context-continuity-fork-prompt.md).

## Actual Typed Luna Outcomes

Local evidence base:
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/`.
Each `continuity-quality-typed-vN/evidence/quality-report.json` indexes raw receipts,
catalogues, decoder diagnostics, source/SDK pins and frozen baselines.
`RESULTS.md` records v1/v2; v3 `RESULTS.md` is an offline selector audit, while
v3/v4 `LIVE-RESULTS.md` records live outcomes. These phases all use body version 1.

| Phase | Pinned source | Actual result |
| --- | --- | --- |
| v1 | `756440441509785331ded8438052244ad19fa94e` | Original estimated input 333571 exceeded 272000 limit in three guarded attempts. Two holdout forwards returned HTTP 400; no verified provider completion. |
| v2 | `a81b816b61524013301667bfc080d3e73b1766a4` | Five forwards: four verified completions, all invalid; one holdout timeout. Unknown wrappers and an invalid `exact.reason: decision` prevented acceptance. |
| v3 | `aba98b0ab6a8d166396d5ecce8388e0454f23e16` | Five forwards: three verified completions, all invalid; two holdout timeouts. Unsupported references despite `canRecall:false`; one `ready` body also had nonempty issues. |
| v4 | `26db4aca2cd21060e10aefe435c0fa6c8e33bac3` | One original-1 pilot: verified completion, rejected `missing_source`; remaining original/holdout calls stopped. |

V1 exact initial transport/parameter cause is unconfirmed. HTTP 400 survives in
the raw receipts and v2 `evidence/v1-inspection.json`; provider code/type/body and
exact cause did not survive the initial observer. An empty-body `invalid_json`
diagnostic does not prove Luna generated malformed JSON. Later output-policy fixes
do not retrospectively establish the cause. Guard timings are not provider latency.

V4 `evidence/original-1/summary.json` records HTTP 200, actual response model
`gpt-5.6-luna`, terminal `response.completed`, 262839 input tokens and 1784 output
tokens **including** 484 reasoning tokens, with 36938.590044 ms pipeline duration.
`artifact-guard.json` records actual-fork rejection and strict `missing_source`.
S1454 was selected as evidence with unknown extent and `exactTokens:null`.
S014, S015 and S016 were also selected as constraints with `role: tool` (full
extent, cost hints 185/188/187). Their separate authority violation does not change
the decoder's first reason. No rejected body was repaired, applied or graded.

V4 stopped after the pilot: no holdout, no continuation, no timeout extension,
no candidate QA. Across all typed phases, accepted artifacts and candidate QA
executions are zero. Candidate quality scores, critical errors, hallucinations,
newly lost facts, accepted exact fidelity and end-to-end savings are **unavailable**,
not zero scores. Diagnostic selections/render estimates are not accepted fidelity.

Frozen historical original baselines were 29/30 in three rounds, using 55281
provider input tokens. q01 `project_handle` truncation already occurred in the
full-history baseline. Holdout was 30/30 with 71741 input tokens; its two replicas
share one historical baseline/history/question. These were not new baseline calls.
Earlier plaintext 29/30 candidates cannot approve the typed implementation.
Detailed completed-call usage and failures remain in the
[measured research register](context-continuity-research.md#measured-typed-register--2026-10-01-addendum).

V4 source subset fingerprint (1028 pinned runtime files):
`45f2b5f5818ccb04b740d25998f0e434b1925724424912317e5f41009367b53e`.
Captured assembled producer-role hash:
`485c0854cbbe943cf8ecd5a8af8af056fcc76034490a62881f7b708aabb10847`.
Decoder-generated body-schema hash:
`5dbdc3e65f1105489b07f33d73f3667496c42b38f9e3edb73b574ea3ed1b3f79`.
`evidence/final-verification.json` records immutable lineage, source/SDK pins and
terminal receipt checks; `evidence/calibration/` records positive/planted controls.

## Actual Private UI: r4, run-6

Evidence root: `continuity-user-validation-r4/run-6/` under the same local base.
`final-report.json` records `ACTUAL_PRIVATE_UI_PASS` at the runtime pin above.
Real private Electron DOM click/fill/keypress created the conversation, physically
selected qualified `test:test-model` after its visibility toggle, sent prompts,
approved tools, stopped, reloaded and reopened the same session through Home.
Application API observations were GET-only; real DOM approvals made legitimate
renderer permission POSTs. Provider controls affected only the deterministic fixture.

| Recorded quantity | Actual run-6 |
| --- | ---: |
| User DOM sends | 23 |
| Provider requests | 33: 25 parent rounds, 7 maintenance, 1 title |
| Durable messages / completed real tools | 48 / 2 |
| Screenshot / ARIA / text triples | 26 |
| DOM positive controls / observed hits | 12 / 24 |
| Rejected wire mutants | 5 |
| Observed private-marker leaks / unexpected provider requests | 0 / 0 |

The detector calibrated persistent text, same-task removed nodes, old character
data and overwritten accessibility attributes in the actual renderer. Five mutants
of captured parent wire failed: missing artifact, malformed exact frame, foreign
provenance, missing native tail and stale producer. Zero findings are bounded by
that instrument and observed run, not a universal absence claim.

Observed sequence: parent replies while A is held; stale A discarded; B applied;
C incremental maintenance carries protected prior content with a disjoint head;
D tool attempt rejected; E partial stream/error preserves prior valid context;
K cancelled with the actual parent Stop; next Send frees the slot and L applies;
reload and Home reopening preserve the same full transcript. Restart means next
user Send after Stop, not a process restart or persisted continuity-artifact reload.

Opaque recall `NEVOA-4R8K` was absent from normal active request context and recovered
by the real built-in, using original stored IDs:

```json
{
  "message_id": "msg_0f827ea69001DHTnxMnrL2HtKc",
  "part_id": "prt_0f827ea730016DrX2D0VHjE4lV"
}
```

Parent session: `ses_f07d84b0dffekkM4WP1ZtOnUDw`. Actual DOM Allow Once returned
HTTP 200 for the own-session permission route. Observed tool call
`call-parent-context-recall` returned `status: found`, `extent: stored_document`,
`complete: true`, field `content`. Completeness means that stored JSON document,
not the complete original external resource. Parent Read used a separate real
Allow Once route and completed; maintenance still had no tools.

The deterministic provider returned correct-schema six-field artifacts from actual
source wire and reported **synthetic** 50000 prompt tokens to trigger maintenance
(ordinary parent requests reported 100). This is wiring/threshold evidence, not
actual 50000-token load, Luna inference or Luna semantic quality.

Full tracked-source fingerprint (different scope from the quality subset):
`e71ff7ff93e4eede3ce357c1b9d4e332f74d713af2cdcaa7a8eedf797f05eaac`.
Locally source-built executed artifact SHA256 values:

| Artifact | SHA256 |
| --- | --- |
| `packages/opencode/dist/node/node.js` | `2cbc78db0823be15a44ff2bf742a676ae906534c809ff2ddd7faa74138fca803` |
| `packages/desktop/out/main/index.js` | `f2b519bc82c89d1e595ef9320e076c1e29642b073c96592e88f25550f077caec` |
| `packages/desktop/out/main/sidecar.js` | `a88f9e956db688d818f98233b3488ccb7f3434e9d06a701e98e763d95dde8226` |

`OPENCODE_SIDECAR_V2=0` selected the fresh V1 utility backend. Actual sidecar path
is recorded in `final-report.json`; provenance binds binaries to the pinned source.
Run-6 `processes.json` records isolated Electron PID/PGID 1959 and harness PID/PGID
1960. `cleanup.json` records exit 0 for both. `cleanup-verified.json` records live
positive-control PID 24348, no remaining owned group members and successful
post-cleanup binding on ports 19394 and 9234. This establishes owned-run cleanup,
not cleanup of unrelated applications or a current host-wide process census.

### Evidence File SHA256

Paths are relative to the local evidence base above. These hashes identify receipts
read for this record; they are distinct from source fingerprints and build hashes.

| Evidence file | SHA256 |
| --- | --- |
| `continuity-quality-typed-v1/evidence/quality-report.json` | `b1107388e5b813bc1666650f69a1e5c159b6eb02cea29688fedbc3b3b3cc69e8` |
| `continuity-quality-typed-v2/evidence/quality-report.json` | `be7f52576321c967cfb3f3a01ddab9592c23e896a1e368a564fa6f47cc3bbe79` |
| `continuity-quality-typed-v3/evidence/quality-report.json` | `5ac4b7d7b3c2d4e223206064adfcd745d265ba0be6907e2765936bce10d353d8` |
| `continuity-quality-typed-v4/evidence/quality-report.json` | `9ff304ab4ba6c157f5346bdf2bcdeecaa6396c1aa9e9f4a6a1c74d4d44f0439f` |
| `continuity-quality-typed-v4/evidence/original-1/summary.json` | `31cd1a393795403978049aaed7e89ef160c86043929d84c83e339a67d0f2886a` |
| `continuity-user-validation-r4/run-6/final-report.json` | `e61524d816d10dbf265f633ff4a1e26df2fb96209bb406e59da464371f176bd8` |
| `continuity-user-validation-r4/run-6/cleanup.json` | `8db31724527c903dc33adfbf464f7151af3ed36863149e8afdcabb06f5eb8524` |
| `continuity-user-validation-r4/run-6/cleanup-verified.json` | `3c96e04c16dc47afb0c8d6efae0dd7ea57961cf2a1a65b6010870b345fea7103` |

## Checks, Integration and Open Decision

The lead ran package typecheck successfully on this runtime checkpoint. The scoped
continuity/request/recall suite completed with 194 passes, zero failures and 2667
assertions. Legacy compaction regression completed with 55 passes, zero failures
and one existing skip: the disabled V2 projector case. These are local scoped
checks, not a full workspace test pass or CI-green claim. Lead mutation controls
made source ownership, fork role, own-session isolation, patterned permission,
OAuth output-policy and budget-hint assertions fail before restoration.

An initial full scoped command hit its outer 120-second shell deadline partway
through HTTP cases; the completed rerun used a 360-second shell budget. Test flags
and production's 60-second maintenance deadline were unchanged. Executed commands:

```sh
# From packages/opencode
bun typecheck
bun test src/continuity test/continuity test/session/continuity-request.test.ts test/tool/context-recall.test.ts test/tool/context-recall-source.test.ts --timeout 30000
bun test test/session/compaction.test.ts --timeout 30000
```

Completed v4 harness commands included `stage.ts`, `bootstrap.ts`, `run.ts prepare`,
`controls.ts`, `run.ts pilot`, `grade.ts`, `finalize.ts`, via
`bun --no-install --no-env-file run` from its evidence root. Inference is at-most-once;
do not rerun completed calls. `run.ts continue` was not invoked. UI build/run commands
were `python3 "$ROOT/prep.py" build` and `python3 "$ROOT/supervise.py"`, where ROOT
is the private r4 root; completed generations must not be overwritten or replayed.

[Draft PR #236](https://github.com/gmhelmold/HuGR-Orchestra/pull/236) tracks this work
and remains adoption-blocked and not merge-approved. The original
baseline was reported 97 commits behind dev; that was a historical count, not a
fresh current-dev distance. Integration with current dev remains pending.

At this historical pin, provider-native constrained JSON with source eligibility
was unimplemented. It is implemented in the later recovered bundle; its semantic
quality results remain adoption-blocked as the linked current record explains.
Adoption needs actual accepted typed artifacts, direct fidelity and downstream
semantic QA with frozen gold, baseline/shared-error accounting, recovery, repeated
compaction, failure rate, usage and latency. Mechanical/UI success cannot substitute
for those measurements. A cold lead must verify raw JSON, source pins and build
receipts rather than trust this author's report alone.
