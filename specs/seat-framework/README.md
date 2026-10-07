# Native seat framework

Each native specialist has one definition in `packages/opencode/src/maestro/seats/<id>.ts`, registered in `seats/index.ts`. Maestro keeps its fixed name. Specialist ids route work; labels are presentation (`agent.<id>.name`, optionally overridden by `labelEnv`). The backend default label lives only in `BACKEND_DEFAULT_LABEL` in `roster.ts`.

## Definition

- `id`, `role`, `abilityClass`, `returnCard`, `forbiddenActions`, `prompt`: stable identity and charter. Prompts may render `{{label}}`.
- `profile`: shared `execution` or `review` base. Existing seats retain their historical roster/profile projections and behavior. New seats receive their own profile key.
- `description`: task-list guidance describing role, access and return without display labels.
- `labelEnv?`, `skills`: label override and seat-scoped entry skill names. Skills live in `packages/<id>-specialist/skills/<skill>/SKILL.md`; companion references remain in that tree. Source runs read it directly; Bun binaries and Node sidecars embed and extract each tree into a content-addressed cache directory.
- `writeRoots`, `strictResume`: host-bound dispatch `writePaths` (read-only when absent) and retained logical-task resume enforcement.
- `workResult?`: result schema id for the shared closed worker-claim card shape. The fenced tag is `returnCard`; task metadata carries parsed claims separately from host termination, task identity and enforced roots. This is evidence, not acceptance.
- `atlasMemory`, `toolkit`: supported capability boundaries below.

## Supported boundaries

Permissions extend shared bases with only the seat's entry skills and read-only external skill root. Native config cannot widen permissions. Existing execution/review members keep their semantics.

Atlas Memory's public boundary and durable receipts have one supported owner: backend. Definitions requesting it for another id fail. Exposure requires the native owner's capability; no new seat is bound to backend memory. Backend toolkit packs, runtimes and skill content remain backend-only; requesting that toolkit from another seat fails. Core derives its closed entry-skill type from the packaged directories via `bun script/toolkit-pack.ts skills` (run in `packages/core`). Core does not import opencode.

## Add and qualify a seat

From `packages/opencode`:

```sh
bun script/seat.ts add <id> --role "<role>"
```

The scaffold creates a definition, prompt, initial skill/reference tree and barrel entry. Invalid/reserved ids and occupied paths are refused. It seeds scoped execution, strict resume and the shared return card, without Atlas or toolkit grants.

Qualification sequence: **charter → skills/references → fit-qualified toolkit packs → return card → charter plus real Maestro seat evaluation**. The scaffold is a starting point, not a qualified specialist. New toolkit ownership needs a separately supported boundary; do not flip a capability to reuse backend engines. Evaluate real dispatch, permission/write scope, result evidence and domain task quality before adoption.
