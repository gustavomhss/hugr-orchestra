# Lucy: build plan

Status: proposal, not approved. Author: `archie`, proposal version 1, no parent.
Baseline: branch `lucy-design` at `5e1da9683e` (the approved design `docs/specs/lucy/design.md`, owner approval of
2026-11-01 with every §15 recommendation, D1–D12).

This plan turns the design into phases that each land as their own PR into `dev`. It reopens no design choice. Where
building shows a choice cannot work as written, the choice stays and §9 records the smallest correction.

## How to read this

- **Owner decision** cites the design's D1–D12. **Observed** means read in the source at `5e1da9683e` while writing
  this plan, with the path. **Proposal** is this plan. **Assumption** carries its check. `[An]` cites
  `research/answers/n-*.md`; `[An*]` is a draft answer.
- Atlas: `atlas_context` returned `held: provider-unconfigured` (evidence `6d2de99a19`). No Atlas unit backs any claim
  here and no knowledge anchor is selected. When a phase runs as a Relay work package, its `knowledge` arrays stay
  empty unless Atlas is configured by then.
- The seat is named by its id, `lucy`. Other seats are named by id; the backend specialist is "backend".
- Work package (WP) here means one step of a phase's single linear work package: the steps of a phase map one to one
  to the `work_packages` of one `RelaySprint.Sprint` when Maestro runs the phase governed. They are not product Tasks.

## 1. Goal and scope

**Goal.** Ship the `lucy` seat the design describes, in phases that are each useful on their own, so that the core
cold review (plan, code, rereview) with execution-backed findings and a richer governed receipt reaches `dev` first,
and every later capability is an addition that does not change what earlier phases froze.

**In scope.** Design §§2–13 and the extensions E1–E10, as placed in §4.

**Deferred, not in any phase here (proposal).**

- GitHub and GitLab output (design §7.6, D8). D8 makes it opt-in; nothing in the phases needs it, and governed
  blocking already goes through the merge queue (phase 2). It becomes its own plan when the owner asks for it.
- Atlas Memory for lucy (D5: "later, after §11 measures something").
- The offline eval set and online resolution rate (§11, D12): designed, never run without the owner's permission.
- MCP bridges (§7.5): `mcp` stays empty; a configured bridge needs no code from this plan.
- Rendering the card's findings, coverage and handoffs in the session view and board (§7.6 "Owner surfaces"). Phase 1
  carries the data to the app's wire; the screens go to the Interface session, which owns visual work.

## 2. Global acceptance

These apply to every phase. Each WP below cites them and states its delta.

## Completeness Criteria

- Every capability C1–C16 is delivered by the phase §3 names for it, or is listed in §1 as deferred.
- Every extension E1–E10 lands in the phase §4 names, and its contract (§5) is frozen in code before a dependent WP
  starts.
- Every phase ships its docs and skills (§8).

## Success Criteria

- A governed plan review and a code review return a `review-result` card whose findings each carry rule, location,
  trigger and labelled evidence (design §6.4), and a receipt whose `reviewMethodVersion` is
  `review-v2/<profile>/<tier>` (§5.3, §9.4).
- A finding without evidence is a question, never a FIX_FIRST; APPROVE never coexists with a confirmed P0 or P1;
  `blocked` is returned instead of an APPROVE with a caveat (§6.4, §6.6).
- Every card lists what was examined and what was not, with a reason (§6.8).
- Settlement keeps today's meaning: plan-stage APPROVE gates, FIX_FIRST spends one retry and carries findings, REJECT
  needs a new plan round (design §1, [A24]).

## Invariants

- Lucy never edits product files, commits, pushes, merges, approves on the owner's behalf or delegates. It writes only
  inside a host-made scratch copy (§6.3).
- Lucy never receives the author's transcript. Review rules are read from the base revision; change text is data
  (§6.1).
- Child processes start only through `ChildProcessSpawner`, `Process` or omni, wrapped by `ToolSafetySandbox.confine`.
  `script/spawn-allowlist.json` gains no entry.
- No tool is installed and no network is used during a review. A missing toolchain is `not run: <tool> absent`
  (§7.1).
- Only lucy may call `maestro_record_review`; only Maestro may call `maestro_request_review` (observed
  `modules/maestro/coordination/src/v2/seats.ts`, design §1).
- Receipts recorded before a phase replay unchanged after it (durable event `maestro.review.received` v2, observed
  `packages/schema/src/maestro-event.ts:513-530`).
- Runtime knowledge lives in the prompt or a shipped seat skill; `lucy-maintenance` and `lucy-ownership` are never in
  `seat.skills`.

## Quality Standards

- AGENTS.md style; no mocks or `globalThis`; tests exercise the implementation, not a copy of its logic.
- A test that spawns through omni calls `expectSpawn(import.meta.path)` before it spawns.
- Each skill-tree node follows `docs/specs/seat-framework/skill-tree.md`: `when`/`not-when` on non-roots, at most 10
  children, depth at most 3 below a root; each leaf names a check lucy runs or a fact it cites, or is cut.
- "Smart, not bloated": a WP that a phase's acceptance does not need is cut, not padded.

## Definition of Done

Per WP: its change-scoped tests pass through `bun run test:ci` on Actions (the run is named in the PR), the package
type check passes through the `typecheck.yml` dispatch (no local type check on the owner's Mac), and
`bun run check:guards --base origin/dev` is clean. Per phase: one full suite run on the phase PR (the `epic` label),
docs and skills shipped, and landing done between governed runs (§7). A worker's done claim is local; the phase is
done when Maestro's review and the owner's merge say so.

## 3. Phases

| Phase | Branch | PR title | Delivers | Gated on |
|---|---|---|---|---|
| 1 | `lucy-core` | `feat(maestro): rebuild the lucy review seat` | C1 (governed), C2, C3, C4, C5 (fail-before/pass-after), first pass of C8 (secrets, handoff), C16 (no-build lane, language-agnostic); profiles `plan`, `code`, `rereview`; tiers Quick and Standard | G22 for five WPs |
| 2 | `lucy-queue-receipts` | `feat(core): queue lucy review receipts` | E6: receipts in the PR record, queue refusal on open FIX_FIRST or REJECT | none |
| 3 | `lucy-lenses` | `feat(maestro): add lucy lenses and overlays` | C6 (reading), C7, C8, C9, C10, C11; change-type overlays; profile `pr`; Atlas Own read | G23 for one WP |
| 4 | `lucy-languages` | `feat(core): add lucy language packs` | C16 per language, no-build lane; `team-stack` additions; offline advisories (D7) | none |
| 5 | `lucy-deep-tier` | `feat(core): add the lucy build lane` | Deep tier; build lane; C5 mutants; C6 forced interleavings and race runs; profile `release`; read-only LSP diagnostics | none |
| 6 | `lucy-audit` | `feat(maestro): add lucy audit and diligence` | C13, C14; profiles `audit`, `diligence`; C12 and profile `artifact` | G15 for one WP |
| 7 | `lucy-compliance` | `feat(maestro): add lucy compliance evidence` | C15; profile `compliance` | G10 for three leaves and the policy, licence and accessibility packs |

Why this order (proposal): phase 1 is the smallest seat that is worth having, because Standard is the default tier
(D4) and Standard needs the host fan-out (D2) and the separate verifier (D3). Phase 2 is small and makes the receipt
gate merges, which is the design's third differentiator. Lenses come before languages because a lens works on any
language through quoted and probe evidence, while a language pack only adds tool evidence. The build lane is
expensive and executes repository code, so it comes after the cheap lanes are in use. Audit, diligence and compliance
are repository-scoped and reuse everything before them.

Each phase is shippable alone: a later phase only adds lenses, packs, runner kinds, profiles and tiers to enums and
trees that phase 1 froze as open sets (§5). Until a profile or tier exists, `maestro_request_review` refuses it with a
named error, and the card's coverage says which lanes are not built (§9, R5).

## 4. Framework extensions by phase

| # | Extension | Phase | Contract frozen first (§5) |
|---|---|---|---|
| E1 | Review seat capability: `review_analyze`, `review_probe`, `review_history`, read-only `code_locate`/`code_query`/`code_search`; its own pack set | 1 (no-build lane, closed runner set); 4 adds language packs; 5 adds the build lane and runners | K4 tool I/O, K5 seat tool declaration |
| E2 | Read-only `atlas_context` for lucy without Atlas Memory | 3 (WP 3.4, gated G23) | K9 |
| E3 | `review-work-result-v1` and parsing of the `review-result` card for a plain `task` | 1 | K2 card |
| E4 | `maestro_request_review` takes `profile` and `tier`, runs the host fan-out, reads rules from the base | 1 (plan, code, rereview; Quick, Standard); 3 adds `pr`; 5 adds Deep's samples and `release`; 6 and 7 add their profiles | K6 request, K7 fan-out |
| E5 | `recordReview` and `ReceivedV2` carry the full finding; unchanged-line findings tied to a changed line (D10); method version with profile and tier | 1 | K1 finding, K3 method version |
| E6 | Merge queue fills `reviews` and refuses queueing on an open FIX_FIRST or REJECT | 2 | K8 |
| E7 | SARIF normalizer (E7a); read-only LSP diagnostics call (E7b) | E7a in 1; E7b in 5 | K4 `ToolFinding` |
| E8 | Validation rejects `routedMemberID: "lucy"` up front | 1 | none (error code only) |
| E9 | The `tests` ability lists lucy's real tools | 1 | none |
| E10 | Scratch-copy service for the reviewed tree | 1 | K5 scratch |

## 5. Load-bearing contracts

Each sketch is the smallest seam whose change would force a consumer in another WP or phase to change. Backend writes
them as Effect schemas in the WP that freezes them; names and module paths are proposals backend may adjust before the
freeze, never after a dependent WP starts.

**K1. Finding record** (E5; `packages/schema/src/maestro-event.ts`, consumed by the card, `recordReview`, settlement
retry findings, the queue record and the app wire).

```ts
// Added to the receipt's finding entry. path, line, message stay required so receipts recorded before phase 1 decode.
// Every new field is optional on the event; recordReview requires them on new receipts (K3 version review-v2).
{
  path: NonEmptyString, line: PositiveInt, message: NonEmptyString,   // existing
  id?: NonEmptyString,                                                // stable across rounds (§6.7)
  endLine?: PositiveInt,
  severity?: "P0" | "P1" | "P2" | "P3",
  confidence?: "high" | "medium" | "low",
  difficulty?: "low" | "medium" | "high",                             // security findings only (§6.5)
  lens?: NonEmptyString, rule?: NonEmptyString, trigger?: NonEmptyString,
  evidence?:
    | { kind: "probe", command: NonEmptyString, result: NonEmptyString, uri?: string }
    | { kind: "tool", tool: NonEmptyString, version: NonEmptyString, rule: NonEmptyString, uri?: string }
    | { kind: "quote", path: NonEmptyString, startLine: PositiveInt, endLine: PositiveInt },
  cause?: { path: NonEmptyString, line: PositiveInt },                // D10: the added line that causes an unchanged-line finding
  status?: "open" | "resolved" | "dismissed", dismissedReason?: NonEmptyString,
  suggestedTest?: string,
}
```

Rules: a legacy entry with no `severity` counts as blocking (P1) wherever severity matters. `cause.line` must be an
added line of the diff; `line` may then be any line of the reviewed tree.

**K2. `review-result` card and `review-work-result-v1`** (E3; new
`modules/maestro/coordination/src/v2/governance/review-result.ts`, beside the observed `discovery-result.ts`). The card
is design §9.3, plus two fields the design's text requires but its example omits (§9, R6): `requestedTier` (the tier
asked for, when it differs from the one run) and `riskSignals: string[]` (the §5.3 triggers that fired). `profile`,
`tier`, `overlays`, lens names and check ids are open string sets validated against the registry of the phase, so a
later phase adds values without a schema change. Strict decoding as in the observed `work-result.ts` `parse`: a card
that does not decode leaves `card.parsed: false`, never a guessed verdict.

**K3. Method version.** `review-v2/<profile>/<tier>`, validated by `recordReview` against the profiles and tiers the
running build supports. Profiles map to the settlement stage: `plan` to `plan`; `code` and `release` to `code`;
`rereview` to the stage of the round it continues. `pr`, `artifact`, `audit`, `diligence` and `compliance` run outside
a validation, so they return the card and record no receipt (`recordReview` requires a validation, design §1). Old
receipts keep whatever non-empty value they hold.

**K4. Review tool I/O** (E1, E7a; new `packages/core/src/review-toolkit/`).

```ts
review_analyze({ lane: "no-build" | "build", scope: "diff" | "files", files?: string[] })
  -> { checks: { id, tool, version, lane, status: "pass" | "fail" | "not-run", reason?, workspaceExecuted: boolean }[],
       findings: ToolFinding[],       // { rule, nativeSeverity, path, line, endLine?, snippetDigest, tool, toolVersion, packVersion, uri }
       artifacts: string[] }          // raw output URIs, citable as evidence.uri
review_probe({ runner:
    | { kind: "typecheck" }
    | { kind: "test", file, name? }
    | { kind: "fail-before", hunk: { path, startLine, endLine }, test: { file, name? } }
    | { kind: "differential", test: { file, name? } }      // base and head copies, same test
    | { kind: "script", language: "ts" | "python", text } })
  -> { status: "pass" | "fail" | "not-run", reason?, exitCode?, durationMs, excerpt, uri, snapshot: { revision, files } }
review_history({ op: "log" | "blame" | "pickaxe" | "show", path?, range?, pattern?, rev? }) -> { text, uri }
```

`lane: "build"` and runner kinds `mutants` and `race` are refused with `not-run: lane not built` until phase 5 adds
them; adding a kind is additive. The host fixes every binary and argument vector; no model-supplied path or flag
reaches a process.

**K5. Seat tool declaration and scratch copy** (E1, E10). A `ReviewSeatTools` module
(`packages/core/src/review/seat-tools.ts`) mirrors the observed `ResearchSeatTools`
(`packages/core/src/research/seat-tools.ts`): `SEAT = "lucy"`, `OWN`, `LOOP`, `CLAUDE`, `RETAINED`. Allow-lists for
both engines derive from it. A new `Seat` field `review?: boolean` is refused for any id but `lucy` in `define()`,
the same way `toolkit` and `research` are (observed `seats/seat.ts:63-66`). The scratch copy is one service
`ReviewScratch.create({ worktree, revision | tree }) -> Snapshot` that reuses the observed `ProbeSnapshot`
(`packages/core/src/research-toolkit/probe/snapshot.ts`), lives for one review, holds a base and a head copy when a
differential needs both, and is removed when the review ends.

**K6. Request** (E4; observed params in `modules/maestro/coordination/src/v2/tools/review.ts:52-85`). Adds
`profile?` and `tier?`. Default profile follows `stage`; default tier is lucy's entry proposal (D4) or the project or
request pin. An unsupported profile or tier returns a named error, never a silent fallback.

**K7. Fan-out** (E4, D2, D3). Behaviour, not types: Quick runs one lucy child. Standard runs the main lucy child for
entry and context, one child per selected lens in parallel, one verifier child per candidate that sees only the
finding and the code, then resumes the main child to dedup, rank, write the card and record the receipt. Lucy never
creates a child; the host does. The verifier runs on a different model family when one is configured, else the same
model with a refutation brief. A children cap and a concurrent-probe cap are host settings (§9, R9). The card records
how many children ran.

**K8. Queue review record** (E6; observed `packages/core/src/board/queue-record.ts:276` writes `reviews: []`).
`reviews: { id, stage, verdict, method, counts: { P0, P1, P2, P3 }, open: boolean }[]`, read from the receipts linked
to the card through the board review note the request writes (observed `review.ts:178`,
`bno_review_<validation>_<stage>`). "Open" means the newest receipt for a stage is FIX_FIRST or REJECT.

**K9. Atlas read grant** (E2). `atlas_context` catalog and unit reads for lucy, without memory tools, header or
resume admission, separate from `atlasMemory` (observed `define()` limits `atlasMemory` to four ids,
`seats/seat.ts:59-60`).

## 6. Evidence gates

Four research answers are drafts whose claims did not pass the closing check. Verifying reruns are running. A WP
marked with a gate stays blocked until that answer passes the closing check. If the rerun contradicts a claim the WP
uses, the WP is revised before it starts; if the rerun fails or never closes, the phase ships without that WP (each
gated WP is cuttable).

| Gate | Answer | Claims the plan leans on | Blocked WPs |
|---|---|---|---|
| G22 | 22 skills and team | Seat skills packaging and tree rules (`seat-skill-content.ts`), `seatProfile` skill grants, `PlaybookContent` pins 5 roots and 12 files, ability descriptors, work-result kinds, the playbooks that name lucy | 1.5, 1.6, 1.7, 1.8, 1.9 |
| G23 | 23 Atlas | Own snapshot shape and guard, the closed Atlas owner list, how `atlas_context` is granted, the v2-atlas tests that use lucy as the refused case | 3.4 |
| G15 | 15 AI artifacts | Review method for prompts, skills, tool descriptions and evals; agent security rules | 6.3 |
| G10 | 10 EU regulation | CRA, NIS2, DORA, AI Act, EAA and EN 301 549 facts; licences and fit of OPA, Conftest, Kyverno, axe-core, ScanCode, REUSE | 7.2 (`cyber`, `ai-act`, `accessibility-law` leaves and the packs they need) |

State while this plan was written (observed, uncommitted): the worktree has staged, uncommitted replacements of
answers 10, 15 and 23 without the `.draft` suffix or the "close refused" header; answer 22 is still a draft. A
renamed file is not a passed closing check: Maestro confirms each one, and the WPs above stay blocked until then.
When a final answer changes a claim this plan uses, the WP it feeds is revised first. Two such changes are already
visible: answer 23 says the v2-atlas tests pin lucy as the refused case, so WP 3.4 must change those tests, not only
the grant; answer 10 adds ORT among the policy tools, which WP 7.2 weighs against its licence before adding a pack.

Some G22 facts were re-observed while writing this plan (`seats/seat.ts`, `v2/governance/work-result.ts`,
`v2/tools/review.ts`, the `team-stack` children). That lowers the risk but does not clear the gate: Maestro decides
whether the closing check passed.

A fifth gate is not research: **no benchmark or eval runs without the owner's permission (D12).** The seat
framework's qualification sequence ends with "a real Maestro seat evaluation" (observed
`docs/specs/seat-framework/README.md:60`). No phase runs one; each phase is accepted on tests, guards and an optional
live proof (one governed review on a real change, observed, not scored), and the evaluation waits for the owner.

## 7. Landing protocol

Lucy's prompt, grants and profile feed the hashes that validations and receipts bind (`grantHash`,
`reviewPolicyHash`, observed `maestro-event.ts:485-486`; design §9.4). Every phase except 2 changes at least one of
them (a new skill root is a grant). So, for phases 1 and 3–7:

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
| 1 | New `docs/guides/review.md`: the card, verdicts, tiers Quick and Standard, profiles, what "not examined" means, how to pin a tier; link from `maestro.md` and `agents.md` | New `lucy-maintenance` (seat file, prompt, tools, toolkit, tree, tests, hash-change landing) and `lucy-ownership` (what lucy owns and never owns, boundaries with backend, jimmy, archie, the unbuilt `billy` and `frankie`); update `maestro-ownership` (lucy is no longer "charter only"), `seat-skill-tree-maintenance` (lucy's roots) | `docs/specs/seat-framework/README.md` (the review boundary next to toolkit and research); `docs/specs/seat-framework/skill-tree.md` (lucy's five-root plan replaced by design §8.1); `modules/maestro/coordination/README.md` |
| 2 | `docs/guides/merge-queue.md`: reviews in the PR record, the refusal | `lucy-maintenance`: queue link | `docs/specs/maestro-lead/merge-queue.md` §4.5: mark built |
| 3 | `review.md`: overlays, the `pr` profile, Atlas Own checks | both lucy skills | none |
| 4 | `review.md`: languages, packs, "invoke if installed", licence classes | `lucy-maintenance`: adding a pack, pin and hash rules | `packages/core/src/review-toolkit` README if the package keeps one |
| 5 | `review.md`: Deep, the build lane and D6, cost in children and analyzer time | both lucy skills | none |
| 6 | `review.md`: audit, diligence, artifact | both lucy skills | none |
| 7 | `review.md`: compliance, "evidence, never compliant", the human-decision list | both lucy skills | none |

## 9. Risks and corrections

| # | Risk | Smallest correction (proposal) |
|---|---|---|
| R1 | Landing a phase stales in-flight governed approvals (§9.4) | §7 landing protocol |
| R2 | This repository refuses local tests (`script/test-guard.ts`; the research probe already reports that line, observed `research-toolkit/probe/run.ts`). In this repo fail-before/pass-after and differential probes are `check-unavailable`, and §6.6 lets APPROVE through only when the owner accepted that. Every Standard review here would block | A project setting listing lanes the owner accepts as unavailable, next to the tier pin §5.3 already allows. The card then cites the `test:ci` checks the validation recorded. Needs the owner's yes before phase 1's acceptance, see §11 |
| R3 | Deep is the risk-trigger tier for many changes (§5.3) but arrives in phase 5 | Until then the host runs Standard, the card sets `requestedTier: "deep"`, `tier: "standard"`, and lists the Deep lanes as not examined, reason `not-built`; the method version says `standard` |
| R4 | Standard runs "the repo's declared linters and gates" and fail-before/pass-after, which execute repository code, while §7.1 calls code execution the build lane | They run confined at Standard under D6's trust rule (on for the project the owner opened, off for external targets), tagged `workspaceExecuted` |
| R5 | §6.8 reasons (out of scope, toolchain absent, time box, tier) have none for a lens or lane a later phase adds | Add reason `not-built` |
| R6 | §5.3 says the card records the risk signals and the requested tier; the §9.3 example has no field for either | K2 adds `riskSignals` and `requestedTier` |
| R7 | `recordReview` today rejects APPROVE with findings (observed `review.ts`, design §1) while §6.6 allows APPROVE with P2 and P3 | APPROVE may carry only P2 and P3; FIX_FIRST and REJECT need a confirmed P0 or P1; a legacy finding without severity counts as P1 |
| R8 | The receipt event is durable; a breaking schema change breaks replay | K1 is additive and optional on the event; required only by `recordReview` for `review-v2` receipts; `test/event-manifest.test.ts` pins it |
| R9 | Fan-out children and analyzers load the owner's Mac (memory and swap are the limit) | Host caps for children and concurrent probes (reuse the probe semaphore), set low by default; the card records counts |
| R10 | `confine` refuses on Windows and on Linux without a ready srt (observed `tool-safety-sandbox.ts:380-393`), so analyzer and probe lanes do not run there | Report `check-unavailable` with the sandbox reason; R2's accepted-lanes setting covers it; never run unconfined |
| R11 | Reusing `research-toolkit/probe` from the review toolkit may trip `check:boundaries` or read as widening jimmy's research engine | Import the probe modules without the `research` seat flag; if a boundary rule refuses, move snapshot and runner code to a shared core module in WP 1.2, with no behaviour change |
| R12 | Lucy on the `claude-code` engine reaches Orchestra tools through MCP; a review tool missing from that path silently leaves lucy without it | WP 1.6 derives the Claude allow-list from `ReviewSeatTools.OWN`, as jimmy's is, and tests both engines |
| R13 | Draft-gated WPs stall a phase | Every gated WP is cuttable; a phase ships without it and the coverage reason says `not-built` |
| R14 | Real cost per review is unknown (design §5.2 assumption) | The card records children and analyzer time; no benchmark without the owner (D12) |
| R15 | `team-stack` reaches ten children, the limit, after phase 4 (§8.2) | A further language needs a regrouping plan; none is in scope |
| R16 | Advisory databases need network outside the review (D7); nothing refreshes them today | Phase 4 adds a host refresh step outside any review; the card states the database age; a missing database is `not-run` |
| R17 | Rereview resume (`strictResume: true`) changes what a `task_id` resume of lucy accepts | WP 1.6 covers it in `test/v2-resume-admission.test.ts` and `test/v2-logical-task.test.ts` |
| R18 | Running a heavy type check or mutation run in a scratch copy on the owner's Mac contradicts the owner's no-heavy-local-runs rule for this repository | Deep's build lane honours the R9 caps and the R2 setting; in this repo the card cites `typecheck.yml` results instead |

## 10. Work packages

Owning seat: backend writes code, tests and the prompt wiring; `archie` writes skill trees and prompt text only where
a WP says so; Maestro runs the gates and the landing. No WP goes to a general agent.

Every WP ends with: its `test:ci` run named, the `typecheck.yml` dispatch for each touched package, and
`bun run check:guards --base origin/dev` clean. A WP that changes the public Protocol or Server `HttpApi` runs
`bun run generate` in `packages/client`; WP 1.1 records whether the receipt change reaches it (assumption: it does
not, since the event schema lives in `packages/schema`; check `packages/client/src/generated` diff after generate).

Test file names marked *new* are proposals; backend may rename them. `test:ci` package aliases: `maestro`
(`modules/maestro/coordination`), `core`, `schema`, `app-shell`.

### Phase 1: core review seat (`lucy-core`)

Global objective: profiles `plan`, `code`, `rereview` at Quick and Standard, with the pipeline, finding bar, verdict
rules, card, receipt, no-build lane and probes. Order: 1.1 freezes K1–K3 and K6; 1.2 and 1.3 freeze K4 and K5; then
1.4–1.9.

**1.1 Contracts and receipt** — backend. E5, E8, K1, K2, K3, K6.
- Write: `packages/schema/src/maestro-event.ts`; `modules/maestro/coordination/src/v2/tools/review.ts`,
  `review-records.ts`; new `src/v2/governance/review-result.ts`; `src/v2/workflow/review.ts` and `settlement.ts` only
  where findings are read.
- Read: `test/v2-workflow-review.test.ts`, `test/v2-chain.test.ts`, `src/v2/governance/discovery-result.ts`.
- Acceptance: new receipts must carry K1's fields and a K3 version; old receipts decode and settle as before; D10
  findings accepted only with an added-line `cause`; R7 verdict rule; E8 refuses `routedMemberID: "lucy"` at
  validation with a named error; `review-result` decodes strictly; settlement retry findings carry the full record.
- Tests: `bun run test:ci schema test/event-manifest.test.ts`;
  `bun run test:ci maestro test/v2-workflow-review.test.ts test/v2-chain.test.ts test/v2-tools.test.ts test/v2-settle.test.ts test/lucy-review-result.test.ts` (last *new*).
- Depends on: nothing. Gate: none (claims from [A1], verified).

**1.2 Scratch copy and `review_probe`** — backend. E10, E1 (probe), K4 (probe), K5 (scratch).
- Write: new `packages/core/src/review-toolkit/` (`scratch.ts`, `probe.ts`, `index.ts`); shared probe code only if R11
  requires.
- Read: `packages/core/src/research-toolkit/probe/*`, `packages/core/src/tool-safety-sandbox.ts`.
- Acceptance: runners `typecheck`, `test`, `fail-before`, `differential`, `script` run confined in a scratch copy
  through the existing `ResearchProcess`/omni path; the reviewed worktree is byte-identical after every probe; a
  fail-before probe reverts the hunk only in the copy; refusals (`script/test-guard.ts`, sandbox unavailable, missing
  toolchain) return `not-run` with the reason; `build`, `mutants`, `race` return `not-run: lane not built`; no
  network; no allowlist entry.
- Tests: `bun run test:ci core test/review-toolkit/scratch.test.ts test/review-toolkit/probe.test.ts` (*new*, both
  call `expectSpawn`); `bun run check:spawn-imports`.
- Depends on: 1.1 (K1 evidence kinds). Gate: none ([A34]).

**1.3 `review_analyze`, no-build lane, SARIF normalizer, packs** — backend. E1 (analyze), E7a, K4.
- Write: `packages/core/src/review-toolkit/analyze.ts`, `sarif.ts`, `packs/` (pinned, hash-verified gitleaks and
  ast-grep, own manifest, not the backend toolkit's), `review_history` in `history.ts`.
- Read: `packages/core/src/backend-toolkit/packs/gitleaks.ts`, `ast-grep.ts`, `manifest.ts` (pinning pattern);
  `packages/core/src/relay-commands.ts` (`detect`).
- Acceptance: language detection from manifests and diff extensions; the repo's declared gates and linters read from
  the base revision and run confined under R4; native JSON and SARIF normalized into `ToolFinding`; raw output kept
  as a citable artifact; cache keyed by (pack version, config digest, file digest); diff-scoped by default; a missing
  tool is `not-run: <tool> absent`; GPL tools are never bundled (D9); `review_history` runs only `log`, `blame`,
  `log -S/-G` and `show`, read-only.
- Tests: `bun run test:ci core test/review-toolkit/analyze.test.ts test/review-toolkit/sarif.test.ts test/review-toolkit/history.test.ts` (*new*; spawning tests call `expectSpawn`).
- Depends on: 1.2 (scratch, process path). Gate: none ([A4], [A34]).

**1.4 Host fan-out and base rules** — backend. E4, K6, K7, D2, D3.
- Write: `modules/maestro/coordination/src/v2/tools/review.ts`; new `src/v2/workflow/review-fanout.ts` if the request
  grows past one cohesive function.
- Read: `src/v2/governance/dispatch.ts`, `src/v2/governance/logical-task.ts`.
- Acceptance: Quick runs one child; Standard runs entry, lens children, one verifier per candidate and a final
  aggregation in the main child, all host-created; lucy has no delegation path; the verifier gets only the finding and
  the code; D3 model choice; caps from R9; rules (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`) read with `git show
  <base>:<path>`, never from the head; the brief marks change text as data; `rereview` sends only open findings and
  the delta and reports `UNADDRESSED` when the tree did not change; R3 tier cap; entry returns `blocked` per §6.2.
- Tests: `bun run test:ci maestro test/v2-workflow-review.test.ts test/v2-review-fanout.test.ts test/v2-workflow-host.test.ts` (second *new*).
- Depends on: 1.1. Gate: none ([A1], [A3], [A5]).

**1.5 Seat capability and tool grants** — backend. E1 (grant), E9, K5 (declaration), R12.
- Write: new `packages/core/src/review/seat-tools.ts`; `modules/maestro/coordination/src/seats/seat.ts` (`review`
  field); `src/roster.ts` (lucy's grants); `src/ability-descriptors.ts` (`tests` lists lucy's tools); `src/v2/tools.ts`
  and `src/v2/seats.ts` (registration). The Claude-mode allow-list is derived in `roster.ts`, as jimmy's is from
  `ResearchSeatTools` (observed: `roster.ts` and `test/jimmy-method.test.ts` are its only users).
- Acceptance: `define()` refuses `review` for any other id; lucy gets exactly `ReviewSeatTools` plus its base;
  `review_*` tools refuse any other caller; both engines expose the same set.
- Tests: `bun run test:ci maestro test/roster.test.ts test/seat-framework.test.ts test/ability-descriptors.test.ts test/v2-seats.test.ts test/v2-tools.test.ts test/lucy-tools.test.ts` (last *new*, mirroring `test/jimmy-method.test.ts`'s engine check).
- Depends on: 1.2, 1.3 (tool ids). **Gate: G22** (seat grants and ability descriptors).

**1.6 Seat definition** — backend. Design §9.2.
- Write: `modules/maestro/coordination/src/seats/lucy.ts`.
- Acceptance: §9.2 fields: `returnCard: "review-result"`, `workResult: "review-work-result-v1"`, the nine
  `forbiddenActions`, `strictResume: true`, `atlasMemory: false`, `toolkit: false`, `review: true`, phase 1's roots
  (`lucy-review`, `lucy-correctness`, `lucy-tests`, `lucy-security`, `lucy-toolchain`), the new description; a plain
  `task` to lucy yields a parsed `metadata.workResult` (E3); R17.
- Tests: `bun run test:ci maestro test/seat-framework.test.ts test/roster.test.ts test/v2-resume-admission.test.ts test/v2-logical-task.test.ts test/specialist-name-guard.test.ts`.
- Depends on: 1.1, 1.5, 1.7 (prompt), 1.8 (roots exist). **Gate: G22**.

**1.7 Prompt** — `archie` writes `modules/maestro/coordination/src/seats/prompt/lucy.txt`; backend wires and tests.
- Acceptance: design §9.1 only: role, cold rules, six stages, the load rule for `lucy-review`, the finding bar, the
  verdict rules, the card, a Forbidden line matching `forbiddenActions` item by item. No rule a guard or the host
  enforces. Shaped after jimmy's and backend's prompts (benchmark-first).
- Tests: `bun run test:ci maestro test/seat-framework.test.ts`.
- Depends on: 1.1 (card), 1.6 (forbidden list). **Gate: G22** (prompt and charter rules).

**1.8 Phase 1 trees** — `archie` authors under `packages/lucy-specialist/skills`.
- Nodes: `lucy-review` (root, always loaded) with `plan`, `code`, `rereview`; `lucy-correctness` with `logic`,
  `edges`, `reliability`; `lucy-tests` with `adequacy`; `lucy-security` (first pass and D1 handoff rules) with
  `secrets`; `lucy-toolchain` (detection, lanes, triage, missing-toolchain reporting), no language children yet.
- Acceptance: skill-tree rules (Quality Standards); every leaf names a check lucy runs through K4 or a fact it cites
  with its source; no Maestro playbook content.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/seat-skill-root.test.ts test/v2-skills.test.ts test/seat-framework.test.ts`.
- Depends on: 1.1 (card fields), 1.2–1.3 (tool names). **Gate: G22** (tree rules).

**1.9 Maestro playbooks** — `archie` authors the text; backend runs the tests.
- Write: `modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md`, `maestro-run/verify/SKILL.md` and
  `verify/review-checks/SKILL.md`: the `profile` and `tier` arguments and the card fields Maestro reads (§10.1). No
  file added or removed. The playbook name in `maestro.txt`, `host.ts` and the playbook stays in step (unchanged).
- Tests: `bun run test:ci maestro test/orchestra-map.test.ts test/seat-skills-build.test.ts`.
- Depends on: 1.4. **Gate: G22** (playbook pins).

**1.10 App wire** — backend. Data only; screens go to the Interface session (§1).
- Write: `packages/app-shell/src/v2-wire.ts`, `src/pages/session/orchestra-governance-data.ts`.
- Acceptance: the richer findings decode and reach the governance data; old receipts still render.
- Tests: `bun run test:ci app-shell src/pages/session/orchestra-governance-data.test.ts`.
- Depends on: 1.1. Gate: none.

**1.11 Docs and skills** — backend, with `archie` for the guide text. §8 row 1.
- Tests: none beyond `check:guards`.
- Depends on: 1.1–1.10.

Phase 1 global acceptance (last step): `package-verification` and `cold-review` host checks if the phase runs as a
published workflow (the host appends them); the full suite once on the phase PR; optional live proof per §6.

### Phase 2: merge-queue receipts (`lucy-queue-receipts`)

**2.1 Reviews in the PR record and queue refusal** — backend. E6, K8.
- Write: `packages/core/src/board/queue-record.ts`, `queue.ts` (refusal in `board_queue`), the record renderer.
- Read: `docs/specs/maestro-lead/merge-queue.md` §4.5.
- Acceptance: `reviews` filled from linked receipts; `board_queue` refuses with a named error while a stage's
  newest receipt is FIX_FIRST or REJECT; absence of a receipt is not a refusal; the PR body shows reviews; no model
  spend on GitHub.
- Tests: `bun run test:ci core test/board-queue.test.ts test/board-tools.test.ts test/board-queue-scoped.test.ts`.
- Depends on: phase 1 (K1, K3 on `dev`). Gate: none ([A24]).

**2.2 Docs** — backend. §8 row 2.

### Phase 3: lenses and overlays (`lucy-lenses`)

**3.1 Lens trees** — `archie`. Adds `lucy-correctness` `concurrency` (reading only; forced interleavings in phase 5),
`resources`, `performance`; `lucy-tests` `oracles`, `smells`, `flaky`, `strategy`; root `lucy-contracts` with `api`,
`semver`, `data`, `third-party`, `ipc`; `lucy-security` `boundaries`, `supply-chain`, `ci`, `infra`; root `lucy-change`
with all five children; root `lucy-experience` with all four.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/seat-skill-root.test.ts test/v2-skills.test.ts`.
- Depends on: phase 1. Gate: none ([A12]–[A14], [A16]–[A21]).

**3.2 Overlays and lens selection** — backend. The change-type overlays (§5.1) map to lenses and required checks in
the fan-out registry; entry records which fired.
- Write: `src/v2/tools/review.ts` or `review-fanout.ts`; lucy's `skills` gains the new roots in `seats/lucy.ts`.
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/seat-framework.test.ts`.
- Depends on: 3.1.

**3.3 Profile `pr`** — backend; `archie` writes `lucy-review/pr`. A PR or branch outside the governed flow: base
rules, PR text as data, a card to Maestro, no receipt-gated settlement, no posting.
- Tests: `bun run test:ci maestro test/v2-workflow-review.test.ts test/v2-review-fanout.test.ts`.
- Depends on: 3.2.

**3.4 Atlas Own read** — backend. E2, K9.
- Acceptance: lucy reads Own units for changed paths through `atlas_context` without memory tools; a changed anchored
  path with a stale snapshot becomes a finding citing the same rule `atlas-guard` uses; Atlas held means
  `not-run` with the reason; memory tools, header and resume stay refused for lucy.
- Tests: `bun run test:ci maestro test/v2-atlas.test.ts test/v2-atlas-memory.test.ts test/v2-atlas-header.test.ts test/roster.test.ts`
  (the v2-atlas cases that expect lucy's `atlas_context` refusal change; the memory and header refusals stay).
- Depends on: phase 1. **Gate: G23.** Cuttable.

**3.5 Docs and skills** — §8 row 3.

### Phase 4: languages (`lucy-languages`)

**4.1 Language packs, no-build lane** — backend. Pinned, hash-verified MIT, BSD, Apache, ISC and MPL tools per
design §7.3–7.4 that read lockfiles and sources only (for example oxlint, knip, jscpd, OSV-Scanner offline, Syft,
ruff, bandit, pip-audit `--locked`, cargo-audit, cargo-deny, staticcheck, govulncheck, actionlint, zizmor, squawk);
GPL and AGPL tools invoked only from PATH (D9); CodeQL and Brakeman only with the user's licence. Each pack carries
its licence class in its manifest; the guard refuses bundling a non-pinnable class.
- Write: `packages/core/src/review-toolkit/packs/*`, `analyze.ts` detection table.
- Tests: `bun run test:ci core test/review-toolkit/analyze.test.ts test/review-toolkit/packs.test.ts` (second *new*).
- Depends on: phase 1. Gate: none ([A28]–[A33]); claims in [A33] marked "from memory" are checked against each tool's
  own docs inside the WP before its pack is written, and dropped if they fail.

**4.2 Offline advisories** — backend. D7 and R16: a host refresh step outside any review, read offline, age on the
card.
- Tests: `bun run test:ci core test/review-toolkit/advisories.test.ts` (*new*).
- Depends on: 4.1.

**4.3 Language trees** — `archie`. `lucy-toolchain` children `rust`, `js-ts`, `jvm`, `python`, `go`, `native`,
`dotnet`, `swift`, `ruby-php`, `polyglot`; `team-stack` gains `rust`, `jvm`, `native`, `dotnet`, `swift` (shared, so
backend reads them too). Each trap leaf needs its source before it ships (§8.2); an unsourced trap is cut.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`.
- Depends on: 4.1.

**4.4 Docs and skills** — §8 row 4.

### Phase 5: build lane and Deep (`lucy-deep-tier`)

**5.1 Build lane** — backend. `review_analyze` `lane: "build"`: type checks, typed lint, API and semver diffs per
§7.4, confined, `workspaceExecuted`, D6 trust rule; R9 and R18 caps.
- Tests: `bun run test:ci core test/review-toolkit/analyze.test.ts test/review-toolkit/build-lane.test.ts` (*new*).
- Depends on: phase 4.

**5.2 Probe runners `mutants` and `race`, forced interleavings** — backend. Mutants on changed lines, race-instrumented
runs, differential at Deep; time-boxed fuzzing writes only in the scratch copy.
- Tests: `bun run test:ci core test/review-toolkit/probe.test.ts`.
- Depends on: 5.1.

**5.3 Read-only LSP diagnostics** — backend. E7b: a call that returns diagnostics without a mutation, confined like
the language servers already are.
- Write: `packages/core/src/lsp/*` (read-only path only).
- Tests: `bun run test:ci core` with the LSP test files backend names (`UNKNOWN` today).
- Depends on: phase 1.

**5.4 Deep tier and profile `release`** — backend. Two independent samples over a reordered diff and aggregation; R3's
cap lifted; `release` profile (provenance, signing, updater, SBOM, notes).
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-workflow-review.test.ts`.
- Depends on: 5.1, 5.2.

**5.5 Trees** — `archie`. `lucy-correctness/formal`, `lucy-security/release`, Deep sections of the existing nodes.
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`.

**5.6 Docs and skills** — §8 row 5.

### Phase 6: audit and diligence (`lucy-audit`)

**6.1 Profiles `audit` and `diligence`** — backend. Repository-scoped request, brief-defined time box, a report with
no merge verdict, the K2 card without `verdict`, the §6.5 mappings, a fix-review slot that re-runs a finding's
evidence.
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/lucy-review-result.test.ts`.
- Depends on: phase 5.

**6.2 Audit tree** — `archie`. Root `lucy-audit` with its seven children (§8.1).
- Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts`.
- Depends on: 6.1. Gate: none ([A25]–[A27]).

**6.3 Profile `artifact`** — backend; `archie` writes `lucy-review/artifact` and `lucy-security/agents`.
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-skills.test.ts`.
- Depends on: 6.1. **Gate: G15.** Cuttable.

**6.4 Docs and skills** — §8 row 6.

### Phase 7: compliance (`lucy-compliance`)

**7.1 Profile `compliance` and the verified leaves** — backend for the profile; `archie` for root `lucy-compliance`
with `privacy` (closing the [A9] gaps §13 names first), `licensing`, `controls`, `evidence`. Every output is evidence,
finding, confidence and the human-decision list; never "compliant"; no developer scoring.
- Tests: `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-skills.test.ts`.
- Depends on: phase 6. Gate: none for `privacy` ([A9]) and the SSDF and SLSA parts of `controls`; ISO and SOC 2
  wording stays labelled inferred.

**7.2 Draft-backed leaves and packs** — `archie` for `cyber`, `ai-act`, `accessibility-law`; backend for OPA,
Conftest, Kyverno, axe-core, ScanCode and REUSE packs.
- Tests: `bun run test:ci core test/review-toolkit/packs.test.ts`; `bun run test:ci maestro test/seat-skills-build.test.ts`.
- Depends on: 7.1. **Gate: G10** (D11). Cuttable.

**7.3 Docs and skills** — §8 row 7.

## 11. Open items for Maestro

- **R2 needs the owner.** Phase 1 cannot APPROVE a Standard review in this repository without an accepted
  unavailable lane. The proposed project setting is an addition the design did not name; confirm or choose another
  correction before phase 1's acceptance.
- Gates G22, G23, G15, G10: tell `archie` when each verifying rerun passes or fails the closing check; a contradicted
  claim gets a plan revision.
- Live proofs are optional and unscored; an evaluation waits for the owner (D12).
- Rendering the card in the app goes to the Interface session after phase 1 lands.
