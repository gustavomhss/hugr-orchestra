# Lucy completion ledger, phases 4–7

Baseline `107669604c022e71c35ad9e8250abfcc8533b719` (`origin/dev`, PR #1448). This worktree's `git rev-parse HEAD` matched. The recovered-session inventory was checked with `git show` against this commit. The source checkout has unrelated uncommitted work and is not an integration target. Inventory is baseline status, not a release qualification. No row is `verified`. This ledger claims no earlier test and no green CI. It is not a Relay sprint; no Relay stop hook is in force.

Status: `pending` (implementation not written), `in-progress` (dispatched; never mark done here), `verified` (lead-observed terminal condition; none yet), `source-blocked` (a verified source constraint needs a host design or an owner decision). Missing research alone stays `pending qualification`; it never cancels an approved requirement. No percent.

Approved deferrals stay deferred (`build-plan.md` §1): GitHub/GitLab output, MCP bridges (including knip MCP), Atlas Memory, evals and ablations (D12), project budget overrides, card rendering. No stale-branch rebase. No mass cleanup. Owner merge is the final step.

## Factored bar

These apply to every WP. Do not copy them onto rows.

- Invariants (`build-plan.md` §2): lucy does not edit product, commit, push, merge, or delegate. Children start only through `ChildProcessSpawner` / `Process` / omni and `ToolSafetySandbox.confine`. No new `script/spawn-allowlist.json` entry. No install and no network during a review. Missing toolchain is `not run: <tool> absent` or `<tool> absent: <cause>`. `mcp` stays empty. Receipts already recorded replay unchanged. Maintenance skills stay out of `seat.skills`.
- Lane: no-build reads lockfiles and sources only (`design.md` §7.1). Executing repository configuration or project code belongs in the trusted build lane with `workspaceExecuted` and D6. Classify Cargo/Go metadata commands by their actual effects, configuration, subprocesses and network requirements. Five published native targets may be provisioned; only Linux x64 is a qualified runtime. Other hosts record `native-runtime-unqualified` and do not block (`type-aware.ts`).
- Pins: licence text at the tag, checksum from that release, closed argv, SARIF or a named parser. Do not invent a native binary, a flag, or an offline mode. A rule that the pack emits is `probation`. Published artifact targets do not expand runtime qualification; Linux x64 glibc is the current native review runtime. `confine` refusal is `check-unavailable`, never unconfined.
- Catalog: an option not in `ReviewProbe.BUILT` is `not-run` / `not-built`. Adding an id to `BUILT` without its own `execute` branch falls through to regress (`probe.ts`). Class options max 3 (`catalog/index.ts`). An unreached `lucy-review-prove` or `lucy-lens` node fails the build. Agreement orders the queue only; it never confirms (`design.md` §8.7). Never emit "compliant".
- Quality: AGENTS.md style; no `any`, `globalThis`, import alias, or star import; new code namespaces self-export at file top; no generated edits; tests call the implementation. A spawning test calls `expectSpawn` before spawn.
- DoD: the worker does not run tests, typecheck, or CI. The lead runs change-scoped hosted tests after integration, a package `bun typecheck`, and `bun run check:guards --base origin/dev`. The full epic runs once at campaign readiness. A source constraint is not permission to cut a requirement: resolve it, or obtain and record the owner's explicit scope decision before claiming campaign completion. A worker's done claim is not `verified`.

Shared seams have one editor. The lead owns `analyze.ts` / `entries.ts` / `route.ts` and CLI jscpd provisioning. The samples worker owns `review-fanout.ts`, `review-candidates.ts`, and `review-diff.ts` for D1. No other WP edits those files until that dispatch lands. New modules export a runner; the lead adds the one import or branch at integration. Workers do not edit `docs/guides/review.md`.

## Do not re-dispatch

Present at this baseline, not re-qualified, and not owned by a remaining WP:

- Routing: `packages/core/src/review/catalog/languages-rest.ts` (`rust`, `jvm`, `native` only).
- Go race: `packages/core/src/review-toolkit/probe.ts` race branch; do not extend it to other languages.
- Build lane and LSP: `packages/core/src/review-toolkit/build-lane.ts`, `lsp-diagnostics.ts`, `catalog/tsc.ts`. Plan 5.3's LSP test names were `UNKNOWN`; do not claim them.
- Offline OSV and Syft: `review-toolkit/osv.ts`, `osv-refresh.ts`, `syft.ts`, `catalog/osv.ts`, `catalog/syft.ts`.
- Go pinned: `review-toolkit/go-pinned.ts`, `catalog/staticcheck.ts`, `catalog/gosec.ts`. Build-lane only.
- Other live packs: gitleaks, ast-grep, squawk, ruff, actionlint, oxlint, zizmor, invoke shellcheck/hadolint, golangci-lint, go-vet. Do not reopen them.
- Ledger: `packages/core/src/review/ledger.ts` and the precision modules. Thresholds were not re-proved. Not a rewrite. Not `verified`.
- `team-stack` leaves under `modules/specialists/team/skills/team-stack/compiled/{rust,jvm,native,dotnet,swift}/` exist. Leaves are not catalog detection.

## Requirement map

| Requirement | WP | Status | Kind |
|---|---|---|---|
| jscpd SARIF, closed argv | S0 | in-progress | dispatched |
| cargo-audit `--file` + host RustSec DB | S1 | pending | not written |
| knip, pip-audit, govulncheck, cargo-deny as no-build pins | — | source-blocked | design correction |
| §7.3/§7.4 names without verified commands/distribution | Q1 | pending qualification | research, then runner WP |
| `probe:mutants` / `interleave` / `property` | P1 P2 P3 P0 | pending | not written |
| `probe:race` | — | not a WP | Go only; not a Deep gate |
| two samples, reordered diff, agreement ranks only | D1 | in-progress | dispatched; never done here |
| blast-radius in noise | D2 | pending | not written |
| release proof leaf; R3 removal | D3 D4 | pending | not written |
| audit, diligence, artifact: non-validation, no merge verdict, variants, time box, fix-review | A1 A2 A3 | pending | not written |
| compliance profile; open existing leaves | C1 A3 | pending | not written |
| OPA, Kyverno, ORT, axe-core | C3 | pending | licence class known; pin unread |
| Conftest, ScanCode, REUSE | Q1 | pending runner qualification | licence texts captured below; G10L is no longer an unread metadata label |
| dotnet/swift detection | Q2 | in-progress | qualified manifests; implementation and gates pending |
| §8 guide rows 4–7 | DOC | pending | after behavior |

## Scanners

Closed set is design §7.3 plus the phase 4.1 example list. No further tools are added.

**S0 — jscpd — in-progress.** Do not mark done. Owns `packages/core/src/backend-toolkit/packs/jscpd.ts`, `packages/core/src/review-toolkit/jscpd-analyze.ts` and `packages/core/src/review-toolkit/packs/jscpd.ts`, `packages/core/src/review/catalog/jscpd.ts`, and the jscpd branch already in the dispatch. Pin v5.4.3, MIT, linux-x64 archives and checksums in `scanner-facts.result.md`. Closed argv `jscpd <copy> --reporters sarif --output <output>`. No `--exit-code` or threshold: clones normally exit zero, so the host parses SARIF. Each side has its own fresh host working/output directory, outside the scanned copy. Omit `--semantic`, `--semantic-download`, `--semantic-url`, `--mcp`, `--lsp`, `--dead-code`. JSON config is data. Done only when a confined linux-x64 run writes SARIF and a valid duplicate report is a probation candidate under `change.duplication`, not automatic defect proof. The host provisions with `orchestra toolkit prefetch jscpd`; the review uses status-only lookup and never installs. Lead: `bun run test:ci core test/review/catalog.test.ts test/review/route.test.ts test/review-toolkit/analyze.test.ts` plus the new jscpd test the dispatch adds. Source: https://github.com/kucherenko/jscpd/releases/tag/v5.4.3

**S1 — cargo-audit — pending.** Owns `packages/core/src/backend-toolkit/packs/cargo-audit.ts`, `packages/core/src/review-toolkit/cargo-audit.ts`, `packages/core/src/review-toolkit/rustsec-refresh.ts`, `packages/core/src/review/catalog/cargo-audit.ts`, `packages/core/test/review-toolkit/cargo-audit.test.ts`. Does not edit `analyze.ts` or `osv.ts`. Closed argv only: `cargo-audit audit --file <Cargo.lock> --db <host-git> --no-fetch --stale --format json|sarif`, lockfile path outside the repo. Never `fix`, `bin`, default fetch, or `cargo update`. Host refresh is outside the review (R17); card states DB age; missing DB is `not-run`. Not the OSV DB. v0.23.0, Apache-2.0 OR MIT, linux checksums in the scanner facts. Lead: `bun run test:ci core test/review-toolkit/cargo-audit.test.ts test/review/catalog.test.ts test/review-toolkit/analyze.test.ts`. Source: https://github.com/rustsec/rustsec/releases/tag/cargo-audit/v0.23.0

**Verified constraints requiring a host design before implementation:**

- knip 6.45.1: GitHub release `assets: []`; bins are JS. No `--no-config`. Non-JSON config runs via jiti. Design no-build (`design.md:423`) holds only for data config. Do not invent a native binary. Tag `knip@6.45.1`; npm integrity is in `scanner-facts.result.md`, not a native pin.
- pip-audit 2.10.1: no `--offline`. `--locked` globs `pylock.*.toml` and `pylock.toml` only, not `uv.lock`, `poetry.lock`, or `requirements.txt`. Default service is network. Do not replace this with a claim of support. Wheel is not a native pin. Tag `v2.10.1`.
- govulncheck v1.9.0: no official native artifact or checksum (`releases/tags/v1.9.0` 404; `releases/latest` is v1.1.4 with empty assets). Source mode needs `go` and `packages.Load`; `telemetry.Start` runs. No published native release pin was found; the existing toolkit also supports source-built engines, so Q1 must evaluate a hash-pinned host build rather than declare the capability impossible. https://github.com/golang/vuln/blob/v1.9.0/LICENSE
- cargo-deny 0.20.2: checksum exists, but `check` always spawns `cargo`. Design lists it no-build (`design.md:410`); source requires a Cargo subprocess and configuration analysis. Q1 must establish the actual effects and lane; no no-build dispatch is authorized from this observation alone. https://github.com/EmbarkStudios/cargo-deny/releases/tag/0.20.2

**§7.3 table, every named cell.** Pinned and already present, not a WP: ast-grep, gitleaks, OSV-Scanner, Syft. tree-sitter is already bundled, not a review pin. jscpd is S0. OPA, Kyverno, axe-core, ORT are C3. Invoke or licensed, not a pin WP: Semgrep CE (our rules only; maintained rules never), CodeQL (`user-licence`), TruffleHog (never bundled), Conftest (Apache-2.0 at v0.71.1), ScanCode (mixed software/data/third-party terms), REUSE (GPL-containing distribution, invoke only). Q1 qualification: difftastic, SCIP, OpenGrep (LGPL separate binary; read the actual licence at the selected tag).

**Phase 4.1 example list.** Present, not a WP: oxlint, OSV-Scanner offline, Syft, ruff, staticcheck, actionlint, zizmor, squawk. S0: jscpd. S1: cargo-audit. Q1 qualification or host-design constraints: knip, bandit, pip-audit, cargo-deny, govulncheck. GPL/AGPL already `invoke`: shellcheck, hadolint, golangci-lint. Do not add a second absence string.

**Q1 — remaining named tools, pending qualification.** Before any runner is dispatched, capture the primary licence, exact version/argv, output/exit semantics, distribution and effects; produce one bounded runner WP per compatible tool, or an explicit design/scope decision. No missing read counts as a delivered capability. The closed remaining list is: cargo-geiger, cargo-machete, clippy, clippy-sarif, cargo-semver-checks, Miri, cargo-careful, loom, shuttle, Kani, tsgo, typescript-eslint, api-extractor, publint, arethetypeswrong, dependency-cruiser, Error Prone, NullAway, detekt, SpotBugs, FindSecBugs, Checkstyle, PMD, CPD, japicmp, OWASP Dependency-Check, diff-cover, pyright, mypy, pylint, Pysa, griffe, atheris, Django `check`, clang-tidy, cppcheck, Infer, CodeChecker, ASan, UBSan, libFuzzer, CBMC, Frama-C, Roslynator, `dotnet list package`, Stryker.NET, PublicApiAnalyzers, SwiftLint, Periphery, `swift package diagnose-api-breaking-changes`, RuboCop, bundler-audit, Sorbet, Steep, strong_migrations, PHPStan, Psalm, `composer audit`, Infection, Roave, shfmt, sqlfluff, Trivy, Checkov, tflint, kube-linter, kubeconform, OpenTofu, Slither, Echidna, Mythril, Foundry. Stryker, cargo-mutants, mutmut, PIT, and Hypothesis are probe constraints under P1–P3, not scanner WPs. These names remain pending work; they are not blanket exclusions.

### G10L source capture, 2026-11-11

GitHub's licence detector is not the licence text. The lead read the tagged sources:

- Conftest `v0.71.1`: [LICENSE](https://github.com/open-policy-agent/conftest/blob/v0.71.1/LICENSE), Apache-2.0; SHA-256 `a3fc6a99a82b59b761a6b1aabe8fc540b7046d5f91377fc1d8897dbbf3bd18ac`. Artifact and command qualification remain pending.
- ScanCode Toolkit `v32.5.0`: [NOTICE](https://github.com/aboutcode-org/scancode-toolkit/blob/v32.5.0/NOTICE) separates Apache-2.0 software from CC-BY-4.0 data and describes additional third-party licence terms. NOTICE SHA-256 `9049f9f2fca9ff13140af12a552d015fda6d4db09ae38e5a0323d73f69874691`. A software-only Apache label does not establish that the full bundled distribution meets the project's allowed pin classes; inspect that closure before deciding a backend.
- REUSE `v6.2.0`: [GPL text](https://github.com/fsfe/reuse-tool/blob/v6.2.0/LICENSES/GPL-3.0-or-later.txt), SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`; [package metadata](https://github.com/fsfe/reuse-tool/blob/v6.2.0/pyproject.toml) declares a mixed expression including GPL-3.0-or-later. Under D9 it can be considered for an installed-tool invocation, never a bundled pin.

These observations resolve the earlier unread-licence question, not the missing runner, output parser, confinement proof or distribution closure.

## Probes

Proposed seams, to freeze with exact input/output types before dispatch: each runner is `export * as ReviewProbeMutants` (or Interleave, Property) from its file and exports `run` returning the existing `ReviewProbe.Output`. It must not call regress argv or hunk revert. Writes stay under the review scratch and die with the scope. Timeout, RSS, and output cap are `not-run`, not fail. Cancellation restores before the shared permit drops (same oracle as `probe-cancellation.test.ts`, different option). Do not add `probe:fuzz`. Do not bundle Stryker, cargo-mutants, mutmut, PIT, or Hypothesis until a pin exists; absence of that binary is `not-run`, not a pass. Changed-line scope is the design flag (`--mutate <file:lines>`, `--in-diff`, PIT-on-diff), not whole-file mutation (`design.md` §7.4, §4.3).

- **P1 mutants — pending.** Owns `packages/core/src/review-toolkit/probe-mutants.ts`, `packages/lucy-specialist/skills/lucy-review/prove/mutants/SKILL.md`, `packages/core/test/review-toolkit/probe-mutants.test.ts`. A mutant outside the diff is not produced.
- **P2 interleave — pending.** Owns `packages/core/src/review-toolkit/probe-interleave.ts`, `packages/lucy-specialist/skills/lucy-review/prove/interleave/SKILL.md`, `packages/core/test/review-toolkit/probe-interleave.test.ts`. Gated or `Deferred` test fails on the unfixed copy and passes after; distinct from `probe:test` and from hunk revert. Race stays unoffered when the catalog language has no detector.
- **P3 property — pending.** Owns `packages/core/src/review-toolkit/probe-property.ts`, `packages/lucy-specialist/skills/lucy-review/prove/property/SKILL.md`, `packages/core/test/review-toolkit/probe-property.test.ts`. Round-trip or other stated metamorphic; a failure excerpt contains a shrunk input.
- **P0 dispatch — pending.** Depends on P1–P3. Sole editor of `packages/core/src/review-toolkit/probe.ts` and `modules/maestro/coordination/src/v2/tools/review-binding.ts`. Spreads `phase5Options` so an offer of only `probe:mutants` (or interleave, or property) creates `binding.probe` and reaches `run`. Drops one existing class option where the list is already 3. Does not edit `review-fanout.ts`. `formal` stays unreached until a route exists; do not add the node. Lead: `bun run test:ci core test/review-toolkit/probe.test.ts test/review-toolkit/probe-cancellation.test.ts test/review/catalog.test.ts` plus the three new probe tests.

## Deep

- **D1 two-sample — in-progress.** Sole editor of `modules/maestro/coordination/src/v2/workflow/review-fanout.ts` until it lands. Two hunt passes over a reordered diff; fingerprint dedup counts agreement across those samples. Agreement only ranks; it never confirms and never sets a verdict. Do not set `deep.built`, do not remove R3, do not open `lucy-audit`, do not generate audit variants. `catalog.budget.samples === 2` with `built: false` is still the fallback, not this WP done. Lead: `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-workflow-review.test.ts`.
- **D2 blast-radius — pending.** Build and test the Deep-only path before D4 enables the tier. Sole editor of `packages/core/src/review-toolkit/noise.ts`. Today only changed lines are kept because Deep is unbuilt (`noise.ts` blast-radius comment). Do not pretend the rule runs while `built` is false. Lead: `bun run test:ci core test/review-toolkit/noise.test.ts`.
- **D3 release proof — pending.** Owns `packages/core/src/review-toolkit/release-checks.ts`, `packages/core/src/review/catalog/release-checks.ts`, `packages/lucy-specialist/skills/lucy-review/release/SKILL.md`, `packages/lucy-specialist/skills/lucy-lens/security/release/SKILL.md`. Provenance, signing, updater, notes: evidence or `not-run`. No new binary. Syft stays the SBOM pack; do not claim the Standard lockfile scan is the release check. The release skill must not say the checks ran until they did. Behavioural eval stays not examined, reason `owner-permission` (R20). Leaf cites catalog ids, never commands. A route must reach `lucy-lens-security-release` or the node is not added.
- **D4 remove R3 — pending.** Depends on P0, D1, D2 and D3, with all Deep acceptance tests green. Only WP that may set `deep.built` and stop `runs: "standard"`. Not part of D1. Until then a Deep request records `requested: "deep"` and runs Standard (`route.test.ts`). Lead: `bun run test:ci core test/review/route.test.ts`.

## Audit, diligence, artifact

Skill files under `lucy-audit/{context,variant,spec-map,diligence,forensics,controls,report}` and `lucy-review/artifact` exist. Catalog rows exist. Receipt still refuses the method (`review-records.ts` `UNRECORDED_PROFILES`). Fanout still strips `lucy-audit` descendants. That is not the profile.

- **A1 — pending.** Owns `modules/maestro/coordination/src/v2/tools/review-engagement.ts` and the one new union arm in `modules/maestro/coordination/src/v2/tools/review.ts`. Repository-scoped request for `audit`, `diligence`, and `artifact`. No validation id. Brief time box is a host field, not prompt prose. Does not edit `review-pr.ts`. R20 on artifact.
- **A2 — pending.** Depends on A1. Sole editor of `modules/maestro/coordination/src/v2/governance/review-result.ts` and `modules/maestro/coordination/src/v2/tools/review-records.ts`. Add the engagement report schema without a merge verdict and durable report artifacts in the Session result. Preserve the existing governed receipt refusal for non-validation profiles: an audit report never settles a plan/code validation. Compliance extends the report schema after C1. §6.5 mappings stay. Lead: `bun run test:ci maestro test/lucy-review-result.test.ts test/v2-review-fanout.test.ts` and `bun run test:ci core test/review/route.test.ts`.
- **A3 — pending.** Depends on A2 and on D1 having landed. Owns `modules/maestro/coordination/src/v2/workflow/review-engagement-run.ts`. Audit: at most three variant generations, stop when noise is half. Diligence and artifact: `variants: 0`. Fix-review re-runs the cited finding's evidence through existing analyze/probe; no install. Opens the existing `lucy-audit` subtree, including compliance leaves, without rewriting them. Lead adds the one call into `review-fanout.ts` after D1; this WP does not edit that file while D1 is in progress.

## Compliance

- **C1 — pending.** Owns `packages/core/src/review/catalog/phase7.ts` ; lead registers the additive profile in `entries.ts`. The generic `unsupported-profile` refusal remains unchanged. Does not change `tier.run` or `deep.built`. Output is evidence, finding, confidence, and a human-decision list. Never "compliant". No developer scoring. Depends on nothing in phase 6 except the receipt editor staying A2.
- **Leaves.** Files already exist under `packages/lucy-specialist/skills/lucy-audit/compliance/{cyber,ai-act,accessibility-law,licensing,evidence}/`. Opening them is A3. G10: cyber, ai-act, and accessibility-law state only design §14 verified claims. Not captured (no date, deadline, or duty): CRA SBOM wording, 24-hour deadline, disclosure-contact duty; AI Act amending number, Art 50 paragraph dates, Art 19 retention; NIS2 clock; DORA; EN 301 549; Data Act; DSA; SSDF practice tables; Scorecard. Cyber already states no duty, date, or deadline. Do not add those claims. Capturing primary texts stays a jimmy research task, not a phase dependency (`build-plan.md` §6, §11).
- **C3 — pending, pin unread.** Four exclusive packs, same shape as S1, no shared file: `opa`, `kyverno`, `ort`, `axe-core` under `packages/core/src/backend-toolkit/packs/`, `packages/core/src/review-toolkit/`, and `packages/core/src/review/catalog/`. G10L: OPA, Kyverno, ORT Apache-2.0; axe-core MPL-2.0. The first commit reads the tag's licence and published checksum. If there is no closed runner that does not execute repo config, the row becomes `source-blocked` and no argv is invented. Conftest can proceed to artifact/argv qualification under Apache-2.0. ScanCode needs its full distribution closure checked; REUSE remains invoke-only. These are runner WPs, not claims that a pack is already present. Lead, only if a pack file exists: `bun run test:ci core test/review/catalog.test.ts test/review-toolkit/analyze.test.ts` and `bun run test:ci maestro test/seat-skills-build.test.ts`.

**Q2 — dotnet/swift — in-progress.** Manifest qualification is captured from [Microsoft project SDK documentation](https://learn.microsoft.com/en-us/dotnet/core/project-sdk/overview), [Visual Studio project files](https://learn.microsoft.com/en-us/visualstudio/ide/solutions-and-projects-in-visual-studio?view=vs-2022), and [Swift package creation](https://docs.swift.org/latest/data/documentation/packagemanagerdocs/creatingswiftpackage.json). The bounded detection contract is case-sensitive basename globs `*.csproj`, `*.fsproj`, `*.vbproj` and exact `Package.swift`, including nested packages; source, solution, resolution and Xcode container files alone are insufficient. Version-only Swift manifests and binary runners are outside this qualified detector. Acceptance is in `dotnet-swift.test.ts`, with a separate cold critic; implementation and hosted gates are pending. Tool pins remain separate Q1 WPs.

## Docs and gates

**DOC — pending.** Depends on the behavior WPs it describes. Sole editor of the phase 4–7 deltas in `docs/guides/review.md` and the pack/ledger/Deep/audit/compliance notes in `.orchestra/skills/lucy-maintenance/SKILL.md`. Does not ship ahead of the code. Does not claim a check ran.

Lead commands, run by the lead only, from the repo root, after that WP's files are integrated. Not run for this ledger. Not a local `bun test`.

| WP | Command |
|---|---|
| S0, S1, C3 | `bun run test:ci core test/review/catalog.test.ts test/review/route.test.ts test/review-toolkit/analyze.test.ts` plus that pack's new test file |
| P0–P3 | `bun run test:ci core test/review-toolkit/probe.test.ts test/review-toolkit/probe-cancellation.test.ts test/review/catalog.test.ts test/review-toolkit/probe-mutants.test.ts test/review-toolkit/probe-interleave.test.ts test/review-toolkit/probe-property.test.ts` |
| D1, A2, A3 | `bun run test:ci maestro test/v2-review-fanout.test.ts test/v2-workflow-review.test.ts test/lucy-review-result.test.ts` |
| D2, D4, C1 | `bun run test:ci core test/review/route.test.ts test/review-toolkit/noise.test.ts` |
| D3, A1 | `bun run test:ci maestro test/seat-skills-build.test.ts test/v2-skills.test.ts test/v2-review-fanout.test.ts` |
| any new spawn | `bun run check:spawn-imports` |

The lead combines each accepted wave's changed-file gates; workers never dispatch them. No local `bun test`. The epic label waits until no implementation row is `pending` or `in-progress`. Landing of a new skill root or tool follows `build-plan.md` §7: between governed runs; the owner restarts the app; agents never restart it.

## Sources

- Plan and design: `docs/specs/lucy/build-plan.md` phases 4–7, §1 deferrals, §2 bar, §6 G10/G10L, §7 landing, §8 docs, R3, R17, R20; `docs/specs/lucy/design.md` §4.3, §5.1–5.2, §7.1–7.4, §8.6–8.7, §14.
- Baseline status, not qualification: `seat-review/inventory.result.md` (git show of `10766960`, not the dirty worktree it was launched from).
- Scanner constraints: `seat-review/scanner-facts.result.md`. Upstream already cited there: jscpd v5.4.3, cargo-audit v0.23.0, cargo-deny 0.20.2, govulncheck v1.9.0 `LICENSE`, knip `6.45.1`, pip-audit `v2.10.1`.
- Probe seams: `seat-review/probe-facts.result.md` (`probe.ts` `BUILT`, `phase5.ts` not spread, fanout `samples` unread, agreement is not confirmation).

## Contracts

- S0 and S1 export a template id and `run`. They do not import each other. Lead registers each template in `analyze.ts` only after S0's branch has landed, one branch per pack.
- P1–P3 do not import `probe.ts` and do not edit it. P0 imports them and is the only editor of `BUILT` and `execute`. A class already at three options drops one quoted option in the same P0 change; the dropped id is named in the PR, not guessed here.
- D1 does not import A3. A3's `generations(profile, noiseRatio)` returns 0 unless profile is `audit`, never more than 3, and 0 once new-item noise is at least half the generation. Lead calls it from `review-fanout.ts` only after D1 lands.
- A1's input schema is the contract A2 decodes: `profile` of `audit` | `diligence` | `artifact`, `timeBoxMinutes`, no `validationRecordID`. A2 does not invent a fourth kind. C1 adds `compliance` to that union only inside A2's files, after `phase7.ts` exists.
- C3 packs do not share a file. A failed pin read deletes nothing else and does not edit `analyze.ts`.
- Success, still unmet: governed methods remain bound to valid plan/code validation receipts; outside-validation profiles produce reports, never governed receipts; examined and not-examined are listed with a reason; APPROVE does not coexist with a confirmed P0 or P1; a finding without evidence is a question.

## Acceptance checklist

Terminal conditions. Status starts as in the map. `verified` requires the lead's named `test:ci` run, not this file.

- S0: confined linux-x64 jscpd writes SARIF; semantic and MCP flags absent; other hosts unqualified, not blocking.
- S1: `--file` outside the repo, `--no-fetch`, host RustSec age on the card; default fetch and `cargo update` absent.
- P0–P3: offer reaches `run`; copy matches head after a non-regress pass; changed-line mutant only; interleave distinct from race and revert; property shrink excerpt; scratch writes gone when the scope ends.
- D1: run-tier `samples === 2`, two reordered passes, agreement does not confirm, `deep.built` still false until D4.
- D2: blast-radius items exist only after D4; changed-line filter remains for Quick and Standard.
- D3: release card lists provenance, signing, updater, SBOM, notes as run or `not-run`; no certification; R20 eval not examined.
- D4: Deep request no longer records method `standard` solely because of R3.
- A1–A3: request has no validation id; card has no merge verdict; audit stops at three generations or half noise; fix-review re-runs cited evidence; existing audit leaves are delivered, not rewritten.
- C1: `compliance` routes; words "compliant" do not appear as a verdict; human-decision list present.
- C3: each pack's checksum equals the release read at write time, or the row is `source-blocked`.
- Q1/Q2 and source constraints remain visible until implemented or explicitly re-scoped by the owner; they cannot be erased by marking them unavailable. `controls` may label ISO and SOC 2 as inferred; it may not state them as verified (`build-plan.md` 6.2).

Primary qualification sources: [jscpd 5.4.3 CLI](https://github.com/kucherenko/jscpd/blob/v5.4.3/rust/crates/cpd/src/cli.rs), [cargo-audit 0.23.0](https://github.com/rustsec/rustsec/tree/cargo-audit/v0.23.0/cargo-audit), [cargo-deny 0.20.2](https://github.com/EmbarkStudios/cargo-deny/tree/0.20.2), [govulncheck v1.9.0](https://github.com/golang/vuln/tree/v1.9.0/cmd/govulncheck), [knip 6.45.1](https://github.com/webpro-nl/knip/tree/knip%406.45.1/packages/knip), [pip-audit 2.10.1](https://github.com/pypa/pip-audit/tree/v2.10.1).
