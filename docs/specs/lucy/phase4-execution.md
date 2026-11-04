# Lucy phase 4: backend execution packet

Status: preparation only, not an authorization to implement or a claim that phase 4 is complete.
Baseline: `750a23b8ed40af0ceef23f3323ae4910d470718a`, branch `lucy-language-plan`.
Authority: `build-plan.md:668-703,322-325,337-341`; `design.md:385-405,729-763`.
Phase 1 is present at this baseline, but its tests are landing independently. Integrate against the
landed phase 1 contracts, not a guessed replacement. Phase 3 can add routing/context integration;
inspect its landed interface when available, without requiring it to land for this preparation.
The context producer remains owned by its observed domain, not by the ledger or a generic context registry.
One final bundled epic, small PRs and surgical remote tests; no merge of PR 1290 as a shortcut.

## Existing anchors and first cohort

- `packages/core/src/review/catalog/index.ts`: `Pack` has `id`, `version`, optional `pin`,
  `licence`, `backend`, `languages`, `detection`, `lane`, `output`, `network`, `template`,
  `status`; `Rule` has `pack`, `rule`, `class`, `lens`, `severity`, `triage`, `status`.
  Detection uses `manifests`, `extensions`, `absent`; validate references with `ReviewCatalog.check`.
- `entries.ts` currently supplies js-ts, python, go, ruby, php; gitleaks has wildcard mapping and
  repo pack is active. Catalog thresholds are activate 20/0.5, demote 20/0.2, drop 20/high 10.
- `review-toolkit/packs/gitleaks.ts` spreads the backend artifact into Lucy's **own** `fit`
  (`role: check`, `skills: []`), calls `BackendToolkit.status` with Lucy's manifest to locate only,
  and provides host templates. It neither inherits the backend grant nor installs during review.
  `review-toolkit/analyze.ts` owns sandbox runs, scratch base/head, checks and retained artifacts;
  `sarif.ts` owns normalization. Existing `ReviewAnalyze.Status` is `pass | fail | not-run |
  acquisition-error`; absent executables are `not-run` with an absent reason, not findings.
- First candidate cohort: PostgreSQL SQL migration files and **Squawk 2.67.0** only, using
  `backend-toolkit/packs/squawk.ts` existing five target hashes and Lucy's own manifest fit.
  This is a narrow cross-cutting SQL cohort, not proof that any language family is complete.
  Version and `Apache-2.0 OR MIT` are confirmed by upstream's tagged workspace manifest:
  https://github.com/sbdchd/squawk/blob/v2.67.0/Cargo.toml . Tagged README describes SQL paths,
  JSON reporter, config search and suppressions: https://github.com/sbdchd/squawk/blob/v2.67.0/README.md .
  It does not establish complete JSON semantics, exit codes or every rule. The executable integration
  is blocked until version-specific primary source for those claims is captured and the lead freezes
  the interface. Do not guess a complete rules list or silently map unknown rules to a wildcard.
- All other §7.3–7.4 entries remain pending, not cut: oxlint, knip, jscpd, OSV offline, Syft,
  ruff, bandit, pip-audit, cargo-audit/deny, staticcheck, govulncheck, actionlint, zizmor and
  other listed tools are examples, not verified pins. Existing `ast-grep`, `kubeconform` and
  Postgres language server backend manifests do not alone establish review suitability.
- Per tool, capture tagged upstream licence, exact version, argument/output/exit behavior and rule
  docs before pin/template/catalog mapping. Existing pin integrity and target support are inputs,
  not proof of safe invocation. Undetermined licence blocks pin; GPL/AGPL is `path` + `invoke`,
  CodeQL/Brakeman `user-licence`. Enforce non-pinnable licence versus pinned backend at catalog check.
  Never install, update advisories, call tool servers or access network during a review.

## Shared interface decisions the lead must freeze before integration

K10 durable input is `MaestroEvent.Review.ReceivedV2` in `packages/schema/src/maestro-review.ts`:
optional `catalogDigest`, `routingDigest`, `items[]` with `{pack, rule, fingerprint, outcome}`;
outcome is `confirmed | refuted | not-pursued`, unread items are absent. Event publication and
reading anchors are `modules/maestro/coordination/src/v2/tools/review-records.ts` and `review.ts`;
the versioned event is session-aggregated, not itself project-aggregated. Legacy optional items are
not zero findings or confirmed reads. The host must supply a durable project association and stable
event ordering from existing event/project records; do not infer either from worktree path alone.

K13 requested shape: `RuleLedger.derive(outcomes, catalog, project) -> Record<rule,
{status, read, confirmed, lastWindow}>` (`build-plan.md:337-341`); make key identity unambiguous
for duplicate native rule ids across packs (existing catalog duplicate key is `pack/rule`). The
minimal ordered input needs project identity, event identity/order, K10 item fields and a resolvable
catalog generation at receipt time. A whole catalog digest identifies a snapshot, but is not a
rule-generation identity: unrelated edits must not reset a rule. A rule generation must bind the
pack/rule and effective tool version plus effective rule configuration. The existing receipt has only
catalog digest, not version/config, nor an archived catalog guaranteed by these anchors. Lead must
freeze a durable generation-resolution mechanism and its missing-history behavior before coding;
do not claim that today's event alone proves the generation. Keep the derivation pure; all event
I/O and catalog resolution stay outside it. No new public event fields without a frozen contract.

Fold chronological completed receipt items, deterministically ordered and replay-stable. The lead
must define tie-breaking and item order within a receipt, and whether repeat fingerprints count as
separate reads. A completed demoted window starts after the transition, persists across calls and
restarts, and counts its subsequent reads; repeated `derive` calls must not restart the window.
Only the rule's new version/config starts a new probation generation; unrelated catalog changes
do not. A `repo` backend is always active. Project history overrides the all-project prior once
history exists; the lead must define exact selection at the boundary and avoid double-counting it.
At >=20 reads with >=1/2 confirmed probation becomes active; <1/5 confirmed over last 20 demotes;
after demotion a completed 20-read window without a unique confirmed finding drops, or 10 for high
cost (`entries.ts:359-362`). `not-pursued` and `refuted` count as reads, not confirmations.
`design.md:759-763` and `build-plan.md:690-693` do not define unique across which scope, consecutive
versus sliding post-demotion windows, transition precedence at shared boundaries, or whether a
demoted rule with a unique confirmation can ever recover without a generation change. Lead decides
these exact points before implementation; never invent a threshold. Dropped rules do not run;
demoted findings remain artifact-only; probation labels reach models, precision counts do not.

## Small PRs and acceptance contracts

All read paths are relative to repository root. Each WP waits for the lead's frozen interface where
it crosses another WP. Keep each PR's write set disjoint; integration owns the shared seams.

### A. Catalog safety and language detection
Read: `packages/core/src/review/catalog/{index,entries}.ts`, `review/route.ts`, design §7.4.
Write: `packages/core/src/review/catalog/{index,entries}.ts`, `packages/core/test/review/{catalog,route}.test.ts`.
Depends: phase 1, approved skill-node naming from D. No runtime pack work here.
1. Reject pinned backend for invoke/user-licence/never, with a stable `ReviewCatalogCheckError`
   problem kind agreed by lead; preserve the existing `Problem {kind,id,at}` contract.
2. Add only sourced detection entries and negative signals; Rust Bazel/Buck/Nix cases do not route
   cargo. Test base/head matching and negative controls without claiming unsupported tool coverage.
3. Existing catalog and skill-node reference validation remains meaningful; unsupported entries stay pending.
Tests: `bun run test:ci core test/review/catalog.test.ts test/review/route.test.ts`.

### B. Squawk pack, after A and lead interface freeze
Read: backend Squawk manifest, gitleaks adapter, analyze, SARIF parser, tagged primary docs.
Write: `packages/core/src/review-toolkit/packs/squawk.ts`, `packages/core/src/review-toolkit/sarif.ts`,
`packages/core/test/review-toolkit/packs.test.ts`, `packages/core/test/review-toolkit/sarif.test.ts`.
Catalog entry and runner wiring are reserved to E; no edits to backend manifests or generated files.
1. Reuse exact version/target hashes via own review fit and status-only locate; unsupported/absent is
   explicitly not-run. Never fetch or run repo install hooks.
2. Capture exact v2.67.0 exit, JSON schema and each exposed rule's primary docs before choosing
   command and rule mappings; constrain config discovery to scratch and disable all network via jail.
3. Tests run the actual pinned binary in CI against a positive and negative SQL fixture, validating
   output/exit/normalization; fake executables alone are not evidence. Missing binary is not green.
4. Malformed output or tool execution failure is acquisition-error, distinct from a valid empty result.
Tests: `bun run test:ci core test/review-toolkit/packs.test.ts test/review-toolkit/sarif.test.ts`.

### C. Pure precision fold
Read: `maestro-review.ts`, `review/catalog/index.ts`, `entries.ts`, receipt readers above.
Write: `packages/core/src/review/ledger.ts`, `packages/core/test/review/ledger.test.ts` only.
Depends: K10 on phase 1; lead freezes ordered event/project/generation and ambiguity decisions above.
1. Pure deterministic fold, all-project prior only when project lacks history, no model-visible counts.
2. Test 19/20 and 9/10 boundaries, strict <4/20, unique-confirmation windows, repeat calls and
   restart/replay; unrelated catalog edits cannot reset; changed rule version/config does.
3. Test legacy/missing generations by the lead-approved policy, multiple packs sharing rule ids,
   `not-pursued`, per-project isolation and repo active. No fabricated data enrichment.
Tests: `bun run test:ci core test/review/ledger.test.ts`.

### D. Shared team-stack prose
Read: `modules/specialists/team/skills/team-stack/SKILL.md`, existing language leaves, design §9.2.
Write: `modules/specialists/team/skills/team-stack/{rust,jvm,native,dotnet,swift}/**/SKILL.md`.
Depends: A node naming agreement; author is archie, backend consumes. Each trap needs a primary
source; omit unsourced traps, not the whole language. Runtime knowledge belongs in this shipped tree,
not `.orchestra/skills`. No `lucy-toolchain` node.
1. The five nodes are reachable from shared team-stack and catalog language entries once integrated.
2. Every included trap cites its source and avoids undocumented tool commands.
Tests: `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts` and
`bun run test:ci core test/review/catalog.test.ts` after integration.

### E. Integration seam, after A/B/C and applicable phase 3
Read: `review/route.ts`, `review-toolkit/{analyze,noise,sarif}.ts`, `catalog/entries.ts`, receipt
reader, phase 3's landed context producer and the frozen contract. Write: these core integration
files and `packages/core/test/review/{route,catalog}.test.ts`,
`packages/core/test/review-toolkit/{analyze,noise}.test.ts`; coordinate with A before touching shared files.
1. Resolve durable data outside pure routing, inject status explicitly; preserve deterministic replay,
   don't expose precision to a model, and label probation while retaining demoted artifacts only.
2. Route or configure dropped rules not to run; where a tool cannot exclude them, lead must decide
   an honest not-run policy rather than claiming per-rule suppression is execution prevention.
3. Integrate Squawk only after B's pinned evidence and positive/negative real-binary CI controls;
   `not-run`, absent reason and `acquisition-error` cannot become clean findings.
Tests: `bun run test:ci core test/review/catalog.test.ts test/review/route.test.ts test/review-toolkit/analyze.test.ts test/review-toolkit/noise.test.ts test/review-toolkit/packs.test.ts`.

### F. Offline advisory refresh, separate PR
Read: design D7/R17 and phase 1 analyze/card contracts; any selected advisory tool's tagged docs.
Write: `packages/core/src/review-toolkit/advisories.ts`,
`packages/core/test/review-toolkit/advisories.test.ts`; integration into card/host is a separately
agreed seam, not a change to the domain context producer. Depends: A and a lead-frozen offline DB
format, storage, refresh trigger, provenance, age clock and failure IDs; no OSV pin presumed.
1. Refresh occurs only in explicit host operation outside reviews; review opens a local snapshot only.
2. Missing/stale/corrupt database yields explicit age or unavailable/acquisition-error as agreed,
   never a clean pass; prove network denial and no implicit refresh during review.
3. Positive and negative real-binary CI controls apply to whichever pinned consumer is added.
Tests: `bun run test:ci core test/review-toolkit/advisories.test.ts`.

## Delivery and controls

Run package `bun typecheck` from affected package directories and `bun run check:guards --base
origin/dev` before each implementation PR is called done; all tests use the remote `test:ci`
commands above, not local `bun test`. Do not dispatch these during preparation. One final bundled
epic runs the full suite once, after the small PRs. Update user guides for user-facing changes and
ship runtime skill prose with the seat, not maintenance-only documentation. Treat live repo work,
phase 1/3 additions and user work as independent; no force-push, restart, or implicit merge.
