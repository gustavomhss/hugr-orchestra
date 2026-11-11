---
name: lucy-maintenance
description: How to change the review seat `lucy`: its seat file and prompt, the review catalog and its id build check, the pure route function, per-Session scope, budgets and how to tune them, the review tools, its skill tree, the tests to run, and the landing protocol for a change that moves the hashes governed validations bind. Use before editing anything under `packages/core/src/review`, `packages/core/src/review-toolkit`, `packages/core/src/session/scope.ts`, `packages/lucy-specialist/skills`, lucy's seat or prompt, or the review fan-out.
---

# Lucy maintenance

Lucy is the cold review seat: the host routes, the model judges. Design: `docs/specs/lucy/design.md` (§8 is the
arsenal); build plan and contracts K1–K13: `docs/specs/lucy/build-plan.md`; corrections found while building are in
its §9. What lucy owns and its boundaries: `lucy-ownership`. User guide: `docs/guides/review.md`.

## Map

| Piece | Code | Rule |
|---|---|---|
| Seat file | `modules/maestro/coordination/src/seats/lucy.ts` | `review: true` (refused for any other id by `define()`), `returnCard: "review-result"`, `workResult: "review-work-result-v1"`, `strictResume: true`, `atlasMemory: false`, `toolkit: false`, `mcp` empty (D15, pinned by a test) |
| Prompt | `seats/prompt/lucy.txt` | Role, cold rules, stages, load rule, finding bar, verdicts, card, Forbidden line matching `forbiddenActions` item by item. Budgets, scope, caps and routing stay out of the prose |
| Catalog | `packages/core/src/review/catalog/` (`index.ts` schema, `check`, `catalogDigest`; `entries.ts` the data) | Every id is an open string checked against this catalog; a new profile, tier, lens, pack or option is an entry, not a schema change |
| Route | `packages/core/src/review/route.ts` (`ReviewRoute.route`), record schema `routing.ts` (`ReviewRouting`) | Pure: no clock, no I/O, no model; reads paths, added lines and counts, never change prose |
| Project settings | `packages/core/src/review/settings.ts` (`ReviewSettings`) | Board project `review.tier` (pin) and `review.acceptedUnavailable` (R2), set through `board_settings` |
| Per-Session scope | `packages/core/src/session/scope.ts` (`SessionScope`), kept in `session.metadata.scope` | Only narrows the agent's grant; an unscoped Session behaves as before |
| Toolkit | `packages/core/src/review-toolkit/`: `scratch-copy.ts` (`ReviewScratch`), `probe.ts`, `history.ts`, `item.ts`, `sarif.ts`, `noise.ts`, and `analyze.ts` with `packs/` | Every process runs confined through `ResearchProcess`/omni; no allowlist entry, no network, no install |
| Seat tools | `packages/core/src/review/seat-tools.ts` (`ReviewSeatTools`), `tools.ts` | The per-stage tool sets the fan-out writes into scopes; both engines' allow-lists derive from it |
| Card and stage schemas | `modules/maestro/coordination/src/v2/governance/review-result.ts` (`ReviewResultV2`) | Strict decode; a card that does not decode is `parsed: false`, never a guessed verdict |
| Fan-out | `src/v2/tools/review.ts`, `src/v2/workflow/review-fanout.ts` | The §8.7 sequence; lucy never delegates |
| Receipt | `src/v2/tools/review-records.ts`, event `maestro.review.received` in `packages/schema/src/maestro-event.ts` | New fields optional on the event, required for `review-v2`; old receipts replay unchanged |
| Queue | `packages/core/src/board/review-receipts.ts`, `queue.ts` | A stage's newest `FIX_FIRST` or `REJECT` refuses `board_queue` with `ReviewOpen`. A request note with no receipt does not. The PR record lists that verdict |
| Tree | `packages/lucy-specialist/skills` | See below |

## Catalog and id check

- `ReviewCatalog.check(catalog, tree)` fails on: a `pack:`, `rule:`, `class:`, `lens:`, `overlay:`, `probe:` or `tool:`
  id a node cites that the catalog lacks; a profile, lens or class node missing from the tree; a `lucy-lens` or
  `lucy-review-prove` node no route reaches; any catalog entry naming an unknown id, a duplicate id, an unraised
  class or a content pattern that does not compile.
- It runs in `seat-skills-module.ts` when lucy's tree is embedded, so a broken id fails the build. Adding a leaf that
  cites a new id means adding the catalog entry in the same change.
- Two digest forms: `catalogDigest` returns `sha256:<hex>`; the routing record and the receipt hold the bare hex.
  `ReviewRouting.digest` hashes the record without `deviations` and model entries, so it digests what the host chose.

## Budgets and thresholds

The §8.3 budgets, §8.4 rungs and probe attempts, the §5.3 triggers and the §8.6 ledger thresholds live in
`entries.ts` under `route.tiers`, `route.triggers` and `route.ledger` (D14). Tune them only by a catalog change:

- It changes the catalog digest the receipt records. Settlement does not compare it, so no in-flight validation goes
  stale, and no landing protocol is needed for a catalog-only change.
- Budgets are host counts (`SessionScope` loads and tool calls, `ReviewResultV2.CAPS`, the fan-out's child counts);
  never move one into prompt or skill prose.
- Deep is requestable with `built: false` and `runs: "standard"`; the route records `tier.requested` (R3). A profile,
  lens or option that is not built is refused or reported `not-built`, never silently skipped.

## Adding a pack

Reuse an engine the toolkit already lists (`gitleaks`, `squawk`, `actionlint`) when the review pack is that same pin.
A Lucy-only pin stays out of `ENGINES`. `osv-scanner` is that shape: the catalog imports
`packages/core/src/backend-toolkit/packs/osv-scanner.ts`, and that file is not an `ENGINES` entry. Its asset is `raw`,
not an archive. Name the member the release actually publishes.

- Read the licence text at the tag. Copy each target's SRI from that release's checksum. Leave `floor` empty unless a
  floor was measured. Do not claim a minimum OS from memory. A pin declaration that does not match the catalog check
  fails the build; it is not a runtime absence.
- The argv lives in a facts module. A test asserts that array. Do not invent a flag. Linux x64 is the only qualified
  native runtime. Another host records `native-runtime-unqualified` and does not block. A failed install on that
  runtime is `<tool> absent: <cause>`, as `osv-scanner` writes it, and blocks until `review.acceptedUnavailable`
  accepts that check.
- GPL and AGPL stay backend `path` and licence `invoke`. They are not bundled. Do not assume one absence string.
  `shellcheck` and `hadolint` use `not run: <tool> absent`. `golangci-lint` uses `golangci-lint absent`. Neither blocks.
- Each rule the pack actually emits gets a catalog entry with class, lens, severity, triage note, and status
  `probation`. Do not add a rule for a tool that emits no defect rule.
- Ledger thresholds live in `entries.ts` `route.ledger`: activate at 20 reads with at least half confirmed; demote when
  fewer than one in five of the last 20 are confirmed; drop only when a later demoted window of 20, or 10 for a high
  cost class, has no new unique confirmed finding. A catalog edit returns a rule to probation only when it changes the
  hashed pack or rule fields. A precision number never goes in a prompt or a card.

## Tree

Phase 1 roots: `lucy-review` (procedure; `plan`, `code`, `rereview`; `prove` with `quote`, `regress`), `lucy-lens`
(`correctness` with `logic`, `edges`, `concurrency`, `reliability`; `tests/adequacy`; `security/secrets`) and the
shared `team-stack`. `lucy-audit` arrives in phase 3. Finder leaves say how to look, proof leaves how to prove; leaves
cite catalog ids, never commands. The `lucy-review` root is about 1,150 tokens by correction B4; every other group stays
under about 300 tokens. Node rules: `seat-skill-tree-maintenance`.

## Tests

Run on Actions only, never on the Mac:

- Catalog, route, settings: `bun run test:ci core test/review/catalog.test.ts test/review/route.test.ts test/review/settings.test.ts`
- Toolkit: `bun run test:ci core test/review-toolkit/scratch-copy.test.ts test/review-toolkit/probe.test.ts test/review-toolkit/history.test.ts test/review-toolkit/noise.test.ts test/review-toolkit/sarif.test.ts test/review-toolkit/analyze.test.ts`
  (spawning tests call `expectSpawn`), plus `bun run check:spawn-imports`
- Scope: `bun run test:ci core test/session-scope.test.ts test/skill.test.ts test/tool-skill.test.ts test/session-runner-tool-registry.test.ts test/session-store-permissions.test.ts`
- Card, receipt, fan-out: `bun run test:ci maestro test/lucy-review-result.test.ts test/v2-workflow-review.test.ts test/v2-review-fanout.test.ts test/v2-tools.test.ts test/v2-settle.test.ts`
- Seat and tree: `bun run test:ci maestro test/seat-skills-build.test.ts test/seat-framework.test.ts test/roster.test.ts test/lucy-tools.test.ts test/v2-resume-admission.test.ts test/specialist-name-guard.test.ts`
- Receipt replay: `bun run test:ci schema test/event-manifest.test.ts`

## Landing a hash change

Lucy's prompt, grants and profile feed `grantHash` and `reviewPolicyHash`, which validations and receipts bind. A new
root, tool or prompt edit is a hash change; a catalog edit alone is not. For a hash change:

1. Before merging, Maestro confirms no governed run is between validation and settlement in any open project and no
   queued card waits on a lucy receipt.
2. Merge, then ask the owner to restart the desktop app when the running build must pick up the seat. Agents never
   restart it.
3. A validation recorded before the merge is re-recorded before its next review; a stale-hash refusal after landing
   is expected, not a regression.

## Traps

- `**/scratch.*` trips the `agent-scratch` guard; the module is `scratch-copy.ts` (B1).
- This repository refuses local tests, so probes here return `not-run`; R2's `review.acceptedUnavailable` decides
  whether APPROVE may stand, and the card cites `test:ci` results.
- `confine` refuses on Windows and on Linux without srt: report `check-unavailable`, never run unconfined.
