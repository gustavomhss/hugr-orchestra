# Lucy: build plan

Status: proposal, not approved. Author: `archie`, proposal version 2, parent version 1 (`7efc0c3345`).
Baseline: branch `lucy-design` at `7efc0c3345`, with the design `docs/specs/lucy/design.md` approved by the owner on
2026-11-01 (D1–D15, including §8 "Handling the arsenal" and every change §8.10 lists), its citations refreshed against
the verified answers 10, 15, 22 and 23 in the same change as this revision.

Why version 2: version 1 was written against the design at `5e1da9683e`, before §8 existed, so it shipped an
unrouted arsenal in phase 1, planned the old eleven-root tree with `lucy-toolchain`, and gated work on four draft
answers. This revision builds §8 into the phases, follows the regrouped tree, keeps MCP bridges host-side (D15),
makes budgets and thresholds host-enforced catalog data (D14), and drops the draft gates.

This plan turns the design into phases that each land as their own PR into `dev`. It reopens no design choice. Where
building shows a choice cannot work as written, the choice stays and §9 records the smallest correction.

## How to read this

- **Owner decision** cites the design's D1–D15. **Observed** means read in the source at the baseline while writing
  this plan, with the path. **Proposal** is this plan. **Assumption** carries its check. `[An]` cites
  `research/answers/n-*.md`; every answer is verified.
- Atlas: `atlas_context` returned `held: provider-unconfigured` (evidence `6d2de99a19`) again for this revision. No
  Atlas unit backs any claim here and no knowledge anchor is selected. When a phase runs as a Relay work package, its
  sprint `knowledge` and step `knowledge` arrays stay empty unless Atlas is configured by then.
- The seat is named by its id, `lucy`. Other seats are named by id; the backend specialist is "backend".
- Work package (WP) here means one step of a phase's single linear work package: the steps of a phase map one to one
  to the `work_packages` of one `RelaySprint.Sprint` when Maestro runs the phase governed. They are not product Tasks.

## 1. Goal and scope

**Goal.** Ship the `lucy` seat the design describes, in phases that are each useful on their own. Phase 1 already
routes: the host computes the routing record from the catalog before any model turn, each child Session sees only its
route, and the model judges inside it. Every later phase adds catalog entries, tree nodes, pack backends, probe
options, profiles and tiers to sets phase 1 froze as open, without changing what phase 1 froze.

**In scope.** Design §§2–14 and the extensions E1–E13, as placed in §4.

**Deferred, not in any phase here (proposal).**

- GitHub and GitLab output (§7.6, D8). Opt-in; nothing in the phases needs it, and governed blocking goes through the
  merge queue (phase 2). It becomes its own plan when the owner asks for it.
- MCP bridges as pack backends (§7.5, §8.5, D15). The catalog's pack `backend` field is an open set from phase 1, so a
  bridge is an additive backend kind the host calls and normalizes. Lucy's `mcp` list stays empty in every phase,
  pinned by a test in WP 1.7. No phase needs a bridge; it becomes its own plan when one is wanted.
- Atlas Memory for lucy (D5: later, after §12 measures something).
- The offline eval set, the online resolution rate and the routing ablation (§8.9, §12, D12): designed, never run
  without the owner's permission.
- A project-level override of the budgets and thresholds. D14 makes them tunable; in this plan they are tuned by a
  catalog change, which the receipt's catalog digest records (§5 K5).
- Rendering the card's findings, routing, coverage and handoffs in the session view and board (§7.6 "Owner
  surfaces"). Phase 1 carries the data to the app's wire; the screens go to the Interface session, which owns visual
  work.

## 2. Global acceptance

These apply to every phase. Each WP below cites them and states its delta.

## Completeness Criteria

- Every capability C1–C16 is delivered by the phase §3 names for it, or is listed in §1 as deferred.
- Every extension E1–E13 lands in the phase §4 names, and its contract (§5) is frozen in code before a dependent WP
  starts.
- Every phase ships its docs and skills (§8).

## Success Criteria

- A governed plan review and a code review return a `review-result` card whose findings each carry rule, location,
  trigger, labelled evidence, class, node and rung history (design §6.4, §10.3), and a receipt whose
  `reviewMethodVersion` is `review-v2/<profile>/<tier>` and which binds the routing and catalog digests (§5.3, §10.4).
- The routing record is computed by one pure function before the first lucy turn; the same inputs give the same
  record; model changes appear only as appended, quoted additions; the model can add rigor and never remove it (§8.2).
- No model turn ever sees the catalog, a skill node off its route, another lens's items, or more than its budget
  allows; every budget is a host count, not a prompt instruction (§8.3, D14).
- A finding without evidence is a question, never a FIX_FIRST; APPROVE never coexists with a confirmed P0 or P1;
  `blocked` is returned instead of an APPROVE with a caveat (§6.4, §6.6).
- Every card lists what was examined and what was not, with a reason, including how many analyzer items no model read
  (§6.8, §8.6).
- Settlement keeps today's meaning: plan-stage APPROVE gates, FIX_FIRST spends one retry and carries findings, REJECT
  needs a new plan round (design §1, [A24]).

## Invariants

- Lucy never edits product files, commits, pushes, merges, approves on the owner's behalf or delegates. It writes only
  inside a host-made scratch copy (§6.3). The host creates every child Session (§8.7).
- Lucy never receives the author's transcript. Review rules are read from the base revision; change text is data and
  cannot remove a routed overlay, lens or pack (§6.1, §8.2).
- The host routes, the model judges (§8.1): profile, tier floor, path overlays, languages, lenses, packs, entry nodes
  and budgets are host choices.
- A child Session's skill and tool grants are never wider than lucy's seat grant (E11).
- Child processes start only through `ChildProcessSpawner`, `Process` or omni, wrapped by `ToolSafetySandbox.confine`.
  `script/spawn-allowlist.json` gains no entry.
- No tool is installed and no network is used during a review. A missing toolchain is `not run: <tool> absent`
  (§7.1).
- Lucy's `mcp` list is empty (D15).
- Only lucy may call `maestro_record_review`; only Maestro may call `maestro_request_review` (observed
  `modules/maestro/coordination/src/v2/seats.ts`, design §1).
- Receipts recorded before a phase replay unchanged after it (durable event `maestro.review.received` v2, observed
  `packages/schema/src/maestro-event.ts`, pinned by `packages/schema/test/event-manifest.test.ts`).
- Runtime knowledge lives in the prompt or a shipped seat skill; `lucy-maintenance` and `lucy-ownership` are never in
  `seat.skills`.

## Quality Standards

- AGENTS.md style; no mocks or `globalThis`; tests exercise the implementation, not a copy of its logic.
- A test that spawns through omni calls `expectSpawn(import.meta.path)` before it spawns.
- Each tree node follows `docs/specs/seat-framework/skill-tree.md` and `SeatSkillContent.validate`
  (`modules/maestro/coordination/src/seat-skill-content.ts:78-90`): `when`/`not-when` on non-roots, at most 10
  children, at most three levels below a root; a group body under about 300 tokens, a leaf under about 2,000 (§8.3);
  each leaf names a check lucy runs or a fact it cites, and cites catalog ids, never commands (§8.5).
- "Smart, not bloated": a WP, node, pack or catalog entry that a phase's acceptance does not need is cut, not padded.

## Definition of Done

Per WP: its change-scoped tests pass through `bun run test:ci` on Actions (the run is named in the PR), the package
type check passes through the `typecheck.yml` dispatch (no local type check on the owner's Mac), and
`bun run check:guards --base origin/dev` is clean. Per phase: one full suite run on the phase PR (the `epic` label),
docs and skills shipped, and landing done between governed runs (§7). A worker's done claim is local; the phase is
done when Maestro's review and the owner's merge say so.

## 3. Phases

| Phase | Branch | PR title | Delivers |
|---|---|---|---|
| 1 | `lucy-core` | `feat(maestro): rebuild the lucy review seat` | The routed core: catalog, route function and routing record (E12), per-Session scope with delivered entry node and budgets (E11), the §8.7 sequence (E4), the quote, tool and probe rungs, the §8.6 noise pipeline, item outcomes in the receipt. C1 (governed), C2, C3, C4, C5 (fail-before/pass-after), C6 (concurrency reading), first pass of C8 (secrets, handoff), C16 (no-build lane with gitleaks and the repo's own gates); profiles `plan`, `code`, `rereview`; tiers Quick and Standard; overlays `docs` and `concurrency` |
| 2 | `lucy-queue-receipts` | `feat(core): queue lucy review receipts` | E6: receipts in the PR record, queue refusal on open FIX_FIRST or REJECT |
| 3 | `lucy-lenses` | `feat(maestro): add lucy lenses and overlays` | The rest of `lucy-lens`; the other seven overlays, including `personal-data` with the `privacy` leaf; ast-grep with lucy's own structural rules; profile `pr`; Atlas Own read (E2). C6 (edges in full), C7, C8, C9, C10, C11 |
| 4 | `lucy-languages` | `feat(core): add lucy language packs` | Language catalog entries and no-build packs (C16 per language), `team-stack` additions, offline advisories (D7), the per-rule precision ledger (E13) |
| 5 | `lucy-deep-tier` | `feat(core): add the lucy build lane` | Deep tier; build lane; probe options mutants, interleave, race, property; the rest of `lucy-review-prove`; profile `release`; read-only LSP diagnostics (E7b) |
| 6 | `lucy-audit` | `feat(maestro): add lucy audit and diligence` | Root `lucy-audit` children for engagements; profiles `audit`, `diligence`; C13, C14; discovery generations up to three; C12 and profile `artifact` |
| 7 | `lucy-compliance` | `feat(maestro): add lucy compliance evidence` | C15; profile `compliance`; the remaining `lucy-audit-compliance` leaves; policy, licence and accessibility packs |

Why this order (proposal): phase 1 is the smallest seat worth having that already routes. Standard is the default
tier (D4), and Standard needs the host fan-out (D2), one verifier per class (§8.7, D3) and the route that decides the
lenses, so §8's mechanisms cannot wait. Phase 2 is small and makes the receipt gate merges. Lenses come before
languages because a lens works on any language through quote and probe evidence, while a language pack only adds tool
evidence. The precision ledger lands with the languages because that is where the rule count grows from a handful to
dozens; phase 1 already records every item's outcome, so the ledger starts with history. The build lane executes
repository code and is expensive, so it comes after the cheap lanes are in use. Audit, diligence and compliance are
repository-scoped and reuse everything before them.

Each phase is shippable alone. Until a profile, tier, lens, overlay, pack or probe option exists in the catalog,
`maestro_request_review` and the route refuse or record it by name: an unsupported profile or tier is a named error,
a Deep request runs Standard with `tier.requested: "deep"` and the Deep lanes listed as not examined, reason
`not-built` (§9 R3, R5).

## 4. Framework extensions by phase

| # | Extension | Phase | Contract frozen first (§5) |
|---|---|---|---|
| E1 | Review seat capability: `review_analyze`, `review_probe`, `review_history`, read-only `code_locate`/`code_query`/`code_search`, its own pack set | 1 (no-build lane, gitleaks and repo packs, probe options quote, regress, test, typecheck, script); 3 adds ast-grep; 4 language packs; 5 the build lane and Deep probe options | K6 tool I/O, K7 seat tools and scratch |
| E2 | Read-only `atlas_context` for lucy without Atlas Memory | 3 | K11 |
| E3 | `review-work-result-v1` and parsing of the `review-result` card for a plain `task` | 1 | K2 |
| E4 | `maestro_request_review` takes `profile` and `tier` and runs the §8.7 sequence; rules from the base | 1 (plan, code, rereview; Quick, Standard); 3 `pr`; 5 Deep's two samples and `release`; 6 `audit`, `diligence`, `artifact`; 7 `compliance` | K8 request, K9 stage schemas |
| E5 | `recordReview` and `ReceivedV2` carry the full finding, the routing and catalog digests and item outcomes; unchanged-line findings tied to a changed line (D10); method version | 1 | K1, K3, K10 |
| E6 | Merge queue fills `reviews` and refuses queueing on an open FIX_FIRST or REJECT | 2 | K12 |
| E7 | SARIF normalizer (E7a); read-only LSP diagnostics call (E7b) | E7a in 1; E7b in 5 | K6 `ToolItem` |
| E8 | Validation rejects `routedMemberID: "lucy"` up front | 1 | none (error code only) |
| E9 | The `tests` ability lists lucy's real tools | 1 | none |
| E10 | Scratch-copy service for the reviewed tree | 1 | K7 |
| E11 | Per-Session scope: narrowed skill and tool grants, delivered entry node, load and tool-call budgets | 1 | K5 budgets, K4 scope |
| E12 | Review catalog as typed data, the pure `route` function, the id build check | 1 (entries for phase 1's lenses, classes, overlays, packs, languages, route); every later phase adds entries | K5 catalog, K2 routing record |
| E13 | Per-rule precision ledger derived from receipts | 4 (status derivation); 1 records the outcomes it derives from | K10 item outcome (phase 1), K13 ledger (phase 4) |

## 5. Load-bearing contracts

Each sketch is the smallest seam whose change would force a consumer in another WP or phase to change. Backend writes
them as Effect schemas in the WP that freezes them; names and module paths are proposals backend may adjust before the
freeze, never after a dependent WP starts. Every enum of ids below (profiles, tiers, overlays, lenses, classes, packs,
probe options, backends) is an open string set validated against the catalog of the running build, so a later phase
adds values without a schema change.

**K1. Finding record** (E5; `packages/schema/src/maestro-event.ts`, consumed by the card, `recordReview`, settlement
retry findings, the queue record and the app wire).

```ts
// Added to the receipt's finding entry. path, line, message stay required so receipts recorded before phase 1 decode.
// Every new field is optional on the event; recordReview requires them on review-v2 receipts (K3).
{
  path: NonEmptyString, line: PositiveInt, message: NonEmptyString,   // existing
  id?: NonEmptyString,                                                // stable across rounds (§6.7)
  endLine?: PositiveInt,
  severity?: "P0" | "P1" | "P2" | "P3",
  confidence?: "high" | "medium" | "low",
  difficulty?: "low" | "medium" | "high",                             // security findings only (§6.5)
  lens?: NonEmptyString, class?: NonEmptyString, node?: NonEmptyString,
  rule?: NonEmptyString, trigger?: NonEmptyString,
  rungs?: NonEmptyString[],                                           // catalog option ids climbed, e.g. ["quote", "probe:regress"]
  evidence?:
    | { kind: "probe", option: NonEmptyString, command: NonEmptyString, result: NonEmptyString, uri?: string }
    | { kind: "tool", pack: NonEmptyString, rule: NonEmptyString, version: NonEmptyString, uri?: string }
    | { kind: "quote", path: NonEmptyString, startLine: PositiveInt, endLine: PositiveInt },
  cause?: { path: NonEmptyString, line: PositiveInt },                // D10: the added line that causes an unchanged-line finding
  status?: "open" | "resolved" | "dismissed", dismissedReason?: NonEmptyString,
  suggestedTest?: string,
}
```

Rules: a legacy entry with no `severity` counts as blocking (P1) wherever severity matters. `cause.line` must be an
added line of the diff; `line` may then be any line of the reviewed tree. A `tool` evidence confirms only for a rule
whose status at routing time was `active`; a `probation` rule's hit needs a quote or probe as well (§8.4).

**K2. Routing record, `review-result` card and `review-work-result-v1`** (E3, E12; routing record schema in new
`packages/core/src/review/routing.ts`; card in new `modules/maestro/coordination/src/v2/governance/review-result.ts`,
beside the observed `discovery-result.ts`).

- The routing record is design §8.2's JSON, plus `tier.requested` (the tier asked for when it differs from the one
  run) and `tier.signals` (the §5.3 triggers that fired). Each entry carries `source`: `request`, `risk`, `path`,
  `content`, `catalog` or `model`; a `model` entry carries its quote. `deviations` lists departures from the route.
- The card is design §10.3, with `routing` embedded in full. Strict decoding as in the observed `work-result.ts`
  `parse`: a card that does not decode leaves `card.parsed: false`, never a guessed verdict.
- The routing digest is the hash of the canonical routing record without `deviations` and model entries, so it is a
  digest of what the host chose; the card shows both.

**K3. Method version.** `review-v2/<profile>/<tier>`, validated by `recordReview` against the catalog's profiles and
tiers. Profiles map to the settlement stage: `plan` to `plan`; `code` and `release` to `code`; `rereview` to the stage
of the round it continues. `pr`, `artifact`, `audit`, `diligence` and `compliance` run outside a validation, so they
return the card and record no receipt (`recordReview` requires a validation, design §1). Old receipts keep whatever
non-empty value they hold.

**K4. Session scope** (E11; new `packages/core/src/session/scope.ts`, consumed by the skill listing, the `skill` tool,
the tool registry, both engines and the review fan-out).

```ts
SessionScope = {
  skills: { entry: NonEmptyString, allow: NonEmptyString[] },   // allow: exact node names, each a prefix-free grant
  tools: NonEmptyString[],                                       // tool ids this Session may call
  budgets: { loads: NonNegativeInt, toolCalls: PositiveInt },
}
```

- Written once when the host creates the child Session, beside the per-Session permission ruleset the store already
  keeps (observed `packages/core/src/session/store.ts:87-99`, `SessionStore.permissions`). It only narrows: the
  effective grant is the agent's permissions intersected with the scope, so the seat grant stays the ceiling.
- The listing (observed `packages/core/src/skill/guidance.ts:75`, `SkillV2.available` in
  `packages/core/src/skill.ts:31-32`) and the `skill` tool both apply the scope. The tool refuses a node outside
  `allow`, refuses a node whose content the Session already holds (the delivered entry node included), and counts
  loads; past `loads` it refuses with "record a question or a not-examined item instead". The tool registry refuses
  tools outside `tools` and counts calls; past `toolCalls` it refuses and the Session's next turn is its last.
- The delivered entry node is rendered by the observed `toModelOutput` (`packages/core/src/tool/skill.ts:31-63`), with
  its generated "Next level" index filtered to `allow`, and placed in the brief by the host. It does not count as a
  load.
- A Session with no scope behaves exactly as today. Refusals and budget exhaustion are reported to the host as
  structured deviations, which the fan-out copies into `routing.deviations`.

**K5. Catalog** (E12, D14; new `packages/core/src/review/catalog/`, typed data beside the pinned pack manifests,
following the observed pack `fit` precedent in `packages/core/src/backend-toolkit/packs/squawk.ts`).

| Entry | Fields frozen in phase 1 |
|---|---|
| pack | id; tool; version and pin; licence class (`pinned`, `invoke`, `user-licence`, `never`); backend (`pinned`, `path`, `repo`; later `mcp`); languages; detection with negative signals; lane; tiers; output (`sarif`, or `json` with a parser id); cost class; network (`none` or `offline-db`); scratch writes; a host-owned argument template id; lenses served |
| rule | pack; rule id; class; lens; severity mapping; triage note (one line); status (`probation`, `active`, `demoted`, `dropped`); CWE when one exists |
| overlay | id; path globs; content patterns; lenses and required checks it adds |
| lens | id; node; classes it raises |
| class | id; proof node; escalation options per language (at most three, each: option id, what it proves, cost class) |
| language | id; detection; `team-stack` node |
| route | lenses per profile × tier × overlay; tier risk triggers (§5.3); the §8.3 budgets per tier; rung permissions per tier and severity (§8.4); attempt caps; variant generations per profile; ledger thresholds (§8.6) |

- The phase 1 values are design §8.3, §8.4 and §8.6's starting numbers (D14). Tuning them is a catalog change, which
  changes the catalog digest the receipt binds.
- `catalogDigest` is the hash of the canonical catalog. Receipts record it; settlement does not compare it, so a
  catalog change never stales an in-flight validation (§7).
- **Id build check.** A pure `ReviewCatalog.check(catalog, tree)` fails on: a `pack:`, `rule:`, `class:`, `lens:` or
  `overlay:` id a leaf cites that the catalog lacks; a lens or class whose node does not exist in the tree; a node in
  `lucy-lens` or `lucy-review-prove` that no route reaches; an overlay or route naming an unknown lens. It runs from
  the seat skills build (observed `modules/maestro/coordination/src/seat-skills-module.ts`, which already validates
  trees through `SeatSkillContent`), so a broken id fails the build and its test.

**K6. Review tool I/O** (E1, E7a; new `packages/core/src/review-toolkit/`).

```ts
// Host-run before any model turn (fan-out step 2); also callable by a lens child to page its own items.
review_analyze({ op: "run", lane, packs, scope: "diff" | "files", files? })               // host only
  -> { checks: { id, pack, version, lane, status: "pass" | "fail" | "not-run", reason?, workspaceExecuted }[],
       items: ToolItem[],               // after the §8.6 pipeline, grouped by lens, capped per lens
       retained: { uri, total, unread: Record<lens, number> } }
review_analyze({ op: "page", lens, filter?: { rule?, path?, class? }, cursor? }) -> { items: ToolItem[], cursor? }
ToolItem = { fingerprint, class, lens, pack, rule, ruleStatus, severity, path, line, endLine?, snippetDigest,
             sources: { pack, rule }[], triage, onChangedLine: boolean }

review_probe({ candidate: NonEmptyString, option: NonEmptyString,      // option: a catalog option id offered in the brief
               target: { hunk?: { path, startLine, endLine }, test?: { file, name? }, script?: { language, text } } })
  -> { status: "pass" | "fail" | "not-run", reason?, exitCode?, durationMs, excerpt, uri, tree: digest }

review_history({ op: "log" | "blame" | "pickaxe" | "show", path?, range?, pattern?, rev? }) -> { text, uri }
```

- The host maps an option id to a fixed runner and argument template; no model-supplied flag or binary reaches a
  process, and target paths resolve only inside the scratch copy.
- The host refuses an option not offered for the candidate's class and language, a repeat of the same option on the
  same candidate and tree digest, and an attempt past the tier's cap (§8.4).
- Phase 1 options: `quote` (no tool call), `tool:<pack>` (rerun one rule on the region), `probe:regress`
  (fail-before/pass-after and base-versus-head differential), `probe:test`, `probe:typecheck`, `probe:script`.
  Phase 5 adds `probe:mutants`, `probe:interleave`, `probe:race`, `probe:property`. An unbuilt option returns
  `not-run: not-built`.

**K7. Seat tools and scratch copy** (E1, E10). A `ReviewSeatTools` module (`packages/core/src/review/seat-tools.ts`)
mirrors the observed `ResearchSeatTools` (`packages/core/src/research/seat-tools.ts`): `SEAT = "lucy"`, the seat's own
tools, and the per-stage sets the fan-out puts in K4 scopes (lead entry: read tools and code intelligence; lens child:
those plus `review_analyze` `page`; verifier: those plus `review_probe`; lead final turn: those plus
`maestro_record_review`). Allow-lists for both engines derive from it. A new `Seat` field `review?: boolean` is refused
for any id but `lucy` in `define()`, as `toolkit` and `research` are (observed `seats/seat.ts`). The scratch copy is
one service `ReviewScratch.create({ worktree, revision | tree }) -> Snapshot` that reuses the observed `ProbeSnapshot`
(`packages/core/src/research-toolkit/probe/snapshot.ts`), lives for one review, holds a base and a head copy when the
new-only pass or a differential needs both, and is removed when the review ends.

**K8. Request** (E4; observed params in `modules/maestro/coordination/src/v2/tools/review.ts`). Adds `profile?` and
`tier?`. The default profile follows `stage`; the tier is the request's, else the project pin, else the route's risk
rule (§5.3). An unsupported profile or tier returns a named error, never a silent fallback.

**K9. Stage schemas** (E4, §8.2, §8.7; in `review-result.ts` beside K2). Children return fixed schemas so the merge is
mechanical and no child's prose reaches the lead.

- Entry record: `eligible` or `blocked` with a §6.2 blocker; the context sheet (intent, acceptance, invariants,
  assumptions, each with its line or `nothing found`, capped near 1,000 tokens); overlay confirmations and declines
  with quotes; at most two added overlays with quotes; a tier raise of one step with a quote; a slice plan.
- Lens child return: at most the tier's candidate cap of `{ class, node, path, line, endLine?, severity, trigger,
  quote }`; at most three out-of-lens observations; the hunks marked read; the items it read with `pursued: boolean`.
- Verifier return, per candidate: `confirmed` with the highest rung and its evidence, `question` with the reason
  (`not verified: budget` included), or `dropped` with the refutation; the rung history.
- The host enforces every cap by schema: entries over a cap are dropped by rank and recorded in `deviations`.

**K10. Receipt binding and item outcomes** (E5, E13 input; `packages/schema/src/maestro-event.ts`, additive and
optional on the event, required by `recordReview` for `review-v2`). `routingDigest`, `catalogDigest`, and
`items: { pack, rule, fingerprint, outcome: "confirmed" | "refuted" | "not-pursued" }[]` for every item a model read.
Unread items are not listed; the card's coverage counts them.

**K11. Atlas read grant** (E2). `atlas_context` catalog and unit reads for lucy, without memory tools, header or
resume admission, separate from `atlasMemory`. Observed in [A23]: `atlas_context` readers are the memory owners plus
Maestro, everyone else gets `native-atlas-owner-required`, and `define()` limits `atlasMemory` to backend, jimmy,
archie and live.

**K12. Queue review record** (E6; observed `packages/core/src/board/queue-record.ts:276` writes `reviews: []`).
`reviews: { id, stage, verdict, method, counts: { P0, P1, P2, P3 }, open: boolean }[]`, read from the receipts linked
to the card through the board review note the request writes (`bno_review_<validation>_<stage>`, observed
`review.ts`). "Open" means the newest receipt for a stage is FIX_FIRST or REJECT.

**K13. Precision ledger** (E13, phase 4; new `packages/core/src/review/ledger.ts`). A pure
`RuleLedger.derive(outcomes, catalog, project) -> Record<rule, { status, read, confirmed, lastWindow }>` folded from
K10 outcomes, per project, with the all-project value as the prior for a project with no history. The route reads the
derived status in place of the catalog's static `probation`. Only a catalog change to a rule (new version or config)
returns a demoted rule to probation. Repository packs are always `active` (§8.5).

## 6. Evidence gates

Every research answer is verified. Gates on draft evidence are gone. The citation refresh found claims the verified
answers do not support (listed at the end of the design refresh report and corrected in the design); one of them
still constrains building:

| Gate | Answer | What it constrains | WPs |
|---|---|---|---|
| G10 | 10 EU regulation | `lucy-audit-compliance-cyber`, `ai-act` and `accessibility-law` may state only the claims design §14 marks verified. Not captured: CRA SBOM wording, the 24-hour reporting deadline and a disclosure-contact duty; the AI Act's amending regulation number, Art 50 paragraph dates and Art 19 retention; the NIS2 reporting clock; DORA entirely; EN 301 549; the Data Act and DSA; the SSDF practice tables and Scorecard. A leaf names each as a human-decision or open question and states no date, deadline or duty for it. | 7.2 |
| G10L | 10 EU regulation | Conftest and ScanCode have no determined licence (GitHub reports NOASSERTION) and REUSE's was not captured. A pack is pinned only after its licence class is read from the upstream licence at the pinned version; an undetermined one is not added. OPA, Kyverno, ORT (Apache-2.0) and axe-core (MPL-2.0) are verified. | 7.2 |

Neither gate blocks a phase: the leaves ship with the verified content, and a pack whose licence stays undetermined
is cut from the phase with coverage reason `not-built`. Capturing the missing primary texts is a research task for
`jimmy`, proposed in §11, not a dependency of this plan.

A further rule is not research: **no benchmark or eval runs without the owner's permission (D12).** The seat
framework's qualification sequence ends with "a real Maestro seat evaluation" (observed
`docs/specs/seat-framework/README.md:60`). No phase runs one; each phase is accepted on tests, guards and an optional
live proof (one governed review on a real change, observed, not scored), and the evaluation waits for the owner.

## 7. Landing protocol

Lucy's prompt, grants and profile feed the hashes that validations and receipts bind (`grantHash`,
`reviewPolicyHash`, observed `packages/schema/src/maestro-event.ts:381-382`, `:416-417`; design §10.4). Every phase
except 2 changes at least one of them: a new skill root or tool is a grant change. A catalog change alone does not,
because only the receipt records the catalog digest (K5). So, for phases 1 and 3–7:

1. Before merging, Maestro confirms no governed run is between validation and settlement in any project the owner
   has open, and no queued card waits on a lucy receipt.
2. Merge, then ask the owner to restart the desktop app when the running build must pick up the seat (agents never
   restart it).
3. Any validation recorded before the merge is re-recorded before its next review; a stale-hash refusal after
   landing is expected, not a regression.

Phase 2 changes queue refusal: a card with an open FIX_FIRST or REJECT already queued when phase 2 lands stays
queued; the refusal applies at the next `board_queue`.

## 8. Docs and skills per phase

| Phase | `docs/guides` | `.orchestra/skills` (repo-only) | Specs and other docs |
|---|---|---|---|
| 1 | New `docs/guides/review.md`: the card, verdicts, tiers Quick and Standard, profiles, the routing record and what "host routes, model judges" means for a reader, what "not examined" and "not read" mean, how to pin a tier; link from `maestro.md` and `agents.md` | New `lucy-maintenance` (seat file, prompt, catalog and its id check, route function, scope, budgets and how to tune them, tools, tree, tests, hash-change landing) and `lucy-ownership` (what lucy owns and never owns, boundaries with backend, jimmy, archie, the unbuilt `billy` and `frankie`); update `maestro-ownership` (lucy is no longer a charter), `seat-skill-tree-maintenance` (lucy's roots and the catalog id check) | `docs/specs/seat-framework/README.md` (the review boundary next to toolkit and research; per-Session scope); `docs/specs/seat-framework/skill-tree.md` (lucy's planned five roots replaced by design §9.1); `modules/maestro/coordination/README.md` |
| 2 | `docs/guides/merge-queue.md`: reviews in the PR record, the refusal | `lucy-maintenance`: queue link | `docs/specs/maestro-lead/merge-queue.md` §4.5: mark built |
| 3 | `review.md`: overlays, the `pr` profile, Atlas Own checks, personal-data checks | both lucy skills | none |
| 4 | `review.md`: languages, packs, licence classes, "invoke if installed", rule status and what `probation` means on a card | `lucy-maintenance`: adding a pack and its rules, pins, the ledger and its thresholds | none |
| 5 | `review.md`: Deep, the build lane and D6, cost in children and analyzer time | both lucy skills | none |
| 6 | `review.md`: audit, diligence, artifact | both lucy skills | none |
| 7 | `review.md`: compliance, "evidence, never compliant", the human-decision list | both lucy skills | none |

## 9. Risks and corrections

| # | Risk | Smallest correction (proposal) |
|---|---|---|
| R1 | Landing a phase stales in-flight governed approvals: lucy's prompt or grants change `grantHash` and `reviewPolicyHash` (§10.4) | §7 landing protocol: land between governed runs |
| R2 | This repository refuses local tests (`script/test-guard.ts`; observed in `research-toolkit/probe/run.ts`). Here fail-before/pass-after and differential probes are `check-unavailable`, and §6.6 lets APPROVE through only when the owner accepted that, so every Standard review in this repository would block | A project setting listing lanes the owner accepts as unavailable, next to the tier pin §5.3 allows; the card then cites the `test:ci` checks the validation recorded. Needs the owner's yes before phase 1's acceptance (§11) |
| R3 | Deep is the risk-trigger tier for many changes (§5.3) but arrives in phase 5 | The route sets `tier.requested: "deep"`, runs Standard, and lists the Deep lanes as not examined, reason `not-built`; the method version says `standard` |
| R4 | Standard runs the repo's declared gates and fail-before/pass-after, which execute repository code, while §7.1 calls execution the build lane | They run confined at Standard under D6's trust rule (on for the project the owner opened, off for external targets), tagged `workspaceExecuted` |
| R5 | §6.8 reasons have none for a lens, lane, pack or option a later phase adds | Add reason `not-built` |
| R6 | `recordReview` today rejects APPROVE with findings (observed `review-records.ts`, [A22]) while §6.6 allows APPROVE with P2 and P3 | APPROVE may carry only P2 and P3; FIX_FIRST and REJECT need a confirmed P0 or P1; a legacy finding without severity counts as P1 |
| R7 | The receipt event is durable; a breaking schema change breaks replay | K1 and K10 are additive and optional on the event, required only by `recordReview` for `review-v2`; `event-manifest.test.ts` pins it |
| R8 | Fan-out children and analyzers load the owner's Mac (memory and swap are the limit) | The §8.3 child counts are catalog maxima; a host cap on concurrent children and probes (reuse the probe semaphore) sits under them, set low; the card records counts |
| R9 | `confine` refuses on Windows and on Linux without a ready srt (observed `tool-safety-sandbox.ts`), so analyzer and probe lanes do not run there | Report `check-unavailable` with the sandbox reason; R2's setting covers it; never run unconfined |
| R10 | Reusing `research-toolkit/probe` may trip `check:boundaries` or read as widening jimmy's research engine | Import the probe modules without the `research` seat flag; if a boundary rule refuses, move snapshot and runner code to a shared core module in WP 1.3, with no behaviour change |
| R11 | Lucy on the `claude-code` engine reaches Orchestra tools through MCP and the host's allow-list; a per-Session tool scope enforced only in the native registry would leave Claude-mode children with the seat's full set | K4 is enforced where Orchestra executes the tool call, which both engines share (the runner's `turn.execute`), and the Claude allow-list for a scoped child is derived from its scope; WP 1.5 tests both engines |
| R12 | Per-Session scope might feed `grantHash` and so change on every review | Assumption: `grantHash` binds the seat grant, not child Session rules. Check in WP 1.5 against `review-records.ts`; if it does bind them, hash the seat grant only and record the scope in the routing record |
| R13 | The model can still be steered by change text inside its own Session (which code to pull, which candidate to raise) | Accepted by design: routing is fixed before any model reads the change; additions are quoted on the card; the merge and verify steps are host-run |
| R14 | Content-pattern overlay suggestions are noisy, and every declined one costs an entry-stage line | Catalog patterns stay few in phase 1 (`concurrency` only); every decline stays on the card, so phase 3's patterns can be tuned from real declines |
| R15 | Rule status thresholds need 20 items read per rule; most rules will sit in `probation` for a long time, so tool evidence rarely confirms on its own | Accepted by D14 as a starting value; probation items still reach the model and are confirmed by quote or probe |
| R16 | `team-stack` reaches ten children, the limit, after phase 4 (§9.2) | A further language needs a regrouping plan; none is in scope |
| R17 | Advisory databases need network outside the review (D7); nothing refreshes them today | Phase 4 adds a host refresh step outside any review; the card states the database age; a missing database is `not-run` |
| R18 | Rereview resume (`strictResume: true`) changes what a resume of lucy accepts | WP 1.7 covers it in `test/v2-resume-admission.test.ts` and `test/v2-logical-task.test.ts` |
| R19 | A heavy type check or mutation run in a scratch copy on the owner's Mac contradicts the no-heavy-local-runs rule for this repository | The build lane honours R8's caps and R2's setting; in this repository the card cites `typecheck.yml` results instead |
| R20 | The `artifact` profile cannot run the behavioural evals [A15] says a prompt diff needs, and this repository has none in CI [A15] | Under D12 lucy judges artifacts by quote and tool evidence and lists "behavioural eval" as not examined, reason `owner-permission`; it never claims a prompt change is behaviour-safe |
| R21 | Verified answer 10 does not support several §14 claims (§6 G10) and three pack licences (G10L) | Gates G10 and G10L; the compliance leaves ship with verified content and open questions; the approved choices (D9, D11) stand |
| R22 | `personal-data` routes a leaf under `lucy-audit`, so phase 3 lists a fourth root before audit profiles exist | The `lucy-audit` root ships in phase 3 with its final body and only `compliance/privacy` below it; per-Session scope keeps it out of every diff-review listing except as the delivered leaf (§8.3) |

## 10. Work packages

Owning seat: backend writes code, tests, catalog data and the prompt wiring; `archie` writes skill trees, the prompt
text and playbook text only where a WP says so; Maestro runs the gates and the landing. No WP goes to a general agent.

Every WP ends with: its `test:ci` run named, the `typecheck.yml` dispatch for each touched package, and
`bun run check:guards --base origin/dev` clean. A WP that changes the public Protocol or Server `HttpApi` runs
`bun run generate` in `packages/client`; WP 1.1 records whether the receipt change reaches it (assumption: it does
not, since the event schema lives in `packages/schema`; check the `packages/client/src/generated` diff after
generate).

Test file names marked *new* are proposals; backend may rename them. Existing test files named below were observed at
the baseline. `test:ci` package aliases: `maestro` (`modules/maestro/coordination`), `core`, `schema`, `app-shell`.

### Phase 1: routed core review seat (`lucy-core`)

Global objective: profiles `plan`, `code`, `rereview` at Quick and Standard, routed by the host from the catalog, with
per-Session scope and budgets, the §8.7 sequence, the quote, tool and probe rungs, the §8.6 pipeline over gitleaks and
the repo's own gates, the richer card and receipt.

Order and freezes: 1.1 freezes K1, K2, K3, K8, K9, K10; 1.2 freezes K5 and the route function; 1.3 freezes K7 and the
probe half of K6; 1.4 the analyze half of K6; 1.5 freezes K4. 1.6 starts after all five. 1.7–1.12 follow.

**1.1 Wire contracts and receipt** — backend. E5, E8, K1, K2 (card and routing record schemas), K3, K8, K9, K10.
- Write: `packages/schema/src/maestro-event.ts`; `packages/core/src/review/routing.ts` (schema only); in
  `modules/maestro/coordination`: `src/v2/tools/review.ts` (params), `src/v2/tools/review-records.ts`, new
  `src/v2/governance/review-result.ts`; `src/v2/workflow/settlement.ts` only where findings are read.
- Read: `src/v2/governance/discovery-result.ts`, `src/v2/governance/work-result.ts`.
- Acceptance: new receipts carry K1's fields, K10's digests and outcomes and a K3 version; old receipts decode and
  settle as before; D10 findings accepted only with an added-line `cause`; R6 verdict rule; E8 refuses
  `routedMemberID: "lucy"` at validation with a named error; `review-result` and the stage schemas decode strictly;
  settlement retry findings carry the full record.
- Tests: `bun run test:ci schema test/event-manifest.test.ts`;
  `bun run test:ci maestro test/v2-workflow-review.test.ts test/v2-chain.test.ts test/v2-tools.test.ts test/v2-settle.test.ts test/lucy-review-result.test.ts` (last *new*).
- Depends on: nothing.

**1.2 Catalog, route function and id build check** — backend. E12, K5, K2 (producer).
- Write: new `packages/core/src/review/catalog/` (schema, phase 1 entries, `check`), new
  `packages/core/src/review/route.ts`; `modules/maestro/coordination/src/seat-skills-module.ts` (call
  `ReviewCatalog.check` when lucy's tree is embedded).
- Phase 1 entries: profiles `plan`, `code`, `rereview`; tiers `quick`, `standard` (and `deep` as requestable but not
  built); overlays `docs` (path) and `concurrency` (content: locks, spawns, `Promise.all`, goroutines, `Deferred`);
  lenses `correctness-logic`, `correctness-edges`, `correctness-concurrency`, `correctness-reliability`, `tests`,
  `security` (first pass); the classes they raise with proof nodes `lucy-review-prove-quote` or
  `lucy-review-prove-regress` and options from K6's phase 1 set; packs `gitleaks` (pinned) and `repo` (the base
  revision's declared gates, through `RelayCommands.detect`, observed `packages/core/src/relay-commands.ts:25`); the
  languages whose `team-stack` nodes exist today (`js-ts`, `python`, `go`, `ruby`, `php`, observed
  `modules/specialists/team/skills/team-stack`); the route table with §8.3's budgets, §8.4's rung table and attempt
  caps, and §8.6's thresholds.
- `route(request, base, head, catalog) -> RoutingRecord` is pure: no clock, no I/O beyond the trees passed in, no
  model. Path overlays, languages, lenses, packs, entry nodes and budgets are binding; content overlays are
  suggestions; the tier comes from the request, else the project pin, else the §5.3 triggers, and a Deep result is
  recorded as `tier.requested` with Standard run (R3).
- Acceptance: the same inputs give byte-identical records; the owner's §8.3 example routes as the design shows (made
  up fixture); a docs-only change routes Quick; change text in a fixture PR body changes nothing; the id check fails
  each named class of break; every pack and rule starts in `probation` except `repo` packs, which are `active`.
- Tests: `bun run test:ci core test/review/route.test.ts test/review/catalog.test.ts` (*new*);
  `bun run test:ci maestro test/seat-skills-build.test.ts`.
- Depends on: 1.1 (routing record schema). The id check's tree half is exercised fully once 1.10 lands; until then
  its test uses fixture trees.

**1.3 Scratch copy and `review_probe`** — backend. E10, E1 (probe), K6 (probe), K7 (scratch).
- Write: new `packages/core/src/review-toolkit/` (`scratch.ts`, `probe.ts`, `index.ts`); shared probe code only if
  R10 requires.
- Read: `packages/core/src/research-toolkit/probe/*`, `packages/core/src/tool-safety-sandbox.ts`.
- Acceptance: options `probe:regress`, `probe:test`, `probe:typecheck`, `probe:script` run confined in a scratch copy
  through the existing `ResearchProcess`/omni path; the reviewed worktree is byte-identical after every probe; a
  regress probe reverts the hunk only in the copy; the host refuses an option not offered for the candidate, a repeat
  on the same candidate and tree digest, and an attempt past the cap; refusals (`script/test-guard.ts`, sandbox
  unavailable, missing toolchain) return `not-run` with the reason; Deep options return `not-run: not-built`; no
  network; no allowlist entry.
- Tests: `bun run test:ci core test/review-toolkit/scratch.test.ts test/review-toolkit/probe.test.ts` (*new*, both
  call `expectSpawn`); `bun run check:spawn-imports`.
- Depends on: 1.1 (evidence kinds), 1.2 (option ids, caps).

**1.4 `review_analyze`, noise pipeline, SARIF normalizer, `review_history`** — backend. E1 (analyze), E7a, K6 (analyze).
- Write: `packages/core/src/review-toolkit/analyze.ts`, `noise.ts`, `sarif.ts`, `history.ts`, `packs/` (gitleaks with
  lucy's own manifest entry, reusing the observed pin in `packages/core/src/backend-toolkit/packs/gitleaks.ts`, not
  the backend toolkit's grant).
- Acceptance: the §8.6 pipeline in order: normalize with a fingerprint that survives line shifts; new-only against the
  base copy, cached by file digest, with pre-existing items to the debt artifact; location (changed lines only at
  Standard); dedup by class and overlapping range with every source listed; the repo's suppressions honoured and a
  suppression the change adds raised as an item for the change lens; rank; cap per lens with the rest retained and
  counted; demoted rules never returned, dropped rules never run. `page` returns only the caller's lens. The repo's
  declared gates run confined under R4. Raw output is a citable artifact. A parse failure is `acquisition-error`,
  never a pass; a missing tool is `not-run: <tool> absent`. `review_history` runs only `log`, `blame`, `log -S/-G` and
  `show`, read-only.
- Tests: `bun run test:ci core test/review-toolkit/analyze.test.ts test/review-toolkit/noise.test.ts test/review-toolkit/sarif.test.ts test/review-toolkit/history.test.ts` (*new*; spawning tests call `expectSpawn`).
- Depends on: 1.2 (catalog), 1.3 (scratch, process path).

**1.5 Per-Session scope** — backend. E11, K4, R11, R12.
- Write: new `packages/core/src/session/scope.ts`; `packages/core/src/session/store.ts` (persist the scope with the
  Session); `packages/core/src/skill.ts` and `src/skill/guidance.ts` (listing); `packages/core/src/tool/skill.ts`
  (allow, already-held refusal, load count, filtered "Next level"); the tool registry and the runner's tool execution
  (tool allow and call count); the Claude host allow-list in `modules/engine-adapters/claude-code/src/v2/` for scoped
  Sessions.
- Acceptance: a scoped Session lists only allowed roots and loads only allowed nodes; the delivered node is not
  reloadable and costs no load; the load and tool-call budgets refuse with the named message and report a deviation;
  the scope never widens the agent's grant (a scope naming a node the agent is denied stays denied); an unscoped
  Session behaves exactly as before; both engines enforce the same scope; R12 checked and recorded.
- Tests: `bun run test:ci core test/skill.test.ts test/tool-skill.test.ts test/session-runner-tool-registry.test.ts test/session-store-permissions.test.ts test/session-scope.test.ts` (last *new*); the Claude host's test for scoped tools, named by backend.
- Depends on: 1.1. Independent of 1.2–1.4.

**1.6 Host fan-out (§8.7) and base rules** — backend. E4, K8, K9, D2, D3.
- Write: `modules/maestro/coordination/src/v2/tools/review.ts`; new `src/v2/workflow/review-fanout.ts` for the
  sequence.
- Read: `src/v2/governance/dispatch.ts`, `src/v2/governance/logical-task.ts`.
- Acceptance: the seven steps run in order: route (1.2), analyze (1.4), entry in the lead Session, lens children in
  parallel, host merge with fingerprint dedup and agreement counting, verifiers one per class with up to four
  candidates each, then the lead resumed for the card and the record call. Each Session gets the K4 scope and brief of
  its row in design §8.3: the lead's entry turn has `lucy-review` and the profile node delivered and no lens nodes,
  analyzer items or probe tool; a lens child has its lens node delivered, its slice and capped items, and its routed
  `team-stack` node ids; a verifier has the class's proof node delivered, the intent and acceptance lines, its
  candidates with their code regions and at most three options, and never the finders' reasoning; the lead's final
  turn sees only the merged confirmed findings, questions and coverage. Model additions from entry are appended to
  the routing record and their lenses and packs routed. At Quick, entry, hunt and finish run in the one lead Session
  and the lead verifies by quote. Rules (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`) are read from the base; the brief
  marks change text as data. `rereview` reuses the first round's route, runs only lenses with open findings or that
  the new delta routes, reuses the analyzer cache, and reports `UNADDRESSED` when the tree did not change. When the
  verifier budget runs out, the lowest-ranked candidates become questions. D3 model choice. R8 caps. Lucy has no
  delegation path.
- Tests: `bun run test:ci maestro test/v2-workflow-review.test.ts test/v2-workflow-host.test.ts test/v2-review-fanout.test.ts` (last *new*: asserts each Session's scope and brief contents, not model output).
- Depends on: 1.1–1.5.

**1.7 Seat capability, grants and definition** — backend. E1 (grant), E3, E9, K7 (declaration), design §10.2, R18.
- Write: new `packages/core/src/review/seat-tools.ts`; in `modules/maestro/coordination/src`: `seats/seat.ts`
  (`review` field), `roster.ts` (lucy's grants and the Claude allow-list derived from `ReviewSeatTools`, as jimmy's
  is), `ability-descriptors.ts` (`tests` lists lucy's tools), `v2/tools.ts` and `v2/seats.ts` (registration),
  `seats/lucy.ts`.
- Acceptance: `define()` refuses `review` for any other id; lucy gets exactly `ReviewSeatTools` plus its base; the
  `review_*` tools refuse any other caller; both engines expose the same set. `seats/lucy.ts` per §10.2:
  `returnCard: "review-result"`, `workResult: "review-work-result-v1"`, the nine `forbiddenActions`,
  `strictResume: true`, `atlasMemory: false`, `toolkit: false`, `review: true`, `skills: ["lucy-review", "lucy-lens",
  "team-stack"]`, `mcp` empty (pinned by a test, D15), the new description. A plain `task` to lucy yields a parsed
  `metadata.workResult` (E3).
- Tests: `bun run test:ci maestro test/roster.test.ts test/seat-framework.test.ts test/ability-descriptors.test.ts test/v2-seats.test.ts test/v2-tools.test.ts test/v2-resume-admission.test.ts test/v2-logical-task.test.ts test/specialist-name-guard.test.ts test/lucy-tools.test.ts` (last *new*, mirroring `test/jimmy-method.test.ts`'s engine check).
- Depends on: 1.3, 1.4 (tool ids), 1.8 (prompt), 1.10 (roots exist).

**1.8 Prompt** — `archie` writes `modules/maestro/coordination/src/seats/prompt/lucy.txt`; backend wires and tests.
- Acceptance: design §10.1 only: role, cold rules, the six stages, the load rule for `lucy-review` ("open the branches
  the work needs, one level at a time, stop at the first node that covers it"), the finding bar, the verdict rules,
  the card, a Forbidden line matching `forbiddenActions` item by item. No rule a guard or the host enforces: budgets,
  scope, caps and routing stay out of the prose. Shaped after jimmy's and backend's prompts (benchmark-first).
- Tests: `bun run test:ci maestro test/seat-framework.test.ts`.
- Depends on: 1.1 (card), 1.7 (forbidden list text, written together).

**1.9 Maestro playbooks** — `archie` authors the text; backend runs the tests.
- Write: `modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md`, `maestro-run/verify/SKILL.md` and
  `maestro-run/verify/review-checks/SKILL.md`: the `profile` and `tier` arguments and the card fields Maestro reads,
  including `routing` (§11.1). No file added or removed; the inventory stays 5 roots and 7 sub-files (observed
  `src/playbook-content.ts`, [A22]). The playbook name in `maestro.txt`, `host.ts` and the playbook stays in step
  (unchanged).
- Tests: `bun run test:ci maestro test/orchestra-map.test.ts test/seat-skills-build.test.ts`.
- Depends on: 1.6.

**1.10 Phase 1 trees** — `archie` authors under `packages/lucy-specialist/skills`.
- Nodes: `lucy-review` (root: the procedure, finding bar, severity, verdict rules, card, do-not-report list) with
  `plan`, `code`, `rereview`, and `prove` with `quote` and `regress`; `lucy-lens` (root, under about 300 tokens) with
  `correctness` (`logic`, `edges`, `concurrency`, `reliability`), `tests` (`adequacy`), `security` (first pass and the
  D1 handoff rule) with `secrets`. `team-stack` is declared, not changed.
- Acceptance: Quality Standards; every leaf cites catalog ids from 1.2 and passes `ReviewCatalog.check`; finder leaves
  hold how to look and no proof technique, proof leaves hold how to prove (§8.3); no Maestro playbook content.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/seat-skill-root.test.ts test/v2-skills.test.ts test/seat-framework.test.ts`; `bun run test:ci core test/review/catalog.test.ts`.
- Depends on: 1.1 (card fields), 1.2 (ids).

**1.11 App wire** — backend. Data only; screens go to the Interface session (§1).
- Write: `packages/app-shell/src/v2-wire.ts`, `src/pages/session/orchestra-governance-data.ts`.
- Acceptance: the richer findings and the routing record decode and reach the governance data; old receipts still
  render.
- Tests: `bun run test:ci app-shell src/pages/session/orchestra-governance-data.test.ts`.
- Depends on: 1.1.

**1.12 Docs and skills** — backend, with `archie` for the guide text. §8 row 1.
- Tests: none beyond `check:guards`.
- Depends on: 1.1–1.11.

Phase 1 global acceptance (last step): the full suite once on the phase PR; `package-verification` and `cold-review`
host checks if the phase runs as a published workflow (the host appends them); an optional live proof per §6 that
shows, in the stored Sessions, that no model turn listed an unrouted root or loaded an off-route node.

### Phase 2: merge-queue receipts (`lucy-queue-receipts`)

**2.1 Reviews in the PR record and queue refusal** — backend. E6, K12.
- Write: `packages/core/src/board/queue-record.ts`, `queue.ts` (refusal in `board_queue`), the record renderer.
- Read: `docs/specs/maestro-lead/merge-queue.md` §4.5.
- Acceptance: `reviews` filled from linked receipts; `board_queue` refuses with a named error while a stage's newest
  receipt is FIX_FIRST or REJECT; absence of a receipt is not a refusal; the PR body shows reviews; no model spend on
  GitHub.
- Tests: `bun run test:ci core test/board-queue.test.ts test/board-tools.test.ts test/board-queue-scoped.test.ts`.
- Depends on: phase 1 (K1, K3 on `dev`).

**2.2 Docs** — backend. §8 row 2.

### Phase 3: lenses and overlays (`lucy-lenses`)

**3.1 Catalog entries** — backend. Lenses `correctness-resources`, `correctness-performance`, `contracts`,
`security` children, `change`, `experience`; overlays `api-wire`, `data-migration`, `performance`, `ci-infra`,
`dependency`, `ui`, `personal-data` with their path globs and content patterns; ast-grep as a pinned pack (reusing the
observed backend pin) with lucy's own structural rules, each a `probation` rule with a class, lens and triage note;
the classes and options the new lenses raise.
- Tests: `bun run test:ci core test/review/route.test.ts test/review/catalog.test.ts test/review-toolkit/analyze.test.ts`.
- Depends on: phase 1.

**3.2 Lens trees** — `archie`. Under `lucy-lens`: `correctness` `resources`, `performance`; `tests` `oracles`,
`smells`, `flaky`, `strategy`; `contracts` with `api`, `semver`, `data`, `third-party`, `ipc`; `security`
`boundaries`, `supply-chain`, `ci`, `infra`; `change` with `structure`, `history`, `merge`, `provenance`, `health`;
`experience` with `interaction`, `a11y`, `visual`, `content`. Root `lucy-audit` with its final body and only
`compliance` (group) and `compliance/privacy` below it (R22), the privacy leaf closing the [A9] gaps §14 names first.
- Acceptance: as 1.10; `ReviewCatalog.check` passes against 3.1's entries.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/seat-skill-root.test.ts test/v2-skills.test.ts`; `bun run test:ci core test/review/catalog.test.ts`.
- Depends on: 3.1.

**3.3 Seat roots** — backend. `seats/lucy.ts` `skills` gains `lucy-audit`; the scope for every diff-review Session
excludes it except the delivered privacy leaf.
- Tests: `bun run test:ci maestro test/seat-framework.test.ts test/roster.test.ts test/v2-review-fanout.test.ts`.
- Depends on: 3.2.

**3.4 Profile `pr`** — backend; `archie` writes `lucy-review/pr`. A PR or branch outside the governed flow: base
rules, PR text as data, a card to Maestro, no receipt, no posting.
- Tests: `bun run test:ci maestro test/v2-workflow-review.test.ts test/v2-review-fanout.test.ts`; `bun run test:ci core test/review/route.test.ts`.
- Depends on: 3.1.

**3.5 Atlas Own read** — backend. E2, K11.
- Acceptance: lucy's lead and lens Sessions read Own units for changed paths through `atlas_context` catalog and unit
  without memory tools; a changed anchored path whose snapshot blob is stale becomes a finding citing the same check
  `own-snapshot-guard` applies ([A23]); Atlas held means `not-run` with the reason; memory tools, header and resume
  stay refused for lucy.
- Tests: `bun run test:ci maestro test/v2-atlas.test.ts test/v2-atlas-memory.test.ts test/v2-atlas-header.test.ts test/v2-atlas-restore.test.ts test/roster.test.ts`
  (the `v2-atlas.test.ts` case that expects lucy's `atlas_context` refusal changes; the memory, header and restore
  refusals stay, [A23]).
- Depends on: phase 1. Cuttable without affecting the rest of the phase.

**3.6 Docs and skills** — §8 row 3.

### Phase 4: languages and the precision ledger (`lucy-languages`)

**4.1 Language entries and no-build packs** — backend. Catalog language entries with detection and negative signals
(§7.4: Bazel, Buck and Nix as non-cargo, and so on); pinned, hash-verified MIT, BSD, Apache, ISC and MPL packs per
§7.3–7.4 that read lockfiles and sources only (for example oxlint, knip, jscpd, OSV-Scanner offline, Syft, ruff,
bandit, pip-audit `--locked`, cargo-audit, cargo-deny, staticcheck, govulncheck, actionlint, zizmor, squawk); GPL and
AGPL tools as `path` backends with licence class `invoke` (D9); CodeQL and Brakeman as `user-licence`. Each rule a pack
exposes gets a catalog entry with class, lens, severity mapping and triage note, in `probation`. The environment pins
of §7.4 live in the argument templates.
- Acceptance: the catalog refuses a `pinned` backend for a non-pinnable licence class; claims [A33] marks "from
  memory" are checked against each tool's own docs inside the WP before its pack is written, and dropped if they fail.
- Write: `packages/core/src/review-toolkit/packs/*`, `packages/core/src/review/catalog/*`.
- Tests: `bun run test:ci core test/review/catalog.test.ts test/review/route.test.ts test/review-toolkit/analyze.test.ts test/review-toolkit/packs.test.ts` (last *new*).
- Depends on: phase 1.

**4.2 Offline advisories** — backend. D7 and R17: a host refresh step outside any review, read offline, age on the
card.
- Tests: `bun run test:ci core test/review-toolkit/advisories.test.ts` (*new*).
- Depends on: 4.1.

**4.3 Precision ledger** — backend. E13, K13. The route reads derived status; the noise pipeline drops demoted and
dropped rules; the card labels probation items.
- Acceptance: status transitions at the catalog's thresholds (20 read, one half confirmed to `active`; under one in
  five of the last 20 to `demoted`; `dropped` after a demoted window with no unique confirmed finding, sooner for a
  high cost class); only a catalog change to the rule returns it to probation; per project with the all-project
  prior; derived only from K10 outcomes; no model sees a precision number.
- Tests: `bun run test:ci core test/review/ledger.test.ts test/review/route.test.ts test/review-toolkit/noise.test.ts` (first *new*).
- Depends on: phase 1 (K10 outcomes on `dev`).

**4.4 `team-stack` additions** — `archie`. `team-stack` gains `rust`, `jvm`, `native`, `dotnet`, `swift` (shared, so
backend reads them too); language entries in 4.1 point at them. Each trap leaf needs its source before it ships
(§9.2); an unsourced trap is cut. No `lucy-toolchain` node: commands, lanes and triage are catalog data.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`; `bun run test:ci core test/review/catalog.test.ts`.
- Depends on: 4.1.

**4.5 Docs and skills** — §8 row 4.

### Phase 5: build lane and Deep (`lucy-deep-tier`)

**5.1 Build lane** — backend. `review_analyze` `lane: "build"` packs per §7.4: type checks, typed lint, API and semver
diffs, confined, `workspaceExecuted`, D6 trust rule; R8 and R19 caps.
- Tests: `bun run test:ci core test/review-toolkit/analyze.test.ts test/review-toolkit/build-lane.test.ts` (*new*).
- Depends on: phase 4.

**5.2 Deep probe options** — backend. `probe:mutants` on changed lines, `probe:interleave` (gated test), `probe:race`
(only where the language's catalog entry has a race detector), `probe:property`; time-boxed fuzzing writes only in the
scratch copy; class entries gain these options per language.
- Tests: `bun run test:ci core test/review-toolkit/probe.test.ts test/review/catalog.test.ts`.
- Depends on: 5.1.

**5.3 Read-only LSP diagnostics** — backend. E7b: a call that returns diagnostics without a mutation, confined like
the language servers already are.
- Write: `packages/core/src/lsp/*` (read-only path only).
- Tests: `bun run test:ci core` with the LSP test files backend names (`UNKNOWN` today).
- Depends on: phase 1.

**5.4 Deep tier and profile `release`** — backend. Deep's route row: up to eight lens children, each run twice over a
reordered diff, agreement counted in the merge, up to ten verifiers, the blast-radius location rule in the noise
pipeline; R3's fallback removed; `release` profile (provenance, signing, updater, SBOM, notes).
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-workflow-review.test.ts`; `bun run test:ci core test/review/route.test.ts test/review-toolkit/noise.test.ts`.
- Depends on: 5.1, 5.2.

**5.5 Trees** — `archie`. `lucy-review-prove` gains `mutants`, `interleave`, `race`, `property`, `formal`;
`lucy-lens-security-release`; Deep sections of existing nodes.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`; `bun run test:ci core test/review/catalog.test.ts`.
- Depends on: 5.2.

**5.6 Docs and skills** — §8 row 5.

### Phase 6: audit, diligence and artifact (`lucy-audit`)

**6.1 Profiles `audit` and `diligence`** — backend. Repository-scoped request, brief-defined time box, a report with no
merge verdict, the K2 card without `verdict`, the §6.5 mappings, a fix-review slot that re-runs a finding's evidence;
the route row allows three variant generations for `audit` with the half-noise stop rule; the lead's entry scope may
open the `lucy-audit` subtree.
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/lucy-review-result.test.ts`; `bun run test:ci core test/review/route.test.ts`.
- Depends on: phase 5.

**6.2 Audit tree** — `archie`. `lucy-audit` gains `context`, `variant`, `spec-map`, `diligence`, `forensics`,
`controls`, `report` ([A25]–[A27]; `controls` uses the SLSA and SSDF claims §14 marks verified and labels ISO and SOC 2
wording inferred).
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`; `bun run test:ci core test/review/catalog.test.ts`.
- Depends on: 6.1.

**6.3 Profile `artifact`** — backend; `archie` writes `lucy-review/artifact` and `lucy-lens/security/agents` ([A15]).
R20 applies.
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-skills.test.ts`; `bun run test:ci core test/review/catalog.test.ts`.
- Depends on: 6.1.

**6.4 Docs and skills** — §8 row 6.

### Phase 7: compliance (`lucy-compliance`)

**7.1 Profile `compliance`** — backend. Every output is evidence, finding, confidence and the human-decision list;
never "compliant"; no developer scoring.
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/lucy-review-result.test.ts`.
- Depends on: phase 6.

**7.2 Remaining compliance leaves and packs** — `archie` for `lucy-audit-compliance` `cyber`, `ai-act`,
`accessibility-law`, `licensing`, `evidence`; backend for the OPA, Kyverno, ORT and axe-core packs, and for Conftest,
ScanCode and REUSE only under G10L.
- Acceptance: G10: each leaf states only §14's verified claims and lists the not-captured items as human-decision or
  open questions. G10L as stated.
- Tests: `bun run test:ci core test/review-toolkit/packs.test.ts test/review/catalog.test.ts`; `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`.
- Depends on: 7.1.

**7.3 Docs and skills** — §8 row 7.

## 11. Open items for Maestro

- **R2 needs the owner.** Phase 1 cannot APPROVE a Standard review in this repository without an accepted unavailable
  lane. The proposed project setting is an addition the design did not name; confirm or choose another correction
  before phase 1's acceptance.
- **R12 check.** WP 1.5 must confirm whether `grantHash` binds child Session rules before 1.6 starts.
- **Missing primary texts (G10).** A research task for `jimmy` to capture DORA and RTS 2024/1774 Art 17, the CRA SBOM
  wording and 24-hour deadline, the NIS2 reporting clock, the AI Act Art 50 and Art 19 texts and amending act, EN
  301 549, the Data Act, the DSA, and the Conftest, ScanCode and REUSE licences. Not a dependency: phase 7 ships
  without them.
- Live proofs are optional and unscored; an evaluation or ablation waits for the owner (D12).
- Rendering the card and routing record in the app goes to the Interface session after phase 1 lands.
