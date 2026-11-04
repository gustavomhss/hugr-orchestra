# Phase 3.4: PR review execution packet

Status: **proposal for lead freeze, not an implementation or test report**.
Baseline: `750a23b8ed40af0ceef23f3323ae4910d470718a`; branch `lucy-pr-contract`.
Demand: `build-plan.md:651-654`; stable authored node `lucy-review-pr`,
`git show de3254b1a1:docs/specs/lucy/phase3-execution.md` (T1 owns prose).
This packet does not authorize architecture beyond the lead's explicit acceptance below.

## Observed seams

* `modules/maestro/coordination/src/v2/tools/review.ts:79-91,232-477` registers
  `maestro_request_review`. Maestro is gated; validation, work-card hash, bound
  context, plan and baseline are mandatory. Code requires an approved plan;
  rereview requires its first code round. It calls `ReviewFanoutV2.run` at 418,
  then reads a receipt and optionally writes board-thread request/verdict.
* `workflow/review-fanout.ts:61-121,155-210,230-255,277-295,502-520` owns
  the port, scope, fanout and finish prompts. Quick and normal finish explicitly
  request `maestro_record_review`; blocked finish does not. The result returns
  raw `reply`, not a validated card. `review.ts:574-580` already parses a card
  using `ReviewResultV2.parse` for governed rereview; this is not a PR validator.
* `review-diff.ts:5-25` loads `AGENTS.md`, `CLAUDE.md`, `REVIEW.md` from base
  revision ancestors of changed paths. `review-records.ts:276-379` publishes
  `MaestroEvent.Review.ReceivedV2`; settlement and approval consume governed
  receipts. Conversation/session events are distinct from review receipts.
* Catalog profile and tier names are open validated strings. `code` metadata is
  stage `code`, tier `risk`, overlays true, code lenses and one variant
  (`packages/core/src/review/catalog/entries.ts:240-246`). A `pr` entry alone
  cannot bypass validation or replace the receipt flow.
* `ReviewSeatTools` defines lead/lens/verifier/final tools in
  `packages/core/src/review/seat-tools.ts:23-36`; final includes the record tool.
  `workflow/review-fanout.ts:182-195,300-315,367-372` writes Session scopes.
  Seat permissions also come from `roster.ts:110-136` and ownership/visibility
  from `v2/seats.ts:215-236`; a tool grant and a Session scope are both needed.

## Proposed frozen boundary — lead must approve

Recommend **discriminating the existing `maestro_request_review` input**, retaining
the present shape unchanged as the governed alternative (absence of discriminator
means governed). No new tool name; no claim that generic task delegation implements
this review: the traced actual fanout callsite is the request tool above. Reject
mixed alternatives and excess properties rather than accidentally entering governance.

```ts
// Additional alternative only; existing governed input remains byte-compatible.
{ kind: "pr", baseRef: string, headRef: string, prText?: string,
  tier?: string }
```

`baseRef` and `headRef` are nonempty local Git commit-resolvable refs, not shell
fragments; run Git with argument arrays, resolve each to a commit SHA, reject
missing/ambiguous/non-commit refs and truncated or failed output. No network fetch,
checkout, forge access, mutable worktree content, or implicit default branch.
Resolve `baseSHA = merge-base(baseRef commit, headRef commit)` and `headSHA =`
resolved head commit; require a unique merge base, nonempty complete bounded diff,
and fail closed if unavailable. Load base rules at `baseSHA`, diff `baseSHA..headSHA`,
list files at both commits, and retain artifact diff hash and changed paths. Branch
movement after resolution does not change this immutable candidate; recheck resolution
immediately before provider execution and fail if either ref moved. Worktree dirty
files are excluded, never silently folded into the committed review.

The existing Maestro gate applies before Git or Session creation; normal tool
permission remains in force. `prText` is caller-supplied, bounded untrusted data,
including title/body if desired; never an instruction, base selector or authority
to suppress routing. Pass it in a separately delimited data block through the fanout;
do not concatenate it into `facts.record` or base rules. No forge client is required.

Identity proposal: hash a domain-separated canonical encoding of parent Session ID,
project/location, resolved base/head SHAs, artifact diff hash, exact `prText` bytes,
selected tier and effective catalog/settings identity. Derive lead/child IDs and
prompt IDs from this candidate plus role/turn, rather than validation ID; exact
retries adopt those Sessions, differing inputs or changed heads never reuse them.
Scopes and scratch bindings remain review-lifetime scoped and released by
`Effect.scoped`; persistent Session history is not a durable review receipt.
Resolve concurrency/retry collision behavior with the lead before implementation:
do not promise new-run semantics or allow a changed prompt under an adopted ID.

Invoke the existing `ReviewFanoutV2.run` from `tools/review.ts` using an explicit
internal **completion policy** (`governed` / `card-only`), not a hardcoded profile
test. The policy controls finish instructions and stage tool grants, not routing.
For card-only, omit `maestro_record_review` in both Quick and normal lead scopes,
never set finishing authorization, never call `BoardThread.write`, and do not
read or synthesize a receipt. Blocked, Quick and normal finishes return one card.
Keep governed stage/record/retry and rereview behavior exactly as today.

Output remains the existing `Schema.String`: return a single parsed, validated
`review-card` block to Maestro (with host-derived base/head and artifact identity
alongside it); fail with `Tool.Failure` for missing, malformed, duplicate, mismatched
or unbound cards, not `LUCY_NO_RECEIPT` or an unvalidated model reply. Check card
schema via `ReviewResultV2.parse`, host routing/catalog/method and scope against
the run, and prevent findings that were not verified on non-Quick paths; preserve
blocked cards without claiming success. Freeze any additional card schema fields
with lead before dispatch, rather than inventing a second model result contract.
Public Server `HttpApi`/Protocol is not intended to change; this is an internal
tool schema and fanout contract. If implementation changes either public surface,
stop and obtain approval; `bun run generate` in `packages/client` is then required.

## Cross-seam freezes for lead integration

* G2 catalog owner adds `pr` with `node: lucy-review-pr` and the `code` entry's
  stage, risk tier, overlays, lenses and variants. Profiles/options remain open
  catalog IDs; do not gate behavior on a closed profile enum or name whitelist.
  T1 alone owns `packages/lucy-specialist/skills/lucy-review/pr/SKILL.md`.
* 3.3 owner adds `lucy-audit` to `seats/lucy.ts` skills. In fanout lead Quick
  scope (`:186-195`) and lens scope (`:310-315`), allow/deliver only the routed
  privacy leaf and necessary ancestors, never the entire audit tree. Standard lead
  must not acquire it merely because the seat has the root. Verifier scope
  (`:367-372`) must not receive audit root/other compliance or Atlas context.
  Check actual `SkillTool.deliver`/scope ancestry semantics in acceptance tests.
* G4 owns Atlas implementation: native `atlas-source.ts` reader admission,
  `roster.ts` permission and `v2/seats.ts` ownership/visibility if needed, plus
  `ReviewSeatTools.lead/lens` and fanout stage scopes. Allow `atlas_context`
  catalog/unit only to lead/lens, not anchor, memory, header, resume or verifier.
  `v2/tools/atlas.ts:87-104` separately checks native reader, anchor and permission;
  do not enable `atlasMemory` just to grant reading. Held is explicit not-run.
  Coordinate the shared `seat-tools.ts`/fanout scope hooks: a single owner edits
  each file, G4 supplies its exact dependency; never dispatch conflicting edits.

## RED acceptance, to write before backend implementation

All integration cases invoke the real registered tool and real session/event store;
model responses may be deterministic harness inputs, never substitute a pure route
test for the entrypoint. No execution has been performed for this packet.

1. **PR-ENTRY:** Maestro invokes card-only without validation/plan; non-Maestro,
   mixed shapes and unsupported catalog tier fail before fanout. Valid branch returns
   exactly one schema-valid, host-bound card to the caller.
2. **BASE-DATA:** Git fixture has different base/head rules and injection text in PR
   prose; only base rules bind, prose is delimited data, paths cannot be suppressed.
3. **TREE-IDENTITY:** missing/ambiguous ref, dirty-only diff, truncated diff and
   ref movement fail; committed base/head and artifact hash are reflected in card.
4. **LIFETIME:** exact retry adopts deterministic Sessions; changed head, text or
   tier cannot reuse a candidate/turn; bindings release on success and error.
5. **CARD-VALIDATION:** malformed, duplicate, incorrect routing/scope and invented
   unverified finding fail; blocked result is a valid explicit blocked card; exercise
   both Quick and non-Quick completion and refusal of receipt tool in each.
6. **NO-SIDE-EFFECT:** query actual `EventV2.EventTable` before/after for both
   versions of `MaestroEvent.Review.Received` for parent and descendants; no new
   receipt. Inspect board-thread storage for no request/verdict writes. Instrument
   fake forge transport with a positive-control invocation proving it detects calls;
   PR path records zero forge requests. Normal Session messages may persist.
7. **GOVERNED-REGRESSION:** real request/record path still writes a decodable V2
   review event; approved plan is required for code, rereview first-round/delta
   semantics and settlement remain unchanged, including board behavior.
8. **SCOPED-PRIVACY-ATLAS:** routed privacy leaf only for lead/lens; unrelated
   route and verifier cannot access audit. Lead/lens read actual Atlas catalog/unit;
   verifier, anchor, memory, header and resume denied; held reports not-run.

Planned scoped gates after implementation (GitHub Actions only):
`bun run test:ci maestro test/v2-workflow-review.test.ts test/v2-review-fanout.test.ts test/v2-atlas.test.ts test/v2-atlas-memory.test.ts test/v2-atlas-header.test.ts test/v2-atlas-restore.test.ts test/roster.test.ts test/seat-framework.test.ts`;
`bun run test:ci core test/review/route.test.ts test/review/catalog.test.ts`.
Run package `bun typecheck` in affected directories and root
`bun run check:guards --base origin/dev`; no local tests. One final bundled epic.

## Disjoint writes and small-PR sequence

* Contract/acceptance first: lead freezes this packet and assigns one test owner;
  test files above have one owner, not parallel edits by each backend slice.
* G2 alone: core catalog entries and route/catalog tests; coordinate T1 skill tree.
* 3.3 alone: `seats/lucy.ts` and assigned scope hooks, after 3.2; coordinate G4.
* 3.4 alone: `v2/tools/review.ts`, `v2/workflow/review-fanout.ts` and their
  registered-tool tests; it owns any shared fanout edits for 3.3/G4 sequentially.
* G4 alone: Atlas reader/permission files and Atlas tests; `seat-tools.ts` has one
  assigned owner, changes consumed sequentially by fanout owner. No G4/T1 edits here.
* Lead resolves overlapping test/scope ownership before dispatch; integrate small
  dependent PRs against current baseline, never merge PR 1290 as part of this packet.

Backend return card: `SHA | owned paths | RED cases -> CI evidence | typecheck/guards |
cross-seam changes | blockers/lead decisions`; no self-reported green substitutes for
lead verification. Lead choices: accept discriminator and merge-base contract;
approve candidate identity/retry semantics, exact output envelope and card checks;
assign shared hooks/test ownership before dispatch.
