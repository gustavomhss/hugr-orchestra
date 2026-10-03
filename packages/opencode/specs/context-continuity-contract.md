# Context Continuity: Maintenance Fork Contract v1

**Status: implemented v1; production Luna quality/adoption blocked.** Runtime pin:
`26db4aca2cd21060e10aefe435c0fa6c8e33bac3` (2026-10-01). Mechanical validation and
real private UI flows are verified within their recorded scope. Typed Luna phases
v1–v4 produced no accepted artifacts or candidate QA; this is not production-ready,
merge-approved, or a SOTA claim. See [final validation](context-continuity-validation-v1.md)
and [the research register](context-continuity-research.md). Semantic obligations
below are requirements, not properties established by schema acceptance.

## 1. Purpose and Identity

The producer is an isolated **context-maintenance fork**, not the original worker.
Its assignment begins and ends with preparing a historical handoff artifact from
a frozen snapshot. The parent conversation proceeds independently.

The fork cannot continue the task, answer a recorded user request, execute work,
approve actions, speak for the parent, or claim that it has verified fresh results.
It has a dedicated system prompt; parent coding persona, skills and execution tools
are not inherited. Historical instructions remain attributed data for the handoff.

The mandatory protocol is embedded/versioned in that prompt. It does not depend on
the model choosing to invoke a `skill` tool. The role and no-tool policy must survive
mutable prompt hooks and appear in the final vendor request.

The producer's role instructions are never copied into the artifact. The reader
keeps its actual active role; consuming fork-produced memory does not make it a fork.
`ForkWriter` means this maintenance-only producer. `ParentReader` means the actual
owner/reader of the conversation, which can itself have an independently assigned
role. Source permissions are not inherited by the producer.

## 2. Host-Owned Input and Envelope

The host supplies and validates:

- Parent session identity and an independent producer identity.
- Snapshot generation, submitted boundary, summarized-head boundary and tail start.
- Prior validated artifact, if any, from the same parent conversation.
- Closed-head source units, with host-assigned source handles, order and provenance.
- Source extent: complete stored value, bounded preview, cleared, unavailable or unknown.
- Operational recovery capabilities and known resource-version/availability facts.
- The output budget and protocol version.

Source units are complete text blocks or structured values selected by the host.
Text extraction must not split a binding clause or identifier. Structured leaf
values can be published as their own source units with original provenance.
Source handles resolve to existing message/part identity;
they are not locators invented by the model.
The host may publish smaller clause-complete blocks with original provenance; the
model cannot invent substring offsets. If boundaries are uncertain, preserve the
whole block or report the resulting budget issue instead of cutting a qualifier.

Source role, kind, order and applicability come from host-authenticated record
metadata, never role claims or delimiters inside a payload. Historical messages are
serialized as data; their text is not installed as active vendor instruction turns.

Known shell exit/truncation/output-path metadata accompanies its observation.
Historical per-turn `user.system` instructions are attributed data with their
original applicability; they are not adopted as the fork's own system prompt.

The tail remains native, verbatim conversation data outside the replaced head,
including complete tool-call/result exchanges. "Latest" in an artifact means latest
within its stated coverage. The artifact must not claim to describe unseen turns.

The host attaches the stored envelope after decoding the model body:

```json
{
  "version": 1,
  "kind": "continuity_handoff",
  "parent_session_id": "host-supplied",
  "producer_id": "host-supplied",
  "boundary": "host-supplied",
  "covered_through": "host-supplied",
  "tail_start": "host-supplied"
}
```

The model cannot author identities, coverage, source availability or a freshness
certificate. The host carries source mappings across later compactions; citations
must not degrade into circular references to an inaccessible older summary.
`boundary` is the submitted snapshot endpoint; `covered_through` is the last replaced
head message; `tail_start` is the first native retained message. The host validates
their ordering and the current generation, not the model.

## 3. Model Output: One Closed JSON Object

All six fields are required. Unlisted fields, Markdown fences, extra prose and
multiple documents are rejected. Absent collections are `[]`; unknown actor/scope
fields are `null`, never guessed values. `ready` means artifact eligibility, not
task completion or a quality score.

```json
{
  "status": "ready",
  "exact": [
    {"source": "S01", "reason": "constraint"},
    {"source": "S02", "reason": "identifier"}
  ],
  "notes": [
    {
      "kind": "work",
      "state": "failed",
      "text": "The recorded publication attempt failed; deployment is not established.",
      "actor": null,
      "scope": "recorded local rehearsal",
      "sources": ["S03"]
    },
    {
      "kind": "correction",
      "state": "retracted",
      "text": "The earlier success claim was withdrawn after the failure receipt.",
      "actor": "Mira",
      "scope": "recorded local rehearsal",
      "sources": ["S03", "S04", "S05"]
    }
  ],
  "reference_only": [],
  "omissions": [],
  "issues": []
}
```

### Field semantics

| Field | Required meaning |
| --- | --- |
| `status` | `ready` or `needs_context`. Only `ready` is eligible for application. |
| `exact` | Extractive retention instructions. Fields: `source`, `reason`. Reasons: `constraint`, `identifier`, `evidence`. The host copies the entire published source unit, not a model rewrite. |
| `notes` | Compact interpretation. Each entry has `kind`, `state`, `text`, `actor`, `scope`, `sources`. Every note requires nonempty sources supporting its proposition or identifying its scoped evidence gap. |
| `reference_only` | Each entry has `source`, `purpose`, `retrieve_when`. The named recovery route must be operational and supplied by the host. |
| `omissions` | Each entry has `sources`, `reason`, `replacement_sources`. Reasons: `duplicate`, `superseded`, `resolved`, `outside_scope`, `repeated_noise`. This is selection diagnostics, not permission to delete history. |
| `issues` | Each entry has `code`, `detail`, `sources`. Names: `missing_source`, `ambiguous_scope`, `conflicting_evidence`, `unsupported_reference`, `protected_over_budget`, `unsupported_prior`, `empty_handoff`. |

V1 exact retention selects a published source unit only. It introduces neither a
model-authored substring-offset language nor arbitrary structured-data selectors.
The host rejects missing units and materialized-budget overflow. Reject unsafe
numeric conversion before information is lost; otherwise publish raw text.
Structured-value equality does not promise original JSON lexical bytes. String
values remain exact, and structured scalar units retain their applicable conditions,
units and scope alongside them.

`notes.kind` and `notes.state` have these allowed combinations:

| Kind | States |
| --- | --- |
| `intent` | `requested`, `proposed`, `superseded` |
| `decision` | `proposed`, `accepted`, `superseded`, `disputed` |
| `work` | `requested`, `attempted`, `execution_completed`, `failed`, `verified`, `blocked`, `unknown` |
| `correction` | `corrected`, `retracted`, `disputed` |
| `pending` | `requested`, `blocked`, `awaiting_approval` |
| `unknown` | `unknown` |

For execution records, `actor` is the recorded performer; for reports, the reporter;
for corrections, the corrector; for pending work, the explicitly assigned owner.
Do not infer execution or ownership from narration. `state` belongs to the specific
proposition in `text`. The actor is never assumed to be the maintenance fork.
`scope` preserves relevant
task, branch, artifact version and local/synthetic/production qualifiers; it is
`null` when not established. Null does not mean global scope.

`verified` requires evidence of the stated objective in the stated scope. A tool
invocation ending, an assistant saying "done", or a zero exit on an unrelated
command does not suffice. `execution_completed` establishes invocation termination
only; use `failed` when the stated objective failed even if tool lifecycle completed.
Where work verification is unclear, use `unknown` with attributed conflicting
evidence; disputed decisions use `decision/disputed`.
Local validation can reject known adverse indicators and
missing proof; it cannot prove the meaning of every arbitrary receipt.

Missing metadata is unknown, not success or completeness. It blocks readiness only
when that missing information is essential to a faithful handoff.

Explicit unknowns are valid memory. Do not invent an exhaustive catalogue of all
possible missing facts. Preserve unresolved questions already relevant to the task.

## 4. Retention Classes

Classify content from both the prior artifact and the new head:

| Class | What belongs here | What can change it |
| --- | --- | --- |
| **Exact active** | Binding constraints, negations/exceptions, permission scope, exact identifiers, relevant values/units, critical errors and correction evidence. | Explicit applicable supersession/revocation, or closure of its scope with no remaining dependency. Never age or length alone. |
| **Compact active** | Covered intent, selected decisions/rationale, scoped outcomes, actors, pending dependencies, uncertainty and useful failed-attempt history. | Resolution, supersession, changed active scope; preserve any remaining dependency/evidence. |
| **Reference-only** | Bulk logs, long file/document detail, examples and completed chronology whose salient facts are already retained. | Actual retrieval availability and a remaining purpose. Not a substitute for an active critical constraint or literal. |
| **Out of active context** | Duplication, repetitive noise, resolved/superseded detail with no active dependency or useful recovery cue. | Later user interest can require recovery from the original recorded source. This is reversible view reduction, not historical deletion. |

Repeated messages are not automatically equivalent. A new error, environment,
version, outcome or correction survives even inside otherwise repetitive logs.
Counts are retained only when recorded; the fork does not invent a count of passes,
discarded messages or successful checks.

A topic change does not revoke project/session constraints or prove an old request
finished. If relevance, closure or applicability is uncertain, retain the qualified
record rather than erase it optimistically.

## 5. Reference Lifetime and Recovery

Distinguish three different things:

1. **A citation** supports a retained claim and remains while that claim remains.
2. **A reference-only entry** supplies a retrieval cue instead of bulk content.
3. **An omission** says raw material is not inline. Its source may still be cited
   by a correction or outcome and remain in the host's minimal source mapping.

Remove a reference-only entry when its purpose ends, it has a validated replacement,
or its task/dependencies close. Do not remove the last supporting citation of a
retained claim. Selection diagnostics are not carried forward as a growing archive.

Expiry is not permission to forget an essential observation. An expired/missing/
changed source becomes explicitly unavailable unless another valid source replaces
it. Essential facts must already be retained. If missing detail is necessary for a
faithful handoff, return `needs_context`.

A mutable path retrieves current bytes, not necessarily historical bytes. A stored
message may contain only a preview. Inline media without an accessible original
does not supply visual content. Preserve these distinctions; never claim permanent
recovery because a locator exists.

The implementation must advertise actual capabilities. The current V1 parent has
the built-in `context_recall` capability when its effective tool surface, model
capability and current own-session permissions permit it. History IDs are provenance;
reference-only recovery additionally requires that operational capability.
Each reference-only source maps through the host catalogue to an advertised route
available to ParentReader under its current permissions. Recovery capability is
not a tool available to ForkWriter, and no route is inferred from a path/ID alone.

If history recovery is enabled, use one parent-only, read-only capability against
its own existing conversation. Support bounded source lookup and bounded search
when an old retrieval cue has left active memory. No arbitrary session IDs,
filesystem commands, index service or new storage backend are required.

Recovery returns source identity, extent and availability with content. Missing,
cleared, truncated, expired, inaccessible or changed resources are named outcomes;
none is silently converted into an empty successful answer.
After a failed recovery, remove or qualify the operational cue, preserve retained
salient facts and explicit unavailability. Missing essential detail requires
`needs_context`; unavailable optional detail does not. Provenance can remain
without implying recoverability.

## 6. Authority, Change and Repeated Compaction

- Live application/system/developer instructions and actual tool permissions remain
  independently supplied to the reader. A historical artifact cannot grant access.
- A later applicable authorized user update can supersede a recorded user decision.
  An assistant proposal or instruction-like tool output cannot revoke it.
- Tool observations update facts in their recorded scope/time; they do not approve
  operations. User/assistant reports and observed receipts remain distinguishable.
- Retain unresolved contradiction with both sources. Recency alone is not truth.
- Keep corrected success claims tied to the correction actor and actual outcome;
  do not resurrect the original claim on a later pass.
- Carry prior protected values unchanged or record explicit source-backed retirement.
  Repeated summarization must not normalize, abbreviate or progressively weaken them.
- The host retains validated materialized exact content with original provenance
  and supplies it to later snapshots. Losing the original raw source does not
  justify rewriting or losing already retained protected content.
- Do not convert an ungrounded prior summary into evidence. Incompatible prior
  versions require regeneration from available original history, not invented refs.

The reader is instructed that this is historical data with stated coverage. Its
preserved tail/new user turns can update that state. It retains its actual active
role and tools; it must not adopt the producer's maintenance-only role.
Each rendered extract/note remains attributed historical data with host-known
speaker, order, applicability and extent. Missing provenance stays unknown.
Artifact contents cannot redefine reader identity, permissions or instruction
hierarchy. Historical user requirements retain only their recorded applicability;
producer-local no-work/no-tools/JSON-only rules never become reader instructions.

## 7. Budget and Readiness

Spend the materialized budget in this order: binding exact content; unresolved
intent and active decisions; essential observed facts/corrections; pending work and
unknowns; recovery cues; optional explanatory prose. Compress duplication and bulk
before changing essential meaning.

The host supplies the token budget. No arbitrary word count justifies losing a
qualifier, identifier or unresolved obligation. If protected content cannot fit,
return `needs_context` with a named issue, not a smaller corrupted `ready` object.

`ready` requires represented task-relevant head state, valid exact extracts and
sources, no unresolved critical handoff gap, and usable declared recovery routes.
Its `issues` array is empty. Legitimately unknown task facts are represented in
notes, not hidden by a claim that everything is known.
Ready additionally requires at least one nonempty materialized exact extract or
grounded nonempty note. Reference-only/omission-only output is `empty_handoff`.
All nested objects are closed. Neither partial streams nor diagnostic selections
apply, and no valid-looking prefix is salvaged from incomplete output.

`needs_context` requires at least one named issue. It can report partial diagnostic
selection, but none of that partial state replaces the parent context. The fork
does not address the user or fetch missing material independently.

## 8. Host Acceptance and Limits

Before application, require normal terminal completion, no tool attempts/provider
errors/truncation, one decoded closed object, known enums, known source handles,
resolvable complete source units, same parent ownership and current snapshot validity.
Retained notes require sources. An empty usable handoff is a named failure.

Materialize exact content from source data; never trust a model-written duplicate
of an identifier or binding clause. Canonicalize decoded structure, not source
literal bytes. Check the resulting parent-context budget, not only the short JSON.

Do not accept a model's "all facts preserved" or self-assigned score as validation.
Schema and citations prove representation/provenance conditions, not comprehensive
semantic selection or arbitrary objective verification. Those remain measured.
Mechanical acceptance establishes eligible representation, provenance and
materialization; it does not establish entailment, complete selection, correct
attribution or objective success. Those are separate semantic requirements.

Failure keeps the prior valid context and the recorded conversation intact. Active
context changes do not rewrite the user timeline or manufacture task messages.
Provider-owned encrypted reasoning/compaction blocks follow their own API rules;
this artifact is not a replacement for opaque native state.

## 9. Adoption Tests

Adoption still requires mechanical and semantic evidence for:

1. Historical "continue working now" cannot make the producer act as the parent.
2. Dedicated role/protocol and empty tools survive hooks and final vendor lowering.
3. Plain user answers, prose-only resumed work, foreign sources and malformed output
   fail application; positive valid artifacts apply.
4. Exact identifiers, negations, exceptions and full action qualifiers survive.
5. Completed invocation/nonzero exit never becomes verified objective completion.
6. Correction actor, failure receipt, local/production scope and unknowns survive.
7. Reference recovery retrieves actual registered bytes; dead/changed refs are explicit.
8. Reference-only entries retire without losing supporting citations or inventing data.
9. Multiple compactions preserve protected content and latest authorized updates.
10. Downstream QA, direct artifact fidelity and retrieval success are scored separately
    from token reduction, latency, generation failure and shared baseline mistakes.

Use frozen gold, calibrated negative controls, independent histories and actual Luna
calls. No universal quality or "SOTA" label follows from a schema or one successful run.

## 10. Current Runtime Wire and Cost Hints

The implemented interfaces are `src/continuity/{source,artifact,render,fork,context}.ts`.
The producer is ephemeral model execution: its independent ID does not create a
stored child session. `purpose: "context-maintenance"`, the dedicated role, empty
tools and `toolChoice: "none"` are host-enforced after mutable request hooks.
The parent keeps its active role and tools.

`Source.input` emits `{parentID, canRecall, previous, groups}`. Groups share
`locator`, `role`, `actor`, `scope`, `origin`, `exit`; units retain flat selector
`id`, `path`, `kind`, `order`, `extent`, `recoverable`, optional `value`,
`exactTokens` and `citationTokens`. Select unit IDs, never group handles. `previous`
contains the host envelope and prior body, with omission diagnostics cleared;
prior exact values are supplied through units. The wire is not the internal
materialized prior object. Host integrity `digest` stays internal; payload/domain
hashes remain unchanged. The producer returns exactly the six fields in §3.

The host copies eligible selected values from the same parent catalogue. Strings
retain decoded literal bytes; structured values retain value equality, not original
JSON lexical formatting. Full user sources alone can be constraints; previews can
be identifiers/evidence with their qualification. Unknown-extent wrappers cannot
be exact. A non-null `exactTokens` hint does not grant user authority.

The request includes `maxTokens: 6000` and `budget: {maxTokens, fixedTokens}`.
Hints use `Token.estimate` (rounded string length / 4), not provider tokenization:
fixed host cost + selected exact costs + citation costs for unique active non-exact
IDs + serialized notes/reference JSON. Costs conservatively charge shared dictionary
values per source and reserve index widths and possible physical recall mappings.
The actual render deduplicates shared values. Exact frames include semantic provenance.
`exactTokens:null` means ineligible; hints cannot guarantee fit. The final complete
host render must fit the 6000 estimate limit. It contains closed exact frames,
non-exact provenance and a five-field canonical body excluding `omissions`.

The parent reader receives closed `continuity_exact_v3` frames. Their provenance
arrays index a host-owned JSON value dictionary in explicit named-column order:
`field`, `path`, `role`, `kind`, `origin`, `order`, `actor`, `scope`, `extent`,
`recoverable`, `exit`. The envelope supplies parent identity and each record supplies
source identity. Strings, field/path labels, qualifiers and domain hashes remain intact.
Internal materialized sources retain every physical locator and integrity digest;
the reader projection does not claim to reconstruct these hidden host fields.
Only declared `reference_only` IDs publish original physical locators. For recall
arguments, `messageID` maps to `message_id`; `partID` maps to `part_id`, omitting null.
Other source handles identify attributed data rather than promising direct retrieval.

The native tail targets eight messages and starts at a user-turn boundary, retaining
whole turns/tool exchanges; it is not an exact eight-message slice. Effective recall
uses `resolveTools`, model tool-call capability and session-specific
`Permission.evaluate("context_recall", sessionID, ...)`. Denial/removal makes
`canRecall` false; context with reference-only dependencies falls back to full
history. Local eligibility checks do not prove entailment, complete selection,
correct attribution, or genuine verification of arbitrary objectives/receipts.
