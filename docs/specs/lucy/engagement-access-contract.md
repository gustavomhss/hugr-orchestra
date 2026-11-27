# Independent engagement: first public contract

This contract freezes the first cohesive public engagement slice on
`b1877953cd4a3915c1bab27e93607dff329c7477`. It covers A01/A02, durable
request/report identity, the original host deadline and cancellation, and
captured file authority. It does not close all of block 2, A03, A04 or A05.
The audit variant loop, fix review and operational compliance need subsequent
frozen contracts and observed hosted assertion RED before implementation.

## Request and admission

The registered `maestro_request_review` gains the existing strict
`ReviewEngagementPolicyV2.Input` arm:

~~~json
{
  "kind": "engagement",
  "requestID": "audit-42",
  "profile": "audit",
  "brief": "Inspect the admitted repository scope.",
  "timeBoxMinutes": 5,
  "revision": "HEAD",
  "paths": ["src"]
}
~~~

- The first slice runs `audit`, `diligence` and `artifact`. No validation
  ID, governed work card, arbitrary command or caller-supplied source identity
  is accepted. Excess properties fail the existing strict decode.
- Only Maestro may admit this request. Existing governed and PR arms retain
  their contracts. An independent report cannot settle a validation.
- All current policy bounds remain: request ID, brief, integral 1–120 minute
  time box, bounded revision, canonical repository-relative paths and strict
  optional fix-review shape.
- `compliance` returns `engagement-profile-unavailable` in this slice.
  A syntactically valid `fixReview` returns `engagement-fix-review-unavailable`.
  Both refusals precede source capture and child admission.
- Request identity is namespaced by the authoritative parent Session, project
  and Location. Within that namespace, `requestID` claims one exact input.
  `inputHash` is lowercase SHA-256 of the UTF-8 canonical JSON of the complete
  decoded input, including the kind, request ID, profile, brief, time box and
  every supplied optional field. Omission differs from explicitly supplying a
  default; array order is preserved. HEAD resolution is not part of inputHash.
- Same request ID with any different accepted input returns
  `engagement-request-conflict`. It does not recapture or execute a child.
  The same spelling under a different parent has independent authority.

## Canonical bytes and public result

Canonical JSON recursively sorts object keys by JavaScript string ordering,
preserves array order, encodes primitive JSON values with `JSON.stringify`,
and emits no insignificant whitespace. Optional absent fields are omitted;
non-JSON values and nonfinite numbers are refused.

A terminal successful tool response contains exactly one JSON object, without
a Markdown fence or surrounding prose:

~~~json
{
  "schema": "review-engagement-result-v1",
  "requestID": "audit-42",
  "inputHash": "<64 lowercase hex>",
  "sessionID": "<the request's durable lead Session>",
  "status": "completed",
  "source": {
    "revision": "HEAD",
    "commit": "<captured full Git object ID>",
    "sha256": "<prepared source digest>",
    "files": [
      {"path": "src/a.ts", "oid": "<blob ID>", "mode": "100644", "size": 43}
    ],
    "notExamined": []
  },
  "budget": {"startedAt": 0, "deadlineAt": 300000},
  "report": "<strict ReviewResultV2.Card object, with no verdict property>",
  "citations": [
    {
      "uri": "<host-owned citation identity>",
      "path": "src/a.ts",
      "oid": "<captured blob ID>",
      "startLine": 1,
      "endLine": 1,
      "text": "<exact quoted logical lines>",
      "sha256": "<SHA-256 of the UTF-8 citation text>"
    }
  ],
  "classifications": [
    {"findingID": "C1", "severity": "P1", "label": "significant deficiency"}
  ],
  "notExamined": [],
  "reportID": "<64 lowercase hex>"
}
~~~

The example's report placeholder denotes the actual object, not a string.
`reportID` is SHA-256 of the canonical UTF-8 encoding of the entire envelope
with only `reportID` omitted. It therefore binds schema, request/input identity,
Session, terminal status, original budget, source, validated report, citations,
classifications and host-owned unexamined work. Every terminal envelope has a
report ID. Persist and replay the exact canonical output bytes, not a fresh
model rendering.

`completed` means the request reached its validated terminal report. The
card's separate `outcome` may be `done` or `blocked`; unavailable checks
remain accurately represented. Any verdict property, including `APPROVE`,
is rejected with `engagement-report-invalid`. Host routing, scope, checks and
confirmed finding identities/evidence must match exactly.

The card's scope uses the captured commit for both base and head, the number
of admitted regular files, and `changedLines: 0`. Whole-repository review must
not fabricate an added-line diff. Finding citations bind the actual captured
blob, exact in-range original coordinates and exact source quote, and remain
available after all graph/scratch scopes close.

The host derives `classifications` one-for-one from report findings using
`ReviewEngagementPolicyV2.severity`. Card severity remains P0–P3:

| Severity | Audit label | Diligence label |
| --- | --- | --- |
| P0 | material weakness | deal-breaker |
| P1 | significant deficiency | price or structure item |
| P2 | deficiency | condition or remediation |
| P3 | observation | observation |

Artifact labels remain P0–P3. Confidence retains the existing uncalibrated
meaning; questions remain questions. Artifact reports must retain
`{item: "artifact:behavioral-eval", reason: "owner-permission"}`.
This first audit slice explicitly retains
`{item: "audit:variants", reason: "not-built"}`. It does not pretend that a
variant search ran. No report becomes a governed receipt, including on replay.

## Immutable source and exact file authority

The host uses the existing engagement prepare/read boundary to resolve one
commit and its sorted captured regular-file set. Requested paths are literal
file/directory prefixes; they are not CODE globs. Symlinks and submodules are
recorded as not examined. No live worktree or shared mutable probe directory
supplies report or CODE bytes after capture.

Persist the complete captured file authority with request identity and source
digest. Bind that exact set to every lead, lens and verifier Session before
execution. Prompt text, a displayed file list or a source commit alone is not
an authority boundary.

- Registered `code_search` and `code_locate` have positive access to
  captured admitted files after live files change. Omitted paths and wide
  globs cannot widen the admitted set.
- Registered `code_query` receives the host-owned exact allowed-file set.
  Explicit outside file/position requests fail `reference_invalid` before
  retention. Unqualified resolution, candidates, hit/via ranges, pagination
  and map results exclude captured-but-unadmitted files. Full cache integrity
  validation is preserved; missing cache remains explicit.
- This first route excludes native read/grep/glob operations, including their
  engine-specific forms, and `review_history`. The latter currently reads
  arbitrary live revisions/paths. These calls are explicitly unavailable;
  existing PR/governed/global grants are unchanged. Reports mark
  `{item: "engagement:history", reason: "not-built"}`, and A05 forensics stays
  open until a separately confined history route is qualified.
- `atlas_context` must either enforce captured admitted authority or be
  explicitly unavailable in this route. It cannot reveal live mutations,
  unadmitted file names/content or repository instructions through a memory
  context escape. This clause does not claim that implementation qualified.
- An expired, cancelled or closed binding cannot produce or retain new
  successful source output. An old call cannot be revived by a new binding.

## Durable ownership, deadline and retry

Use the real Session admission/projector/store/runner and process-global
`SessionExecutionLocal` graph. A scripted LLM transport in acceptance tests
does not replace prompts, the runner, execution coordination or persistence.

The host fixes `startedAt` and `deadlineAt` once, before asynchronous
source acquisition. The clock and timeout belong to the host. Source reads,
analysis, model/provider turns, tools, retained output and final publication
share the original remaining budget. A waiter, continuation or reopened graph
does not acquire a new budget.

Persist admission, captured source, owned children, original deadline and
terminal outcome through transactional Session metadata or another real
durable store. Update only the owned metadata key. Completion atomically
checks the same request owner, nonterminal state and unexpired deadline.
Never overwrite a terminal state with a late model response.

- Completed retry returns byte-identical output after SQLite close/reopen,
  HEAD movement, configuration reads changing or ambient parent prompts.
  It reads durable state before preparing Git/settings/catalog or executing
  any child. Original source, evidence and deadline remain unchanged.
- Same-process concurrent exact requests have one execution owner. A cancelled
  waiter must not cancel the owner or reset its deadline.
- Owner cancellation propagates interruption to that caller. Persist
  `status: "cancelled"`, interrupt only owned children, await their cleanup
  and discard their pending wakes. Retry returns the terminal envelope
  without restarting.
- Expiry persists `status: "expired"` and host `notExamined` entries with
  reason `time-box`, interrupts owned work and awaits cleanup. At the
  deadline, observe cancellation/terminal ownership; do not require native
  filesystem cleanup to finish in the same TestClock scheduling tick.
- Before capture finishes, expired/cancelled/failed terminal envelopes may
  omit `source` and `report`; no commit or card is invented. After capture,
  terminal output retains original source plus the remaining unexamined work.
  It never promotes a partial model verdict/report.
- A durable unfinished request found after its process owner is gone fails
  closed as `engagement-interrupted` (or its already-expired terminal
  outcome), retaining original capture/budget. This slice does not claim
  post-crash provider resumption.

## Frozen acceptance and qualification

The new public/persistence/timebox tests invoke the existing registered tool
with unknown input, so baseline compilation needs no future production API.
The fixture uses real Git, native process execution, file SQLite and a fresh
actual Local Session graph on each open. Its only conversational script is
the LLM event stream. Nonempty quote proof passes through the real lens and
verifier protocol and reads actual captured blobs.

The Core companion scope suite independently exercises real prepared caches,
duplicate names, explicit scope refusal, pagination and nested result paths.
Public tests prove that engagement authority actually reaches those routes.

Tests and typechecks run only through the hosted package gate. Import, type,
setup, unsupported-platform or resource failures are not assertion RED.
Declared platforms need their own observed results; there are no silent
platform skips. This contract and the first slice do not claim all of Lucy,
block 2, variants, fix review, compliance, packaging or the named Grok gate
complete.
