# A05 — confined history and profile skill contract

Status: **focused Core/Main GREEN at integrated source `0076ad37`; landing blocked, A05 open**. The current disposition and exact results are appended below and detailed in [qualification](engagement-history-qualification.md) and [open findings](engagement-history-open-findings.md). Earlier chronological checkpoints remain historical. API reading baseline: `c3ed848aef3c0883097eb8611bbd8eb1090f41f1` (2026-11-28). This contract supersedes only the first-slice history refusal in [engagement-access-contract.md](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/docs/specs/lucy/engagement-access-contract.md). The original request, durable identity, exact file authority, time box, cancellation and permission contract still applies.

The user supplied the remaining scope explicitly in the latest message: A05/forensics, compliance, Kubeconform/83 tools and integrated acceptance. The complete old chat was not available. This packet is a concrete subset of A05, not a claim that the entire inherited ToDo or A05 has already passed.

Original remote acceptance base: `a959b3fffcbb9d1d2a36c0557f1de1b94c8a91a4`, including the preserved Activity/Omni work, TOML override, R8 probe fix and Kubeconform P1. Root and independent reviewers accepted the source packet after correcting dangling-object, metadata, proof binding, promisor control and replay-observation weaknesses. The close/rebind case is a controlled binding-lifetime test; expiry/cancellation cases exercise real completed history and later refusal, not a separately suspended native Git call. H01–H10 and final A05 closure still require the observations specified below, including preservation gates.

## 1. Behavior and ownership

The existing registered `review_history` gains a **host-owned scoped binding** for independent `audit` and `diligence` lead Sessions. PR/governed/global history keeps its existing contract. The same public input schema is reused, so acceptance calls the existing tool with unknown input and imports no future production interface.

History is a read-only forensic source. It cannot execute a repository command, start a probe, install/fetch a tool, rate developers, certify a control, manufacture a current-source quote, or convert an observation into a confirmed defect. No live network or delivery-system ingestion is added.

Explicit role decision: the lead owns cross-cutting context and the final independent report. It may read the scoped history and `lucy-audit-forensics`. Routed code lenses and independent verifiers keep their current source/skill scopes and receive neither history nor forensics by ancestry. A future dedicated forensic child is a separate scope decision; this packet creates no new child role. This choice must be approved as part of contract review and is **not** an implicit narrowing of all A05 obligations.

`artifact` is not an audit/diligence historical engagement. Its forensics/history status is **not applicable to the profile**, grounded in the existing leaf's “When: audit/diligence brief includes repository history or delivery evidence.” It continues its artifact leaf and owner-permission gap for behavioral evaluation. The packet must not enable compliance or grant all descendants of `lucy-audit`.

## 2. Authority and revision grammar

A scoped history binding carries the original request input hash, source digest, captured full commit, **exact sorted captured regular-file set**, original active/lifetime check and the original evidence collector. It never derives authority from the model's prompt or a later HEAD.

- `path` is mandatory for every operation and is exactly one admitted repository-relative file. No omission, directory, prefix, glob, absolute path, traversal, NUL/control characters, option, alternate separators or rename following may widen authority. A file captured as a symlink/gitlink is not admitted.
- Omitted `rev`, or the exact spelling `HEAD`, means the captured commit. `HEAD` is a documented convenience, **never** resolved against the live repository after capture.
- Any other `rev` is a full lowercase object ID (40 or 64 hex, matching repository object format), identifies an actual commit, and is an ancestor of the captured commit under the original object graph.
- `range` is allowed only for log/pickaxe and is exactly `<full ancestor OID>..<full ancestor OID>`. Both ends are ancestors of the capture; the left end is an ancestor of the right. The right end is the inclusive upper bound; the left is excluded. `rev` plus `range` is refused.
- Symbolic branches/tags, abbreviated IDs, ancestry/reflog expressions, leading options, symmetric ranges, dangling objects, descendant or unrelated commits, tree/blob IDs and unknown objects fail before returning or retaining history output.
- The history operation is bound to an immutable object graph. Disable replacements and grafts; reject unsupported graph-altering repository state before use. Shallow or missing ancestry fails explicitly (no silent “complete” result), and missing objects never trigger lazy fetch.
- Refuse or isolate alternate object databases, repository includes/config helpers, fsmonitor, textconv, external diff, hooks, pager, signatures, credential helpers and alias expansion. The host may copy verified objects into a private read-only projection. It must not trust arbitrary Git configuration/environment to preserve the above invariants.
- Files may be read only where that **same exact path** is a regular blob at the selected commit. No `--follow`, path-change expansion, similarity/copy expansion or historical filename substitution. A prior symlink/gitlink/missing file is an explicit unavailable segment, not permission to read its target.

Refusal errors use a stable prefix `engagement-history-` with a concrete reason. Error details do not include raw Git stderr, unadmitted filenames/content, arbitrary configuration values or secret data. Existing native Session scope refusals remain native refusals.

## 3. Four bounded operations

| op | Accepted input | Safe result |
| --- | --- | --- |
| `show` | exact admitted path; optional validated rev | Exact UTF-8 text of that one path's blob at the selected commit; no full commit, other file diff, message body, filename list or live worktree. |
| `log` | exact admitted path; optional validated rev **or** range | At most 200 captured-ancestry commits which changed that exact path, with commit ID, UTC timestamp and stable author identity digest. No arbitrary commit message/body/email/name fields. |
| `pickaxe` | same as log plus literal pattern or bounded regex | Same metadata for path-local content-change matches. Pattern never becomes a Git option or shell input. The operation cannot search unadmitted historical files. |
| `blame` | exact admitted path; optional validated rev | Selected blob's logical lines, commit attribution, UTC timestamp and author identity digest. Only same-path ancestry contributes. Never emit porcelain `filename`/`previous` fields, copied/renamed source names, unadmitted historical content, or live worktree lines. |

The author identity digest is SHA-256 of canonical `{name,email}` UTF-8 data. It supports aggregate concentration observations without publishing raw identities. It is not a person rating. If the implementation cannot establish same-path blame without following a rename/copy or a graph boundary, it must stop attribution at that boundary and explicitly mark that limited attribution; it cannot claim the line's earlier origin was examined. `complete=false` and a concrete `notExamined` entry are mandatory for any attribution/traversal boundary, even when all emitted text fits and `truncated=false`.

For `show`, non-UTF-8 or binary content is refused with an explicit unsupported-content gap. Unicode is not silently replaced. Blame line text must equal the selected admitted blob. Log/pickaxe outputs never include raw patch bodies or commit messages.

The normalized model-visible object uses:

```json
{
  "schema": "review-engagement-history-v1",
  "historyID": "<64 hex>",
  "sourceSha256": "<captured source digest>",
  "anchorCommit": "<captured full commit>",
  "op": "show",
  "path": "src/a.ts",
  "selection": {"endCommit": "<full commit>", "startCommit": "<optional exclusive full commit>"},
  "complete": true,
  "truncated": false,
  "notExamined": [],
  "text": "<normalized text as specified above>"
}
```

Optional absent fields are omitted. `selection.startCommit` exists only for a range. Canonical JSON follows the established engagement encoding. Log/pickaxe `text` is one canonical JSON object per line with only `commit`, `timestamp`, `authorID`. `timestamp` is that commit's **committer** time normalized to UTC using the ISO representation produced by `Date.toISOString()`. Blame uses only `line`, `text`, `commit`, `timestamp`, `authorID`; at an attribution boundary `commit`, `timestamp` and `authorID` may be omitted and the bound is identified in `notExamined`. `show.text` is the selected blob text.

The **complete normalized safe result** is retained up to 4 MiB, never raw unfiltered stdout. The model-visible canonical envelope is at most 32 KiB; if its text must be shortened it remains valid JSON, `complete=false`, `truncated=true`, with a concrete `notExamined` entry. The retained safe body is marked incomplete when the native process/commit walk/retention bound is reached. No silent byte or commit loss.

A call has at most 30 seconds and cannot outlive the original engagement deadline. Log/pickaxe visit/output at most 200 commits, with the limit explicit. The collector's existing 16 MiB per body, 64 MiB total, 256 artifacts, 1 MiB receipt and 4096-byte page bounds remain. CODE plus history captures share the existing 128 source-operation admission budget, not two independent budgets. Denied invocations still consume the real Session's existing tool budget.

## 4. Durable evidence and exact lifetime

Use the same owned binding instance for admission, every asynchronous read, result emission, collector retention and native completion acknowledgement. Check original active ownership/deadline after awaits and immediately before every durable admission. Closing/expiring/cancelling the binding invalidates an in-flight call. Rebinding the same Session ID never revives it.

A successful history output is not publishable unless the original collector retained its safe body. The durable receipt V2 adds optional `history` references `{historyID, artifactID}`; each points to a new `history` artifact. A receipt with no history retains its prior bytes/schema. Old V1/V2 receipts remain readable with their established semantics.

The artifact contains a canonical proof:

```json
{
  "schema": "review-engagement-history-proof-v1",
  "historyID": "<digest of identity payload described below>",
  "inputHash": "<original request>",
  "sourceSha256": "<original capture>",
  "anchorCommit": "<original full commit>",
  "budget": {"startedAt": 0, "deadlineAt": 300000},
  "sessionID": "<real caller>",
  "assistantMessageID": "<real originating assistant message>",
  "toolCallID": "<real call>",
  "name": "review_history",
  "input": {"op": "show", "path": "src/a.ts"},
  "result": "<complete normalized safe result object>",
  "nativeSettlement": {"status": "completed", "messageID": "<real settled assistant message>"}
}
```

The history identity is SHA-256 of canonical `{schema:"review-engagement-history-operation-v1",inputHash,sourceSha256,sessionID,assistantMessageID,toolCallID,name:"review_history"}`. The proof's `result.historyID` equals this identity. The descriptor uses the existing content digest/size/MIME/complete identity and aggregate quotas. The host cross-checks the actual native completed tool event, session, message, call, public input, safe result and source; it does not accept model-supplied history references as evidence. It independently validates that the proof's exact safe input and normalized selection correspond, that every selected commit satisfies the captured ancestry, and that path/source/anchor belong to the registered durable request. A native event not observed as completed is not a successful examined history operation.

Index `counts.operations` includes history captures in addition to existing operations; counts and identity must validate on every public read. A corrupt, missing or substituted proof/body/reference/native binding fails the existing evidence-integrity boundary. Completed replay after SQLite close/reopen uses original stored bytes and does not reread Git, provider, settings or prepare history. Original source, history, deadline and report bytes remain fixed after HEAD/config changes.

A history observation can support report observations/questions with its retained identity. It never replaces the current-source citation/verifier rules for findings. No `APPROVE` or governed receipt is produced by a history report.

## 5. Scope and skill acceptance mapping

Every grant must be asserted using a real Session scope **and a native tool call**; an implementation helper's returned array is insufficient. Testing one forbidden call without a positive sibling does not prove confinement.

| Profile / role | Positive leaves/tools | Required negative control / preserved limit |
| --- | --- | --- |
| audit lead | `lucy-audit`, context, spec-map, controls, report, forensics; four history ops | No diligence/artifact/compliance leaves by ancestry; no native read/grep/glob/Atlas; no arbitrary probe/command. |
| diligence lead | `lucy-audit-diligence`, context, spec-map, controls, report, forensics; four history ops | No audit variant generator or compliance/artifact grant; existing scoped TypeScript probe contract preserved. |
| artifact lead | `lucy-review-artifact` | History/forensics explicitly not applicable; audit/diligence/compliance/variants denied; R20 stays owner-permission. |
| routed code lens | Own delivered lens, allowed routed leaves and stack leaves | No cross-cutting audit/forensics/history by ancestry; each file read retains slice/captured boundary. |
| verifier | Existing class/rung-specific verification skill and source tools | No forensics/history/author transcript grant; independent verification remains independent. |
| audit variant role | Existing bounded variant node in the host-created variant Session | No grants for diligence/artifact; at most three generations and half-noise stop remain existing behavior. |
| security/agents lens | Existing actually routed security/agents leaves | Unrouted sibling, release and compliance leaves remain denied. |
| compliance | No change in this packet | C01–C03 need their own contract/RED/implementation; operational compliance remains unavailable. |

“Context”, “spec-map”, “controls”, “report” above mean exact `lucy-audit-*` leaf names, not wildcards. Existing variant/security/agents tests must be retained and supplemented where they do not prove the profile-role matrix. Their completion is not inferred from this candidate's history tests. ISO/SOC 2 remains inferred; no certification claim.

## 6. Frozen acceptance ledger

| ID | Independent observable requirement | Qualification |
| --- | --- | --- |
| H01 | Four real positive native operations in audit and diligence, with valid source/code sibling; exact captured default/HEAD and explicit ancestor; valid full-OID range. | New assertions must be RED on baseline. |
| H02 | Missing/outside/prefix/glob/traversal/symlink/gitlink path; symbolic/abbreviated/option/dangling/nonancestor/future revision refused after positive control. | No filename/content sentinel in outputs or durable evidence. |
| H03 | Live HEAD/worktree changes after capture do not alter any allowed operation. Commit-message/other-file sentinels never escape show/log/pickaxe. | Native tool completion checked. |
| H04 | Rename/copy ancestry cannot disclose outside historical filenames/content through blame, log or pickaxe. | Source-path positive plus explicit boundary gap. |
| H05 | Replacement/graft/shallow/alternates/config helpers cannot alter traversal, execute code or fetch data. | Real repository hostile fixtures; helper marker remains absent. |
| H06 | Native proof identity/digest/source/selection/settlement; all public pages reassemble; exact report/proof replay after graph close/reopen, Git mutations and cache removal. | Corrupted/missing/substituted proof fails closed. |
| H07 | Original deadline/cancel/close and close-then-rebind during suspended call yield no success or late retention. | Interruption cleanup and zero late artifacts checked. |
| H08 | Exact profile/role skill positives and negatives above; no ancestry or entry index widening. | Native tool events plus persisted scope. |
| H09 | Bounds for text/raw/commits/shared source-op budget and concurrent collection; explicit gaps instead of false completeness. | No silent skip, new budget, or leaked unfiltered stderr. |
| H10 | PR/governed history, scoped probes, legacy receipts, artifact owner-permission and existing variants/security routes stay valid. | Preservation, not a fabricated new RED baseline. |

Tests must compile against the unchanged baseline and fail on named expectations for missing behavior, not imports/types/setup/resource/platform issues. A candidate prepared here is **not** proof of compilation. Only hosted package type/test gates can establish RED/GREEN. Freeze acceptance hashes before production changes, independently review the contract/tests, then implement; repair a defective acceptance only with explicit review and a new frozen baseline.

Use isolated `lucy-scope-history` (three words). Do not touch the concurrent Kubeconform work. Linux/macOS/Windows declared targets need observed hosted results, no silent skips. Final integration still needs compliance, tools, 29-line acceptance, authenticated Grok and final epic gates. No release/promotion/restart is authorized by this packet.

## 7. Reviewed implementation seam

1. Add an optional scoped history handler to `ReviewTools.Binding`, whose lifetime is captured before awaits. Existing nonengagement bindings use the current implementation.
2. Construct the history capability from captured engagement authority and collector, with strict validation/safe normalized Git reads; never enable current arbitrary live history for reports.
3. Grant tool and exact forensics skill only through explicit profile/role policy, preserving the rest of the A05 matrix.
4. Add durable history proof collection/validation/reader compatibility under original quotas and deadline.
5. Replace the blanket “history not-built” gap only for qualified history-capable profile/routes. Unrequested, denied, truncated or unavailable history remains honestly reported.
6. Update access contract/guide/coverage only after corresponding evidence is observed.

Evidence for the gap: [current history](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/packages/core/src/review-toolkit/history.ts), [binding and tool](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/packages/core/src/review/tools.ts), [report filter](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/modules/maestro/coordination/src/v2/workflow/review-fanout-support.ts), [collector](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/modules/maestro/coordination/src/v2/workflow/review-engagement-artifact-collector.ts), [forensics leaf](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/packages/lucy-specialist/skills/lucy-audit/forensics/SKILL.md).


## Typecheck repair and full-body integrity supplement

The original tests-only source was `1c9b5fca6d54c3d40468b7b1ea1852a463d9a864`. [Baseline 46168033618](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46168033618) failed package typecheck on all three hosts before any test executed. Optional captured-source expectations and the operation enum required explicit narrowing; two files imported a Core process subpath which is not exported. This is **invalid preparation, not causal RED**. Cleanup succeeded.

The reviewed repair changes only four TypeScript test files. It uses explicit captured-source guards and the already-public `AppProcess`/`ReviewHistory` APIs for real controls, without exporting internal modules or changing production. The H06 observer still proves a real `ResearchProcess.run` span before requiring zero new Git/process/provider work during exact replay. The four other previously frozen TypeScript files remain byte-identical.

A separate H06 supplement adds one real history operation larger than the model-visible prefix. It changes only unseen tail text, preserves its length, operation/source/input/selection and native event, recalculates artifact/descriptor/receipt hashes, and requires manifest, read and replay to reject it. Restoring the original evidence must restore byte-identical public reads without provider work. Therefore the **complete normalized safe result**, including text not shown to the model, must be bound to the original persisted native completed settlement. Self-consistent artifact hashes or the visible prefix alone are insufficient. The history URI remains operation-stable; rejection cannot rely on a content-derived URI mismatch.

This refreeze integrates `f469755b33bb478693d2d1dae022c010c2e47ebc` as the current base. The two post-Kube commits changed only a Script test and the capability-assets pytest dependency; no Lucy production paths changed. The packet now inventories **50 cases across eight suites plus one fixture**, not yet qualified by execution. Typecheck and assertion RED remain prerequisites for implementation.

| TypeScript fixture/suite | SHA-256 |
| --- | --- |
| `fixture/lucy-history.ts` | `55a453d32d0039d49a974988895ca9c0d77ebc9566ad7b8d92aef53ce06d6f25` |
| `lucy-history-boundaries.test.ts` | `28a0cbf9dea0aa1793cc7307d69d093e3b20a299d2cde77aad5c9e5bf242d576` |
| `lucy-history-bounds.test.ts` | `443fd7dc6b07733ef555a3ef660566432efaca680e4573ee306757b5443a067e` |
| `lucy-history-evidence.test.ts` | `d3656fa736bceeb7abd09893301b8a684c4ed6457b26d9a3301dab18067a92dd` |
| `lucy-history-lifetime.test.ts` | `3c3fdbbdc2e3945960ca27271441cd19a2627f222417e48cc801dabaedb85427` |
| `lucy-history-public.test.ts` | `8d10e27d67507598ae31c4ac4cd2aedb4ea7b86eca5540841cd7bccdf67a65a7` |
| `lucy-history-quota.test.ts` | `2ca7aab0030e9e2521129764e141a8cc15fb4bb4e7e58a68d16f4b16ee4c6f8c` |
| `lucy-history-scopes.test.ts` | `840fa81d009a87f7ad71e9f03e45c71bc6e909aaa171786ba6a7f591fea32284` |
| `lucy-history-tail-proof.test.ts` | `56d8a4f6fb361d5a0f4833e65ffd54153c56adcd7488cbb791155734c9c5680e` |

## Bounded process prefix supplement

The existing ResearchProcess sink retains the tail of a bounded stream. Confined history must retain the beginning of oversized source text instead. A separate Core tests-only supplement, `packages/core/test/research-process-capture.test.ts` (SHA-256 `afd2f0f6f6b7c1c8a8ce03e1179045d68bc4145368e79aa9516faac8b36fa2ee`), freezes two native cases: preserve the default and explicitly selected tail with exact stdout/stderr counts; and require a bounded prefix when real output crosses the capture limit, after a complete positive control and before a post-overflow child control. It is compiled against the unchanged API using a structurally assignable input variable. It imports no future implementation.

This adds two Core cases to the 50 Maestro cases; it does not change their nine TypeScript hashes. Hosted Core typecheck and causal assertion RED must precede any new head-capture option. The proposed opt-in preserves the current process supervisor, cancellation, stream byte bound, memory limit and default tail semantics; no alternate process executor is authorized by this supplement.

## Existing public coverage expectation repair

The existing `modules/maestro/coordination/test/lucy-engagement-public.test.ts` positive report case still expected `engagement:history/not-built` for every profile. That expectation predates this reviewed contract. The only changed assertion now requires `not-examined` for an audit/diligence report that makes no history call, and `profile-not-applicable` for artifact. All capture, quote/verifier, classification, permission, scope and compliance-refusal assertions remain unchanged. Root and an independent reviewer checked the entire existing file before this repair. Its frozen SHA-256 is `30db2be9123fc862b975a66981b16b9f8691fb52c5aa6375aa30c433dc8105a5`.

The main acceptance remains at its nine TypeScript hashes above. The separate Core prefix test also remains byte-identical. [Main RED 46169235061](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169235061) passed types on all three hosts, each with 11 preservation passes and 39 causal assertion failures. [Core RED 46169869338](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169869338) passed types on all three hosts, each with one preservation pass and one causal prefix-capture failure. Neither gate had test skips; both cleanup jobs passed. The implementation is authorized by those observations and remains subject to exact-source GREEN and preservation gates.

The existing public test repair is frozen separately before any remote production publication. Its complete existing suite will run against unchanged production on all three hosts; no name filter or skip is used. Its new coverage expectations require their own observed assertion baseline. A later qualification record must distinguish this baseline from the 50-case main acceptance and two-case Core supplement.

## Imported predecessor integration supplement

An independent review of the implementation candidate identified a qualification gap: earlier fix tests exercise imported prior evidence without a history operation. A separate `modules/maestro/coordination/test/lucy-history-fix-proof.test.ts` case (SHA-256 `bff3d887d6e35d394fd75dbfc33ba5fab44c04a6a916a00e6186674e0295c9b1`) closes that observation. It uses one real diligence history read and a current-source quote finding, creates a real fix review, and first verifies imported bytes and successful replay. Both GitCli and ResearchProcess observers have real positive controls. Changing only the original native settlement's full-result digest must make the ordinary predecessor reader and all three public fix manifest/read/replay paths fail evidence integrity; restoring the native row must restore exact bytes with no provider/Git work and no CAS changes.

Chronology is explicit: this integration supplement was authored **after the first local runtime candidate**. It is an additional H06/H10 observation of an already reviewed contract, not a claim that this specific test preceded every local implementation line. Root and a separate reviewer examined its complete source and existing fixture APIs. It adds one test file without changing the eleven frozen TypeScript files. Its compiling baseline runs on unchanged remote production before runtime publication; deeper fix-path assertions may only become reachable on GREEN. No local runtime or typecheck was executed.

The prior public coverage supplement completed its hosted baseline at [46172065780](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46172065780): each host passed types and ran three preservation passes plus three expected coverage failures, 143 assertions, zero skips/delegated; cleanup passed. This tests-only source integrates `5e92c30c7c6ccfa5b0d105422a56329151fd1873`, whose concurrent Activity work has no overlap with this slice's production/test paths.

### Integration supplement preparation repair

[Attempt 46173166715](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46173166715), source `edbf4a7523cdec218e6904f6cee98665a8f981e7`, snapshot `e089970482662a2921e40ede42c23c4a51998321`, failed types on all three hosts before any test ran. The Bun `toEqual` overload rejected a comparison between the independent history descriptor's `kind: string` and the existing fix descriptor's closed kind union. Cleanup passed. This is **invalid preparation, not RED**.

The reviewed repair adds an explicit imported-descriptor presence assertion and compares the complete canonical JSON of the two descriptors as strings. It removes no field or integrity observation and changes no production API/export. Reverting that one block recovers the original test SHA-256 exactly. Root and an independent reviewer approved this delta. The replacement frozen test SHA-256 is `6a07d144dbe511da8cbbb6ab010864167e98eb1e5e1c5a44518ffecbc6c3ff28`; all eleven earlier TypeScript hashes remain unchanged. A fresh hosted typecheck and causal assertion baseline are still required for this repaired supplement.

## Reviewed candidate and operational bounds

The repaired imported-history/fix baseline is qualified at [46173610281](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46173610281), source `04deb51aae9f417509b88315863854ee4b4ad004`, snapshot `d72440b5a49467fd58136fd7394e32e71b4a3378`. All three hosts passed types and reached one causal assertion failure (native history expected completed, received error), with 14 assertions, zero skips/delegated and successful cleanup. The predecessor and quote positive controls passed before that assertion. The deeper fix-integrity observations remain GREEN obligations.

The production candidate changes sixteen source files and has root plus independent source reviews. The private bare object projection admits at most 256 MiB and 16,384 object-store entries; repository metadata reads are capped at 1 MiB. The reader limits accepted directory entries to 258 at the outer level and 16,384 across the object store. Bun 1.3.14 implements `Dir.read()` with an eager internal `readdir`, so these counts do not prove a bound on the host's directory-enumeration allocation. Source files must be regular, non-symlink and stable across bounded nonblocking reads. Acquisition registers cleanup before its post-await lifetime fence. A full native integrity check verifies copied object content/hashes before any selected history output; it shares the original 30-second call/deadline and may inspect more objects than the 200-commit forensic walk. Oversized or unsupported stores are refused explicitly with no live-store fallback. These operational limits are not a throughput qualification for arbitrary repository sizes/layouts.

Source review repaired UTF-8 BOM preservation, blocking special-file opens and unbounded metadata reads after growth. It added accepted-entry caps, while the eager Bun directory-allocation limitation remains open. It also removed avoidable large-string projection work while keeping fresh integrity checks on every public read. No frozen acceptance was changed to fit these repairs. All twelve frozen TypeScript files retain their accepted hashes. Hosted GREEN, relevant preservation and final source/hash-input checks remain required before merge.

## First production qualification and runtime repair

The first production source `ce6b319ee5a687231c6a06118a5048b7d3bb7be3` did **not** qualify. Core [46174345215](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46174345215), snapshot `6154f02d952765d73da6727c1c98bda124d587b9`, failed types on all three hosts with fifteen diagnostics from an inferred required `failure` field; none of the four selected test files ran. Maestro [46174350093](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46174350093), snapshot `93a4762e6b082f8cc918cae309d77a3de0e35602`, passed types and ran 57 cases on every host: 19 passed and 38 failed at the same native-history completed/error assertion, with 1,154 assertions and zero skips/delegated. Cleanup passed in both runs. Later assertions in these failing cases remain unobserved.

A narrow process return annotation restores the existing public `Outcome` shape without changing its execution. The scoped acquisition finalizer now awaits its release operation in an async function: the runner's [Bun 1.3.14 `Dir.close()`](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/js/node/fs.ts) returns `void`, despite the Node promise signature. Root and an independent reviewer verified both deltas. The source explains the shared failure, but hosted execution must establish the repair. All twelve frozen TypeScript files are unchanged.

This corrective source also integrates dev `6a04d4d1890a37aaf0e5559c2c1093accd7c21de`. The thirteen concurrent paths do not overlap the A05 production or frozen paths. A focused review confirms its runner-history cache does not change `SessionStore.message`: native evidence point reads still query the database and decode the requested message afresh. This is not a blanket qualification of that separate change.

A separate source review found the call-local 30-second timer ended before collector retention. The original contract still requires the complete history callback, including permit/CAS admission, to respect that deadline. A reviewed repair is being held locally while a dedicated compiling causal supplement is prepared. The initial lifetime fixtures do not prove that stalled-retention case or native Git interruption in flight. No deadline closure or final A05/GO claim is made here.

## Native error observation repair and replacement freeze

Corrective Core [46175626742](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46175626742), source `c61824e868dc05464f3bad264f79d47df77d9606` / snapshot `ac4682fc770c24876b91a3d59d0c2349278c748b`, passed types and tests on all three hosts: Linux 10 PASS / 178 assertions / 44 Omni spawns; Windows 8 PASS / 93 assertions / 14 spawns; macOS 7 PASS / 92 assertions / 14 spawns. All had zero failures/skips/delegated; cleanup passed. Head/tail and global-history behavior ran on all three. Linux alone exercised its native jail and concurrent compiler path; unsupported-platform guards elsewhere are not substitutes for that proof.

Maestro [46175630629](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46175630629), snapshot `87227ef058a5888ef58fa44837eb77639b9f333a`, passed types on all three and reached 37 PASS / 20 FAIL / 57 cases on each. Linux had 13,819 assertions / 10,921 Omni spawns; macOS 13,833 / 10,904; Windows 13,833 / 10,333. All had zero skips/delegated and cleanup passed. Real positive history, captured-scope, output/commit/quota bounds, replay/tamper/full-tail and imported fix integrity now passed. Seventeen failures had already confirmed native `state.status === error`, but the observation adapter returned empty text because it omitted the native `state.error.message`. Three separate replace/graft/shallow cases failed at native child placement identity; they remain production obligations, not adapter failures.

The replacement adapter preserves every original `content.text` and appends `state.error.message` only for a native error. The native schema (`packages/schema/src/session-message.ts`, blob `7d5c2866f2a2ad6de9e058bfb447cd9d3fdc852c`) defines that field as a string. Completed and pending projections are unchanged, and content remains visible to leakage assertions. No assertion, input, permission or runtime output was changed. Root and two independent source reviewers checked the delta; reverting that one block restores the original file exactly.

The new frozen `test/fixture/lucy-history.ts` SHA-256 is `2d3cbc345cb239d0e301c52f993594c98ccdfae3afec0bbcf7fd50825ba0efa5`, replacing `55a453d32d0039d49a974988895ca9c0d77ebc9566ad7b8d92aef53ce06d6f25`. The other eleven frozen TypeScript files remain unchanged. This repair was authored **after** corrective production execution exposed the observation defect. A new compiling hosted baseline runs on pre-runtime source `04deb51aae9f417509b88315863854ee4b4ad004`, with only this adapter and documentation changed; no earlier test-first chronology is claimed for the replacement adapter. Subsequent qualification must use its exact replacement bytes.

## Supplemental full-call admission deadline freeze

The first candidate's timer ends when the Core reader returns, before collector admission. The unchanged contract requires the original 30-second call budget to cover the complete callback, including time queued for the shared permit and CAS retention, while preserving the original engagement deadline. A call completed on time may receive its native turn ACK later under that engagement lifetime. The local repair is held until this compiling causal supplement is qualified.

Two separately reviewed cases are frozen in `modules/maestro/coordination/test/lucy-history-admission-deadline.test.ts` (SHA-256 `fe8bc3854a5349a7e38b9bb2c1b8126fcca1ae006fb933a8e596bbaa38b0bac2`). The fixture adds an optional `afterFsLink` observer in `test/fixture/lucy-engagement.ts` (SHA-256 `47e42d3ef0fa2739f2dbf41093cc023ce6fe3e139387634319be98e3d70e356c`). Its scoped service replacement uses the real FSUtil filesystem, calls the original link first and then the observer; it never replaces evidence bytes, digests, native Git, Session, SQLite or tool settlement. FSUtil has only its platform filesystem dependency. The existing scripted provider transport remains explicit.

The first case establishes a positive native CODE/history call, then observes two concurrent real history readers finish with known source/call identities and current/ancestor bytes. One real CAS hard link completes physically but its return is delayed by a controlled non-interruptible wait. The second finished reader has not entered publication. Combined with the collector's serial permit, this establishes the expected queue position by control-flow inference, not direct queue introspection. Advancing the TestClock by 31 seconds leaves the 300-second engagement alive. Releasing storage must yield two native error settlements and no late admitted history evidence; either a failed report or a completed report retaining only the earlier positive call is permitted. Physical orphan blobs are explicitly allowed.

The second case completes a real history call natively before advancing the clock, holds only the next provider response so the turn ACK is delayed, then advances 31 seconds and requires the final completed report to retain the valid proof. It prevents storing a call-local deadline as the lifetime of an already completed history operation. The Tracer observes real completed `ReviewScopedHistory.run` exits using the exact Effect beta.83 API; it does not supply outcomes. Each controlled delay has a release finalizer before application scope teardown.

Chronology: this supplement was authored after the local deadline repair proposal, and is not represented as preceding that local candidate. Its baseline production is `c61824e868dc05464f3bad264f79d47df77d9606`, which has the reviewed Core cleanup/type repairs but none of the three deadline production deltas. All twelve earlier TypeScript files retain their original published bytes in this baseline; the separate replacement native-error adapter is being re-baselined at source `832b138dddbc3749f82c8d124d940e97a3603be3`. New hosted types and a causal late-completed assertion are required. No local runtime test or typecheck ran.

## Observed supplemental baseline results

The replacement native-error adapter baseline at source `832b138dddbc3749f82c8d124d940e97a3603be3`, snapshot `b2040b0a420c5084da3f71190512f089f90bf11a`, run [46176934443](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46176934443), passed package typing on Linux, macOS and Windows. Each host observed 14 PASS / 43 causal FAIL / 57 cases / 766 assertions, with zero skips, timeouts or delegated spawns. Omni counts were respectively 9,889 / 9,898 / 9,418. Cleanup `141079585659` passed. Root and an independent reviewer read all three complete logs. The causes were 36 history scope refusals, two forensics scope refusals, one ignored H07 binding callback and four stale coverage reasons. These are pre-runtime failures of the behavior; deeper assertions behind each first failure still require the corrected candidate.

The full-call deadline baseline at source `85df1f71dc5ca54743602f78b2dc3fe9212f2eda`, snapshot `00b61283b845a31fcacfbdaf8487667a2bc8d293`, run [46177720324](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46177720324), passed package typing on all three hosts. Each observed 1 PASS / 1 causal FAIL / 168 assertions, with zero skips or delegated spawns. Linux / Windows / macOS Omni counts were 289 / 270 / 288. Cleanup `141080900103` passed. The causal assertion expected a native error after 31 seconds but observed completed; all positive controls before it passed. The separate later-ACK control passed. Post-failure assertions about the reason and final receipt remain GREEN obligations. The testclock advisory warning did not prevent either case finishing. Both frozen files and the three unchanged production files were fetched from source and snapshot and matched exactly.

The native parent-placement supplement is separately described in [history-parent-placement-contract.md](history-parent-placement-contract.md). Its first baseline `46178075785` failed package typing on all three hosts before tests because the test used the event field name on `Session.Info`; it is invalid preparation, not RED. The replacement source `afc80c2427d8a83045714c093652f034b42547ab` corrects only seven observations to the existing `Info.subpath`, and its snapshot `8d2b4adb1008079501bb1ce81a3a5e53b34915c7` runs the unchanged `c61824e868dc05464f3bad264f79d47df77d9606` production. The repaired baseline [46178957084](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46178957084) passed package typing on Linux, macOS and Windows. Each host observed two preservation PASS and five causal assertion FAIL, seven cases, 129 assertions and 186 Omni spawns, with zero skips, timeouts or delegated spawns. Linux / macOS / Windows test durations were 1.79 / 5.15 / 12.43 seconds. Cleanup `141085032460` passed. The two overlay cases failed at the inherited project assertion (line 115); root admission failed at line 139 and directory/workspace mismatches at line 179 because the unchanged implementation returned Success. Missing-parent refusal and existing-ID adoption passed. Default/false/different-location controls passed before the new assertions. Assertions after each first failure remain obligations for the production candidate. This causal baseline, not the earlier typing failure, admits the host-only Session repair and its two ordinary engagement callers.

## GREEN3 observation and open landing findings

Draft #1684 source 0076ad37 integrates dev 8cf8407f. Focused Core GREEN3 passed 65 Linux / 63 Windows / 62 macOS cases; Main GREEN3 passed all 59 cases on every host, including the corrected native-error observation, full-call deadline, later ACK and inherited Session placement. All selected types passed with zero skips/delegated. Preservation passed 122 cases on Linux/macOS; Windows had 121 PASS and one existing governed-round 5-second timeout. Landing remains blocked by source-directory authority across concurrent parent replacement and eager host enumeration before entry admission. A05 and final GO remain open.

The requirements above are unchanged. Directory authority across parent replacement/restoration and eager host enumeration must be resolved before landing the enabled history route. A later green fixture does not waive them. [Exact receipts and chronology](engagement-history-qualification.md), [source findings and Windows diagnosis](engagement-history-open-findings.md), and [native profile/role evidence](engagement-profile-qualification.md) are separate records. The 17 production and 15 frozen TypeScript identities are retained in the A05 section of [resumption-todo.json](resumption-todo.json).
