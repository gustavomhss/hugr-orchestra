# Lucy fix-review — partial A04 contract

**Status: frozen contract and tests-only predecessor, source review approved.**
Production work remains gated on hosted package types and the intended baseline
assertion failures. Source review alone does not authorize implementation or
qualify runtime behavior.

Baseline: qualified integrated source `2ec8b95d499b6bca3b25094ff388b04b659f557e`,
tree `ca30822f4e55b47262807374886003cc6e53ac53`. Merge
`2a9a60c0695e6bae5aaccf02000179307632faec` has identical source bytes.
The public entry already accepts the `fixReview` input shape; the controller and
Store currently refuse it. This contract gives that existing route a bounded,
persisted retest. Implementation requires a compiling hosted assertion RED.

This is a partial A04 delivery. Scoped engagement probes remain unqualified and
require a separate real predecessor/execution/retention gate. This phase neither
closes that obligation nor declares the wider Lucy go-live complete.

## 1. Public route and authority

The only entry is the registered `maestro_request_review` with the existing
strict `ReviewEngagementPolicyV2.Input` and `kind: "engagement"`. Its existing
`fixReview` is exactly `{ reportID: Digest, findingIDs: NonEmptyString[] }`:
1–64 distinct IDs, a lowercase 64-hex report ID, and no extra properties.
The profile must equal the predecessor's `audit`, `diligence`, or `artifact`.
`compliance` keeps its existing refusal. The new revision is an existing local
Git reference; the route does not install, fetch or accept an executable command.

The authority order is fixed:

1. Check the actual Maestro caller and permission for this request and
   `maestro_read_review_evidence` using the original Session, agent, assistant
   message and tool call. Do not fabricate a nested tool invocation or context.
   Explicit denial precedes prior-body acquisition, new Git reads and native work.
2. Compute the existing Store identity and inspect its existing metadata key.
   A different input with the same parent/requestID is
   `engagement-request-conflict`, including ordinary-to-fix and fix-to-ordinary.
   A still-authorized terminal retry validates and returns its own stored bytes;
   it does not look up the old request again or refresh source/settings/catalog.
3. For a new input, use `Store.lookup(parent, reportID)` with the existing SQL
   placement restriction. Missing, other-parent and otherwise unowned reports
   are all `engagement-fix-prior-not-found`; disclose no old report or source text.
   Check terminal completion, ordinary report kind, profile and selected IDs.
4. Admit under the same `lucyEngagementV1` key and deterministic lead identity.
   The existing owner/follower and exact model admission rules still apply.
   Start one deadline in that transaction. A host-created pristine lead may
   precede admission, as on the ordinary route; no verifier/provider/analyzer
   runs before complete predecessor validation.
5. Read and validate the entire prior receipt/body closure under that deadline,
   including the actual v3 variant journal and semantic proofs. Only then select
   the requested findings and bind their immutable prior authority in v4.

Only open findings in the fully validated ordinary report are eligible, at that
report's original tier and evidence bar. A valid Quick finding is eligible but
is not relabeled independently confirmed: its fix disposition is explicitly
independent-verification-unavailable under the unchanged zero-verifier budget.
IDs not present are `engagement-fix-finding-invalid`; arbitrary URI, command,
brief text and model confidence grant no authority. A previous fix result cannot
be a predecessor in this phase (`engagement-fix-prior-kind`). A later retest still
refers to the original ordinary report/IDs. This avoids recursive authority.

State-v1 remains readable historically, but cannot supply evidence it never
retained: `engagement-fix-prior-evidence-unavailable`, detail `legacy-record`.
State-v2/evidence-v1 and state-v3/evidence-v2 are eligible when fully valid.
Corrupt predecessor metadata, bytes or semantic links produce the existing
`engagement-evidence-corrupt`. Selection cannot excuse corruption elsewhere in
the required old closure.

Revoked permission may prevent a retry from being disclosed. It never permits
reexecution, migration or replacement of its frozen result.

## 2. Exact versions and wire types

All objects decode with `onExcessProperty: "error"`, including nested objects.
Digest is lowercase 64-hex; OID is lowercase 40- or 64-hex; counters are finite
safe nonnegative integers; line numbers and byte sizes marked positive are >0.
Arrays preserve stated order. Canonical JSON and SHA-256 use the delivered
`ReviewEngagementReportV2.canonical/digest` functions; digest already canonicalizes.

`review-engagement-state-v4` is **fix-only**, in the same key, with the exact
common fields of delivered state-v2: identity, input, owner, optional exact
model, budget, optional source, children, state and optional output. It requires
`evidence: {policy:"required-completed-v1", receiptID?:Digest, bytes?:positive}`
and `fix:{policy:"fix-review-v1", prior?:PriorBinding}`. It has no `variants`
field. Input must have `fixReview`; ordinary admissions continue using state-v3.
Prior is absent only before validated binding or on a terminal stopped before it.

`PriorBinding` has exactly these fields:

| Field | Exact value/type |
|---|---|
| policy | `"fix-review-v1"` |
| bindingID | Digest, formula below |
| reportID / receiptID | Original report ID / actual prior receipt blob ID |
| receiptBytes | Positive original receipt byte length |
| priorStateSchema | `"review-engagement-state-v2"` or `"review-engagement-state-v3"` |
| priorInputHash / priorSourceSha256 | Validated original identities |
| authoritySha256 | SHA-256 of the canonical complete prior state projection described in §7 |
| profile | `"audit"`, `"diligence"`, or `"artifact"` |
| executionTier | `"quick"`, `"standard"`, or `"deep"`, actually executed |
| tierSha256 / catalogDigest | Canonical digests of the retained actual Tier and final analysis catalog |
| findings | 1–64 `{findingID, findingSha256}` pairs in requested input order |
| requiredFiles | Sorted unique exact admitted regular paths derived in §3 |

`bindingID = digest({schema:"review-engagement-fix-prior-binding-v1", inputHash,
...bindingWithoutBindingID})`. `inputHash` is this new fix input, never the prior
one. Finding digest covers the complete old finding, including evidence/history
fields. Input order remains part of the existing inputHash; work scheduling may
sort a separate list without rewriting the input or binding.

`review-engagement-fix-result-v1` has exactly:

```
schema, requestID, inputHash, sessionID, status, profile, budget,
prior?, source?, dispositions, citations, questions, notExamined, reportID
```

`status` is completed/cancelled/expired/failed. Budget, Source and Citation use
the delivered strict schemas. A completed result requires prior and nonempty
Source, exactly one disposition for each selected ID, and no other IDs.
There is no Card, merge verdict, ordinary finding rewrite or behavioral decision.
`reportID = digest(resultWithoutReportID)`; output is canonical JSON verbatim.

A disposition is one of:

- `{findingID, priorFindingSha256, disposition: open|resolved|dismissed|question,
  reason:NonEmptyString, examinationID:Digest}`;
- `{findingID, priorFindingSha256, disposition:"not-examined", reason}` where
  reason is exactly independent-verification-unavailable, verification-budget,
  region-unavailable, native-runtime-unqualified, runtime-unavailable,
  recipe-incompatible, or probe-unqualified.

Questions are `{findingID,question:NonEmptyString}`; a `question` disposition has
one matching question. Gaps retain the existing `{item,reason}` nonempty strings
because honest underlying analyzer/refusal details are preserved as data, not
an open command, disposition, authority or routing vocabulary.

Stopped results have empty dispositions, citations and questions, never a
partial judgment or receipt. Prior/source may be present only if actually bound
before stopping. They include `engagement:remaining` and
`engagement:evidence-publication` with time-box/cancelled/failure as applicable.

The test-only schemas in `test/fixture/lucy-fix-review-schema.ts` spell these
strict DTOs against already delivered imports. They are not a production shim.

## 3. Source, tier and catalog pin

Derive requiredFiles only after validating the predecessor:

- every selected finding path;
- every selected original quote path, even when different from the finding path;
- every file in each selected qualified analyzer recipe.

The union is sorted, unique and a subset of original captured regular files.
New `paths`, if present, must cover all required files and cannot introduce a
prefix with no required path. It cannot silently omit a recipe input. Invalid
narrowing is `engagement-fix-scope-invalid`. New files under an old prefix are
excluded; a prefix is not persistent authority to discover new inputs.

Capture the new local Git commit and project exactly requiredFiles, preserving
the ordinary Source identity formula and sanitized Git environment. Required
file removal, rename, symlink, submodule or absent regular blob fails the entire
new request as `engagement-fix-source-unavailable`, with a path gap and no receipt.
The path gap is `{item:requiredPath,reason:"required-file-missing"}` for absent
or renamed paths, and reason `required-file-nonregular` for symlink/submodule.
Do not manufacture an empty capture or treat deletion as a clean analyzer pass.
The first failure is typed; its stored stopped retry is immutable failed JSON.

An ordinary captured regular file with an unreadable requested line range is
different: selection is already fixed, that finding becomes region-unavailable,
and the vacancy is not refilled. Blob corruption, identity inconsistency or a
collector integrity failure is fatal, not a benign missing region.

CODE reads only this immutable exact projection. Live worktree, probe scratch,
HEAD and a newly created neighboring file cannot change its answers. A returned
support outside it is a report-invalid failure, not an authority expansion.

The final retained analysis identifies the actual old catalog and execution
tier. The new request uses that **exact built tier** and its budgets, irrespective
of later board settings. Recompute the current effective catalog by the real
host path; its digest and the retained built Tier digest must equal the binding.
A missing/unbuilt tier is `engagement-fix-tier-incompatible`; any other catalog
identity change is `engagement-fix-catalog-incompatible`, before analyzer/provider
work. A completed retry never repeats this check. This deliberately favors a
named refusal over silently running a different review policy.

Quick retains zero verifiers; all findings become independent-verification-
unavailable. There is no hidden promotion to Standard/Deep. Missing qualified
runtime/recipe is a per-finding not-examined outcome; immutable input/source and
catalog corruption remain fatal errors.

## 4. Deterministic selection and independent judgment

Sort selected original findings by P0/P1/P2/P3, then finding ID in code-unit
order. Select the first `retainedTier.budget.verifiers` before reading current
regions or starting children; remaining findings are verification-budget.
One verifier Session per selected finding; no refill after region/runtime failure.
Per-Session tool/load budgets stay those of the retained tier. No new audit,
variant generation, candidate discovery or report-finishing model loop is added.

Initial bounded host reads include the original finding range and original quote
range on the new source, when applicable. They retain actual bytes, source/OID,
blob hash, line range and text digest. Existing 4-MiB blob and 400-line per-read
limits apply. The prompt exposes only this finding's bounded prior/current
evidence and offered observations, not all unrelated imported findings.

The stage prefix is exactly `Stage: fix verify, finding <findingID>.` The child
key is `fix:verify:<findingID>`, role verifier, and turn key `fix:verify`. Child
and prompt IDs use the delivered namespace formulas, not database storageID.
The actual native port selects one completed reply once and retains its
Session/prompt/assistant/text-part tuple. The new verifier is neither the new
lead nor an old producer/verifier. It enters the same two-slot execution permit
used by ordinary lenses and variants; no second pool or nested permit.

Prompt data labels and exact payloads:

- `fix finding`: `{finding: delivered Finding, priorFindingSha256: Digest}`;
- `prior evidence`: `{sourceSha256: Digest, citations: delivered Citation[]}`;
- `fix source`: `{source: delivered Source, regions: CapturedRegion[]}`;
- `fix observations`: `ToolObservation[]` from §6.

The only accepted return is exactly one `review-fix-verify` fenced JSON block:

```
{ findingID, priorFindingSha256,
  disposition: "open" | "resolved" | "dismissed" | "question",
  reason: NonEmptyString,
  supporting: (QuoteSupport | ToolSupport)[],
  refutation?: NonEmptyString }
```

Refutation is required for dismissed and forbidden on all other arms. At most
four supports. QuoteSupport is `{kind:"quote",path,startLine,endLine}`;
ToolSupport is `{kind:"tool",observationID:Digest}`. No URI/command/raw proof ID
is accepted in this model DTO. Identity mismatch, duplicate/extra reply block,
unknown fields or foreign/unobserved/corrupt support is `engagement-report-invalid`.
No-support or genuinely insufficient valid support normalizes to question;
it must not be confused with an actively forged reference.

The host reads and retains every supplied admitted quote after native settlement
and validates offered observation membership. A quote support alone authenticates
bytes, not semantic correctness. The independent verifier's retained argument
is the semantic judgment. A quote predecessor can resolve only with current
quote support. A tool predecessor can resolve only with same-recipe zero proof
and the verifier's independent judgment. A different evidence kind cannot
substitute for the required one.

Unchanged relevant file bytes cannot produce resolved: normalize such a claimed
resolution to open, reason `unchanged-inputs`, retaining the raw return and
examination. Equality never automatically resolves or dismisses a finding.
An explicit independent, supported refutation may still justify dismissed
without changing source; it is not an equality shortcut. A dismissed tool
finding needs a qualified matching current observation and quote support for
the refutation; nonzero observation must never be labeled absence.
For changed inputs, a tool finding claimed resolved with a matching nonzero
observation normalizes to question, reason `native-results-remain`; retain the
raw resolved return and examination. This does not override the preceding
unchanged-input rule or turn a supported open/dismissed judgment into absence.

Questions remain open issues; new observations do not become new findings.
Artifact R20 keeps `artifact:behavioral-eval / owner-permission`; prose asserting
permission does not grant it. There is no legal/business/human acceptance verdict.

## 5. Analyzer retest and conservative absence proof

### Public predecessor prerequisite

The delivered report verifier prompt does not expose the analyzer check's URI;
ToolItems and review_analyze pages do not contain it either. A fixture must not
derive a private cache URI and pretend that the verifier discovered it publicly.
This packet therefore qualifies one narrow prompt/context addition before its
first genuine tool predecessor: report-mode verifier briefs contain
`<data name="analyzer evidence">` with a strict array of
`{candidate:NonEmptyString,item:ReviewItem.ToolItem,check:ReviewAnalyze.Check}`,
where check.uri is required and nonempty. The check fields are exactly the
existing id/pack/version/lane/status/workspaceExecuted/reason?/uri fields.

The host constructs rows from the current final analysis only. The item
fingerprint must be an admitted source of that exact candidate after admitSources,
its class/path/range must match the candidate, and check.pack must equal item.pack.
Check/URI values are copied exactly, not derived from a filename, model text or
another Session. Only candidates in this verifier batch are exposed; existing
candidate/source caps bound the rows. An empty array is honest. This projection
adds no producer, execution authority, tool permission or receipt-v1/v2 field.
Ordinary governed PR prompts are outside this prerequisite's scope.

The native fixture may read actual raw files as a compare oracle and conformance
control, never to supply a model URI. On the baseline, when the block is absent,
it returns legitimate quote evidence, completes the real native diagnostic
control, and explicitly records that the public tool predecessor was not reached,
then fails the named `public-analyzer-evidence-unavailable` assertion.
GREEN must obtain the exact URI from that native prompt, complete a tool finding
accepted by the existing qualifiedTool gate, and then reach the fix assertions.

### Retest

Use the existing ReviewAnalysisV2.step/ReviewAnalyze.run and evidence observer,
with base=head=new captured commit and exact repositoryFiles. Capture old/new
evidence separately; no old-base/new-head runner expansion. Analyze once for the
new fixed selection; it may serve several findings with the same recipe. Other
producers retain engagement-evidence-scope-unqualified. Source-only quote fixes
still retain the real analysis result/retained/debt bodies and their honest checks.

Only the delivered qualified oxlint host-SARIF recipe on Linux x64 is eligible.
Runtime preparation belongs to explicit environment/CI setup, never this request.
Sandbox and runtime resolution remain no-acquire. Compare the actual new
preparation against the old qualified recipe, never execute stored argv directly.

Recipe equivalence is the canonical digest of this projection of Recipe:

```
{pack, template, runtime, files: files.map(file => file.path), rules, config,
 invocation, limits}
```

Preserve exact array ordering. Runtime includes pin, target and executable hash;
config includes hash/size and the exact retained config bytes must hash to it.
Invocation includes typed argv, cwd=projection, sanitized environment identity,
network=false, repositoryExecution=false and write=[]. New analysis/invocation
IDs, side, source hash and file content identities are deliberately outside this
equivalence projection; the new source is what is being tested.

Mismatch gives recipe-incompatible; unavailable runtime gives runtime-unavailable
or native-runtime-unqualified. No-config/no-input/dropped rule/no-run is not a pass.

For a zero observation, both required sides must have actually executed under
the equivalent recipe; check is host pass; exit/outcome fields are consistent;
no timeout, overflow, truncation, memory failure, unexpected stderr or failed
invocation is permitted. Retained SARIF must have the correct qualified driver,
version and invocation envelope and exactly zero native results. Check this
against raw bytes at live sealing and replay. Do not infer absence from a model,
the first retained page, `items:[]`, deduplication, rule filtering or a different
successful check. A normalized result with other native rows is nonzero even if
the old rule disappeared from the displayed first page.

Extract/reuse pure native SARIF envelope validation if necessary. Never invent
the deleted projection's cwd to remap a positive absolute URI during replay.
The conservative zero-results proof needs no fabricated path mapping. Broader
selective absence while other native results remain requires separate RED.

## 6. Exact durable judgment and observation DTOs

Existing CapturedRegion and NativeReply shapes are reused, with role verifier
for fix replies. They have new fix-specific ID domains, preserving every existing
variant ID/formula unchanged:

- regionID = digest of `{schema:"review-fix-region-v1",sourceSha256,path,oid,
  blobSha256,startLine,endLine,textSha256}`;
- replyID = digest of `{schema:"review-fix-reply-v1",inputHash,sessionID,
  promptMessageID,assistantMessageID,textPartID,textSha256}`.

ToolObservation is exactly `{observationID,findingID,priorProofID,
analysisOperationID,headProofID,baseProofID,recipeSha256,result:"zero"|"nonzero"}`.
The prior proof is an actual selected qualified old head proof, and new proofs
belong to the same current operation with their respective head/base sides.
observationID = digest of `{schema:"review-fix-observation-v1",inputHash,
...observationWithoutID}`. Unavailable execution does not fabricate an observation.

Examination is exactly `{examinationID,findingID,priorFindingSha256,
verifierSessionID,replyID,offeredObservationIDs,currentRegionIDs,rawReturn,
disposition:open|resolved|dismissed|question,reason}`. Ordered supporting IDs
refer only to actual selected/retained current source/observations. Its ID is
digest of `{schema:"review-fix-examination-v1",inputHash,...examinationWithoutID}`.
Replay re-parses the retained reply and recomputes normalization, unchanged-input
checks, offered membership, support, eligibility, scheduling and disposition.
Hash consistency alone cannot make a semantic lie valid.

## 7. Self-contained receipt and unchanged quotas

`review-engagement-fix-evidence-v1` has exactly:

```
schema, reportID, inputHash, sessionID, sourceSha256, budget,
prior:{binding,reportArtifactID,receiptArtifactID,authorityArtifactID,artifactIDs},
finalAnalysisOperationID, operations, artifacts, citations, hostProofs,
observations, examinations, regions, replies, notExamined
```

operations/hostProofs retain the current strict CODE/analysis/oxlint DTOs, but
contain only this fix's actual new executions. CODE keeps actual native
acknowledgement. Citations use the existing URI/artifactID mapping. Regions and
replies contain exactly the referenced new examination facts. Extra unreachable
proofs/descriptors/operations are invalid, rather than a place to stash evidence.

The prior bundle comprises three new descriptor kinds and all old descriptors:

- fix-prior-report: **exact original canonical output bytes**, never rewritten;
- fix-prior-receipt: **exact original receipt bytes**;
- fix-prior-authority: canonical strict original StateV2 or StateV3 terminal
  projection, containing only those original fields (including exact output,
  input, model presence, source, children, budget, evidence and v3 journal).
  No unrelated Session metadata is included;
- prior.artifactIDs: sorted complete list of the original receipt artifact IDs,
  with their descriptors and original body bytes preserved unchanged.

The new artifacts array is the sorted unique union of imported original
descriptors, those three wrapper descriptors and every reachable new descriptor.
Existing descriptor ID and SHA formulas remain. Old operations/proofs stay in
the imported receipt; they are not relabeled current or counted as new calls.
Replay validates the imported original schema/authority/whole closure, then the
new fix graph. It does not require the old Session or a transient URI to exist.

All limits are shared by the single new receipt, including the imported closure:
16 MiB per body; 64 MiB summed logical descriptor bytes; **256 descriptors total**;
128 new CODE operations; 1 MiB receipt; 4096 bytes per public page. Byte dedup does
not double descriptor quota or erase logical accounting. Wrapper descriptors
count too. Imported historical calls are not new executions but their bodies
and receipt bytes count. A collector bound/integrity failure remains fatal and
latched; it cannot become question/not-examined to publish a partial receipt.

The existing manifest/read/cursor protocol remains v1. Counts describe new
operations, union artifacts and new hostProofs, with no new public input mode.
Membership is checked before body access. Legacy ordinary receipts are unchanged.

`bindFixPrior(ticket, opaqueValidatedPrior)` is host-only, owner/time checked and
idempotent only for exact binding. The loader's private brand authenticates the
prior projection; a structural object is not an authority token. All body/Git IO
is outside SQL. The final opaque Sealed WeakMap authenticates exact result text,
fix receipt schema and digest of `{identity,input,model?,budget,source,children,
fix}` from v4. Completion CAS compares that projection and clock under ownership.
No pending/changed prior/source or forged sealed object can finish.

## 8. Terminal behavior and named failures

Pre-admission failures: engagement-fix-prior-not-found, prior-kind,
prior-not-completed, profile-mismatch, finding-invalid and prior-evidence-unavailable
(each with `engagement-fix-` prefix), existing request-conflict
and actual permission denial. They must not start a verifier/analyzer/provider.
Prior corruption is engagement-evidence-corrupt. The ordinary caller gate keeps
its existing error; fix evidence denial is engagement-fix-permission-denied.

After admission, scope-invalid (requiredFiles is derived from the validated
recipe closure under the deadline), source-unavailable, tier-incompatible, catalog-incompatible,
report-invalid and all collector failures stop the owned request; the first call
preserves its typed error, later retries return the exact failed result. The
result records the specific reason in engagement:remaining, source path gaps
where relevant, and publication failure. No completed source-less result.
Live malformed/foreign support is engagement-report-invalid; a malformed retained
fix receipt is engagement-evidence-corrupt. Unexpected defects and interruption
are not normalized to named availability failures.

Timeout uses the original fix deadline covering prior load, new capture, queue,
analysis, verifier, retained writes and seal. Owner interruption preserves its
Cause and awaits real cleanup; follower cancellation does not cancel the owner.
Stopped/no-owner reopened records do not resume provider work. Cancelled/expired/
failed readers return engagement-evidence-unavailable with terminal-status.
No late receipt may appear after a stopped CAS. The prior report never changes.

## 9. Preservation and implementation boundary

Ordinary v1/v2/v3 output, metadata, variants, evidence and replay remain exact.
Historical v1/v2 fixtures must be constructed strictly from real produced bodies,
remove only version-specific fields, then freeze bytes before reopen. They are
constructed historical fixtures, not falsely described as old runtime exports.
V1 model absence/default compatibility stays only where already delivered;
new v4 uses the exact model identity policy. Ordinary inputHash/key semantics,
governed PR behavior, R20, skill ownership, native scopes, same RUNNING=2 and
error/defect policy are preserved. No new generic Scope, provider or process mock.

Expected minimal source split after RED: a strict fix schema/report validator;
opaque prior-load/fix receipt validation beside existing artifacts; one v4 Store
arm with owner CAS; a separate fix workflow using the existing native port;
thin ReviewFanout.runFix passing its existing permit; controller/permission glue.
Do not grow existing modules beyond the 750-nonblank-line ownership boundary.
No test or implementation file is authorized by this prose without lead release.

## 10. Public causal acceptance packet

Only LLM transport is scripted. Actual Git capture, file SQLite, reopened graph,
native Session/permissions, registered tools, CODE, retained blob backend and
qualified processes run on their existing public paths. Each negative follows
an actual positive predecessor before its decisive assertion. Existing report,
variant, evidence and quota assertions are never weakened for the new route.

| Case | Required positive before the target | Decisive behavior |
|---|---|---|
| F1 | Real ordinary quote finding + readable full receipt | New capture/independent verifier resolves, v4/fix receipt complete, prior immutable, reopen replay has no Git/provider/new inputs |
| F2 | Real valid ordinary quote predecessor and actual current source | Baseline RED is the absent fix entry; GREEN must reach the independent disposition assertions: unchanged source cannot resolve, unsupported claim is question, supported refutation is dismissed, foreign support fails |
| F3 | Real authorized predecessor and existing ordinary request | Both namespace collision directions; actual denied read permission and foreign parent before acquisition; exact tier pin despite board change |
| F4 | Real completed fix and public paged bytes | Rehashed receipt semantic tamper and required body corruption are refused, restoration replays exact original |
| F5 | Linux real diagnostic/raw/check/proof controls, then the new public analyzer witness assertion | Genuine public tool predecessor, equivalent actual new execution, complete zero SARIF and independent judgment; other hosts actively prove native unqualified and use no fabricated tool predecessor |
| F6 | Actual same-recipe native control | Nonzero/changed recipe/forged raw-zero metadata cannot claim resolution; collector quotas remain fatal |
| F7 | Real prior then owned fix stage | 50/59/60 cumulative deadline, owner/follower interruption, no late receipt, stopped reopen exact; waits race original invocation |
| F8 | Fix verifier and two real eligible ordinary lenses | Same two-slot permit across requests, first lens held and second released only after fix slot frees |
| F9 | Real bounded predecessor and outside/new-file sentinels | New requiredFiles authority excludes neighbors; missing/nonregular required file fails whole request; selection cap before range reads, no refill; artifact R20 remains |
| Preservation | Real ordinary/variant bodies and strict historical v1/v2 bytes | Ordinary v1/v2/v3 replay unchanged; fix v1 legacy unavailable, v2/v3 valid old sources accepted |
| Quota | Actual many distinct completed native CODE calls and small body witnesses | Imported closure plus wrappers/new bodies shares 256 descriptors; no doubled limit or second call pool |

Hosted evidence must report per-platform actual controls/failures, typecheck,
Omni/delegation, skips and exact source/snapshot differences. A setup, syntax,
type, runtime-missing or pre-target failure is not the claimed assertion RED.

## 11. Source anchors and deferred probe gate

The baseline files fixing these boundaries are:

- tools/review-engagement.ts: public refusal, owner deadline, native port/cleanup;
- tools/review-engagement-store.ts: KEY/identity/lookup/admit/own/finish/decode;
- tools/review-engagement-evidence.ts: real permission and lookup-before-read;
- workflow/review-engagement-artifacts.ts and artifact-validation.ts: closure,
  private seal, v1/v2 dispatch, semantic validation and page membership;
- workflow/review-engagement-report.ts: completed Source, citations and probe refusal;
- workflow/review-fanout.ts: the single RUNNING=2 and built execution tier;
- tools/review-analysis.ts and Core review-toolkit/engagement-evidence.ts,
  oxlint-analyze.ts, packs/oxlint-result.ts and native-sarif.ts: actual analysis,
  no-acquire projection/preparation, process outcome and raw parsing;
- workflow/review-variant-schema.ts and variant-validation.ts: unchanged v3/
  evidence-v2 journal and native provenance semantics;
- docs/specs/lucy/go-live-plan.md, build-plan.md, go-live-coverage.md and Lucy maintenance/
  review skills: A04, preservation, R20 and source/evidence requirements.

Engagement probe remains explicitly probe-unqualified/not-built. A later packet
must first produce a real permitted predecessor through the public route, then
qualify exact admitted dependencies/config, no-acquire runtime/sandbox, actual
typed recipe/outcome/raw observation and equivalent retest. It must use an
existing closed runner, separate mutable scratch from immutable CODE, retain
real old failure/new pass and prove timeout/cancellation. A synthetic prior
probe receipt would fabricate the missing qualification and is forbidden.
