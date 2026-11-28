# Audit variants: exact contract for review

Status: **frozen for hosted native acceptance authoring**. The lead and independent
review approved contract source SHA256 `4597c430a57387ba993fbbb92588c0bda75d5d4887042b6fa7546cb4b603f550`.
Production implementation remains gated on compiling hosted assertion RED.
This contract preserves the selected semantics of the earlier design drafts.

Qualified source baseline after search delivery #1643:
`66cfef285979adee36168e62010e8788f510db3d`, tree
`2eb6fd9414b8b0064b7a992937bb25395d3e7c58`. This includes evidence delivery
#1618 at `66371f666132cfa78006b50fc98cdc7800c2e044` and the reviewed
model/runtime reconciliation through `de3568f7efdd87cd130a9292caeb108616bdfd9f`
and `bbe3a84cbf7adeae2ecd4413a2fc0e63cbd7ae28`. These deliveries do not
themselves implement variants.

The first variants acceptance snapshot uses the subsequent dev commit
`8d2d484d68fe746f8f323c712df924603b6c6e26`. The lead inspected all six
intervening commits (#1644, #1645, #1647 and #1648): App Janitor placement,
TUI title recovery, related guides/tests, and two Core hook fixture corrections.
They change no Maestro/Lucy or Core runtime source. The source inspection
anchors below and every normative variants requirement remain identical.

The separate search-completeness contract is frozen at
`docs/specs/lucy/search-completeness-contract.md`, SHA256
`9c577760911c1041ce10c27e0647085495766a43777ecd6ed753a82528bc0bf3`.
Its five native cases reached compiling assertion RED on all three hosts in
run `46100045285`. Search source `cb15c6de4a31b0a7b80a853a25c8259428047764`
then passed all three hosts: Core `46100883601` had 36 pass / 0 fail per host,
418 assertions and 186 native Omni spawns with no delegated spawn; Maestro
`46100885302` had 15 pass / 0 fail per host and 2867 assertions. Types passed
on all hosts; guards and Atlas passed. The lead verified that merge #1643 has
parents `bbe3a84cbf7adeae2ecd4413a2fc0e63cbd7ae28` and that search source,
and that the search-source-to-merge comparison changes zero files. The search
prerequisite is qualified in this baseline; no search behavior beyond its
contract is introduced here.

All implementation gates remain hosted. Contract and test authoring use
source inspection; tests, typechecks and runtime qualification run only in
GitHub Actions.

## 1. Public boundary and fixed limits

Keep the registered `maestro_request_review` engagement input and
`review-engagement-result-v1` unchanged. There is no new public variants input,
tool, model-provided authority, report verdict or `result.variants` property.

An audit has at most **three reserved generations across its whole request**.
Diligence and artifact have zero. The existing compliance/fix-review refusals
and artifact behavioral-evaluation owner-permission gap remain unchanged.

Insert variant work after initial independent confirmation and before the
existing single lead finish. Reuse the captured source, effective catalog,
actual execution tier, initial analysis, owner, native Session services,
original deadline and evidence collector. Do not rerun routing, entry, hunts
or analyzers for a generation. The optional hook is absent for PR, governed,
card-only and Research paths, preserving their behavior.

Quick is not silently raised. Without an independently confirmed initial
finding, it closes variant work as `independent-verification-unavailable`.
A blocked or independently verified audit with no confirmed seed closes as
`no-confirmed-seed`. Non-audit profiles close as `not-applicable`.

Every new Session uses the existing tier's loads/tool-call limits. All stages
share the existing process-wide fanout semaphore of two; no new semaphore is
created for variants. The request-wide limits remain exactly 128 CODE captures,
256 artifact descriptors, 16 MiB per body, 64 MiB aggregate bodies, 1 MiB per
receipt and 4096-byte public pages. Fresh Sessions do not reset these counters
or the original time box.

## 2. Frozen identifiers and canonical data

`Digest` means canonical lowercase SHA256. `Oid` means the existing captured
40- or 64-hex Git object ID. Counts and ordinals are nonnegative safe integers;
lines are positive safe integers. Strings described as IDs are nonempty.
Canonical JSON, hashing and strict excess-field rejection reuse the existing
engagement evidence rules. No unknown fields are accepted by a versioned
schema, including older versions.

The policy string is **`audit-variants-v1`**. New admissions use
**`review-engagement-state-v3`** and newly completed receipts use
**`review-engagement-evidence-v2`**. Existing CODE/analysis operation IDs,
artifact kinds, result-v1, evidence index/page/cursor formats and the metadata
key `lucyEngagementV1` are unchanged.

The identities below use the existing canonical `digest` function:

```text
seedID = digest({schema:"review-variant-seed-v1", sourceSha256, finding})
matchID = digest({schema:"review-variant-match-v1", sourceSha256,
                  defectClass, path, line})
generationID = digest({schema:"review-variant-generation-v1", namespace,
                       inputHash, sourceSha256, ordinal, seedID})
findingID = "V" + ordinal + "-" + matchID
```

`namespace` is the already admitted `identity.key`. `finding` in the seed
identity is the exact `SeedFinding` defined in section 8, including its actual
settled history/evidence. It excludes later lead presentation text. `defectClass`
is the pinned catalog class; the model cannot rename it. Match identity omits
pattern, quote, severity, end range, tool rule and generation ordinal.

Native Session identity continues to be:

```text
sessionID = "ses_lucy_engagement_" +
            digest({namespace, key:childKey, role})
promptMessageID = "msg_lucy_engagement_" +
                  digest({key:namespace, child:sessionID, turn:turnKey})
```

Use `childKey = variant:<ordinal>:proposal`, native `role = lens`, and
`turnKey = variant:<ordinal>:proposal` for a proposal. Use
`childKey = variant:<ordinal>:verify:<defectClass>`, native `role = verifier`,
and `turnKey = variant:<ordinal>:verify` for its independent verifier. These
are fresh children of the engagement lead. Reusing existing native role names
avoids widening the legacy children schema. Their variant stage identity comes
from these exact keys and the receipt, not a new global native role.

## 3. Seed eligibility, selection and proof barrier

For an eligible audit, validate **every initially host-confirmed finding**
before creating any variant child. Each needs its actual independent verifier
Session/reply, offered option list, settled rung/history, pinned class and
captured location. A candidate, analyzer hit, model aggregate or lead assertion
is not a seed. Reuse the existing rung validation; never create a fallback rung.

Read its exact finding range through the captured-source reader. Retain the
returned region and observed full-blob hash as described below. For quote
evidence, also read the exact `Evidence.path/startLine/endLine` and bind it with
`Examination.quoteRegionID`. That supporting range may differ from the finding
range, preserving the delivered Standard/Deep behavior; both must be admitted
captured regions under the existing byte/line limits. The two region IDs may
be equal. The known-instance control always remains the finding's primary
path/line, never the supporting quote's location. Quick's stricter existing
quote rules are unchanged. Tool evidence additionally must bind to the actual
qualified final analysis, matching item/class/rule/location, raw URI and native
proof. Reuse the evidence validator's qualified-proof logic before the child
barrier; do not scan temporary directories, invoke an analyzer or accept a
model's URI as proof. Probe evidence remains unavailable.

An invalid initial confirmed proof fails with the existing
`engagement-report-invalid` behavior before any variant Session/search. A
captured-source read failure or collector failure stays fatal in its existing
typed channel. Do not skip a bad confirmed proof and select another seed.

For generation 1, choose among the validated initial seeds by severity
P0/P1/P2/P3, then canonical path, primary line and original finding ID. Ties
use code-unit string order, never locale order. For generations 2 and 3,
choose only from the immediately preceding generation's newly confirmed
findings with that same order. Do not fall back to the initial pool, rotate
class or retry after a stop.

This is one lineage per audit. The first selected seed fixes class, node and
lens for every descendant. Other initial findings retain their identity and
remain in the final report. Record their unexpanded seed IDs explicitly;
variant coverage does not imply they were searched.

Reserve a generation in the short durable owner transaction **after** seed
proof validation and **before** creating its proposal child. Count reservations,
including invalid attempts. Provider work, Git reads, evidence storage and
Session creation do not run inside that SQL transaction.

## 4. Proposal stage and actual native witness

The proposal's skill entry is `lucy-audit-variant`, with an empty additional
skill allowlist. Its tools are the intersection of the existing native floor
with `skill`, `code_search`, `code_locate`, `code_query`. It receives the
validated seed/rule, original source authority, bounded task and fixed search
requirements. It does not receive the initial verifier's private transcript.
Native filesystem tools, task/delegation, history, executable probes, Atlas,
the evidence reader and analyzer execution are unavailable. Verifier scope
reuses the existing report verifier intersection and proof-skill selection.

The stage brief begins `Stage: variant proposal, generation <ordinal>.`.
Its final answer contains exactly one `review-variant` fenced JSON record,
with only whitespace outside the fence:

```ts
type Proposal = {
  seedFindingID: string
  patternChange: string             // nonempty claim, not a host proof
  candidates: readonly {
    path: string
    line: number
    endLine?: number
    severity: "P0" | "P1" | "P2" | "P3"
    trigger: string                 // nonempty
    quote: string                   // nonempty claim; not source evidence
  }[]                              // at most 200, no duplicate path/line
}
```

The proposal brief carries the exact selected `SeedFinding` (including its
finding `id`) in `ReviewFanoutSupportV2.data("seed", JSON.stringify(finding))`.
This preserves the existing `<data name="seed">` envelope; it is an internal
stage protocol, not another public tool input.

There is no model-supplied call ID, count, class, node, lens, disposition,
source hash or verification status. `seedFindingID` must equal the offered
finding ID. Candidate paths/primary lines must belong to the frozen new match
set. The end range stays in that file and within the existing 400-line captured
region limit. A changed seed, unknown field, duplicate location or invented
candidate is `stage-invalid`; no invalid candidate is silently removed.

An accepted generation has **exactly one actual typed `code_search` attempt**
in its proposal Session. Count pending, running, completed, failed and
provider-executed attempts from actual native messages. Re-observing the same
native tuple is not another attempt. Inspect the complete attempt inventory;
the model cannot choose a favorable successful call after several searches.
Auxiliary query/locate captures never supply the denominator.

The sole attempt must have `state.status === completed`,
`provider.executed !== true`, and a collector CODE capture with the exact tuple
`sessionID + assistantMessageID + toolCallID + name + sourceSha256`. Its existing
CODE operation ID also binds `inputHash`. Repeated provider call IDs in different
assistant messages remain distinct. A lead/foreign-child/previous-generation
operation cannot serve as this witness. A captured call without native success
is not countable. Do not scrape display text or invent an operation.

Require the actual normalized captured input to be:

- `paths: ["**"]`, `offset: 0`, `limit: 200`, `context: 0`;
- the actual proposed pattern/mode/case choice, retained without substitution.

Omitted offset/context may take their existing zero defaults. Omitted limit
means 50 and is not accepted. Omitted case means the existing true default.
Omitted paths is not enough: the explicit positive glob must override an
admitted ignore file while the private projection still excludes unadmitted
files. A public positive must prove this with a real admitted ignore file.
The stage instructions and variant skill require one generalized search that
finds both the known seed and possible variants. They must not instruct a
preliminary known-instance search followed by a second generalized search.

Require actual `coverage.complete:true`, `bounds.truncated:false`, no `next`,
empty `coverage.skipped`, known `binariesSkipped:0`, `execution.op:code_search`,
`freshness:fresh`, bound limit 200, safe nonnegative counters and the exact
captured commit/scope digest/sorted authority files. `ignoreRespected:false`
is the existing honest engagement metadata, not incompleteness. `documents`
is descriptive; it need not equal the admitted file count. Source links,
submodules and other omitted kinds remain declared gaps.

Every match has an admitted canonical regular-file path and a positive safe
primary line. The same actual result must contain the seed's exact primary
path/line. A context line, end range, root-cause location, other call or
`matched:true` claim cannot establish this control.

An unavailable/failed actual search may end variant work. A malformed trusted
capture, inconsistent source, collector integrity/retention/quota failure or
unexpected defect stays fatal; it is not a benign variant limitation.

## 5. Match accounting and independent dispositions

Build M from the complete accepted result before reading the proposal's
candidates. Deduplicate by the match identity and sort by path/line. Remove,
in this priority, the selected seed anchor, other already confirmed same-class
anchors, and all same-class anchors processed by prior generations (including
noise, questions and not-examined). Freeze the remainder for this generation.
An end range never hides other primary lines. This counts matched locations,
not regex submatches or distinct root causes.

Persist `rawMatches` (actual result array length), `distinctMatches`, the
excluded identities/reasons and every new location. Only the new locations
are `matches` in the ratio. An unmentioned location is still a match and gets
`not-examined`, not silent removal.

First assign `candidate-missing` to every new location absent from the valid
proposal. Order the remaining present candidates by severity/path/line/matchID
and select up to `min(4, pinnedExecutionTier.budget.candidatesPerVerifier)`,
only if the pinned tier permits a verifier. All other present candidates get
`verification-budget`. Read captured regions only for the selected candidates;
an expected `region-unavailable` never refills that slot with another candidate.
Create at most one fresh verifier for the selected readable candidates. This
does not multiply the existing one-class budget or remove any real match from
the denominator.

Every new-generation candidate receives the host ID `V<ordinal>-<matchID>`
before verification, including candidates later classified as noise or
question. A verifier's `candidate` must equal that ID; confirmation preserves
it as the finding ID. Original initial candidates/seeds keep their original
finding IDs. Reply-to-location binding never depends on result array order.

The verifier brief begins
`Stage: variant verify, generation <ordinal>, class <defectClass>.`.
It receives the seed rule, candidate claim, offered options and exact captured
candidate region, plus the existing refutation instruction. It does not receive
the proposal transcript, favorable ratio or previous verdict. Its response is
the existing strict `review-verify` / `ReviewResultV2.VerifierReturn` protocol.
The class must match, each returned candidate must be in its batch, and no
candidate may be returned twice. Missing/malformed/foreign/duplicate results
are not confirmations. Ordinary PR/governed verification semantics remain
unchanged by this new-stage validation.

The verifier brief retains `<data name="candidates">` and the existing
candidate-envelope shape used by `ReviewFanoutSupportV2.data`; the new stage
prefix does not rename that internal data block.

| Disposition | Required origin | Count |
| --- | --- | --- |
| `confirmed` | Actual independent reply, valid offered settled rung/history, captured region and qualified quote/tool proof | one match, one confirmation |
| `noise` | Actual independent `dropped` result with nonempty refutation and examined captured region | one match, one noise |
| `question` | Actual independent question, or the existing rung validator downgrading a confirmation | one match, one question |
| `not-examined` | Missing candidate, verifier budget, expected region refusal, or unusable verifier return | one match, one limitation |

Allowed not-examined reasons are exactly `candidate-missing`,
`verification-budget`, `region-unavailable`, `verifier-return-invalid`, and
`stage-invalid`. Recover only the existing region-reader refusals for a new
candidate; do not catch all Tool failures. Errors from native ownership/run,
interruption, the evidence collector or unexpected defects retain their
existing fatal behavior. Each generation's collector latch is checked before
turning any local limitation into a successful stop.

New confirmed finding IDs are `V<ordinal>-<matchID>`. Initial IDs remain
unchanged. Descendants inherit the seed class/node/lens; rule is the actual
tool rule for qualified tool evidence, otherwise the class. Final lead ranking
must preserve every host-confirmed identity/evidence exactly once. Questions
remain separate, and the report still has no verdict.

## 6. Complete stop precedence

Terminal expiry/cancellation/failure takes precedence over every successful
variant stop; retain the existing terminal CAS behavior when causes race.
There is no new timeout or terminal tie-break rule. Collector quota/integrity
failures and unexpected defects cannot be downgraded into the reasons below.

Without a reserved generation, evaluate: non-audit → `not-applicable`;
Quick without independent confirmation → `independent-verification-unavailable`;
otherwise no validated initial seed → `no-confirmed-seed`.

Within a reserved generation, apply this order:

1. Missing/multiple attempts, provider-executed attempt, wrong native stage,
   or a completed captured witness with non-full-authority input → `stage-invalid`.
2. Sole pending/running/error attempt, or no successful native capture →
   `search-unavailable`.
3. Successful but incomplete result/page/binary coverage → `search-incomplete`.
4. A complete search missing the exact seed anchor → `seed-not-matched`.
5. Invalid proposal record/seed/candidate membership → `stage-invalid`.
6. Any question or not-examined location → `verification-incomplete`.
7. Zero new distinct matches → `no-new-matches` (no verifier is created).
8. `noise * 2 >= matches` → `half-noise`.
9. Third reserved generation → `generation-limit`.
10. Otherwise continue with the deterministic newly confirmed seed from this
    generation and reserve the next ordinal under the same deadline.

Thus exactly one noise among two new matches stops; one among three can
continue only when all three are settled. Unknown classifications never improve
the ratio. A continuing generation necessarily has a newly confirmed seed.
An invalid proposal does not hide an earlier incomplete-search limitation.
If a complete valid search has no new matches, its candidates must be empty;
invented candidates still trigger step 5.

Input-scope validation uses only the actual input in a linked completed CODE
capture. Pending/running/error attempts and attempts without such a capture
take step 2; replay never invents input for them. If steps 1–4 pass but the
proposal fails step 5, preserve `search.status:"accepted"` and all actual new
matches as `not-examined/stage-invalid`, with their real counts. Create no
verifier and set the generation decision to `stage-invalid`.
`RejectedSearch` represents steps 1–4 only; a malformed proposal cannot erase
the valid search denominator.

`stage-invalid` carries one exact detail: `search-attempt-count`,
`provider-executed-search`, `search-stage-mismatch`, `search-input-scope`,
`proposal-return`, `proposal-seed`, or `proposal-candidates`. A rejected search
has no invented zero denominator/counts. Its actual CODE body, when captured,
remains required evidence.

## 7. State-v3 durable journal

Keep every delivered common admission field, model identity rule, source,
children, owner, original budget, output and evidence reference. Only state-v1
uses historical absent/default normalization. State-v2 and state-v3 remain
exact. Add this required `variants` field only to state-v3:

```ts
type SeedRef = { seedID: Digest; findingID: string }
type Counts = {
  matches: number; confirmed: number; noise: number
  questions: number; notExamined: number
}
type Decision =
  | { type: "continue"; nextSeed: SeedRef }
  | { type: "stop"; reason: GenerationStop; detail?: StageInvalidDetail }
type ReservationIdentity = {
  generationID: Digest; ordinal: 1 | 2 | 3; sourceSha256: Digest
  seed: SeedRef; reservedAt: number; proposalKey: string
}
type Reservation = ReservationIdentity & (
  | { status: "reserved" }
  | { status: "settled"; settlement: {
      sha256: Digest; decision: Decision; counts?: Counts
    } }
)
type VariantJournal = {
  policy: "audit-variants-v1"; limit: 0 | 3
  reservations: readonly Reservation[]
} & (
  | { phase: "open" }
  | { phase: "closed"; stop: VariantStop }
)
```

`GenerationStop` is the eight within-generation reasons in section 6;
`VariantStop` additionally contains the three eligibility reasons. The journal
starts open with no reservations. `limit` is 3 exactly for audit and 0 otherwise.
`reservedAt` is read under the owner lock and is within the original budget.
Reservations are contiguous ordinals, at most the pinned limit. A new reserve
requires an open running record, exact source/owner, no pending generation,
and either no predecessor or the predecessor's exact `continue.nextSeed`.
An exact retry of the still-pending reservation returns that same reservation;
it does not consume another ordinal. Conflicting reuse is record corruption.

Settlement stores `sha256 = hash(canonical(GenerationRecord))` and its exact
decision/counts. A rejected witness omits counts; it is not serialized as zero
matches. Repeating an identical settlement is idempotent; changing it fails.
Closing requires the last settled stop, or a legal zero-attempt eligibility
reason. No completed record may end with a pending reservation or `continue`.

Expose only these owner-bound Store operations, returning the existing
`Effect<Record, Tool.Failure>` style:

```ts
reserveVariant(ticket, { seed: SeedRef }): Effect<Record, Tool.Failure>
settleVariant(ticket, { generation: GenerationRecord }): Effect<Record, Tool.Failure>
closeVariants(ticket, { stop: VariantStop }): Effect<Record, Tool.Failure>
```

The trusted coordinator supplies a seed only after proof validation. Pure
bounded structural/hash checks are allowed in the transaction; native/IO work
is not. Expiry returns/persists the existing terminal result. The finish CAS
requires the state-v3 journal and sealed receipt-v2 generations to agree, and
rechecks the original clock immediately before publication.

Keep the existing opaque `Sealed` value's exposed shape (`receiptID`, `bytes`).
Extend only its private `minted` association to bind the exact report text,
receipt schema and digest of the closed journal projected from that receipt.
`assertBinding(sealed, report, expectedJournal?)` compares those authenticated
host facts without IO; state-v3 completion requires the supplied journal.
The projection contains the policy/limit, every reservation identity and its
settlement hash/decision/counts, and the final closed stop. A structurally
similar caller object or a seal for another journal cannot pass. Existing
state-v2 receipt-v1 publication retains its current binding when the additional
journal argument is absent.

The exact receipt-to-journal projection is:

```ts
projectJournal(v: Variants) = {
  policy: v.policy,
  limit: v.limit,
  reservations: v.generations.map((g) => ({
    generationID: g.generationID,
    ordinal: g.ordinal,
    sourceSha256: g.sourceSha256,
    seed: g.seed,
    reservedAt: g.reservedAt,
    proposalKey: g.proposalKey,
    status: "settled",
    settlement: {
      sha256: digest(g),
      decision: g.decision,
      ...(g.search.status === "accepted" ? { counts: g.search.counts } : {}),
    },
  })),
  phase: "closed",
  stop: v.stop,
}
journalSha256 = digest(projectJournal(receipt.variants))
```

Here `digest(g)` hashes the full canonical `GenerationRecord`, not only its
identity. There are no omitted pending reservations or synthetic zero counts.
The private mint records `{reportText: report.text, receiptSchema: receipt.schema,
journalSha256}` for receipt-v2. `assertBinding` requires exact report text,
receipt-v2, a closed `expectedJournal` and
`digest(expectedJournal) === journalSha256`. For receipt-v1 the mint omits
`journalSha256`, and the additional argument must be absent. A receipt-v2 seal
cannot use that legacy branch. Store also checks its own state schema before
calling the corresponding branch.

A stopped state-v3 may preserve an open/pending journal as historical attempted
work; it has no receipt and cannot resume. No new migration or SQL table is
needed. Existing strict state-v1/v2 decoders remain separate.

## 8. Receipt-v2 exact variants section

Receipt-v2 preserves every receipt-v1 field and adds required `variants`.
The existing `EvidenceState` shape and `required-completed-v1` publication
policy are unchanged; state-v3 requires the referenced receipt schema v2,
while delivered state-v2 requires v1. The policy name governs completed-only
publication, not an implicit receipt schema upgrade.

The following are the exact additional shapes. `Verdict`, `Evidence` and
`Rung` retain the existing review schemas. All references are validated;
unused region/reply/seed records, duplicate IDs and excess fields fail.

```ts
type NativeReply = {
  replyID: Digest; sessionID: string; childKey: string
  role: "lens" | "verifier"; turnKey: string; promptMessageID: string
  assistantMessageID: string; textPartID: string
  text: string; textSha256: Digest
}
type NativeSearchAttempt = {
  attemptID: Digest; sessionID: string; assistantMessageID: string
  toolCallID: string; name: "code_search"; sourceSha256: Digest
  status: "pending" | "running" | "completed" | "error"
  providerExecuted: boolean; operationID?: Digest
}
type CapturedRegion = {
  regionID: Digest; sourceSha256: Digest; path: string; oid: Oid
  blobSha256: Digest; startLine: number; endLine: number
  text: string; textSha256: Digest
}
type Examination = {
  verifierSessionID: string; replyID: Digest; regionID: Digest
  quoteRegionID?: Digest
  offered: readonly string[]; verdictIndex: number; candidateCap: number
  rawVerdict: Verdict; verdict: Verdict
}
type SeedFinding = {
  id: string; path: string; line: number; endLine?: number
  severity: "P0" | "P1" | "P2" | "P3"
  class: string; node: string; lens: string; rule: string; trigger: string
  rung: string; rungs: readonly string[]; history: readonly Rung[]
  evidence: Evidence
}
type Seed = {
  seedID: Digest; finding: SeedFinding; examination: Examination
  toolProofID?: Digest
}
type MatchBase = {
  matchID: Digest; path: string; oid: Oid; line: number
  candidate?: Proposal["candidates"][number]
}
type MatchRecord = MatchBase & (
  | { state: "confirmed"; findingID: string; seedID: Digest
      examination: Examination }
  | { state: "noise"; refutation: string; examination: Examination }
  | { state: "question"; reason: string; examination: Examination }
  | { state: "not-examined"; reason: NotExaminedReason
      regionID?: Digest; verifierSessionID?: string; replyID?: Digest }
)
type AcceptedSearch = {
  status: "accepted"; operationID: Digest
  control: { path: string; line: number }
  rawMatches: number; distinctMatches: number
  excluded: readonly { matchID: Digest; path: string; line: number
    reason: "seed" | "already-confirmed" | "processed" }[]
  matches: readonly MatchRecord[]; counts: Counts
}
type RejectedSearch = {
  status: "rejected"
  reason: "stage-invalid" | "search-unavailable" | "search-incomplete" | "seed-not-matched"
  detail?: StageInvalidDetail; operationID?: Digest
}
type GenerationRecord = ReservationIdentity & {
  attempts: readonly NativeSearchAttempt[]
  proposalReplyID?: Digest; proposal?: Proposal
  search: AcceptedSearch | RejectedSearch; decision: Decision
}
type Variants = {
  policy: "audit-variants-v1"; namespace: Digest; limit: 0 | 3
  stop: VariantStop
  initialSeedIDs: readonly Digest[]
  unexpandedInitialSeedIDs: readonly Digest[]
  seeds: readonly Seed[]; generations: readonly GenerationRecord[]
  regions: readonly CapturedRegion[]; replies: readonly NativeReply[]
}
```

`initialSeedIDs` are in deterministic seed ranking order. `unexpandedInitialSeedIDs`
is that list without the generation-1 seed; later generations select only the
immediately preceding confirmations. `generations` are in ordinal order.
`seeds`, `regions` and `replies` are unique and sorted by their respective IDs.
Matches/exclusions use path/line order; attempts retain native message/part
order after tuple deduplication. Initial seeds and every new confirmed seed
appear once in `seeds`; no speculative candidate becomes a seed.

`attemptID` uses the existing CODE operation ID formula for the tuple, even
when no capture exists. `operationID` is present only when that capture actually
exists and must equal `attemptID`. Native message states may be updated during
observation, but a generation snapshots the final observed inventory once its
owned drain has completed. It never turns a pending/error/provider-executed
attempt into a completed capture.

`NativeReply` is the exact last text part selected from the actual
`TaskTool.completedReply(messages, promptMessageID)`. Its reply ID hashes
`{schema:"review-variant-reply-v1", inputHash, sessionID, promptMessageID,
assistantMessageID, textPartID, textSha256}`. Empty/missing completed reply is
not invented; an available empty part can be retained but fails stage parsing.
The payload retains that part only, not a reconstructed whole transcript.
Validate its child/role/turn/prompt identity against the admitted namespace.

`CapturedRegion` retains exactly the text returned by the existing captured
source reader, using its existing line semantics. `blobSha256` is the hash of
the full captured blob observed by that reader; `textSha256` hashes the UTF-8
returned region text. `regionID` hashes
`{schema:"review-variant-region-v1", sourceSha256, path, oid, blobSha256,
startLine, endLine, textSha256}`. A partial quote cannot recompute a full blob
OID; replay does not claim that it can. Paths/OIDs must match Prepared.files.

For each Examination, `rawVerdict` is the actual indexed verdict in the reply,
within its admitted candidate cap; `verdict` is the result of the existing
offered-rung validator. Both verdicts must name the exact host candidate ID:
`V<ordinal>-<matchID>` for a new generation, or the original `finding.id` for
an initial seed. A confirmation requires a settled offered rung and
qualified quote/tool proof. `regionID` identifies the exact candidate/finding
range. `quoteRegionID` is required exactly when the normalized verdict is a
confirmation with quote evidence; its region must match that evidence's exact
path/start/end and may equal or differ from `regionID`. It is absent for tool
evidence, questions and noise. Its finding/history/evidence must agree with
the verdict and the applicable captured regions. A new-generation verifier
must differ from its proposal and all earlier verifier Sessions. A tool seed's
`toolProofID` binds the actual qualified final analysis and item; quote seeds
forbid this field.

Raw CODE result bytes remain in their existing required artifact, referenced
by operation ID. Exact regions, selected reply parts and normalized decisions
are inline in the canonical variants section; **there is no new artifact
kind/descriptor for a generation**. These bytes consume the existing receipt
limit. Overflow is a fatal receipt-bound failure, not permission to clip proof,
drop a match, raise limits or convert the failure to not-examined.

All new profiles use this section. Diligence/artifact have limit 0,
not-applicable and empty generation/seed/region/reply arrays. Zero-attempt audits
have the explicit eligibility stop; Quick does not manufacture initial seeds.

## 9. Replay, publication and host coverage

Before publication and on replay, independently recompute IDs, native tuple
links, proposal/verifier decoding, offered-history validation, source/ranges,
known-seed membership, deterministic seed selection, visited subtraction,
counts and stop precedence from the receipt and required immutable bodies.
Do not trust serialized aggregate counts as their own proof. Validate all
existing artifacts/analyses/proofs and all newly referenced CODE bodies too.

The durable metadata journal must match every reservation and generation hash.
Namespace must reproduce the admitted lead identity. Only observed successful
native settlement qualifies a search. Stored-byte hashes do not authenticate
a malicious host/database writer; the threat boundary remains the existing
trusted-host evidence model.

Exact completed replay uses durable metadata/bodies only: no new Git, config,
catalog, provider, search, source read or verification. Preserve strict delivered
state-v1/v2 and receipt-v1 reading and their byte-identical reports, manifests,
IDs and pages. Do not upgrade a reused request ID into state-v3 or variant work.
Ownerless unfinished legacy/new requests retain the existing interrupted
terminal behavior; they never resume a generation after reopening.

A missing required receipt reference keeps `engagement-evidence-missing`.
Wrong version, malformed journal/variants, mismatched references or corrupt
required bodies keep `engagement-evidence-corrupt`. There is no fallback from
v3 to v2/v1. Legacy v1 remains the existing `legacy-record` unavailable case.

Cancelled, expired or failed requests publish **no receipt and no partial
report**. Keep their immutable terminal envelope, evidence-publication gap,
terminal-status unavailable reader and awaited native cleanup. Unreachable
orphan blobs do not become a late receipt.

For newly completed audit reports, the host replaces the old unconditional
`audit:variants/not-built` gap with `audit:variants/<actual stop>`. It adds
`audit:variants:seed:<findingID>/not-selected` for unexpanded initial seeds and
`audit:variants:match:<matchID>/<reason>` for not-examined matches. Questions
also remain report questions. The host owns this reserved coverage prefix;
model-supplied contradictory variants coverage is replaced, not accepted.
Existing unrelated gaps, including history/probes and artifact R20, remain.
Old stored reports are never rewritten to remove their historical not-built gap.

## 10. Exact internal interfaces and implementation split

These names are frozen as the implementation target; they are not new public
tool inputs. Existing Port.run continues returning a string for old callers.

| Module/boundary | Minimal responsibility |
| --- | --- |
| New `workflow/review-variant-schema.ts` / `ReviewVariantSchemaV2` | Strict Proposal, journal and receipt section schemas; canonical IDs; typed pure accounting/stop checks. |
| New `workflow/review-variants.ts` / `ReviewVariantsV2` | Sequential three-generation coordinator, deterministic lineage and total disposition accounting. |
| New `workflow/review-fanout-verification.ts` / `ReviewFanoutVerificationV2` | Extract the existing bounded verifier scope/options/brief/validation boundary; ordinary callers preserve behavior, variants supply already captured candidate regions and strict batch membership. |
| New `workflow/review-variant-validation.ts` / `ReviewVariantValidationV2` | Durable section validation using existing captured CODE/analysis bodies and qualified proof checks. |
| New `tools/review-engagement-variants.ts` / `ReviewEngagementVariantsV2` | Host bridge to ticket, Store journal, captured reader, collector and owned native port. |
| `review-fanout.ts` | Optional `afterConfirmed` before the single finish, including zero-work Quick/blocked paths; preserve actual initial confirmation provenance. Supply its existing shared-permit run wrapper to the hook. |
| `review-engagement-store.ts` | Add strict v3 journal plus reserveVariant/settleVariant/closeVariants, and bind v3 completion to receipt v2. Keep old schemas exact. |
| Collector/schema/validation/artifacts | Add observe/read capabilities below, a strict receipt version union and the private sealed-journal binding from section 7. No second Core CODE observer, artifact scan or producer override. |
| Controller/report/support | Wire the hook and observed replies, closed policy/coverage and stage-specific skills; retain owner/Session lifetime and final publication barrier. |
| Variant skill and existing guide | Require the single generalized search containing the seed, correct the exactly-half sentence and describe actual bounded behavior/limitations, with no installed-update claim. |

The hook receives `confirmation: independent | unavailable | none`, the actual
initial confirmed settlements (including verifier Session, turn key, history
and offered options), questions, pinned routing/catalog/tier and intent. It
returns additional confirmed findings, questions and host notExamined entries.
`unavailable` is Quick; `none` covers blocked/no-confirmation paths. It runs
once for report admissions, and never for omitted-policy legacy callers.

The host bridge provides `validateSeeds`, `reserveVariant`, `settleVariant`,
`closeVariants`, `readRegion`, and the existing owned create/bind/run operations.
The run supplied to the coordinator already uses the **same** shared fanout
permit; a nested/new permit is not introduced.

Extend collector `acknowledge(sessionID, messages, turn?)` with optional host
turn metadata `{promptMessageID, childKey, role, turnKey, reply?}`. `reply`, when
present, is the actual completed `{assistantMessageID, textPartID, text}` selected
by the controller from those same messages. Existing acknowledgements remain
unchanged when `turn` is absent. The collector builds the complete attempt
inventory and stores observed turn identity, without new Session reads.

Add host-private collector methods `variantTurn(sessionID, promptMessageID)`,
`validateVariantSeeds(confirmations, readRegion)`, and
`recordVariants(variants)`. All use the existing active/latch/permit boundary.
`variantTurn` returns observed reply/attempt facts, never display-text matches.
`validateVariantSeeds` shares the qualified proof validator used at seal.
`recordVariants` receives the finalized section for seal/replay validation;
it cannot replace earlier CODE observations or clear a latched failure.

Split large existing files coherently; do not grow legacy godfiles, minify,
remove meaningful comments/assertions, add waivers or move limits to make a
gate pass. No Core source change belongs to this variants slice beyond the
separately qualified search prerequisite.

## 11. Causal public RED packet

Use the real registry, SessionExecutionLocal, permissions/skills, file SQLite,
Git, captured source and CODE. Script only LLM transport. New fixture companions
handle the two variant stage prefixes and emit real tool events; preserve the
original reply helper and graph. Every new-stage wait races its Deferred with
completion of the original invocation so the predecessor fails an assertion
instead of hanging on an unimplemented stage.

1. Three genuine generations: two real initial seeds; deterministic choice;
   each cumulative regex returns selected seed, old anchors and three fresh
   locations; two independently confirmed and one refuted. Assert counts3/1,
   immediate-prior seed, full identities, fresh independent Sessions, stable
   initial/new IDs and no fourth work. Include admitted ignore override,
   excluded sentinel, live/probe mutations, temp deletion/HEAD/settings move
   and byte-identical reopened replay with zero new work. One initial quote
   uses an admitted supporting range different from its finding range; prove
   both regions and keep the search control at the finding's primary line.
2. Exact half: seed plus two fresh locations, one confirmed/one noise; one
   generation, `half-noise`, no later Session/search. The seed cannot dilute it.
3. Zero/uncertain table: no confirmed audit seed; Quick without independent
   seed; confirmed diligence/artifact; complete no-new-matches search; and a
   confirmed-plus-question generation. Require exact stops/limits and no
   unauthorized skill/next generation. Preserve R20.
4. Invalid witnesses: real missing-seed result, only a real foreign/lead call,
   multiple actual local attempts, and unavailable native completion. Genuine
   witness controls precede the target. The initial forged-tool-URI ordering
   control must also prove zero variant child/search; its old-baseline green
   ordering control is not mislabeled as RED by itself.
5. Genuine incompleteness: >200 hits and a real late-NUL source through the
   registered tool. Prove the actual pagination/binary flags before stop;
   no variant verifier or favorable ratio. Missing runtime is not RED.
6. Original minute: 50 seconds acquisition/initial work plus a suspended actual
   variant/verifier; pending at59, finalizer at60, then await native cleanup.
   Empty owned execution, stopped retry, no receipt or late publication.
7. Owner interruption during a real proposal/verifier: preserve interrupt
   Cause, drain only owned work, reopen immutable cancellation without extra
   inputs/provider/search; preserve follower cancellation behavior. Separately
   run two distinct real audits concurrently: hold audit A in a native variant
   turn while audit B has two initial lens turns eligible. A and B's first lens
   occupy the shared two permits; B's second lens must not start until a permit
   is released. Then require actual progress and successful completion. Observe
   native starts/completions, not only coordinator counters. Two sequential
   variant stages alone would not distinguish a new private semaphore; this
   mixed-stage control proves shared capacity and catches nested-permit stalls.
8. Journal/receipt binding and legacy replay: real positive receipt first,
   then one changed generation/seed/count/native identity refused as corrupt;
   restore exact bytes and replay. Preserve independently decoded historical
   v1/v2 state and v1 evidence without a new generation.

Freeze actual tests and allowed legacy-fixture transitions before qualifying
predecessor assertion RED. Implementation must wait for that evidence; source
review or unavailable-as-delivered output is not a replacement.

## 12. Explicit transitions of existing frozen assertions

These are named freeze exceptions to review before editing; they do not lower
existing source, native, identity or quota requirements.

| Existing exact assertion | Required transition; preserved proof |
| --- | --- |
| `lucy-engagement-public.test.ts:87`, audit variants/not-built | Use the actual eligibility/no-new-matches outcome and receipt-v2 ledger for that fixture; preserve finding/source/citation/no-verdict and history/probe gaps. Do not invent a search if it has no independent seed. |
| `fixture/lucy-engagement.ts` stage/reply helper | Keep its old API/graph. Add a companion that handles the new stage prefixes through real native CODE, not a silent fake variant answer. |
| `fixture/lucy-engagement-artifacts.ts:249–263`, strict receipt-v1 | Strict discriminated v1/v2 decoding, canonical bytes and reference validation. Do not disable excess-field rejection or rename operation/index/page/cursor-v1. |
| `lucy-engagement-artifacts.test.ts:33,41–49` | Keep the six actual lead calls and repeated IDs exact. Associate those six operations with that lead Session; separately validate actual variant operations. Never inflate the lead count. |
| Artifact-count mini positive at120–128 | For the confirmed audit positive, companion performs one genuine known-instance/no-new-matches search: exactly one analysis plus one CODE operation, three analysis descriptors plus one citation plus that CODE body. Preserve the original four-descriptor partition separately; total becomes five, not an unbounded lower-bound assertion. |
| Artifact-count main126/127 and252 body witnesses | Unchanged threshold,128 CODE ceiling,256 descriptors, original clock and initial-lens target. Variant work is later and must not excuse an earlier bound failure. |
| CODE128/129,16MiB body and64MiB aggregate tests | Preserve actual completions, bytes and exact failure targets. No early synthetic variants failure, new skip or renewed budget. |
| Receipt-size22-search case | Preserve22 actual lead searches and its own canonical inputs already exceeding1MiB. Account separately for any later variant call; it cannot become the alleged cause of the preexisting payload bound. Keep the other quotas below their limits. |
|4096-byte citation/page test | Preserve exact source bytes, one complete page and cursor binding; only successful stage/receipt parsing adapts. |
| Native oxlint case | Preserve two analyses, four native proofs and eight copied input files. Variants never reanalyze. |
| Forged-tool-URI case | Keep report-invalid and its genuine initial verifier. New packet additionally proves the proof barrier occurs before variant child/search. |
| Lifecycle149–157 and model-identity legacy constructor around207 | New admission expects state-v3. When constructing a strict historical v1 fixture, remove evidence **and variants-only fields**, preserving exact output/model/identity/budget/children. Add strict historical v2/receipt-v1 preservation; do not merely relabel a v3 object with excess fields. |
| Model-identity `owned()` at32 | New admissions expect v3; every exact native child model/presence/retry/digest assertion stays. The v1 historical default behavior remains, and v2 exact model identity remains a delivered compatibility control. |
| Diligence persistence and numeric policy | No variant stages. Preserve original equality, replay/no-work and numerical half-noise assertions. Only explicit new state/receipt version checks change. |

Historical fixture data must conform to the delivered strict schema and use
actual retained producer bytes. Freeze its canonical report/receipt bytes
before testing replay. Production never rewrites old records or transforms
their receipts; test construction is not a migration feature.

The required v2 compatibility fixture has a concrete test-only construction:
complete a genuine diligence request with zero variants and real retained
producer bodies; remove the new `variants` field from the receipt, replace its
schema discriminator with `review-engagement-evidence-v1`, and validate the
result against the preserved strict v1 receipt schema. Publish those canonical
bytes through the existing `CapabilityArtifacts.storage(...).blobs` backend
at the same fixture root. Remove `variants` from the saved state, replace its
schema with `review-engagement-state-v2`, and set its existing evidence
reference to the new canonical receipt's digest/byte count. Preserve the exact
report output, source, model, budget, children, operations and producer bodies.
Validate the strict delivered state shape, then freeze metadata, report,
receipt, index and page bytes before reopening and replaying through the
public route. Name it a constructed delivered-format compatibility fixture,
not a record produced by running historical v2 code. No public input/API or
production migration is added. The v1 fixture additionally removes evidence
and retains its already specified historical model normalization.

## 13. Source inspection anchors

The following delivered blobs remain the implementation starting points in
the qualified #1643 baseline recorded above. Its search prerequisite is
already integrated and does not change these Maestro/skill blobs.

| Path under `modules/maestro/coordination/src/v2/` unless absolute repo path | Blob |
| --- | --- |
| `workflow/review-fanout.ts` | `6dceac9df2ad25d588788676746aa642c34e7396` |
| `workflow/review-fanout-support.ts` | `45cbbd855fe0d840655bfa893895a183cf69be06` |
| `workflow/review-engagement-policy.ts` | `83f69ecbe1f284109ba35c28300eaeaf4438eba5` |
| `tools/review-engagement.ts` | `cb4011eca3f4de1f5dccf35a462f5ad0ff26d221` |
| `tools/review-engagement-store.ts` | `7d78155620455c5effe1cd7f7f4fd175cb795dc9` |
| `workflow/review-engagement-artifact-schema.ts` | `e266e429a69dc4e3244f091ede7e97ab4f980c5b` |
| `workflow/review-engagement-artifact-collector.ts` | `b79c25b1d24be97d64b33d5bb691fbecedd3710c` |
| `workflow/review-engagement-artifact-validation.ts` | `148d7d3b2a9c09d6f8fb08a9016f4ccadd9ab907` |
| `workflow/review-engagement-report.ts` | `ceab09b959dd3066a85b768eb575edbf9d635165` |
| `tools/review-code.ts` | `1f4d6122086739028220581ca770eeef7b04c411` |
| `packages/lucy-specialist/skills/lucy-audit/variant/SKILL.md` | `fb681cdaceb75df87841e73d602aa6ea60c15680` |

For the explicit-glob mechanism, the pinned primary reference is
[ripgrep15.2.0 flag definitions](https://github.com/BurntSushi/ripgrep/blob/15.2.0/crates/core/flags/defs.rs).
For binary completeness, use only the separately frozen search contract and
its actual gate records. This contract does not claim an installed update,
variants runtime success or authority beyond the bounded audit lineage above.
