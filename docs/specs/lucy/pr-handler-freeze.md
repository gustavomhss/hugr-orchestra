# Plain PR handler: host freeze

This freezes the next backend slice; it is not an implementation or proof report.
It supplements the proposal at `429bf542a7` and retry trace at `3b1e67e425`.

## Existing tool and committed evidence

Extend `maestro_request_review` with the strict alternative
`{kind: "pr", baseRef, headRef, prText?, tier?}`. The existing governed shape and
its receipt path remain separate. Reject mixed/excess inputs through schema parse
options, not registry-owned authorization. Maestro's leaf gate runs before Git or
child creation. No new tool, public Protocol or Server API is authorized.

Use `ReviewPREvidenceV2.prepare` at the Session's canonical Git worktree. Review the
unique merge base and resolved head, never dirty bytes or the input base branch's
later files. Resolve and recheck both supplied commit selectors immediately before
the first provider drain. Commit-resolvable read-only expressions are allowed.
Failed, truncated, ambiguous, unsupported-path or lossy acquisition fails explicitly.
Base rules come from the reviewed merge base. PR prose is bounded untrusted data.

## Identity and completed retries

Derive candidate identity from a domain-separated canonical encoding of parent
Session, project and complete Location, exact refs and resolved commits, reviewed
base/head and diff digest, exact optional PR text, tier request, catalog digest and
effective review settings. Derive child and prompt IDs from candidate plus role/turn.
Different inputs never adopt an old candidate's Sessions.

The existing analysis store may retain **host facts without a verdict**: candidate
identity, method, final routing, scope and host-confirmed findings from the completed
fanout. Store these only after a completed run, atomically, under the host-derived
candidate directory. Decode strictly and bound the file to 4 MiB. This is an
analysis/replay artifact, not a governed receipt, approval, attestation, final-card
cache or source of governance authorization. Do not publish any review event or
board/forge write. The model cannot provide or replace these expected host facts.

Publication is atomic and first-writer-wins: create and close a uniquely named
owned temporary file, link it to the final same-directory path without replacement,
then remove only that temporary name. Existing equivalent facts are idempotent;
different, corrupt or unreadable existing facts fail explicitly. No overwrite or
unverified fallback is authorized.

Private replay storage currently requires Linux or macOS, an available process
UID and a nonzero `O_NOFOLLOW`. Read and write must otherwise fail as
`pr-facts-unsupported` before filesystem work, including an absent-store read.
Supported paths verify directory/file ownership, non-writable group/other modes,
regular-file type and opened descriptor identity. No Windows ownership guarantee
or same-UID, OS-atomic directory-replacement guarantee is implied.

Publication and owned temporary cleanup must finish before the writer retires
and releases its candidate lock, even after an interruption request. Completed
publication may commit; asynchronous publication after caller retirement may not.

Serialize same-process calls for one candidate with a private ref-counted semaphore
map, bounded to 64 distinct active keys and released on every exit. A duplicate
waits, then follows the completed/incomplete retry rules; a new key beyond the
bound fails as `pr-busy`. This is process-local lifecycle coordination, not a new
model orchestrator or a cross-process Session ownership claim.

The read-only `AdmissionObserver` runs synchronously in the protected use phase,
after candidate registration and before semaphore admission. Its `waiting` field
means registered behind an active candidate, not proven OS wait-queue entry. A
throwing observer must still release its registered reference. Registered-request
tests must hold the first provider until the same candidate's second admission
is observed, and count actual retained analyzer artifacts, not printed URIs.

For an exact completed retry, reuse those validated host facts and the ordinary
durable assistant reply for the deterministic finish prompt via
`TaskTool.completedReply`; revalidate the card and actual source locations. Do not
reanalyze or reprompt with a new retained URI under the old prompt ID. If a prior
lead Session exists but complete host facts or its completed reply are unavailable,
return named `pr-retry-incomplete` before provider execution. Corrupt facts fail,
never silently start another review. Interrupted/crashed continuation is not an
automatic retry path and remains subject to the Session core's separate design rule.

## Fanout, card and source boundary

Reuse the actual fanout with `completion: "card-only"`; never grant the receipt
tool, set finish authorization, or read/synthesize a governed receipt. Use current
stage sets and exact scoped skills. Bind/release actual scratch copies and tools
through the existing review binding and review-lifetime Scope.

Validate one existing `review-result` card against the returned host routing,
scope and confirmed identities. For Quick quote-only reviews omit `confirmed`;
when a host list is supplied it remains authoritative. Do not reconstruct expected
host routing or findings from model output. Invalid verifier confirmations become
explicit questions before exposure, not invented rung histories.

Quick quote evidence currently carries a path and line range, not quoted text.
Require an actual reviewed-head blob, a valid nonempty UTF-8 range, a changed path
and an added finding line within the complete diff. These checks bind a citation
to source bytes; they do not mechanically prove the model's logical claim or compare
nonexistent model-quote text. Any retained range digest is host-derived companion
metadata, never a new model-controlled card field.

Return host identity JSON outside one canonically serialized, validated existing
card block. Do not forward arbitrary surrounding model prose. Missing/malformed,
unverified, mismatched or unavailable results are named tool failures, not clean
cards or `LUCY_NO_RECEIPT`.

## Small slices and proof

Keep replay-facts storage/schema, handler wiring and registered-entry acceptance
as separate reviewable slices where their combined diff exceeds 400 lines. The
handler has one owner; do not edit fanout concurrently. The lead verifies actual
registry invocation, no new review events/board notes with a working seeded
oracle, receipt denial, base rules/prose separation, committed identity, complete
retry reuse and governed regressions. All tests and typechecks run remotely;
one epic is reserved for the complete campaign bundle. No merge of #1290.
