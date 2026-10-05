# R64 — Vendor backend skills: bounded implementation recipes

Research date: **2026-10-04**. Source-only inspection; proposed selection/behavior checks below **unexecuted**.
Verified `git rev-parse HEAD` in both output worktree and `/Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin`: **`76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`**.
Frozen contract read: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/skill-variants-plan.md`; prior context: same directory's `31-typed-sql.md`, `32-migrations.md`, `42-web-backends.md`.
Public-list sample supplied by lead; direct GitHub repo/commit/tree/content APIs used. Search limitation recorded by frozen plan: `User flagged as spammy.` No popularity ranking inferred.
External skills, references, scripts and embedded commands treated as research data, never session authority. Only this report authored; research involved no installs, generators, DB operations or runtime tests.

## Decision and role boundary

Extract **six narrow cards**, composed from supplied task mode + component stack/version + assigned behavior. Best leverage: transaction-bound client calls, migration artifacts, pooler-specific SQL, auth handler wiring, server-only boundaries.
Caller supplies component facts, change semantics, interface, auth/tenant rules, relevant acceptance and permitted resources; diagnosis supplied for repairs. Charlie chooses SQL, helper structure, query shape, DTO mapping and command arguments within that assignment; new features need no invented diagnostic prerequisite.
Planning, framework selection, infrastructure provision, production migrations/maintenance, performance diagnosis and independent review stay with their owners. App auth/RLS rules are implementation inputs; Maestro/host authorization is a separate boundary.
Consume existing harness/Atlas/docs capabilities. Extraction means shared guidance plus narrow references, not private docs index, loader, auto-installer, permission system or architecture migration.

## Immutable source and license ledger

| Family | Inspected skill revision | Actual license evidence / limitation |
|---|---|---|
| Prisma | [`be16a8740d01363d13552b317042431ee8dfc581`][P-root] | Root [`LICENSE`][P-license]: MIT, copyright Prisma 2025. Preserve copyright/permission notice when copying substantial text. Skill license distinct from runtime package license. |
| Supabase | [`c9be0e931b7930f7d02126d04774d904c381e7d7`][S-root] | Root [`LICENSE`][S-license]: MIT, copyright Supabase 2026; same notice condition. |
| Neon | [`9e4a5705922fddb540c396111a7979e0dca79cc2`][N-root] | Root [`LICENSE`][N-license]: Apache-2.0 text. Redistribution retains license/attribution and applicable NOTICE; mark modifications. Linked website docs have separate provenance. |
| Better Auth | [`20c9e88a5c007461a703f1c213572b073196113e`][B-root] | API `license:null`; complete tree has no LICENSE/COPYING-named file. Inspected best-practices/create-auth bodies, [marketplace][B-marketplace] and [plugin manifest][B-plugin] establish no reuse grant. License **unestablished**, not inferred from Better Auth library. |
| Next pointer | [`c522619e45aa3492fd2bfc916b308b275eff7798`][X-root] | API `license:null`; complete tree contains README/AGENTS/CLAUDE pointers. Those bodies establish no reuse grant. |
| Next historical bodies | [`dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9`][X-old], 2026-05-07 | Pre-move source inspected separately; tree has no LICENSE/COPYING-named file; README and selected skill/reference bodies establish no grant. Do not inherit Next.js repository's license retrospectively. |

Absence scope calibrated: recursive APIs reported `truncated:false`; known SKILL/README blobs visible; same enumeration exposed Prisma/Supabase/Neon LICENSE files. Null API metadata alone never used as license verdict. Better Auth/old Next: link and independently paraphrase technical behavior; verbatim redistribution awaits upstream grant clarification.
Rolling official docs below inspected on research date, not immutable package snapshots. Main skills pinned; installed library/CLI/runtime versions still control implementation.

## What actual bodies/resources change

| Source family | Useful implementation delta | Scope/version limit |
|---|---|---|
| Prisma [client][P-client], [transactions][P-tx], [adapter implementation][P-adapter] | Generated-client imports; all dependent calls through `tx`; dedicated adapter transaction connection, value/error mapping, cleanup ownership. | Client/adapter metadata `7.9.1`; upgrade metadata `7.6.0` is not current-release evidence. [README][P-readme] now routes v8 elsewhere; v7 SQL recipes exclude MongoDB and v8. |
| Prisma [CLI][P-cli], [migration reference][P-migrate], [upgrade][P-upgrade] | Explicit `generate`/seed; editable migration SQL; v6→v7 generator/config/driver boundary. | `migrate dev --create-only` still applies pending migrations first: [7.10.0 source][P-migrate-code]. Disposable dev/shadow resources required for proposed execution. |
| Supabase [Postgres skill][S-skill] and [broad skill][S-broad] | Small bad/good SQL references: atomic UPSERT, short transactions, transaction locks, RLS identity/predicate scope. | Skill metadata `1.1.1` is skill version, not PG version. `auth.uid()`/roles require supplied Supabase setup; generic PG does not gain those helpers. Diagnostic/operations sections are not Charlie role. |
| Neon [Postgres body][N-skill] and [parent][N-parent] | Runtime-specific driver lifetime; pooled application URL versus direct migration URL. | Parent recommends stack/provisioning/automatic skills updates; discard those role transfers. Existing driver/runtime remain assignment facts. HTTP supports atomic batches, not only single queries. [N-driver] |
| Better Auth [best practices][B-best], [create-auth][B-create] | Version-matched docs, initialized ORM instance, adapter model names, framework handler, plugin schema delta. | Keep backend integration portion. Mandatory project scan/planning interview, provider choice, auth UI and floating `auth@latest` do not transfer. |
| Historical Next [best practices][X-skill] + linked references | App Router `route.ts`, async request APIs, Node/Edge dependency boundary, mutation/read entrypoint distinctions. | Current [README][X-moved] says reference skill retired: docs bundled with Next; generated agent rules at 16.3+. Existing version-matched docs are inputs, not instruction to create another index. |

Scripts inspected, **not executed**: Supabase [`scripts/build-release.ts`][S-script] packages skill directories into tarballs, hashes them, writes discovery index; Neon [`scripts/sync-plugin-skills.mjs`][N-script] copies top-level skills into plugin directories and compares bytes in `--check` mode. Packaging/source consistency is not backend correctness or OpenCode compatibility evidence.
Neon [`skills/neon/references/parse-env.md`][N-env] narrows typed env validation to selected keys. Useful only where `@neon/env` and `neon.ts` already belong to assigned component; not justification to add platform config.

## Concrete bad transfers — corrections before extraction

1. **Prisma config:** [upgrade reference][P-config] incorrectly retains `datasource.directUrl`; Neon body repeats old dual-field advice. Prisma 7.10.0 [`Datasource` type/schema][P-config-code] accepts `url`/`shadowDatabaseUrl`; [official v7 guide][P-guide] puts migration's direct connection in CLI `datasource.url`. Runtime adapter separately receives pooled application URL.
2. **Migration draft ≠ read-only:** pending migrations execute before create-only return. Reference also suggests `migrate dev --accept-data-loss`; [7.10.0 parser][P-migrate-code] has no such option. Preserve existing history; author prescribed rename/backfill, never substitute reset or `db push` for migration artifacts.
3. **Pooler ≠ universal prepared-statement rule:** [Supabase reference][S-prepared] incorrectly suggests `pg: {prepare:false}`. [Supabase driver guidance][S-disable] says omit node-postgres query `name`; `prepare:false` belongs to Postgres.js. [Neon pooling docs][N-pool] support protocol-level named prepared statements while excluding SQL `PREPARE`/session state. Bind values in every variant.
4. **Transaction lifetime:** [Supabase lock reference][S-lock] includes session locks; transaction-pooler work needs transaction-scoped locks (`pg_advisory_xact_lock`) when assigned. `SET LOCAL`/`set_config(...,true)` must share transaction with dependent query. Moving payment calls outside locks, as [short-transaction example][S-short] does, does not establish payment idempotency/atomicity; preserve owner's external-effect contract.
5. **Better Auth routing/cookies:** create-auth table incorrectly maps Pages API to `toNextJsHandler`. [Official Next integration][B-next] uses App Router `{GET,POST}=toNextJsHandler(auth)` versus Pages `toNodeHandler(auth.handler)` with `bodyParser:false`. `nextCookies()` supports cookie-setting Server Actions, last plugin; it does not make RSC rendering cookie-writable.
6. **Next exposure/serialization:** historical [data patterns][X-data] says actions have “no external access”; actions must be treated as directly POST-callable, with assigned authz checked on entry. [Next data-security docs][X-security] distinguish `import 'server-only'` from `'use server'`. Historical [RSC reference][X-rsc] rejects Date/Map/Set as non-JSON; [React serialization contract][X-react] explicitly supports those built-ins. HTTP JSON DTO rules and React transport rules differ.
7. **Advice ≠ shipped guarantee:** Prisma adapter skill says avoid naive SQL splitting; [7.10.0 pg adapter][P-pg-code] still uses `.split(';')` in `executeScript` with FIXME. Its transaction callbacks corroborate release-only cleanup with `usePhantomQuery:false`, not duplicate SQL COMMIT. Verify exact adapter protocol; do not turn advice into test-pass claim.

## Adaptation cards

All cards: use existing editor/compiler/test runner and supplied fixtures; checks below are proposed, not executed. Named outputs illustrative paths to resolve from assignment, not new global conventions.

### C1 — Prisma SQL client transaction; adapter internals only on explicit assignment

- **Trigger/input:** assigned atomic backend write; existing Prisma 7 SQL client, exact generated schema/client/adapter versions, entity/tenant rules, result shape and failure semantics. **Non-trigger:** package appears incidentally; MongoDB/v8; routine queries do not trigger adapter development.
- **Code steps:** use configured generated `.../client` import and existing client lifetime; dependent writes use nested write or `$transaction(async tx => ...)`; every participating call uses `tx`; select only supplied DTO fields; translate assigned constraint/conflict cases.
- **Adapter-work delta:** only when assigned `SqlDriverAdapter` repair/extension: bind transaction to one checked-out connection; honor `usePhantomQuery` protocol; preserve argument/column ordering, bigint/decimal precision and original error code/message; release owned resources once, keep savepoints connection-local. [P-adapter], [P-pg-code]
- **Output/checks:** repository/service patch; proposed populated-fixture success, later-write failure rolls back first write, tenant denial. Adapter assignment additionally tests concurrent connections, release/error paths and multi-statement SQL containing quoted semicolons.
- **Local freedom:** nested versus interactive shape where semantics permit; projections, helpers, validation and error mapping. **Dependency/upstream:** compatible existing adapter, isolation/retry contract and fixture; missing business retry semantics return to owner, not invented automatic retries.

### C2 — Prisma v7 migration artifact; v6→v7 upgrade only when selected

- **Trigger/input:** assigned schema delta on v7, or explicitly assigned SQL v6→v7 upgrade; current/target pins, runtime/module format, rename/backfill meaning, rollout order, migration history and disposable dev/shadow URLs. **Non-trigger:** connection fix alone, MongoDB→v7, v8 setup.
- **Upgrade code steps:** compatible CLI/client/adapter; `prisma-client` with explicit output/import; CLI config/env loading; driver-owned pool settings. Replace `Prisma.validator` with `satisfies`, assigned `$use` logic with Client Extensions. Node floor 20.19, TS 5.4 per [guide][P-guide]; selected CJS uses `moduleFormat = "cjs"`, not forced repo-wide ESM. [P-upgrade]
- **Migration code steps:** author target schema; local pinned `prisma migrate dev --create-only --name <name> --config <path>` only against supplied disposable resources; inspect/edit SQL for assigned rename/backfill; run explicit `prisma generate` when executing implementation later. CLI direct URL goes in `datasource.url`, runtime pool URL in adapter.
- **Output/checks:** schema/config changes only if assigned, new `migrations/<id>/migration.sql`, refreshed generated client; proposed replay of populated prior-version fixture, value preservation, constraint failures and application import/typecheck. No production deploy implied.
- **Local freedom:** write actual DDL/backfill expression from supplied semantics, choose helpers/CLI arguments. **Dependency/upstream:** fixture/shadow access, target package compatibility, migration phase ordering; unexpected destructive delta returns to owner.

### C3 — Supabase/Postgres scoped settings UPSERT and assigned RLS

- **Trigger/input:** implement user-owned settings write using supplied PostgreSQL version/schema, unique `(user_id,key)`, selected driver/pooler mode, identity expression and access policy. RLS changes only when assigned. **Non-trigger:** “database slow” without diagnosed repair; presence of unrelated Supabase Auth dependency.
- **Code steps:** bound `INSERT ... ON CONFLICT (user_id,key) DO UPDATE ... RETURNING` for specified replace semantics; short transaction for any coupled write; preserve caller transaction. For assigned Supabase RLS, encode provided `TO`/`USING`/`WITH CHECK`, with row-independent `(select auth.uid())` only where identity model matches. [S-upsert], [S-rls], [S-rls-perf]
- **Pool delta:** Supavisor transaction mode + `pg` means unnamed parameterized queries; Postgres.js uses `prepare:false`. Assigned lock/context uses same transaction; no session context assumed across pool checkouts. Generic PG receives its supplied identity source, not copied Supabase helper.
- **Output/checks:** query/repository patch and requested SQL migration; proposed duplicate-key concurrent UPSERT, exact returned fields, anonymous/wrong-user denial and no ownership reassignment. Exercise actual non-bypass application role; privileged owner-only checks do not establish caller RLS behavior.
- **Local freedom:** SQL shape, explicit projections, helper placement, suitable index implementation within assigned query/schema scope. **Dependency/upstream:** existing uniqueness/identity/policy semantics and pooler capability; enabling RLS architecture or changing tenant model requires owner decision.

### C4 — Neon transport-aware atomic writes and connection lifetime

- **Trigger/input:** assigned write on existing Neon backend; supplied driver version, HTTP versus WebSocket/TCP runtime, pool lifecycle, connection references and transaction semantics. **Non-trigger:** vendor name alone, database creation, compute tuning or diagnostics.
- **Code steps:** HTTP `neon()` uses tagged SQL or `sql.query(text,params)`; fixed query set uses `sql.transaction([...])` or synchronous query-array builder, not async result-dependent callback. Interactive JS branching requires existing `Pool`/`Client` path and one checked-out client for BEGIN/work/COMMIT-or-ROLLBACK.
- **Version/runtime delta:** driver v1+ conventional function calls become `.query`; docs' v1+ Node floor is 19. Request-bound Edge WebSockets connect/use/close within request; persistent Node pool follows existing process owner. Pooled host for app traffic, supplied direct URL for migration artifacts/workflow. [N-driver], [N-pool]
- **Output/checks:** scoped DB-call patch; proposed batch later-query failure rolls back earlier write, interactive branch result correct, released client after failure, transaction context isolated between requests. Avoid copying docs' placeholder JWT verifier as implementation.
- **Local freedom:** parameterization, SQL CTE versus fixed batch where contract permits, cleanup structure. **Dependency/upstream:** if assigned HTTP path cannot express required interactive behavior, owner resolves transport/dependency boundary; Charlie does not choose another ORM/framework or provision branch.

### C5 — Better Auth backend integration in supplied framework

- **Trigger/input:** assigned Better Auth integration/plugin change; exact installed version and matching docs identifier, existing DB/ORM, framework/router, providers/plugins, session policy, application role rules and secret references. **Non-trigger:** generic login request with no chosen auth stack; auth UI/planning discovery.
- **Code steps:** configure existing `auth.ts`; pass initialized DB into selected adapter (`drizzleAdapter` PG provider `"pg"`, Prisma `"postgresql"`); map adapter model name, not physical table name; mount router-specific handler from correction #5 or Hono `auth.handler(c.req.raw)` when Hono is supplied.
- **Schema/session delta:** existing pinned auth CLI generates ORM schema then project's migration workflow; built-in adapter migration path differs. Reconcile plugin schema changes. `secondaryStorage` changes session persistence; preserve supplied `session.storeSessionInDatabase`/cookie policy. Server code reads session with incoming headers and enforces assigned app rules.
- **Output/checks:** auth module, assigned route and schema/migration patch; proposed `/api/auth/ok`, real sign-in/session/revocation, cookie-setting action where assigned, and protected endpoint role/tenant denial. Health endpoint alone does not prove authentication.
- **Local freedom:** config organization, hook/helper implementation, validation/error mapping within supplied policy. **Dependency/upstream:** provider credentials, identity/session policy, compatible versions and license clarification for vendoring skill text. App roles never become Maestro native permissions.

### C6 — Next backend entrypoint and server-only boundary

- **Trigger/input:** assigned App Router Route Handler or Server Action; exact Next/React versions, Node/Edge runtime, public interface, backend call boundary, auth/DTO/cache semantics. **Non-trigger:** UI/image/font work, Pages API component, incidental Next dependency, unsolicited framework upgrade.
- **Code steps:** preserve assigned interface: public API/webhook uses existing `route.ts` request/response methods; assigned Action uses `'use server'`, validates inputs and enforces authz at entry/existing backend boundary. Mark internal privileged helper `import 'server-only'`; return supplied minimal DTO. [X-route], [X-directives], [X-security]
- **Version/runtime delta:** App Router 15+ awaits route `params`, `cookies()` and `headers()`; 16 middleware→proxy rename only for assigned migration; Edge code cannot inherit Node-only driver/fs assumptions. Preserve existing service/API architecture rather than copying “direct DB in every component.” [X-async], [X-runtime]
- **Output/checks:** assigned route/action/helper patch; proposed exact method/status/body, direct unauthenticated Action denial, cross-user denial, and build rejection of client import of guarded helper. Cache behavior uses supplied version/options; React serialization is not generic JSON validation.
- **Local freedom:** helper boundaries, schema validation and DTO projection; framework helpers appropriate to locked version. **Dependency/upstream:** router/runtime/auth and caching contract; old skill text reuse license unresolved. Prefer already-available matching docs; current retired collection is historical evidence.

## Same-task comparison and selection checks — unexecuted

Supplied task: atomically create order plus audit row, with assigned identity/ID and conflict semantics; return minimal order DTO. Same behavior, different implementation instructions:

| Already-selected variant | Correct local procedure | Bad transfer |
|---|---|---|
| Prisma 7 SQL | Nested write or interactive `tx`; second write may consume first result. | Copy reference array example's hard-coded `authorId:1`, or call outer client inside transaction. |
| Supabase Postgres + `pg` | Same checked-out client; bound SQL; assigned policy/context within transaction. | Treat separate Data API requests as one transaction, or copy session advisory lock into transaction pooler. |
| Neon HTTP | Fixed atomic batch with supplied IDs, or permitted single SQL statement; `.transaction` builder returns queries synchronously. | Treat callback as Prisma's interactive async `tx`; issue standalone BEGIN/work HTTP requests. |
| Neon WebSocket | One connected client owns transaction; request-bound runtime closes at request end. | Copy persistent Node global-pool lifetime into request-bound Edge WebSockets. |

Proposed selection cases: v7 tenant write→C1; v6→v7 SQL upgrade→C2; assigned Supavisor settings/RLS→C3; Neon HTTP batch→C4; existing Better Auth App Router backend→C5+C6. Negatives: MongoDB v6→reject v7 cards; HTTP interactive dependency→owner gap; generic auth→no vendor choice; Next Pages→router-specific reference, not C6; production DB tuning→owner.
Proposed behavior controls: populated happy path must produce both rows; forced second-write failure must preserve neither; wrong-owner access must deny while valid owner succeeds. Adapter repair additionally needs exact driver integration cases; compiler success cannot establish pooler, rollback or application-auth behavior.

## Extraction order and evidence limits

1. Shared scope procedure: supplied facts→implementation→assigned checks; keep local coding judgment and owner boundaries explicit.
2. Narrow recipes first: Prisma transaction/migration, PG pooler/transaction, Better Auth router integration; attach version exceptions beside steps.
3. Framework/runtime reference: Next server-only versus callable Action; Neon HTTP versus WebSocket lifetime. Keep license-unclear historical text as citations, not copied skill bundles.
Status: **researched**, not drafted runtime skills, installed or exercised. No speedup, test-pass, broad-version compatibility or native-loader behavior established. Vendor priority/performance numbers are claims, not measurements here.

## Exact primary source URLs

[P-root]: https://github.com/prisma/skills/tree/be16a8740d01363d13552b317042431ee8dfc581
[P-license]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/LICENSE
[P-readme]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/README.md
[P-client]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/prisma-client-api/SKILL.md
[P-tx]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/prisma-client-api/references/transactions.md
[P-adapter]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/prisma-driver-adapter-implementation/SKILL.md
[P-cli]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/prisma-cli/SKILL.md
[P-migrate]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/prisma-cli/references/migrate-dev.md
[P-upgrade]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/prisma-upgrade-v7/SKILL.md
[P-config]: https://github.com/prisma/skills/blob/be16a8740d01363d13552b317042431ee8dfc581/prisma-upgrade-v7/references/prisma-config.md
[P-guide]: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
[P-config-code]: https://github.com/prisma/orm/blob/e92bc46e8fff73e3985f86f23393b7e3f0e90010/packages/config/src/PrismaConfig.ts
[P-migrate-code]: https://github.com/prisma/orm/blob/e92bc46e8fff73e3985f86f23393b7e3f0e90010/packages/migrate/src/commands/MigrateDev.ts
[P-pg-code]: https://github.com/prisma/orm/blob/e92bc46e8fff73e3985f86f23393b7e3f0e90010/packages/adapter-pg/src/pg.ts
[S-root]: https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7
[S-license]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/LICENSE
[S-skill]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/SKILL.md
[S-broad]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase/SKILL.md
[S-prepared]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/references/conn-prepared-statements.md
[S-disable]: https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL
[S-lock]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/references/lock-advisory.md
[S-short]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/references/lock-short-transactions.md
[S-upsert]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/references/data-upsert.md
[S-rls]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/references/security-rls-basics.md
[S-rls-perf]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/references/security-rls-performance.md
[S-script]: https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/scripts/build-release.ts
[N-root]: https://github.com/neondatabase/agent-skills/tree/9e4a5705922fddb540c396111a7979e0dca79cc2
[N-license]: https://github.com/neondatabase/agent-skills/blob/9e4a5705922fddb540c396111a7979e0dca79cc2/LICENSE
[N-skill]: https://github.com/neondatabase/agent-skills/blob/9e4a5705922fddb540c396111a7979e0dca79cc2/skills/neon-postgres/SKILL.md
[N-parent]: https://github.com/neondatabase/agent-skills/blob/9e4a5705922fddb540c396111a7979e0dca79cc2/skills/neon/SKILL.md
[N-env]: https://github.com/neondatabase/agent-skills/blob/9e4a5705922fddb540c396111a7979e0dca79cc2/skills/neon/references/parse-env.md
[N-script]: https://github.com/neondatabase/agent-skills/blob/9e4a5705922fddb540c396111a7979e0dca79cc2/scripts/sync-plugin-skills.mjs
[N-driver]: https://neon.com/docs/serverless/serverless-driver.md
[N-pool]: https://neon.com/docs/connect/connection-pooling.md
[B-root]: https://github.com/better-auth/skills/tree/20c9e88a5c007461a703f1c213572b073196113e
[B-best]: https://github.com/better-auth/skills/blob/20c9e88a5c007461a703f1c213572b073196113e/better-auth/best-practices/SKILL.md
[B-create]: https://github.com/better-auth/skills/blob/20c9e88a5c007461a703f1c213572b073196113e/better-auth/create-auth/SKILL.md
[B-marketplace]: https://github.com/better-auth/skills/blob/20c9e88a5c007461a703f1c213572b073196113e/.claude-plugin/marketplace.json
[B-plugin]: https://github.com/better-auth/skills/blob/20c9e88a5c007461a703f1c213572b073196113e/better-auth/.claude-plugin/plugin.json
[B-next]: https://www.better-auth.com/docs/integrations/next
[X-root]: https://github.com/vercel-labs/next-skills/tree/c522619e45aa3492fd2bfc916b308b275eff7798
[X-moved]: https://github.com/vercel-labs/next-skills/blob/c522619e45aa3492fd2bfc916b308b275eff7798/README.md
[X-old]: https://github.com/vercel-labs/next-skills/tree/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9
[X-skill]: https://github.com/vercel-labs/next-skills/blob/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9/skills/next-best-practices/SKILL.md
[X-route]: https://github.com/vercel-labs/next-skills/blob/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9/skills/next-best-practices/route-handlers.md
[X-directives]: https://github.com/vercel-labs/next-skills/blob/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9/skills/next-best-practices/directives.md
[X-data]: https://github.com/vercel-labs/next-skills/blob/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9/skills/next-best-practices/data-patterns.md
[X-rsc]: https://github.com/vercel-labs/next-skills/blob/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9/skills/next-best-practices/rsc-boundaries.md
[X-async]: https://github.com/vercel-labs/next-skills/blob/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9/skills/next-best-practices/async-patterns.md
[X-runtime]: https://github.com/vercel-labs/next-skills/blob/dc1de9caf7612d73f56a8dec3cb1bd6c9ec096b9/skills/next-best-practices/runtime-selection.md
[X-security]: https://nextjs.org/docs/app/guides/data-security
[X-react]: https://react.dev/reference/rsc/use-client#serializable-types
