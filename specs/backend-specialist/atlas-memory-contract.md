# Atlas Memory: canonical types and the backend specialist consumption

Source inspection: 2026-10-04, canonical checkout `/Users/gustavoschneiter/Documents/HuGR/atlas`, HEAD `b319723d5c5c86a45ad362386d8c0583ed3a10f4`. Read the actual types, templates, injection/respawn code, durable read/write doors, composition root, MCP schemas and selected tests. A small in-memory probe invoked the real template/header/recall functions. No live memory was queried or written; the existing test suites were inspected, not executed.

This is a source-grounded consumer reference, not a replacement Memory model or a claim that every normative clause is fully wired into the backend specialist.

## Four stored Memory kinds

The actual `MemoryKind` union is `'task' | 'pr' | 'project' | 'logbook'`. The important distinction is **how each kind enters context**, not merely which subject it describes. [Types](../../../../atlas/packages/memory/src/types.ts), [canonical reference](../../../../atlas/docs/reference/atlas-memory.md).

| Kind | Owner | Content | Required access behavior |
| --- | --- | --- | --- |
| `task` | Each member, including Maestro | Attempts, observed failures, stopping point and retry-relevant lesson for one task/WP | Consultable on explicit recall; own resumed-unit closing fold is the narrow spawn-time exception |
| `pr` | Each member, including Maestro | Decisions, actual review outcomes and Knowledge delta for one PR | Consultable on explicit recall; normative contract also requires own resumed-PR fold at spawn, subject to wiring limits below |
| `project` | Each member, including Maestro | That member's standing imperative rules for working in this project | **Always supplied through the injected Rules slab**, bounded/ranked by Atlas; not a task history dump or an optional skill lookup |
| `logbook` | Orchestrator only in this version | Structured prose decision journal, one entry per PR | Consultable, never part of the running-turn injected header; not the backend specialist's diary |

The backend specialist therefore owns `task`, `pr` and `project` Memory. Maestro owns these too and additionally authors `logbook`; the inspected Atlas author constant is `orch`. The native adapter maps the orchestrator identity deliberately rather than treating display names as storage keys.

Member ownership scopes injection. It is not confidentiality: the current git-native store is shared plaintext, and a repository reader can read its records. The raw recall implementation can filter other owners; the backend specialist's integration must bind its allowed owner/unit rather than expose unrestricted owner selection as authority.

## Exact entry templates

These fields come from `packages/memory/src/types.ts` and the closed key sets in `template.ts`, not from a new backend specialist schema:

```text
TaskMemoryEntry
  taskId: string
  attempted: string[]
  failedWith: string[]
  stoppedAt: string
  lesson: string
  ref?: Ref

PrMemoryEntry
  prId: string
  decisions: string[]
  reviewOutcomes: string[]
  knowledgeDelta: GroundedFact[]
  ref?: Ref

ProjectMemoryEntry
  rule: string
  scope: string
  frecency: finite number
  grounding?: Ref

LogbookEntry
  prId: string
  at: string
  territories: string[]
  shipped: string
  decisions: string
  tradeoffs: string
  risks: string
  openThreads: string
  links: Ref[]
```

`Ref` is `StructRef | string`. `knowledgeDelta` is typed as `GroundedFact[]`; the Memory template validator checks an array of objects, not independent Knowledge ratification. Recording a PR's delta does not create/admit those facts into shared Knowledge.

Writes submit an **entry**, not a caller-selected `{owner, kind, entry}` record. `memoryKindOf(entry)` derives the unique kind from required/allowed keys; unknown keys or a shape matching no unique template are refused. The write door supplies the composed actor as owner and creates `MemoryRecord { owner, kind, entry }`. Read filters may use `kind`; that is a different operation from letting a write choose its validation gate.

Observed tool/check details fit the existing task fields and their `ref`; do not append invented `checkpoint`, `status`, `checks`, `sessionId` or `supersedes` keys to a closed entry. A missing reusable lesson is not permission to fabricate one. [Template implementation](../../../../atlas/packages/memory/src/template.ts).

## Injected header is not another set of stored memories

The actual `TurnHeader` is:

```text
awareness   — shared, derived project self-model
orientation — shared, derived current project state
rules       — this member's ProjectMemoryEntry[]
```

- **Awareness:** `mission`, `constitution`, `terrain`, `ontology`, `taste`, with source grounding/state. Not a handwritten member memory.
- **Orientation:** `goal`, `last`, `current`, `state`, derived from supplied authoritative sources/event state. Not a handwritten member memory.
- **Rules:** the member's own written `project` entries. This is the persistent personal Memory portion of the running header.

`task`, `pr` and `logbook` are structurally absent from this header. Explicit recall may add the relevant consulted material to a conversation; it does not turn the whole archive into automatic per-turn injection. Reading the header returns data; actual injection into the model still needs the supported host context binding. [Injection code](../../../../atlas/packages/memory/src/inject.ts).

## Existing operations to consume

| Atlas surface | Actual shape / purpose | The backend specialist use |
| --- | --- | --- |
| `atlas-memory-header` | No arguments; returns the composed actor's Awareness + Orientation + own ranked Rules | Native context producer supplies the backend specialist's running context |
| `atlas-memory-recall` | Recognized filters: `owner`, `kind`, `taskId`, `prId`; at least one recognized selector is needed for results | Explicit relevant task/PR consultation, with owner/unit bound to the assignment |
| `atlas-memory-emit` | `{ entry: MemoryEntry }`; same governed write path used by CLI `atlas memory-emit <entryJsonPath>` | Record own task/PR experience or submit a deliberate project-rule write using the native policy |
| `atlas-memory-awareness` / `atlas-memory-orientation` | No arguments; return the respective shared derived slab | Existing foundation projections, not extra backend specialist memory types |
| `MemoryReadDoor.spawnFold(unit)` / `RespawnApi.spawnRecall(seat, unit)` | Internal library capabilities around the own archived fold for `{kind: task|pr, id}` | Host/Atlas resume integration, only through an actually exposed and qualified boundary |

The durable write path derives kind, validates template, binds owner/partition, checks logbook rules or project cap as applicable, runs the named scanner and appends on admission. Refusal and unavailable scanning remain explicit outcomes. It is already an Atlas operation; the backend specialist does not implement a competing write door.

The composition root actually wires Memory read/write doors; “NO PRODUCTION CALLERS” headers in those files are stale. Its returned public surface exposes recall/header/awareness/orientation. Do not infer that every method on the internal read door is also a published MCP operation. [Composition root](../../../../atlas/packages/adapter-io/src/compose.ts), [MCP read tools](../../../../atlas/packages/mcp-server/src/server-memory-tools.ts), [write schema](../../../../atlas/packages/tools/src/handler.ts).

## Ranking, admission and retained history

The canonical rule model uses `frecency`, not the older spec's `hits` field. Project Rules have a bounded hot set; eviction means leaving injection, not deleting retained history. Promotion from a task/PR lesson into `project` is deliberate, not automatic after every success.

The inspected code declares a 12-entry Rules slab and member/orchestrator cap constants 500/800. Its cap helper counts whitespace-separated words in `rule`, not provider tokens. The durable ranker uses stored frecency decayed by positions in the whole folded log; it is not an implemented end-to-end ledger of cited rule use. Score policy remains Atlas/host-owned; the backend specialist must not invent a confidence score and report it as observed usefulness.

These are the exact inspected mechanisms and limits, not new limits chosen for the backend specialist. [Rules](../../../../atlas/packages/memory/src/rules.ts), [durable read/ranking](../../../../atlas/packages/adapter-io/src/memory-read.ts).

## Contract versus currently wired behavior

| Concern | Inspected implementation | Consequence for the backend specialist integration |
| --- | --- | --- |
| Running header | Own `project` records only, with ranked slab; current ranker has no work-scope argument despite entry `scope` | Keep always-injected Rules requirement explicit; do not claim current source already performs task-scope matching |
| Recall | Filters owner/kind/taskId/prId; actor is not automatically added, and `project` is also accepted by the raw API | Bind appropriate owner/unit; do not infer date/territory pagination or application-level authority from this endpoint |
| Resume projection | `foldArchiveFromRecord` projects `task` records without a closing-state predicate; `makeRespawn` chooses first matching fold; repeated calls return it again | No claim of complete durable PR projection, authoritative latest/closing checkpoint selection or once-per-spawn delivery without the real binding/evidence |
| Public resume exposure | `spawnFold` exists on internal read door, but inspected `composeRuntime` return does not expose it alongside public read legs | Use an actual provider-owned exposed seam; do not invent an existing MCP `spawn` tool |
| Owner | Standalone root resolves `ATLAS_ACTOR ?? gitUserEmail(repo) ?? ''`, once; this is a local identity claim, not authentication | Orchestra must bind stable member ownership and actual execution provenance through supported native composition; no per-call global environment switching |
| Schema/bounds | Closed keys and field types are checked; not every prose lifetime/cap/promotion rule is implemented by the same validator | Preserve exact rejection outcomes; do not advertise every normative statement as a measured runtime guarantee |

The normative re-spawn rule remains important: the member's own closing fold for the resumed unit should be pushed once at spawn, not left to discretionary recall. The rows above identify the actual implementation boundary rather than silently promising that the full rule already runs.

These are integration facts for the existing owners, not authorization for the backend specialist to rebuild Memory. Its ordinary task continues only with sufficient supplied context; unavailable required memory capability is reported precisely.

## Source checks and consumer changes

An in-memory probe ran with Bun from `atlas/packages/memory`, importing actual `src/template.ts` and `src/inject.ts`. It supplied synthetic records for the backend specialist, another member and the orchestrator; it did not open the durable store. Observed results:

| Probe | Actual result |
| --- | --- |
| Four correctly shaped entries through `memoryKindOf` | `task`, `pr`, `project`, `logbook` |
| Valid project entry through `validate` | `valid: true` |
| String `frecency: "high"` | `valid: false`, `wrong type: frecency must be finite-number` |
| Extra `owner` field in direct task-template validation | `valid: false`, `out-of-section prose: owner` |
| Header over mixed own/foreign/kind fixture | Shared supplied slabs plus only the backend specialist's project rule; no task/PR/logbook or foreign rule |
| Explicit own task selector | Returned the actual matching synthetic task record |
| Empty recall query against that populated fixture | Returned `[]` |

This measures pure template validation and header/selector behavior, not durable admission, ranked selection, scanners, MCP, resume or model-context delivery. In particular, direct `validate` is not the write door: the write door derives kind before validating and can refuse extra fields at that earlier stage.

The source review also followed durable test paths: project records enter the ranked slab while task/PR records remain recallable, and malformed field types are refused while a correctly typed entry reaches the fixture. The cited tests use a supplied clean scanner and were not run in this inspection, so they do not certify a production scanner or installed the backend specialist binding.

Sources inspected include `packages/adapter-io/test/memory-read-kind-filter.test.ts` and `memory-emit-template-reach.test.ts`, plus `types.ts`, `template.ts`, `inject.ts`, `rules.ts`, `logbook.ts`, `respawn.ts`, `memory-read.ts`, `memory-emit.ts`, `compose.ts` and MCP/write schemas.

Apply this model to [integration-flow.md](integration-flow.md), [owned-tools.md](owned-tools.md) and the shared skill guidance. The older transitional spec contains superseded `hits` and confidentiality wording; current reference amendments and executable source above govern this consumer description.
