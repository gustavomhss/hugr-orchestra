> Lead-authored source-correction derivative v3. The original research body and acceptance are preserved predecessors, not approval of this correction; exact new review/publication bindings are supplied by the host.

# Session input — bounded operational interface supplement

Status: CANDIDATE, not independently accepted · 2026-11-05.
Purpose: resolve the explicit transport-reference gap returned by the L4 Sol operational producer.
This is a declared evidence amendment at source baseline `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`,
not a silent re-mining of L1–L3 or a change to their accepted body identities.
Parent integration: `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d`.
Authorship: source-inspected lead reference; requires both persistent Terra reviews before producer reuse.

## Authority and scope

Use the current project's authorized Orchestra transport, base address and Session placement. This reference
describes the Orchestra Protocol/Server contract at the baseline; it is **not** the external OpenCode CLI
used to run this research campaign. It does not supply deployment credentials, a base URL, an operator UI,
new permissions or authority to act. No runtime request, test execution or provider operation was performed.

## Submission and exact retry contract

`POST /api/session/:sessionID/prompt` accepts JSON with required `prompt` and optional `id`, `delivery`,
`resume`. `prompt` has required string `text`, optional file attachments and optional agent attachments.
The delivery vocabulary is the supplied Schema `steer | queue`; omission/default semantics and the
admit-only limits remain those of the accepted L3, not a new guarantee from an endpoint annotation.

An illustrative normal admit-only body (not an executed request) is:

```json
{"prompt":{"text":"the caller's intended prompt"},"delivery":"steer","resume":false}
```

If exact retry may be needed, preserve a caller-supplied valid message ID or recover the generated one
from a successful admission receipt. Resend the original request's Session, ID, prompt and delivery;
the endpoint has no separate retry verb. Retry-equivalence/conflict/historical provenance semantics
are inherited from accepted L3. Do not mint a replacement ID to evade ambiguous delivery or a conflict.
The public payload does not declare `timeCreated` or `promptContext`; do not add internal receipt/context
fields to the payload. Optional attachment shapes must follow the supplied public prompt schema.

The handler forwards `sessionID`, `id`, `prompt`, `delivery`, `resume` to the admission facade. It maps
`Session.PromptConflictError` to protocol `ConflictError` identifying the message ID; a prompt-blocking hook
also maps to `ConflictError` with its detail and Session resource. A conflict is not automatically evidence
of duplicate provider work, nor permission to create another message.

Evidence: `packages/protocol/src/groups/session.ts:333–350`;
`packages/server/src/handlers/session.ts:58–80,247–259`;
`packages/schema/src/prompt-input.ts:21–26`; `packages/schema/src/session-delivery.ts`.

## Admission receipt and supported observations

Successful admission returns `{data: SessionInput.Admitted}`. The schema carries `admittedSeq`, `id`,
`sessionID`, normalized `prompt`, `delivery`, `timeCreated`, optional `promptContext`, optional `promotedSeq`.
Preserve the actual returned receipt; it is acknowledgment, not proof of a new admission event, visibility,
provider completion, or a global absence of scheduling. Retrying to fetch a receipt can itself request a
wake unless admit-only; it is not a generic read-only inspection operation.

Public observation interfaces available in the inspected protocol:

- `GET /api/session/:sessionID/message/:messageID` returns one projected message owned by the Session,
  or a declared Session/message-not-found error. A missing projected message alone is not proof of a lost
  admission or failed provider work.
- `GET /api/session/:sessionID/history` returns a finite page of public durable Session events plus
  `hasMore`. Its optional query is `limit` (positive integer at most 100) and `after` (nonnegative exclusive
  aggregate sequence). When `hasMore` is true, derive the next exclusive `after` from the final returned
  event's durable sequence, not a message ID, timestamp or page number. Follow `hasMore` within the declared
  inspection bound; do not treat one page or a moving history as a complete absence proof.
  Cursor derivation evidence: `docs/specs/v2/session.md:179` at the stated baseline. `Prompted` and `PromptAdmitted` are in the durable event inventory.
- `GET /api/session/active` returns a map of foreground drains owned by this Orchestra process, with
  entries of type `running`. This is not a durable inbox, continuation trace, cross-process ownership map
  or provider-result receipt.

These interfaces do not, merely by their existence, establish a particular row's current cutoff, queue
rank, continuation state, pre-promotion check outcome or an interrupted provider's completion/usage.
If that is the deciding premise and no approved observation is supplied, hand off that exact missing
runtime evidence; do not invent an inbox-inspection endpoint or inspect/mutate the database as a shortcut.

Evidence: `packages/schema/src/session-input.ts:12–25`;
`packages/protocol/src/groups/session.ts:95–104,175–183,617–634,670–683`;
`packages/schema/src/session-event.ts:143–155,511–523`.

## Interruption boundary

`POST /api/session/:sessionID/interrupt` declares no request payload and returns no content on success.
Its public description is active execution owned by this Orchestra process; idle interruption is a no-op.
The accepted L3 supplies the intended cleanup/inbox/coalesced-wake distinctions and their runtime-proof
limits. The endpoint does not establish those effects were observed, settle provider outcome/usage or
authorize automatic replay. Do not invoke interruption merely to diagnose a missing visible message, and
never restart the owner's application/server to obtain these observations.

Evidence: `packages/protocol/src/groups/session.ts:655–666` plus exact accepted L3 state/evidence bodies.

## Acceptance contract

**Axioms/invariants:** GO-A1..7 / GO-I1..8 / QS-1..6. Reuse accepted semantics; only add the missing public
interface evidence. Original source/producer/accepted artifacts unchanged. Source declarations are not
runtime proof, operator authorization or permission to broaden scope.
**Inputs:** exact frozen numbered excerpts of the six listed Protocol/Server/Schema files and accepted
L3 bindings; no credentials, runtime requests, private incident observations or reserved oracle answers.
**Deliverable:** this source-bound operational reference, its exact source-amendment manifest and two
independent version-bound decisions. No new operational API or production artifact kind is implemented.

| ID | Complete only if |
| --- | --- |
| OA-1 | Submission method/path/payload and prompt/delivery shapes match supplied source; example is valid declared shape and not an executed request. |
| OA-2 | Same-endpoint retry mapping, handler conflict distinctions and internal-field exclusions preserve accepted identity/wake semantics without new provider guarantees. |
| OA-3 | Receipt shape and acknowledgment limits are supported, including the warning that a retry is not necessarily a read-only observation. |
| OA-4 | Message/history/active methods, shapes and pagination limits are source-bound; no page/map absence becomes universal runtime proof. |
| OA-5 | Interruption public interface and inherited intent/runtime limits remain separate; missing internal observations yield a precise safe handoff, not invented endpoints or DB repair. |
| OA-6 | Scope/authority/freshness and original research preservation are explicit; this is Orchestra evidence, not the external campaign runner, and supplies no deployment/authentication/runtime proof. |

**Success/DoD:** both SAME Terra sessions approve every OA criterion for the exact body/source manifest;
then only the dependent operational L4 producer revises using this accepted supplementary reference.
Unaffected L4 results remain reusable but the complete new L4 manifest still needs independent review.
**Stop:** any source/body mismatch, unsupported required interface claim, changed baseline or unresolved
critical contradiction. Do not rerun successful siblings, invent currentness or silently switch providers.
