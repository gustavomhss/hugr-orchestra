# Native seat framework

Each native specialist has one definition in `packages/orchestra/src/maestro/seats/<id>.ts`, registered in `seats/index.ts`. Maestro keeps its fixed name. Specialist ids route work; labels are presentation (`agent.<id>.name`, optionally overridden by `labelEnv`). The backend default label lives only in `BACKEND_DEFAULT_LABEL` in `roster.ts`.

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

Skill trees support UTF-8 text only, including companion references; binary companions are unsupported. Embedding rejects invalid or nonlossless UTF-8 and preserves authored bytes without whole-tree newline normalization. Packaged skill-tree text checks out with LF on every platform, including JSON and TypeScript companions; Git's binary detection preserves binary bytes, while embedding still rejects unsupported content. Source and compiled startup fail closed if a declared tree or entry is missing or invalid; project/global skills cannot substitute for packaged entries. Every `SKILL.md` must be a declared, seat-scoped entry with its matching string name and optional string description, using the runtime frontmatter parser.

Source roots and extracted tree roots must be real directories, not symlinks; tree entries cannot be links or escape their root. Extraction verifies the content digest before reuse and serializes cooperative publication of each cache copy. This confines supported authored trees and cooperative starts, not hostile concurrent filesystem rewrites or symlinked cache ancestors.

Atlas Memory's public boundary and durable receipts have one supported owner: backend. Definitions requesting it for another id fail. Exposure requires the native owner's capability; no new seat is bound to backend memory. Backend toolkit packs, runtimes and skill content remain backend-only; requesting that toolkit from another seat fails. Core derives its closed entry-skill type from the packaged directories via `bun script/toolkit-pack.ts skills` (run in `packages/core`). Core does not import orchestra.

## Add and qualify a seat

From `packages/orchestra`:

```sh
bun script/seat.ts add <id> --role "<role>"
```

The scaffold creates a definition, prompt, initial skill/reference tree and barrel entry. Invalid/reserved ids and occupied paths are refused. It seeds scoped execution, strict resume and the shared return card, without Atlas or toolkit grants.

Owner decision (2026-10-07): interrupted creation fails closed. An existing scaffold lock and any partial artifacts are preserved for owner review; another invocation never deletes them or steals the lock. Ordinary failures roll back only artifacts created by that invocation. Automatic crash recovery is outside this scaffold's contract.

Qualification sequence: **charter → skills/references → fit-qualified toolkit packs → return card → charter plus real Maestro seat evaluation**. The scaffold is a starting point, not a qualified specialist. New toolkit ownership needs a separately supported boundary; do not flip a capability to reuse backend engines. Evaluate real dispatch, permission/write scope, result evidence and domain task quality before adoption.
