# HuGR Maestro V2: Static Own Protocol

Status: proposed. This protocol materializes Atlas-derived ownership state as versioned OpenCode skills. It supersedes the runtime-`own()` adapter as Maestro's primary context path.

## Purpose

Genesis builds Atlas Knowledge and graph state. After Genesis is complete, Own protocol reads Atlas's current ownership availability and converts each canonical ownership unit into a bounded `own_*` Markdown skill. Maestro loads those skills directly; it does not query, pack, or explore Atlas at task time.

```text
genesis -> Atlas graph + Knowledge -> post-Genesis Own materializer -> static own_* skills
PR diff -> graph delta + reverse blast -> OwnImpactReceipt -> maintenance agent
   -> refreshed own_* skills -> independent verifier -> merge gate
Maestro -> selects canonical unit -> loads current own_* skill -> follows only its pointers
```

## Artifact

Each available canonical ownership unit has exactly one artifact:

```text
.opencode/skills/own/<base64url(utf8(unit))>/SKILL.md
```

The skill frontmatter `name` is `own_<base64url(utf8(unit))>`. Base64url is injective, so two units with an equal leaf such as `src/billing` and `crates/billing` cannot collide. Human-facing `description` names the canonical unit. Path, leaf, display label, glob, and guessed handle never identify an artifact.

The Markdown body has two sections:

1. Receipt: canonical unit, artifact schema version, Atlas snapshot identity, source revision, graph unit identity, ordered Knowledge fact IDs/revisions, graph edge coverage, immutable per-file Git `sourceBlobs`, and artifact content hash.
2. Skill: bounded role, terrain, governing invariants, advisory facts, gotchas, blast relations, and explicit `own_*` drill pointers. Every factual statement cites a receipt fact ID or graph identity. No uncited generated claim is allowed.

The receipt may be machine-readable YAML frontmatter or a delimited JSON block, but one parser and canonical serialization must own both materializer and verifier. Free-form prose matching is forbidden.

## Post-Genesis Materialization

Post-Genesis Own materializer reads Atlas availability after Genesis has completed. It emits an `OwnCoverageReceipt` for every canonical unit exposed by that availability. It contains ordered unit IDs, snapshot identity, graph coverage verdict, schema version, and source-file blob anchors for each rendered Own skill. Genesis never writes Own Markdown or an Own coverage receipt.

Coverage is committed at `.opencode/skills/own/OWN-COVERAGE.json`. CI reads this receipt as its only expected-unit oracle; it never treats a successfully scanned empty skill directory as complete coverage.

Materializer input is one unit plus its current Knowledge/graph projection and coverage receipt. It may use an agent to draft Markdown, but the agent never decides unit membership, impact, freshness, fact membership, or receipt fields. Materializer rejects output when any cited fact is stale, or when its cited facts, snapshot, or artifact name differ from input. Stale Genesis is therefore `HOLD`, never a static Own baseline.

Materialization completes only when every coverage-receipt unit has one valid artifact. Missing, duplicate, malformed, or non-canonical artifacts fail closed.

## PR Maintenance

Before a maintenance agent runs, graph authority emits a canonical `OwnImpactReceipt`:

```text
baseSnapshot
headSnapshot
delta { idChanged, stateChanged, changedBuckets }
changedUnits[]
reverseBlast[] { origin, closure[], underApprox, coChanged[] }
impactedUnits[]
coverage: COMPLETE | UNDER_APPROX | UNAVAILABLE
```

`impactedUnits` includes changed units, reverse-closure units, and units whose cited Knowledge facts drift or change. Membership is recomputed by verifier from base/head graph and Knowledge data; it is never trusted from agent prose or a committed receipt alone.

When any reverse closure has `underApprox: true`, coverage is `UNDER_APPROX`. The gate holds. Correlational `coChanged` entries are visible evidence, not replacements for resolved graph edges. No merge may claim complete Own coverage until graph authority resolves or explicitly governs every unknown edge.

Maintenance agent receives only impacted unit IDs, prior artifact, current grounded projection, source-blob worklist, and impact evidence. It refreshes only those artifacts. It cannot widen scope, change receipts, suppress pointers, or mark unknown graph coverage complete.

### CI Freshness Path

CI follows CoreLink OKF's content-anchor model. It does not load a historical Atlas store: committed stores are
provenance-filtered and are not trusted CI input. Instead each Own receipt records immutable Git blob IDs for every
source file its rendered skill covers. CI hashes current files and emits a deterministic stale-source worklist when
any blob differs, is absent, malformed, or escapes repository root.

This is conservative whole-file freshness until Own exposes source spans. A changed byte can require an unnecessary
refresh; an unchanged artifact can never pass after a referenced source file changes. An agent runs only after this
deterministic worklist exists, outside merge CI or in an explicitly dispatched repair workflow. It edits only Own
artifacts, then deterministic validation must pass before a repair PR opens.

## Verification Gate

Verifier recomputes `OwnImpactReceipt` from trusted base/head inputs, then enforces:

1. Artifact unit set equals current `OwnCoverageReceipt` unit set.
2. Each impacted unit has an artifact changed against base, or a deterministic proof that rendered bytes are unchanged under changed inputs.
3. Every artifact receipt binds head snapshot and current fact revisions.
4. Every cited fact exists, belongs to its unit, and is fresh under head graph state.
5. Every drill pointer names an existing canonical unit and corresponding artifact.
6. No duplicate skill name, canonical unit, or artifact path exists.
7. `UNDER_APPROX`, missing graph input, missing Knowledge input, parse error, or unavailable recomputation returns `HOLD`.

CI verifies committed artifacts, source-blob freshness, and available graph impact. It does not execute an LLM or
auto-edit PR content. Like CoreLink OKF, it proves freshness and structural coverage, not truth of agent-authored
prose; human review remains responsible for semantic correctness. Missing historical graph/Knowledge input holds graph
coverage rather than silently weakening source freshness.

## Maestro Boundary

OpenCode already discovers `.opencode/skills/**/SKILL.md`; static Own artifacts therefore use existing skill loading. Maestro selects only canonical unit IDs supplied by a valid Own availability/impact surface, then loads matching `own_*` skill. Deeper context comes only from explicit skill drill pointers.

Maestro cannot call Atlas query/pack/write APIs, source-path search, glob selection, or generic retrieval to replace a missing/stale Own artifact. Missing, stale, ambiguous, or held Own state returns `HOLD`.

## Non-Goals

No runtime Atlas adapter, generic RAG, background refresh, free-text ownership search, automatic merge repair, or agent-authored graph impact classification.
