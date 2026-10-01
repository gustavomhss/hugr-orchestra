# Method: Resolve Scope

Status: proposed V2 method, blocked on OpenCode-to-Atlas adapter freeze. ID: `resolve-scope`. Composition:
M1 Frame + M2 Ground.

V1 internal territory names are reference only. Current Atlas `Territory` is a distinct contract
`{ name, owner, tier, globs }`; retrieval accepts exact territory identity. This method exists because
`draft-plan` and `revise-plan` both require canonical scope, while admitted goal prose has none.

## Purpose

Turn one initial `PlanIntent` or revision subject `(priorRevision, changeRecord)` plus one versioned current-Atlas
territory catalog into a `ScopeProposal` containing only catalog territory names, or one blocking clarification.
It proposes scope; it does not create PlanRevision, retrieve Pack, change Atlas, or create work.

```text
RESOLVED  canonical territory-name proposal; next owner draft-plan or revise-plan
CLARIFY   one scope decision cannot be honestly selected from catalog
HOLD      catalog/identity/adapter is unavailable or invalid
```

## Trigger

Committed `AdmissionRecord` is `READY_TO_DRAFT`, or a plan revision change needs new scope resolution.

## Inputs

```text
scopeSubject        initial PlanIntent ID | revision parent revision ID + change record ID
territoryCatalog    current Atlas territory records and immutable catalog version/address
projectId           exact project identity from ComposedActor
target              initial-draft | revision
methodVersion       version of this contract
```

`territoryCatalog` arrives only through future frozen current-Atlas adapter. Raw paths, globs, V1 territory
objects, LLM-invented names, and repository-wide fallback scans are invalid input.

## Preconditions

1. Scope subject and `ComposedActor.projectId` resolve and agree.
2. Catalog is current, non-empty, versioned, and contains unique canonical `Territory.name` values.
3. Current Atlas adapter maps project identity to catalog without a cross-project fallback.

Precondition failure is `HOLD`. Empty catalog is not an empty scope success.

## Procedure

### 1. Read Catalog

Read territory names, owner, tier, and catalog address/version only. `resolve-scope` does not read Pack or
`globs`; Atlas owns territory membership semantics.

### 2. Frame Candidate Scope

Run bounded `frame-scope` skill against scope subject and catalog names. It emits included names, explicit
exclusions, source labels, and one `ClarificationNeed` when intent cannot distinguish compatible territory sets.
It may select catalog names; it may not mint or normalize names.

### 3. Validate and Persist

`scope-proposal-guard` requires non-empty included names, all names catalog-present, no inclusion/exclusion
intersection, project/catalog version binding, and source labels. Persist immutable `ScopeProposal`; later plan
methods receive proposal ID and exact catalog version, not model text.

## Skills

| Skill         | Stage                        | Output                                 | Stop condition                                             |
| ------------- | ---------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `frame-scope` | select bounded catalog names | `ScopeProposal` or `ClarificationNeed` | every name exists, or one decision blocks honest selection |

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `scope-subject-read`               | read PlanIntent or prior revision/change record            | Maestro durable evidence read  |
| `atlas-territory-catalog-read`     | frozen current-Atlas territory catalog adapter             | Atlas read only                |
| `scope-proposal-write`             | persist immutable proposal                                 | Maestro durable evidence write |
| `scope-input-guard`                | require project/catalog identity/version                   | before reasoning               |
| `scope-proposal-guard`             | reject unknown, empty, intersecting, or invented names     | before persistence             |
| `no-governed-task-before-approval` | deny Task/child Session without approved revision identity | Session/Task boundary          |

No Pack read, Atlas write, shell, product edit, member tool, Task, plan, approval, or dispatch capability exists.

## Authority

Maestro may propose catalog-backed scope. Stakeholder resolves ambiguity. Atlas catalog decides valid territory
identity; Maestro cannot turn a path/glob/display name into territory or widen an empty result.

## Evidence, Output, and Idempotence

`ScopeProposal` stores subject ID/hash, project ID, catalog address/version, included/excluded territory names,
field sources, status, timestamp, and next owner. Deduplication key is
`(scopeSubject, territoryCatalogVersion, target, methodVersion)`. Replay returns stored output; changed catalog
or intent produces linked new proposal, never mutation.

## Refusal and Recovery

| Condition                                                           | Result                                     |
| ------------------------------------------------------------------- | ------------------------------------------ |
| Adapter/catalog unratified, missing, empty, stale, or cross-project | `HOLD`; no guessed scope                   |
| Unknown/invented name or inclusion/exclusion collision              | `HOLD`; preserve named violation           |
| Multiple compatible territory choices                               | `CLARIFY`; ask one scope-boundary question |
| Duplicate trigger                                                   | return stored proposal/question            |

## Acceptance After Ratification

1. Known goal resolves only exact current catalog names, stores catalog version, and creates no plan/Task.
2. Hallucinated V1 territory, raw path, glob, unknown name, or cross-project name is rejected before proposal.
3. Ambiguous multi-territory goal asks one boundary question rather than widening scope.
4. Catalog version change produces a new linked proposal before draft/revision; no old proposal silently binds.
5. Missing/empty catalog holds; it never becomes an all-repository scope.

## Anti-Overengineering Boundary

One skill, one catalog read, one record, two guards, no file classifier, path resolver, glob engine, vector search,
pack read, cache, Atlas write, or task capability. This method has two consumers (`draft-plan`, `revise-plan`) and
closes one named failure: guessed plan scope cannot reach Atlas retrieval.
