# R47 — task modes × technical domains: implementation variant cards

Status: source-only research, 2026-10-03. Cards, bundles and selection/check cases below are proposals; application commands, generators, benchmarks and tests unexecuted. Public skill IDs remain lead decision.
Baseline: `git rev-parse --show-toplevel --verify HEAD` in metadata worktree resolved `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/orchestra/backend-r47-scope-variants`, HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`. Supplied `backend-plugin` source worktree HEAD independently matched.
Contract read: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md`, plus parent `capabilities.md` and `backend-toolbox.md`. R29/R31/R32 used as source leads; technical claims below cite primary material reopened during R47, never earlier reports as runtime evidence.

## Shared contract and selection axes

- **Mode = change intent:** feature, diagnosed repair, prescribed refactor, migration/compatibility change, given optimization, assigned tests. **Domain = technical obligations:** API, data, concurrency/jobs, auth implementation, protocols/codecs, observability. Language/runtime/framework/library/version form separate recipe axis; permissions form none of these axes.
- **Shared inputs:** clear requested behavior, component and authorized implementation/context targets, existing interfaces/patterns, relevant stack versions, acceptance cases and project command references. Diagnosis required for repair; architecture decisions required where unresolved, not ceremonial prerequisites for ordinary features.
- **Shared steps:** consume supplied packet/context → read assigned code → implement using selected version-matched recipe → execute assigned and applicable mandatory project checks → return delta, actual evidence and blockers. Test authoring only when assigned. Independent review/acceptance remains external.
- **Local latitude:** choose SQL expressions, helper boundaries, idiomatic control flow, parameter names, fixture arrangement and ordinary command parameters within known recipes. Targets may be files/components, not exact line spans. Caller need not prewrite SQL, every helper or argv; command details can live in existing project guidance.
- **Failure handling:** correct own scoped implementation mistakes against supplied contract. Missing diagnosis/decision/context, unexpected out-of-scope failure or incompatible recipe returns observed evidence to responsible owner. No investigation, root-cause loop, architecture selection, self-review role, delegation or grant changes.
- **Common tools/output:** existing read/edit tools, compiler/generator/test commands and supplied fixtures; no installation implied. Handoff records changed artifacts, command/CWD/environment identity, observed outcomes and unverified checks. Skips, absent fixtures and zero selected cases stay incomplete, not successful evidence.

## Family/domain × mode matrix

Cells name differing work/check emphasis, not separate agents or proposed skill IDs. Every cell inherits shared contract; only assigned obligations activate.
| Domain family | Feature | Diagnosed repair | Prescribed refactor | Migration / compatibility | Given optimization | Assigned tests |
| --- | --- | --- | --- | --- | --- | --- |
| API | New accepted requests/results | Restore diagnosed wire behavior | Move supplied seams; preserve wire | Implement old/new consumer contract | Chosen boundary hot-path change | Raw request/response oracles |
| Data | New query/write semantics | Correct known predicate/transaction defect | Move access code; preserve results | Ordered persisted-state transition | Chosen query/index/batching change | Rows, isolation, transition fixtures |
| Concurrency/jobs | Encode assigned lifecycle/admission | Correct known cancellation/retry defect | Preserve ownership across move | Implement payload/worker coexistence | Chosen bound/batch implementation | Assigned interleavings/completion checks |
| Auth implementation | Implement supplied allow/deny policy | Restore diagnosed enforcement | Preserve policy through relocation | Implement supplied identity transition | Chosen lookup/cache optimization | Allowed and denied principals |
| Protocols/codecs | Implement supplied format | Correct known decode/encode defect | Preserve wire meaning across move | Old/new reader-writer matrix | Chosen parser/encoding change | Malformed, limits, compatibility cases |
| Observability | Emit supplied signals | Correct known false/missing signal | Preserve signal names/lifetimes | Implement telemetry-consumer transition | Chosen emission-cost change | Signal contents and completion |

## Mode cards — workflow deltas

### M-F — feature
- **Trigger / non-trigger:** new specified behavior; not symptom-only repair, “design backend,” or framework selection.
- **Inputs:** shared packet + intended inputs/results, preserved behavior and any required domain decisions; no repair diagnosis demanded.
- **Steps / tools:** implement contract through existing seams; generate only affected canonical artifacts when recipe requires; wire handwritten behavior; use native editor/compiler and applicable domain tools.
- **Output / checks:** usable implementation plus assigned positive, boundary and preservation results; generated stub alone cannot satisfy supplied behavior. ogen explicitly enables stub generation by default [P1].
- **Local latitude / external blocker:** choose method bodies, SQL and helpers; owner resolves missing business semantics or new architecture boundary.
### M-R — diagnosed repair
- **Trigger / non-trigger:** supplied cause, correction direction and regression; not “endpoint broken—find why.”
- **Inputs:** shared packet + diagnosis, detecting case or supplied baseline evidence, fix constraints and behavior to preserve.
- **Steps / tools:** apply correction at supplied seam; run same detecting case and preservation checks; use existing runner plus domain recipe, not exploratory probes.
- **Output / checks:** correction linked to diagnosed defect, regression outcome and preserved cases; capture pre-fix result only when assigned or use supplied evidence, never invent red→green history.
- **Local latitude / external blocker:** choose correction details and fix own implementation errors; contradicted diagnosis or unexplained wider failure returns to diagnosis owner.
### M-S — prescribed refactor
- **Trigger / non-trigger:** supplied structural change with preserved external behavior; not choosing architecture or changing acceptance under “cleanup.”
- **Inputs:** shared packet + old/target seams, relevant consumers supplied as context, preserved wire/data/lifetime invariants.
- **Steps / tools:** move/extract/rename within boundaries; adapt assigned callers; use native edits or already-selected scoped transform, then compiler and preservation checks.
- **Output / checks:** requested structural delta plus same contract outcomes; include supplied seam/dependency checks, not just successful compilation.
- **Local latitude / external blocker:** choose equivalent internal expressions and small helpers; owner resolves unassigned callers or behavior change required by proposed seam.
### M-M — migration / compatibility change
- **Trigger / non-trigger:** assigned transition between supported states/versions; not every query edit or dependency appearing in lockfile.
- **Inputs:** shared packet + source/target states, compatibility window and direction, phase order, transitional semantics, recovery/forward-only policy where relevant.
- **Steps / tools:** author ordered transition/adapters; apply supplied coexistence rules; use existing migration runner or contract generator and old/new fixtures. Recipe depends on domain, not word “migration.”
- **Output / checks:** phase artifacts and version-pair/transition evidence; state preservation and interrupted/repeated progress checks when assigned, not merely final-state build.
- **Local latitude / external blocker:** implement SQL, adapters and loops within strategy; rollout order, lossy mapping or unsupported version pair unresolved → responsible owner.
### M-O — given optimization
- **Trigger / non-trigger:** identified bottleneck and chosen change supplied; not “make faster” or profiling to select algorithm.
- **Inputs:** shared packet + selected optimization, comparable baseline/workload, metric/threshold, environment and correctness constraints.
- **Steps / tools:** implement selected change; execute supplied correctness checks and measurement recipe with same workload; use existing benchmark runner and prescribed metrics only.
- **Output / checks:** implementation, comparable measurements and stated threshold outcome; missing/unmatched baseline yields unverified improvement, not estimated speedup.
- **Local latitude / external blocker:** choose local layout/allocation details consistent with chosen technique; owner supplies missing baseline or selects different approach when needed.
### M-T — assigned tests
- **Trigger / non-trigger:** explicitly assigned test implementation; running existing checks alone does not select this mode.
- **Inputs:** shared packet + production behavior/properties, oracle, target cases, fixture/runtime and any generation/replay budget.
- **Steps / tools:** author cases against actual implementation; wire existing fixture/property library if selected; run prescribed healthy and detecting controls with existing test runner.
- **Output / checks:** tests/fixtures and actual selected-case results; healthy behavior succeeds, supplied broken/control behavior is detected; unavailable controls remain unverified.
- **Local latitude / external blocker:** choose assertions, examples and generators inside supplied oracle; missing oracle or production defect needing new diagnosis/scope returns to owner, not automatic repair.

## Domain cards — implementation and evidence deltas

### D-A — API boundary
- **Trigger / non-trigger:** endpoint/handler, validation, status/error or consumer-facing mapping changes; not pure internal calculation behind unchanged boundary.
- **Inputs:** operations, request/response/error contract, principal/resource policy reference, assigned consumers, selected router/generator versions and output ownership.
- **Steps / tools:** implement decode→domain call→encode/error mapping; use existing generator only for changed contract inputs. In inspected ogen source, request decoder invokes validation; response validation is separate opt-in [P1].
- **Output / checks:** canonical contract delta when assigned, generated delta when needed, real handlers; raw invalid requests, valid requests and supplied error/auth cases exercise server path.
- **Local latitude / external blocker:** choose mapping/helper code; absent status semantics, consumer decision or unsupported generator construct returns to contract owner.
### D-Q — data query / transaction operation
- **Trigger / non-trigger:** assigned query/write, result mapping or transaction binding; not persisted-schema/backfill transition merely because SQL appears.
- **Inputs:** supplied schema revision, result/cardinality/null rules, predicates/tenant authority, transaction owner and isolation/retry semantics when relevant.
- **Steps / tools:** author SQL/builder expressions; regenerate selected bindings; wire supplied transaction and map results. sqlc's generated `WithTx` binds queries to passed transaction [P2]; begin/commit ownership follows packet.
- **Output / checks:** query/binding/repository delta; assigned actual-engine row, empty/null, tenant and atomicity cases. Typed output is not evidence those business assertions passed.
- **Local latitude / external blocker:** choose correct joins, SQL expressions and parameterization; unclear isolation/business semantics or schema unavailable → data/architecture owner.
### D-D — data transition
- **Trigger / non-trigger:** persisted schema/data conversion, backfill or index migration; not read-time alias/default projection.
- **Inputs:** M-M transition facts + history/base revision, engine/runner version, rename/backfill meaning, concurrency/transaction policy, authorized artifacts and supplied populated fixtures.
- **Steps / tools:** author next migration and prescribed data conversion in given order; reconcile generated candidates to supplied meaning; use existing runner. Alembic autogenerate reports column rename as add/drop; Goose normally wraps migration in transaction unless disabled [P3,P4].
- **Output / checks:** migration/model/metadata artifacts as required; populated upgrade, expected rows/constraints and assigned coexistence/restart checks. sqlc parses migrations but does not apply them [P2].
- **Local latitude / external blocker:** write SQL and batch-loop mechanics under given limits; missing backfill policy, phase compatibility or transaction exception goes upstream.
### D-C — concurrency / application jobs
- **Trigger / non-trigger:** assigned lifetime, admission, cancellation, retry or backpressure behavior; not every `async` function or incidental queue dependency.
- **Inputs:** work/resource owner, cancellation/completion contract, bounds/deadlines, selected queue and ack/retry/idempotency semantics when relevant.
- **Steps / tools:** propagate lifetime, implement supplied admission/retry boundaries and cleanup/completion; use existing task/queue primitives and supplied scheduling/failure fixtures. Go `CancelFunc` does not wait for work to stop [P5].
- **Output / checks:** scoped worker/lifetime implementation; assigned checks observe completion/release and business-effect count, not only cancellation request or enqueue return.
- **Local latitude / external blocker:** choose local synchronization and cleanup placement within ownership design; missing delivery guarantees, effect identity or completion owner requires external decision.
### D-U — auth implementation
- **Trigger / non-trigger:** implement supplied application identity/resource rules; not audit, identity architecture selection or the backend specialist/harness grant changes.
- **Inputs:** trusted principal source, allow/deny matrix, resource/tenant binding, selected library/version; JWT algorithm/issuer/audience profile only when JWT used.
- **Steps / tools:** wire existing verifier and prescribed resource checks before protected effects; use selected auth library and fixtures. JWT algorithm allowlist and applicable audience validation are distinct obligations [P6].
- **Output / checks:** enforcement code; authorized control succeeds, specified wrong principal/resource/token cases deny with prescribed status and effects.
- **Local latitude / external blocker:** choose guards/mappers within policy; missing trust profile or contradictory permissions returns to policy owner.
### D-P — protocols / codecs
- **Trigger / non-trigger:** message framing, field presence, binary/JSON mapping or protocol evolution; not ordinary HTTP handler using unchanged serialization recipe.
- **Inputs:** chosen format/dialect, canonical schema, generator/runtime versions, limits and malformed-input policy; old/new payloads and support direction for compatibility work.
- **Steps / tools:** edit schema or handwritten codec as assigned, regenerate existing bindings, implement remaining framing/domain mapping; use selected compiler/codec and fixture runner. Protobuf deleted field numbers must stay reserved, not recycled [P7].
- **Output / checks:** schema/bindings/adapter delta; supplied known vectors, malformed/limit and old/new directional cases, not round-trip alone.
- **Local latitude / external blocker:** choose parser helpers/buffer handling within given limits; unresolved wire identity, version policy or format selection goes upstream.
### D-O — observability implementation
- **Trigger / non-trigger:** assigned logs/metrics/traces and signal contract; not outage investigation or choosing what system should measure.
- **Inputs:** signal names, lifecycle/status meaning, bounded attributes, redaction policy, existing SDK/exporter version and capture fixture.
- **Steps / tools:** place emissions at supplied operation boundaries, propagate context and terminate spans; use existing SDK/capture tooling. OpenTelemetry Go `RecordError` does not set span status; set prescribed error status separately [P8].
- **Output / checks:** instrumentation plus captured success/failure/cancellation signals matching supplied contents/lifetimes and business-outcome preservation.
- **Local latitude / external blocker:** choose emission/helper placement consistent with lifecycle; missing status/attribute policy or exporter fixture goes to observability owner.

## Same API work, different modes — proposed comparison, unexecuted

Shared target: `POST /widgets`, canonical name-length/quantity validation and `400 {"message":"invalid request"}` mapping through existing ogen boundary. Different starting states make mode meaningful; identical externally visible behavior change cannot honestly become refactor by relabeling.
| Mode | Supplied starting fact → changed steps | Output difference | Detecting/preservation checks |
| --- | --- | --- | --- |
| Feature + D-A | Operation absent; contract supplied → add canonical operation, generate boundary, implement/wire handler | New operation, generated artifacts, business handler | Valid request reaches real handler; invalid request gets prescribed 400 before domain effect |
| Repair + D-A | Contract exists; owner diagnosed manual decoder bypass → route through existing generated decoder, fix error adapter | Wiring/error correction; schema regeneration only if actual input changed | Same supplied formerly accepted invalid payload now rejected; valid response/auth behavior preserved |
| Refactor + D-A | Manual boundary already meets contract; owner prescribed generated seam → replace equivalent validation/mapping path | Structural move with preserved canonical contract | Supplied valid/invalid/error corpus keeps same outcomes; assigned seam check confirms requested move |
Wrong transfer: demand diagnosis before new feature; silently tighten validation during refactor; regenerate everything for wiring-only repair; equate ogen stub/compiler success with completed endpoint. Primary mechanism: request validation, response opt-in and stub feature differ [P1].

## Same data requirement, query versus migration — proposed comparison, unexecuted

Shared outward result: expose `users.name` as `display_name`, substituting `Unknown` for NULL. PostgreSQL 17 fixture: `(1,'Ada'),(2,NULL)` → returned `(1,'Ada'),(2,'Unknown')`. Scope decides whether storage must also change.
| Variant | Steps / tools | Artifacts / decisive checks |
| --- | --- | --- |
| Feature + D-Q; stored schema retained | Author read-time `COALESCE(name, 'Unknown') AS display_name`; regenerate existing sqlc bindings; map DTO. `COALESCE` returns first non-NULL argument [P9]. | Query/bindings/DTO; returned values match and stored row 2 stays NULL; ordinary reads still use `name` |
| M-M + D-D + D-Q; owner chose persisted rename/backfill | Under supplied writer-pause/forward-only plan: rename column → fill NULL → require NOT NULL; adapt assigned readers/writers; execute existing Goose runner on fixture | Migration plus affected queries/bindings; stored values and constraint match, target revision applied, supplied new-app checks pass; old-name client intentionally unsupported after cutover |
Wrong transfer: read-time substitution does not implement persisted backfill; schema/type generation does not replay migration [P2]. Rename/backfill may need different coexistence plan: owner supplies it; the backend specialist does not invent dual-write or claim reverse DDL restores erased NULL provenance. Alembic add/drop proposal is not rename intent [P3].

## Complete example bundle — proposed owner packet, not existing fixture or execution

- **Identity/selection:** `widget-boundary-repair-v1`, supplied fixture revision `widget-bypass-v1`, root `widget-api/`; shared contract + M-R + D-A + Go/ogen recipe. Assigned regression-test authoring uses M-T's oracle/fixture steps as secondary output, not another implementation role.
- **Stack/context:** provisioned Go 1.25.0, ogen 1.24.0; supplied `go.mod`, `go.sum`, `.ogen.yml`, `api/widgets.yaml`, generated `internal/api/` and `internal/http/pattern.go`. Recipe owns exact command arguments; no dependency upgrade. ogen source boundary pinned in [P1].
- **Write scope:** `internal/http/router.go`, `internal/http/errors.go`, `internal/http/widgets_test.go`; read supplied handler/domain/auth fixtures and references above. Canonical contract and generated artifacts already match target; correction concerns route wiring and error mapping.
- **Supplied diagnosis/design:** handwritten route bypasses generated request validation, admitting quantity 0. Bind existing generated router to existing real handler; keep auth before handler; map decode/validation errors to stated 400. No persistence/protocol change needed.
- **Behavior/oracle:** name length 1–80, quantity int32 ≥1; valid `{"name":"bolt","quantity":1}` returns 201 with same body and one domain call. Empty/81-character name, quantity 0, malformed JSON → stated 400 and zero domain calls. Missing credentials → existing 401 and zero calls; authenticated valid case remains successful.
- **Implementation/check recipe:** adjust routing/adapter, author cases using supplied real-handler fixture and call recorder, then invoke existing supplied `scripts/check-widget` from `widget-api/`; recipe runs package build and `TestWidgetContract` raw-HTTP cases. Baseline failing observation supplied by owner; report only checks actually executed later.
- **Output/local latitude:** route/error delta, regression tests and check record; the backend specialist chooses helpers/assertion arrangement and scoped corrections, without caller specifying line spans. Existing generated decoder supplies validation; handwritten error adapter supplies required envelope [P1].
- **External blocker:** missing generated artifacts/fixture/command, inconsistent contract or evidence contradicting supplied diagnosis → return precise observation to caller. Independent owner reviews and accepts returned implementation.

## Bounded composition options and extraction

- **Option A, recommended:** shared implementation guidance + referenced mode cards + domain guidance + version-matched recipe references. Modes own workflow/acceptance delta; domains own implementation obligations; stack recipes own exact APIs/tool behavior. Short ordinary tasks load only relevant sections. Lead chooses public packaging/IDs.
- **Option B:** separately discoverable mode guidance alongside domain guidance; useful when mode is main entrypoint. Tradeoff: additional catalog entries, possible extra loads/trigger overlap; load cost unmeasured. Same shared references; never create feature-API-Go, repair-API-Go, etc. as separate products.
- **Bound:** one primary mode per deliverable; add domains only when they contribute named steps/artifacts/checks. Routine auth preservation does not load full auth implementation card. Multiple assigned phases retain owner's order; test authoring attaches only when assigned. One short interaction note can bind cross-domain invariant, e.g. transaction-bound job admission, without duplicating whole cards.
- **Extraction order:** shared contract and modes → API/query/transition cards and comparisons → other domain cards → versioned recipes when demanded. Framework-specific facts [P1–P9] belong in recipe references, not universal mode instructions. Conflicting guidance/unsupported versions return blocker, never new architecture or permission choice.
- **Packaging limit:** these are composable document options, not asserted loader inheritance, automatic router or enforcement implementation. Native loading details remain R46 integration input; researched/drafted/installed/exercised stay distinct.

## Proposed selection/behavior cases — all unexecuted

| Supplied case | Expected selection / proposed acceptance |
| --- | --- |
| Clear new endpoint; stack, files and cases supplied; no diagnosis or line spans | M-F + D-A; implement with local coding choices, not reject as incomplete repair |
| Existing schema; query result/predicate change; caller supplies semantics, not SQL | Appropriate intent mode + D-Q; author SQL locally; no migration selected just from `.sql` |
| Populated column rename/backfill and writer-pause plan | M-M + D-D, D-Q if readers change; check rows/constraints and supplied cutover behavior |
| API fault plus diagnosis/correction/regression | M-R + D-A; correction and supplied regression; symptom-only equivalent returns diagnosis blocker |
| “Refactor validator” but requested rejection changes existing accepted inputs | Scope contradiction returned; do not silently classify behavior change as preservation |
| Feature includes existing auth unchanged; repository also contains unrelated queue library | Preserve supplied auth checks; no auth/job implementation overlay selected from incidental dependencies |
| Chosen batching/index optimization plus comparable benchmark | M-O + affected domain; index migration also needs D-D transition facts/checks; “make faster” alone returns missing chosen-change/baseline blocker |
| Assigned cancellation completion or failed-span status | D-C or D-O with intent mode; check actual stopped work [P5] or prescribed status [P8], not only cancellation/event call |
| Assigned tests only; implementation fails oracle | M-T + relevant domain; deliver detecting evidence; no unassigned production repair or acceptance weakening |
| Missing tool/version/fixture, forced skip or empty selection | Explicit blocked/unverified result; no install, substitute environment, fabricated pass or grant expansion |

## Primary technical evidence — inspected source/docs only

- **[P1] ogen 1.24.0**, [tag→commit](https://api.github.com/repos/ogen-go/ogen/git/ref/tags/v1.24.0), pinned [feature defaults](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/gen/features.go) and [generated request decoder](https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/internal/integration/sample_api/oas_request_decoders_gen.go): stub default, response-validation opt-in, explicit request `Validate()` call; not universal schema-conformance or runtime result.
- **[P2] sqlc 1.31.1 source**, [DDL/migration handling](https://github.com/sqlc-dev/sqlc/blob/a95e91d70ad9e1181253c333a1cfdd75ae4b95a5/docs/howto/ddl.md), [generated transaction binding](https://github.com/sqlc-dev/sqlc/blob/a95e91d70ad9e1181253c333a1cfdd75ae4b95a5/examples/authors/postgresql/db.go), [generated query methods](https://github.com/sqlc-dev/sqlc/blob/a95e91d70ad9e1181253c333a1cfdd75ae4b95a5/examples/authors/postgresql/query.sql.go): migration parsing, binding/scanning code; database migration execution explicitly excluded.
- **[P3] Alembic 1.20.0**, [autogenerate source docs](https://github.com/sqlalchemy/alembic/blob/rel_1_20_0/docs/build/autogenerate.rst): candidate revisions; column/table rename appears as add/drop; `check` shares autogenerate comparison limits.
- **[P4] Goose 3.28.0**, [SQL migration/transaction docs](https://github.com/pressly/goose/blob/v3.28.0/README.md#sql-migrations): Up/Down annotations, default transactions and `NO TRANSACTION`; not guarantee for every engine or deployment plan.
- **[P5] Go 1.25.0**, [`context.CancelFunc` source contract](https://github.com/golang/go/blob/go1.25.0/src/context/context.go): cancellation signal does not wait for work completion.
- **[P6] RFC 8725**, [§3.1 algorithm verification](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.1), [§3.9 audience](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.9): caller-selected algorithms; audience validation when issuer serves multiple recipients. No claim supplied JWT library already enforces profile.
- **[P7] Protobuf official guidance**, [deleted field reservations](https://protobuf.dev/best-practices/dos-donts/#reserve-tag-numbers), rolling docs read 2026-10-03: reserve deleted tags, never reuse. No compiler/runtime version compatibility inferred; executable recipe still needs project pins.
- **[P8] OpenTelemetry Go 1.38.0**, [`Span` source contract](https://github.com/open-telemetry/opentelemetry-go/blob/v1.38.0/trace/span.go): `RecordError` and `SetStatus` separate; span lifetime explicitly ended.
- **[P9] PostgreSQL 17**, [`COALESCE` contract](https://www.postgresql.org/docs/17/functions-conditional.html#FUNCTIONS-COALESCE-NVL-IFNULL): first non-NULL argument. Illustrative SQL remains unexecuted on any application fixture.
