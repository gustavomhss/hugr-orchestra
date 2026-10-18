# Context Continuity quality improvement contract

> Historical two-call design. The owner subsequently selected [single-call self-check](context-continuity-selfcheck.md).
> Production no longer calls a separate reviewer; prior review receipts remain readable.

Owner authorized implementation on 2026-10-09 after reviewing the real v5 corpus. This work improves
critical retention, current work state, source-grounded claims, actual continuation and archive recovery.
It does not assert universal semantic accuracy or superiority over legacy compaction.

## Frozen baseline and ownership

- Baseline: `16c947b7538f42d494890dfd281f219426d4a28c`, branch `memory-quality`.
- Lead owns shared memory types, persisted format, projection validation, fork integration, lifecycle
  fixture updates, evaluation harness and final integration. Independent executors own disjoint modules.
- W1: `continuity/review.ts`, `review-prompt.txt`, `test/continuity/review.test.ts`.
- W2: `continuity/archive-search.ts`, `tool/context-recall-archive.ts`,
  `test/tool/context-recall-ranked.test.ts`. W2 does not change archive storage or shared memory types.
- The owner clarified the 400 LOC cap applies per file, not per PR, and explicitly retained the existing
  stack/layout. Keep cold review and scoped Linux/Windows CI on the integrated candidate. Runtime
  dependencies and existing Session ownership/admission contracts remain intact.

## 1. Structural retention strengthening

For complete v5 production, an unlocated exact value, error or user quote must not silently discard its
operation. Return C17 and use the existing bounded producer correction. A wrong revocation quote keeps
the protected item and also requires correction. Partial v4 decoding keeps its legacy per-op behavior.
This is a validation extension, not a relaxation of existing source or authority checks.

## 2. Source-grounded semantic review

Every structurally valid new complete candidate is reviewed before publication. The review uses the
same selected model/backend, no executable tools and a separate instruction/request. It receives source
history and candidate, not producer reasoning. This is a model assessment, not a mathematical guarantee.

The review checks indispensable requirements/values, supported meaning, latest covered objective,
next action, superseded decisions, unsupported completion and repeated completed work. A completed tool
invocation is not itself success. Nonzero exits may be expected negative controls; judge them against
the actual task and evidence, never a universal nonzero-exit rule. A closed deliverable may wait for its
owner rather than manufacture a new task. Post-boundary user input is not attributed to covered memory.

Review JSON is closed and required:

```
{
  "verdict": "accept" | "repair",
  "cursor": {
    "supported": boolean,
    "state": "active" | "waiting" | "closed",
    "next": "continue" | "verify" | "ask-user" | "wait-user",
    "reason": "nonempty explanation",
    "src": ["source aliases"]
  },
  "critical": [{"item": "mN", "src": ["source aliases"]}],
  "resolved": [{"item": "previous critical mN", "reason": "why superseded", "src": ["new source aliases"]}],
  "issues": [{
    "kind": "omission" | "unsupported" | "contradiction" | "stale-cursor" | "repetition" | "false-completion",
    "detail": "concrete issue", "src": ["source aliases"]
  }]
}
```

Accept requires supported cursor, no issues, valid owned sources and critical item IDs that exist in
the candidate. Cursor cites an eligible exact boundary source. Closed cursor cannot request continue
or verify. Previously protected critical IDs that remain live are retained automatically. Retired
critical IDs require an explicit resolution grounded in new span evidence; resolutions cannot name
unrelated items. Critical classification beyond deterministic user-owned items is model-selected and
must be described honestly. Empty candidate items permit an empty critical set, not an absent cursor.

A host-owned optional v5 `review` seal records version 1, work state, next-action class, critical IDs
and a canonical digest of the artifact plus those fields. Cold reads reject malformed/stale seals.
Old v4/v5 artifacts remain readable. Existing reviewed input permits incremental review against new
span plus prior items/seal and supplemental older covered messages cited by new or changed items or
changed Now. A prior seal covers unchanged prior claims, not new assertions about old evidence.
Unreviewed migration is checked against full declared covered sources. Alias ownership, source
fingerprints, ordered declared coverage and the exact boundary bind the review to the captured prefix.

Expose pure `request(snapshot, host, artifact)` and
`decode({ text, snapshot, host, artifact }) -> review decision | Failure` in W1. Shared seal functions
are `seal(artifact, decision)` and `validReview(artifact)` in lead-owned `review-seal.ts`.

## 3. Bounded execution and repair

The full operation retains one 600-second abort deadline including lookup, generation, review and
correction; confirmed cleanup may extend elapsed time. Share one producer correction allowance across
structural and semantic errors. A repaired candidate is reviewed again. Audit budget, malformed output,
provider failure, rejection, cancellation or stale ownership cannot publish an unchecked candidate.
Parent replay remains immutable and tool-denied. Existing selected-model and lifecycle fences apply.
`prepare` remains pure. No legacy SessionPrompt orchestration bridge or extra durable runner identity.

Review admission uses the selected backend's input estimate when available, plus observed backend
overhead supplied by the service (zero when absent). The SDK estimate measures its compiled payload:
role-preserving historical-message JSON framing and deduplicated system/reviewer instructions. The
fallback estimates review instructions plus serialized messages. Invalid estimates or an estimate plus
overhead above the selected model's input limit fail before review transport. This is an estimate, not
an exact provider tokenizer or a guarantee that every provider-side token has been counted.

## 4. Archive search

Keep `reference`, literal `archive_query` and listing behavior compatible. Extend search with optional
`match: "literal" | "terms"`, `offset`, `role: "user" | "assistant"`, `from_message`, `through_message`.
Terms mode builds a bounded per-fragment lexical index over verified archived content. Tokens match
`[\p{L}\p{N}_][\p{L}\p{N}\p{M}_]*`, then undergo NFKD normalization, combining-mark stripping and
JavaScript `toLowerCase()`; tokens without a letter or number are discarded. This is not full Unicode
case folding. All distinct query terms must occur across a fragment's title/content; rank by consecutive
normalized-token phrase, title-term count, proximity, then last source ID descending and archive ID
ascending. Snippet offsets remain original UTF-16 code-unit offsets. Paths, tool names, error signatures
and identifiers are searchable text, not invented semantic entities.
Role comes from the verified closed archive envelope. Message bounds are inclusive lexicographic ID
bounds, not timestamps or numeric suffixes: include a chunk when `last >= from_message` and
`first <= through_message` for supplied bounds. A reversed pair returns `invalid_message_range`.

Read and verify every retained chunk before applying role or message-range filters, including chunks
beyond the requested page. Unverified manifest descriptors cannot exclude a chunk from integrity
checks. Missing/corrupt chunks fail closed even when filters would exclude them; totals follow the scan.
Return ranked, paginated descriptors, source snippets and truthful completeness/continuation. Never
scan another Session or external file, silently truncate coverage, or keep a process-global content cache.
Literal default ordering stays unchanged. No embedding dependency or archive migration is required.

## 5. Evidence and acceptance

- Wrong critical exact data and revocation fail; repaired data succeeds; unchanged v4 controls succeed.
- Validly shaped but stale/unsupported/repetitive/omitting candidates are rejected by review; corrected
  candidates receive a seal. Empty/malformed/foreign audit output never counts as approval.
- Audit cancellation/retry/timeout/input budget preserve prior memory and join transport cleanup.
- Seal survives cold persistence; field/critical-ID/digest mutations fail projection/read validation.
- Multiword archive queries find source missed by literal search, rank deterministically, paginate
  honestly and preserve Session ownership, integrity checks and exact reference lookup.
- Continue a real GPT 6 Luna task using current objective/rules/values and an archived fact. Verify
  actions and answer against an oracle outside the model; capture source hashes and actual requests.
- Evaluate matched original/new candidates against frozen source questions and continuation outcomes.
  Report omissions, contradictions, retried work, recovery calls and total producer/review/consumer
  usage, separately from historical legacy comparisons. No inferred winner from corpus size.

Mutation controls must break the protected behavior, fail the named oracle, restore and pass. Local
typechecks run from package directories. Tests run via `bun run test:ci` unless owner separately permits
local runs. No new paid benchmark of the old Warhammer competitors.

The source-pinned acceptance record, measured scope and publication status are in
[Context Continuity quality results](context-continuity-quality-results.md).
