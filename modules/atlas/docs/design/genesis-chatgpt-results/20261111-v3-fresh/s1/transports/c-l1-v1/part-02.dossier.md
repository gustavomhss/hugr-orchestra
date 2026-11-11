
---

Artifact `s1.runtime.codemode_openapi.l1`; file `bodies/codemode-openapi.md`; SHA-256 `0f906322c8952eb43396870be8fea15b2d47146df43a9d604cfd39c9cb293977`; bytes 2698.

# OpenAPI tool planning, credentials and bounded response handling

**L1 authority:** `packages/codemode/src/openapi` implementation plus its explicit TODO. Excerpts C25–C28 show represented and refused behavior. This record does not certify arbitrary OpenAPI specifications or external endpoints.

`OpenAPI.fromSpec` plans representable operations, emits tools and retains precise skipped-operation reasons. The planner checks supported input/output/security shapes instead of treating every operation as callable. Base URL selection follows explicit options, operation, path, then document servers; URLs must be absolute HTTP(S), without unsupported query/fragment or unresolved server templates. Serialization supports particular path/header/query shapes, including supported form/deepObject query cases; unsupported cookie, body, encoding or response semantics are skipped. Source: `openapi/spec.ts`, `openapi/index.ts` (C25).

Generated tools carry JSON Schema signatures. Consequently the interpreter's Effect Schema validation contract is not automatically available to these tools. The HTTP adapter still validates its own required fields, value shapes and serialization before invoking credential resolution. Path segments are encoded and empty, `.` or `..` segments are refused; unresolved placeholders are errors. Source: `openapi/runtime.ts`, `src/tool.ts` (C26).

Security requirements implement alternatives across requirement objects and conjunction within one requirement. A resolver returning no credential permits trying another alternative; resolver failure aborts. Conflicting header/query credentials are refused, and resolved credential headers are applied after model-provided headers. Credentials remain a host capability rather than fields advertised to the model. Source: `openapi/runtime.ts` security and request construction (C26).

Response reading has a fixed 50 MiB cap, checked against a declared content length and again while consuming chunks. JSON parse failures produce tool errors; non-success status handling limits the body summary. The UTF-8 decoding and JSON parser do not constitute response-schema validation. Source: `openapi/runtime.ts` (C27).

**Boundary and gaps.** The TODO explicitly retains redirect constraints, complete malformed-security handling, response validation and configurable size controls as remaining work (C28). This does not support an all-OpenAPI or all-HTTP security guarantee. The captured happy-path specimen was structurally inspected; the much larger `opencode-v2-openapi.json` specimen remains metadata-only, with its size and blob recorded. No generated tool, network request, OpenAPI test or fixture replay was executed.

---

Artifact `s1.runtime.effect_sqlite.l1`; file `bodies/sqlite-adapters.md`; SHA-256 `b1dc22165fbdcee0a5811dc983548ac26f1189adc311e9855cfc22763b7d9597`; bytes 3558.

# Effect SQLite adapters, transaction cleanup and migration refusal

**L1 authority:** generic adapter implementation, package boundaries and selected query/migration code. Excerpts C29–C33 preserve transaction, upgrade and Node limits. Product database startup, backup and application after-commit behavior are not proved by these packages.

`@orchestra/effect-drizzle-sqlite` is a vendored generic Drizzle Effect SQLite adapter over Effect `SqlClient`. Its driver constructs a database from client, logger and cache dependencies; convenience defaults provide logger/cache. It exposes Effect-yieldable queries and migration entry points. Orchestra tables, database paths, migrations and hooks remain outside its package authority. Local Drizzle compatibility shims and copied query builders are implementation support, not a new application storage layer. Source: `README.md`, `AGENTS.md`, `src/effect-sqlite/driver.ts`, `src/internal/drizzle-utils.ts`.

Transactions reserve a connection or reuse the connection from the client's fiber transaction service. The outer transaction begins with configurable behavior, defaulting to deferred; nesting uses `effect_sql_N` savepoints. The callback runs with the transaction connection in context and with interruption restored. A successful callback is followed by commit/release; a failed commit attempts rollback, and nested failures also attempt release. Callback failures likewise roll back and release. Acquired scope closure is part of finalization. Sources: `src/effect-sqlite/session.ts` (C29).

`finalizedExit` retains the original failure and every cleanup failure, concatenating cause reasons rather than deduplicating equal cleanup attempts. A cleanup error cannot silently become a successful transaction result. This source mechanism is stronger evidence than merely reading a test named for rollback; no injected-failure test was run. Source: session finalizer (C30), declared tests in `test/transaction-causes.test.ts`.

The legacy migration-journal upgrade matches local migrations by normalized time, candidate hash and hash fallback. It refuses unmatched database rows before building or executing backfill statements. A comment about future serial-ID fallback is not implemented permission to guess. Normal migration execution uses a transaction for pending SQL and journal writes. Init mode refuses an existing migration-journal entry and more than one local migration, then records rather than executes the initial SQL. Source: `src/up-migrations/sqlite.ts`, `src/up-migrations/effect-sqlite.ts`, `src/sqlite-core/effect/session.ts` (C31–C32).

`@orchestra/effect-sqlite-node` separately wraps `node:sqlite` with scoped closure and serialized acquisition. It enables foreign keys and normally WAL, supports bound parameters and optional extension loading, but `executeStream` dies as unimplemented. Its `create`/`readwrite` config fields are declared without corresponding DatabaseSync options in this constructor. The README identifies it as unused and says Core carries its own Node client; that consumer assertion is documentation, not an independent repository-wide import analysis in this unit. Source: Node `src/index.ts` and `README.md` (C33).

**Boundary and gaps.** Query-builder variants were structurally reviewed with selected execution/cache paths; full relational/query parity is not claimed. Database files, Core migration adoption, backup restore and application post-commit publication require Core evidence. No database was opened and no migration or product test ran.

---

Artifact `s1.runtime.http_recorder.l1`; file `bodies/http-recorder.md`; SHA-256 `4857371404625869016238e6ac23fbf7aad5ab0c7538f64df2ebfe91f1935fe7`; bytes 3464.

# HTTP and socket recording: deterministic fixtures with bounded claims

**L1 authority:** recorder implementation and package/export scripts at the source pin. Excerpts C34–C39 show the mode, replay, refusal and packaging rules. Reading a cassette or test never establishes a runtime pass.

The public namespace provides `http` and `socket`. Automatic mode replays an existing local cassette, records a missing local cassette, and forces replay when CI is set to a nonempty value other than `false` or `0`. Thus using the public layer with a missing local cassette can call a real service. LLM's harness instead supplies explicit internal record/replay mode. Source: `src/effect.ts`, `src/recorder.ts`, `src/internal-effect.ts` (C34).

HTTP recordings buffer complete responses and preserve request-start ordering using a deferred append chain. Replay claims interactions sequentially only after request matching. Default matching checks method, URL, allowed headers and canonicalized JSON, sorting object keys but retaining array order. Callers can provide a custom matcher. Missing/mismatched/exhausted interactions fail. The scope finalizer checks unused interactions after at least one was consumed; a cassette with zero consumed interactions is expressly exempt. Source: `src/internal-effect.ts`, `src/matching.ts`, `src/recorder.ts` (C34–C35).

Cassette names reject absolute Unix/Windows paths, parent traversal and lexical escape from the configured directory. Recording redacts configured and known sensitive headers, URL credentials/query keys and JSON fields. A prewrite scan refuses likely secrets and writes through a temporary file then rename. This is a lexical/path-and-pattern boundary: there is no demonstrated symlink defense or complete secret-detection guarantee, and base64 binary payloads are not decoded for secret scanning. Source: `src/cassette.ts`, `src/redaction.ts`, `src/redactor.ts` (C37).

The public socket wrapper replays the interleaved event sequence: it delivers server events until a client write is required and checks that write before continuing. Concurrent runs and mismatched client frames are refused; close checks remaining client traffic. Failed/interrupted recordings do not become ordinary successful transcripts. It records application frames, not complete timing, cancellation, backpressure or terminal close-code semantics. Source: `src/socket.ts`, `README.md` (C38).

The internal `makeWebSocketExecutor` is a different API. Replay filters client and server event lists separately and exposes a stream of server events, so it does not preserve interleaved chronology like the public socket wrapper. The LLM test adapter uses this internal API. Source: `src/websocket.ts` (C36), `packages/llm/test/recorded-websocket.ts`.

Workspace `package.json` exposes `./internal`; the pack script deletes that export and rewrites public paths to dist. The build retains a small public declaration set. The package declares Node >=22 and exact Effect peer version `4.0.0-beta.83`; the verification script describes a packed-consumer check but was not run. Source: `package.json`, `script/build.ts`, `script/pack.ts` (C39), `script/verify-package.ts`.

**Boundary and gaps.** Buffering is not a bounded-memory or network-fidelity guarantee. The selected two-interaction cassette is supporting fixture data, and the retry fixture remains unread. No package build, install, replay or public export smoke test was executed.

---

Artifact `s1.runtime.guides_intent.l1`; file `bodies/user-guides.md`; SHA-256 `22303bf38d880468d845ec54732c2138f293243058d8cf8f1c6b9152c2587488`; bytes 3362.

# User-guide intent and the limits of documentary evidence

**L1 authority:** the thirteen assigned `docs/guides` documents, read at the baseline. These are product explanations and operational intent. They are not independently established Core, server or UI execution facts in this unit. Excerpts C11 and C40–C44 preserve important boundaries.

| Guide group | Documented contract or operator distinction |
| --- | --- |
| Models, Claude mode, limits | The guide separates model-layer protocols from session-core routes. Claude Code is described as a one-turn execution host with Orchestra retaining its outer orchestration; billing refusals are passed through without retries. Listed limitations are documentary scope, not test results. |
| Permissions | Deny rejects waiting requests for the session; allow-once and always have different persistence/scope. Auto-accept is client session state and resolves allow-once requests, rather than writing saved project rules. |
| Project trust and MCP/CLI failures | Project local MCP commands, code plugins, formatter and LSP config need trust. Remote MCP and global config differ. Only global `trusted_projects` counts, and a project cannot approve itself. Startup/status failures and headless prompt handling are documented separately. |
| Credentials and integrations | Credentials guide describes encrypted local credential storage and key-file fallback; integration guide separates account/target/session binding, connection from catalog visibility, and local disconnect from upstream revocation. These are not claims that credentials were inspected. |
| Database backups | Guide documents pre-migration backup, retention, refusal on backup failure or a newer database, and quit-before-restore procedure. Generic adapter code alone does not prove these Core policies. |
| Hooks and plugins | Hook draft, publication and project installation are separate states. The plugins guide describes model behavior instructions and visible application state, distinct from the code plugin package. |
| Tools and config errors | Tool availability, permission and tool-safety boundaries are described. Config errors distinguish parse/schema failures; the guide says unknown extra keys are ignored. |

Source-to-claim mapping is explicit in `coverage.json`; each guide remains its own pinned source record. Exact sampled excerpts show protocol routing (C11), global trust and refusal (C40), permission persistence (C41), backup intent (C42), credential intent (C43), and behavior plugins (C44). Other guide content is captured in full and attributed as documentary intent.

**Boundary and gaps.** None of these instructions was executed: no database restore, project trust change, credential read, permission reply, integration connection or paid Claude call took place. The implementation of these host-level policies belongs to other S1 production areas or other owners and needs its own evidence. A guide's recommendation, historical limitation or claim that a migration landed is not a substitute for that evidence. In particular, current config schema objects declare `additionalProperties: false`, while the config-error guide describes ignoring unknown keys; the runtime decoder/publisher relationship is unresolved here and should not be collapsed into either a runtime rejection guarantee or a defect assertion.

---

Artifact `s1.runtime.maintenance_intent.l1`; file `bodies/maintenance-intent.md`; SHA-256 `98d6626bcf2ae923fb8a905cef874bc3e086a42a71abc129a2e9471c0864bcb8`; bytes 3852.

# Maintenance instructions, historical plans and generated configuration

**L1 authority:** four assigned repository skills, six historical phase cards, three storage/database specs, generated config schema and package support files. Their content has been classified by purpose and date/authority rather than promoted uniformly to current runtime behavior. Excerpts C45–C49 support the distinctions.

The Claude Code/Claude mode maintenance skills name execution-host ownership, governed skill loading, tool gates, context updates and billing refusal rules. The permission usage skill distinguishes UI replies, saved project rules and client auto-accept. The Effect skill supplies coding/research patterns. These are maintenance instructions and source pointers: following a pointer requires reading its implementation before asserting a host invariant. Root and package AGENTS plus bunfig files require tests through GitHub Actions; older skills/spec command examples do not authorize local product tests in this task. Source: `.orchestra/skills/*/SKILL.md`, captured root `AGENTS.md`, package AGENTS/bunfig (C45).

The six `70-90-briefs` cards are mechanical plans tied to older baseline `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`, with historical branch/worktree paths and proposed acceptance commands. They identify migration intent for plugin facade/runtime, ACP, Claude host, database and Node SQLite. Their old absolute paths and commands are source data, not instructions executed by this producer. Source: `docs/architecture/phase-plans/70-90-briefs/{FAC-PLUGIN,RD-ACP,RD-CLAUDE,RD-DATABASE,RD-PLUGIN,RN-SQLITE}.md` (C46).

The Effect SQLite package spec separates generic adapter ownership from application transaction context and after-commit hooks. The legacy database-removal spec reports its groups complete/superseded but retains descriptions of former inventory and usages. Those inventory counts must not be repeated as a current import census. The integrity follow-up explicitly marks deferred foreign-key work and explains why projection/replay and scheduled-task preallocated IDs complicate immediate constraints. Its report that indexes landed is documentary evidence; the named Core migration was not independently read in this unit. Source: `docs/specs/storage/*.md`, `docs/specs/database/integrity-followups.md` (C47–C48).

`schema/config.json` is a draft-2020-12 document rooted at `$defs/Config.Info`, with comment/trailing-comma hints. The captured schema uses plural `agents`, `plugins`, `providers` and `permissions`; a plugin entry requires `package` and optional options. It defines local/remote MCP alternatives and describes `trusted_projects` as global-only. Many config objects, including the root, have `additionalProperties: false`. These are schema bytes, not proof of decoder behavior or successful regeneration. Source: `schema/config.json` (C49), structured schema inspection in `config-schema-scan.json`.

Package manifests and tsconfig/bunfig files establish declared exports, dependencies and commands. They do not establish successful installation, compilation or tests. Examples and recording scripts are support material; scripts that touch credentials or make network calls were not executed. Generated README contract sections and copied Drizzle query support retain their original bytes and lower review depth where appropriate.

**Boundary and gaps.** The current LLM design draft and V2 plugin plan contain proposed APIs beyond shipped declarations. They remain intention, with current code governing this L1 record. Source capture, classification coverage and hash checks do not imply semantic acceptance of every support file. No L2–L4 synthesis, two-judge verdict, Atlas import, runtime input observation, CAS artifact, manifest publication or consumer pass is manufactured by these files.
