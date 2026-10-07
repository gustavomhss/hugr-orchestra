# HuGR Maestro V2: Ownership Context Contract

Status: proposed static Own artifact contract. It supersedes the earlier direct-`Packer` and runtime-`own()` adapter proposals.

## Purpose

`own_<unit>` is a static, bounded ownership skill derived from Atlas Knowledge and graph state. It carries role,
terrain owner/tier, governing invariants, advisory facts, gotchas, relations, drill-down, availability pointers,
freshness, and its materialization receipt. Maestro loads a current skill; it does not assemble generic packs, issue
exploratory `atlas-query` calls, or invoke runtime Atlas `own()`.

## Model

```text
Genesis produces Atlas graph + Knowledge
  -> post-Genesis Own materializer reads canonical ownership units and writes one static own_<unit> skill per unit
  -> PR impact recomputes affected units and refreshes their skills
  -> Maestro loads selected static own_<unit> skill
  -> explicit drill pointers name deeper static own_* skills when needed
```

Skill name uses injective `own_<base64url(utf8(unit))>` encoding. The canonical `unit` remains identity because
distinct units may share one leaf handle, such as `src/billing` and `crates/billing`.

## Input

```text
actor             ratified ComposedActor { projectId, sessionId, memberId }
planRevision      immutable proposed revision ID + content hash
units             ordered canonical ownership-unit IDs selected by proposed PlanRevision
headSnapshot      verified Atlas structural/Knowledge snapshot identity
artifacts[]       verified static Own receipts for units
```

User text, raw paths, globs, display labels, guessed handle names, and generic query strings do not cross this
boundary. A planner may select a unit only from verified Own availability/drill information or explicit grounded
change analysis.

## Output

```text
version           plan schema version
actor             exact input ComposedActor
planRevision      exact input ID + content hash
headSnapshot      exact input snapshot identity
actions[]         ordered { unit, skillName, operation: "load-skill" }
```

Each action loads one verified static Own skill. Its receipt binds graph/Knowledge head snapshot, cited facts,
artifact hash, drill pointers, and bounded rendered state. The action never substitutes runtime `own()`, an
`atlas-query` pack, concatenated ownership states, or an empty skill for `UN-SEEDED`.

## Readiness

The context is ready only when every planned ownership action loads an artifact verified against head snapshot and
its materialized ownership state is complete enough to validate the proposed PlanRevision:

1. Actor, plan revision, unit IDs, and snapshot bind exactly.
2. Every action loads exact static skill once; skill name never selects a unit.
3. Every ownership state has fresh cited facts and remains inside its own cap.
4. Every `pullReachable` or manifest pointer is preserved as an explicit next ownership read, never silently
   discarded or replaced by a generic query.
5. Changed Atlas structural/Knowledge snapshot invalidates prior ownership-state receipts. A PR therefore causes
   rematerialization before subsequent plan/dispatch uses those receipts.

## Fail-Closed Mapping

| Condition                                                          | Result                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Missing/malformed/cross-project actor, revision, snapshot, or unit | `HOLD` before skill load                             |
| Guessed/ambiguous skill name or duplicate canonical unit           | `HOLD` before skill load                             |
| Unit absent from verified Own availability/drill surface           | `HOLD`; no nearest match                             |
| Missing/malformed ownership artifact                               | `HOLD`; never `UN-SEEDED`                            |
| Stale ownership artifact or cited fact                             | `HOLD` with receipt                                  |
| `UNDER_APPROX` impact coverage                                     | `HOLD` with graph evidence                           |
| Ownership cap/tail cannot satisfy proposed PlanRevision            | `HOLD` with exact drill pointers                     |
| Snapshot changed after plan                                        | `HOLD`; regenerate ContextToolPlan and Own artifacts |

## Boundary

Maestro consumes only verified static Own skills. It may not call `atlas-query`, runtime Atlas `own()`, Atlas writes,
memory writes, shell, network, model, V1 storage, or OpenCode Task APIs to replace them. Atlas remains one-way: it
never imports Maestro actor, approval, or plan types.

## Non-Goals

No path search, generic Knowledge Graph query planner, RAG, context concatenation, cache, background refresh,
Atlas write, approval, dispatch, or synthesized ownership state at task time. Static Own skill tells executor where
to go deeper through bounded drill pointers.
