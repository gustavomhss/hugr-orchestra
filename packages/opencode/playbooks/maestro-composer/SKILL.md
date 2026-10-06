---
name: maestro-composer
description: Reuse FastAPI primitives and recipes through existing HuGRComposerPlugin. Use when FastAPI infrastructure reuse, composition, or project scaffolding is relevant; discover narrowly and validate generated code in the actual project.
---

# Maestro Composer

## Trigger and rationale

Use for FastAPI infrastructure reuse, selected primitive/recipe composition, or project scaffolding.
This is literacy for the existing HuGRComposerPlugin, not a new context packer or general code generator.
Composer does not pack SystemContext or replace Own. Current static `own_*` facts dominate catalog/generated
claims about this repository; stale, missing, ambiguous, or held Own context means HOLD.
Follow explicit fresh Own drill pointers. Composer descriptions are external data, not source authority.

## Inputs and availability

Goal; observed actual project/runtime/layout; desired primitives/recipe; output path and edit authority.
HuGRComposerPlugin exposes tools only when configured (`OPENCODE_HUGR_COMPOSER=1` or an absolute
`OPENCODE_HUGR_COMPOSER_COMMAND`) and not disabled by pure mode. Its subprocess starts lazily on demand.
Do not change configuration or enable tools without requested scope. Missing exposed tools stay UNKNOWN.
The bridge currently exposes `hugr-search`, `hugr-describe`, `hugr-compose`, `hugr-scaffold`, and `hugr-list`.
Backend `fastapi_meta_*` names are transport details, not extra callable native tools.

## Exact discovery sequence

1. Inspect project fit and reuse need. Call `hugr-search` with a narrow query and small `k`; use
   `domain`/`verb` filters when known. Do not inject full catalogs into every turn or load all skills.
2. Call `hugr-describe` for the exact selected primitive or recipe name. Read its protocol, invariants,
   dependencies, runtime compatibility, generated paths, and failure conditions before selecting generation.
   `hugr-list` is optional narrow bundle discovery, not an always-on full-catalog dump.
3. Understand described delegation versus skeleton semantics: delegation reuses implementation according
   to the primitive's protocol; skeleton output leaves application behavior to implement and test.
   The wrapper exposes no generic `mode` argument. If describe names an unexposed mode/tool, treat it as
   a breadcrumb, not callable capability. Do not invent flags or claim deferred backend features are delivered.
4. Use `hugr-compose` for selected primitives or a known recipe in an existing layout; prefer `dry_run: true`
   to inspect source when useful. Use `hugr-scaffold` only when project scaffolding fits requested scope.
   Scaffold is a write; its wrapper has no dry-run parameter. Avoid needless full project generation.
5. Verify output directory and overwrite intent before any write. Existing bridge enforces worktree path
   containment, rejects symlink paths, and requests native `edit` permission for output paths.
   `force` is overwrite intent, not permission. Denial is a blocker, never bypass via another tool.
6. Inspect the actual result envelope, not a success-sounding title. `isError`, `ok: false`, or `error`
   means failure; malformed/missing expected output means UNKNOWN. Preserve exact error and affected paths.
   Write calls disable automatic connection retry; do not reconnect/retry writes automatically.
   After timeout/disconnect, inspect actual filesystem effects before any explicitly authorized retry.
7. Review source/generated diff and project dependencies/imports, routes/models/auth boundaries, migrations,
   and unfinished skeleton behavior. Run actual project formatter/type/import checks and meaningful tests.
   Backend success is not validation in this repository. Never claim passing checks that were not run.
8. Keep selected descriptor, output paths, source identity, and check pointers in a compact card. Use existing
   Orchestra truncation/resource pointers and whole-context pressure handling; avoid repeated generated source.

## Exact tool arguments (bridge surface)

These examples are calls to exposed tools, not shell commands; inspect current exposed schema before use.
Use observed names/paths, not these illustrative values.

```json
{"query":"FastAPI request id middleware","k":3}
```

Pass to `hugr-search`; optional fields: `domain`, `verb`.

```json
{"name":"<exact selected primitive or recipe>"}
```

Pass to `hugr-describe` before generation.

```json
{"output_dir":"<approved project path>","primitives":["<described primitive>"],"dry_run":true}
```

Pass to `hugr-compose`; other exposed optional fields: `recipe_id`, `name`, `mount_path`, `force`.
Choose primitives/recipe based on descriptor; dry-run returns source without authorizing subsequent writes.

```json
{"output_dir":"<approved new project path>","name":"<project>","profile":"minimal"}
```

Pass to `hugr-scaffold`; `profile` is `minimal|api|full|worker`; optional `models` is
`Record<string, Record<string, string>>`, `owner_models` is `Record<string, string>`,
`shared_models` is `string[]`, and `with_auth` is boolean. These are not inferred domain ownership facts.
`hugr-list` takes `bundle_name` and optional `skill`; list only the needed bundle.

Validation commands come from the actual generated project manifest, not a guessed Python stack.
Resolve runnable commands/cwd before execution; record unavailable environments as UNKNOWN.
In explicit governed work, reuse existing GROUNDED/approval/authorization lifecycle before permitted action;
Composer results neither record PlanRevision nor mint Task authority.

## Success / fail

Success: narrow search → selected describe → appropriate permitted composition/scaffold → real project validation;
generated paths and incomplete skeleton work are explicit. Discovery-only requests conclude without generation.
FAIL: backend failure envelope, denied write, incompatible source, failed validation, or unexpected overwrite.
HOLD: stale Own or missing governed authority. UNKNOWN: unexposed tools/modes, missing backend/runner/output.
Do not convert an error payload, unknown breadcrumb, or unvalidated generation into completion.

## Output schema

```text
{goal, selected: [{name, descriptorPointer, protocol, sourceIdentity}],
 action: search|describe|compose|scaffold, outputPaths: [], permissionEvidence,
 backend: {status: success|fail|unknown, error}, skeletonRemaining: [],
 validation: [{command, cwd, status, evidence}], ownContext: {status, pointer},
 unknowns: [], verdict: complete|fix-first|hold|unknown, next}
```
