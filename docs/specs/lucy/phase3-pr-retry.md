# PR review: completed-retry fact trace

Preparation at `429bf542a796ef31acd3a004d10f6c8e24996dc1`; not an implementation, a
new orchestration design, or a claim that standalone PR review is wired. The lead must freeze
the interface before backend work. Paths and lines below refer to this baseline.

## Existing sequence and conflict

1. `modules/maestro/coordination/src/v2/tools/review.ts:325-326,351-353` derives a stable lead
   from parent, validation, stage and reviewed head, and child IDs from lead and child key. The
   cache name is stable per validation and stage, not an analysis result identity.
2. `workflow/review-fanout.ts:160-165` routes then runs host analysis on every invocation, before
   it creates/adopts the lead. `review.ts:126-148,404-405` calls `ReviewAnalyze.run` at the bound
   base/head and stores under `analysisStore(cache)`; `review.ts:650` places that store in tmpdir.
3. `packages/core/src/review-toolkit/analyze.ts:79-86,106-112` allocates a fresh UUID on each run,
   writes `retained.json` and `debt.json` and returns `review:<uuid>/...` URIs. Scanner raw
   outputs also use that write boundary (`analyze.ts:184`); successful checks may contain raw URIs.
   The process-local base cache (`analyze.ts:74-76`) is not a stable whole-analysis replay record.
4. Quick's finish brief embeds `analysis.retained.uri` explicitly (`review-fanout.ts:277-294`);
   Standard's finish brief embeds `analysis.checks` (`:502-517`), which may carry newly generated
   raw URIs. Changed inputs can also change results. Thus a repeat can construct different brief
   bytes for the same logical stage; this is not a claim every Standard invocation always changes.
5. `review.ts:367-387` adopts the stable child and computes prompt ID from child and `turn.key`
   (`entry`, `hunt`, `verify`, `finish` in `review-fanout.ts:211,233,333,404`). It submits queue
   delivery with `resume: false` **before** looking up the completed reply (`review.ts:395-401`).
   For the same child and turn key, a changed brief goes to the same prompt ID.
6. `packages/core/src/session.ts:491-515` calls durable `SessionInput.admit`; `session/input.ts:48-63`
   rejects a non-equivalent existing admission. Equivalence requires same Session, delivery and
   encoded prompt (`:291-302`). The mismatch is `PromptConflictError`, not permission to rerun a
   different prompt. The failure happens before `TaskTool.completedReply` can reuse the reply.

## Existing durable and host boundaries

- `review-fanout.ts:714-723` adopts an existing Session scope only when it exactly equals the
  requested scope; a different scope fails. This protects scope but does not stabilize analysis.
- Durable Session admission retains the admitted prompt; `SessionV2.messages` retrieves projected
  history (`review.ts:395-401`). `TaskTool.completedReply` (`packages/core/src/tool/task.ts:557-574`)
  finds a completed assistant reply after the named user prompt and before the next user message;
  it refuses unfinished, failed or still-tool-calling replies. The reply is model output, not a
  host-authoritative review fact merely because it is durable.
- Host computes the route and applies the decoded entry to derive `afterEntry`
  (`review-fanout.ts:160-161,211-228`). Lens/verifier responses are untrusted model outputs, parsed
  and capped (`:333-345,404-416`); host merges candidates and constructs `confirmed` from the
  candidate/result pairs (`:350-359,422-446`). A confirmation records a verifier's assertion and
  evidence; it is not automatically a proof that the asserted defect is logically true.
- Host constructs final routing, counts, coverage and analyzer-read bindings (`:470-500`) and puts
  routing and the host-merged confirmed list in the final **user prompt** (`:502-517`). Once that
  prompt has actually been admitted, its durable content is an existing trace of what the host
  supplied, distinct from the subsequent model-generated card. This trace is not a typed standalone
  host-facts record; parsing it safely, provenance and validation are unresolved. A missing or
  incomplete final prompt cannot be treated as an empty confirmed list.
- Analysis artifacts retain raw scanner output and normalized retained/debt data, not a final
  verdict (`analyze.ts:79-112,184`; `review.ts:650-653,675-692`). They do not by themselves retain
  the complete final host-merged confirmed set or prove that a retry is the same request. Ordinary
  host metadata beside them could be a candidate seam, but none is specified or frozen here.
- `packages/schema/src/maestro-review.ts:53-75` quote evidence contains `path`, `startLine`,
  `endLine`, not quote text. A future handler can verify that an actual bound Git blob and range
  exist and read its bytes; it cannot compare nonexistent model quote content or establish logical
  entailment merely from the range. Validate cited bytes as source data, not instructions.

## Candidate reuse boundary — lead decision, not an implementation contract

Investigate reuse at the existing host fan-out/Port boundary before `port.analyze` and before
submitting a repeated prompt. Candidate inputs are the exact host-bound request/identity, durable
child prompt and completed reply, plus independently available host facts; candidate outputs are
the original host-confirmed facts and completed reply **only after** their identity/provenance and
availability are established. The lead must decide whether and how existing prompt records, or
host-only metadata in the existing analysis store, can support this. Neither the model's final card
nor its claimed routing supplies expected host facts. Do not write a final card as a receipt file.

The freeze must resolve exact retry identity and collision checks, final host-fact representation,
binding to final routing/catalog/scope and original analysis, durable lookup and integrity, missing
or stale artifacts, concurrent repeat behavior, and how the caller validates the recovered card.
It must say which durable data proves the prior turn completed before avoiding a provider call.
Temporary artifact storage may disappear; missing trusted facts must not become empty facts or an
approval. No cache retention, eviction, or persistence policy is chosen by this trace.

An ordinary explicit retry of an already **completed** review may reuse a proven completed result;
an interrupted or crashed review is different. `AGENTS.md` V2 Session Core reserves post-crash
provider-work continuation for a separate explicit design. This packet does not authorize automatic
recovery, provider reexecution, new governed receipts, Board/forge writes, or a public Protocol.
Hashing a changed brief into a new prompt ID changes provider-work identity and can reexecute an old
review; it does not reconcile this conflict.

## Evidence still owed

After the lead freezes the seam, use focused remote CI to demonstrate the same completed request
reuses authoritative host facts and the completed response without another provider turn, while a
changed identity, missing facts, different scope and unfinished/crashed turn fail according to that
contract. Include a positive control that the current fresh-analysis URI changes the brief and
triggers the existing prompt conflict. No tests, typecheck, CI or runtime were executed for this trace.
