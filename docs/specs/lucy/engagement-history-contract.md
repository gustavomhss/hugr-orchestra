# A05 — confined history and profile skill contract

Status: **frozen contract and tests, awaiting hosted typecheck and causal RED**. No production implementation has been changed. Source review does not qualify runtime. API reading baseline: `c3ed848aef3c0883097eb8611bbd8eb1090f41f1` (2026-11-28). This contract supersedes only the first-slice history refusal in [engagement-access-contract.md](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/docs/specs/lucy/engagement-access-contract.md). The original request, durable identity, exact file authority, time box, cancellation and permission contract still applies.

The user supplied the remaining scope explicitly in the latest message: A05/forensics, compliance, Kubeconform/83 tools and integrated acceptance. The complete old chat was not available. This packet is a concrete subset of A05, not a claim that the entire inherited ToDo or A05 has already passed.

Remote acceptance base: `a959b3fffcbb9d1d2a36c0557f1de1b94c8a91a4`, including the preserved Activity/Omni work, TOML override, R8 probe fix and Kubeconform P1. Root and independent reviewers accepted the source packet after correcting dangling-object, metadata, proof binding, promisor control and replay-observation weaknesses. The close/rebind case is a controlled binding-lifetime test; expiry/cancellation cases exercise real completed history and later refusal, not a separately suspended native Git call. H01–H10 and final A05 closure still require the observations specified below, including preservation gates.

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

## 7. Minimal implementation seam (not implementation)

1. Add an optional scoped history handler to `ReviewTools.Binding`, whose lifetime is captured before awaits. Existing nonengagement bindings use the current implementation.
2. Construct the history capability from captured engagement authority and collector, with strict validation/safe normalized Git reads; never enable current arbitrary live history for reports.
3. Grant tool and exact forensics skill only through explicit profile/role policy, preserving the rest of the A05 matrix.
4. Add durable history proof collection/validation/reader compatibility under original quotas and deadline.
5. Replace the blanket “history not-built” gap only for qualified history-capable profile/routes. Unrequested, denied, truncated or unavailable history remains honestly reported.
6. Update access contract/guide/coverage only after corresponding evidence is observed.

Evidence for the gap: [current history](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/packages/core/src/review-toolkit/history.ts), [binding and tool](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/packages/core/src/review/tools.ts), [report filter](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/modules/maestro/coordination/src/v2/workflow/review-fanout-support.ts), [collector](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/modules/maestro/coordination/src/v2/workflow/review-engagement-artifact-collector.ts), [forensics leaf](https://github.com/gustavomhss/hugr-orchestra/blob/c3ed848aef3c0883097eb8611bbd8eb1090f41f1/packages/lucy-specialist/skills/lucy-audit/forensics/SKILL.md).

