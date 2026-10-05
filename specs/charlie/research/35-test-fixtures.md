# R35 — Libraries for assigned backend integration tests

Research date: 2026-10-03. Official documentation, release metadata and tagged source inspected. Examples illustrative; no runtime validation performed.

**Recommendation:** reuse supplied fixture first. Four useful mechanisms: Testcontainers lifecycle, prescribed Toxiproxy faults, deterministic HTTP fixtures, ephemeral database isolation/reset. Each reduces test implementation work at an application boundary.

## Fixed input packet

Assigner supplies decisions below. Charlie implements named cases and authorized fixtures; missing prerequisite becomes reported blocker, not discovery/debugging work or environment redesign.

| Packet field | Required contents; illustrative order-service assignment |
|---|---|
| Scope and oracle | Named application entrypoint/test file; create order, exact retry returns same ID, exactly one committed row; expected error/status for each negative case. |
| Services and libraries | Already-selected service versions, image digest or native executable, library pins, connection/TLS settings, extensions and service topology. Research pins below are references, not upgrade instructions. |
| Existing seams | Supplied application factory, migration hook, database fixture/DSN injection, HTTP base-URL injection and independent observation query. |
| Isolation and faults | Database/schema ownership, worker namespace, fixture lifetime, fixed seed/clock, cleanup order; exact toxic/direction/timing only when fault case prescribed. |
| Commands | Exact working directory and test/migration commands, startup/request/whole-command deadlines, retry budget and expected results. |
| Authorized files | Named test file, existing fixture module, approved SQL seeds or HTTP recordings; dependency changes only where packet includes relevant manifest/lockfile. |

In snippets, `packet`, `assigned.*`, `ASSIGNED_PG_CTL`, `assigned_migrations` and `app_factory` stand for supplied values/project helpers. They are not proposed infrastructure.

## 1. Testcontainers — lifecycle around selected real dependencies

**Use when:** packet already selects compatible container runtime and service image. Library handles start, endpoint discovery, waits and teardown inside ordinary application tests. It does not choose services or assertions.

| Language / library | Inspected version + official source | Implementation mechanism / official docs | License |
|---|---|---|---|
| Go `testcontainers-go`, `modules/postgres` | [0.44.0](https://github.com/testcontainers/testcontainers-go/tree/v0.44.0) | [`postgres.Run`, `ConnectionString`, `CleanupContainer(t, pg)`][go-doc] | [MIT](https://github.com/testcontainers/testcontainers-go/blob/v0.44.0/LICENSE) |
| Rust `testcontainers` core | [0.28.0](https://github.com/testcontainers/testcontainers-rs/tree/0.28.0) | [`GenericImage`, `AsyncRunner`; explicit `WaitFor`; mapped endpoint; RAII `Drop`][rs-doc]. `SyncRunner` needs `blocking`; community modules have separate pins. | [MIT OR Apache-2.0](https://github.com/testcontainers/testcontainers-rs/blob/0.28.0/Cargo.toml) |
| Python `testcontainers` | [4.15.0](https://github.com/testcontainers/testcontainers-python/tree/testcontainers-v4.15.0) | [`with PostgresContainer(image)`, `get_connection_url(driver=None)`][py-doc]; context exit stops container. | [Apache-2.0](https://github.com/testcontainers/testcontainers-python/blob/testcontainers-v4.15.0/LICENSE.txt) |
| Node `@testcontainers/postgresql` | [12.2.0](https://github.com/testcontainers/testcontainers-node/tree/v12.2.0) | [`await new PostgreSqlContainer(image).start()`, `getConnectionUri()`, awaited `stop()` in `finally`][node-doc]. | [MIT](https://github.com/testcontainers/testcontainers-node/blob/v12.2.0/LICENSE) |
| JVM `org.testcontainers:testcontainers-postgresql` | [2.0.5](https://github.com/testcontainers/testcontainers-java/tree/2.0.5) | [`PostgreSQLContainer`, `getJdbcUrl()`][jvm-doc]; JUnit `@Container` lifecycle or explicit close. Database driver remains separate dependency. | [MIT](https://github.com/testcontainers/testcontainers-java/blob/2.0.5/LICENSE) |
| .NET `Testcontainers.PostgreSql` | [4.15.0](https://github.com/testcontainers/testcontainers-dotnet/tree/4.15.0) | [`PostgreSqlBuilder(image).Build()`, `StartAsync()`, `GetConnectionString()`][net-doc]; `await using` / `DisposeAsync()`. | [MIT](https://github.com/testcontainers/testcontainers-dotnet/blob/4.15.0/LICENSE) |

Python pin uses `from testcontainers.community.postgres import PostgresContainer`; old `testcontainers.postgres` import is a [deprecated shim][py-source]. API parity across languages must not be assumed.

**Packet → implementation:** selected PostgreSQL image + supplied create/retry cases → Go test fixture and application assertions:

```go
ctx, cancel := context.WithTimeout(context.Background(), packet.StartupBudget)
defer cancel()
pg, err := postgres.Run(ctx, packet.Image, postgres.BasicWaitStrategies())
testcontainers.CleanupContainer(t, pg)
if err != nil { t.Fatal(err) }
dsn, err := pg.ConnectionString(ctx, packet.ConnectionOptions...)
if err != nil { t.Fatal(err) }
app := assigned.StartApp(t, dsn) // Applies migrations; registers application/pool cleanup.
first := app.CreateOrder(t, "order-1")
if next := app.CreateOrder(t, "order-1"); next.ID != first.ID { t.Fatal("duplicate order") }
if got := assigned.CountOrders(t, dsn, "order-1"); got != 1 { t.Fatalf("orders for key = %d", got) }
```

- **Actual boundary:** application → production database driver → TCP → real PostgreSQL process. Assertions inspect application result and independently committed state; `SELECT 1` alone is only readiness.
- **Readiness:** Go PostgreSQL requires explicit wait; `BasicWaitStrategies()` waits for two readiness logs, then listening port [source][go-wait]. Node pin uses `pg_isready` healthcheck plus listening-port wait [source][node-source]. Finish with bounded authenticated SQL probe through returned host/port, then await supplied migrations/seeds. Container-running ≠ application-ready.
- **Cleanup:** register immediately; close application workers/pools before database teardown. Go cleanup stack is LIFO. Other bindings use their context/disposal hooks. Resource reapers are fallback, not proof of completed cleanup after process/daemon failure.
- **Limits:** random port only solves port clash; it does not isolate databases, queues, schemas, files or reused volumes. Fresh owned state or assigned per-worker namespaces still needed. Images do not reproduce managed-service configuration/topology automatically.
- **Durability trap:** Go/JVM PostgreSQL modules set `fsync=off`; .NET also disables `full_page_writes` and `synchronous_commit` [Go][go-source], [JVM][jvm-source], [.NET][net-source]. Crash-durability cases require assignment-specified settings; ordinary module defaults cannot prove them.

## 2. Toxiproxy — only already-prescribed transport faults

**Pin:** [2.12.0 source/docs][toxi], [MIT license](https://github.com/Shopify/toxiproxy/blob/v2.12.0/LICENSE). TCP proxy plus HTTP control API; existing binary/process fixture works without containers.

**Packet → fixture → boundary:** prescribed downstream blackhole, client timeout and recovery outcome → owned proxy/toxic fixture → application driver's TCP connection → Toxiproxy → selected real PostgreSQL/Redis/service. Preserve upstream authentication/TLS requirements and use proxy endpoint before pools open.

For assigned blackhole case, fixture POSTs this body to `/proxies/{ownedProxy}/toxics` after healthy baseline and connection establishment:

```json
{"name":"assigned-blackhole","type":"timeout","stream":"downstream","toxicity":1.0,"attributes":{"timeout":0}}
```

- **Meaning:** `timeout: 0` drops data without closing connection until toxic removed. Application's bounded read deadline must trigger. Prescribed latency instead uses `latency`, `jitter: 0`, `toxicity: 1`; these are different faults.
- **Deterministic sequence:** await control API `/version`; create proxy to packet's upstream; establish healthy service call through proxy; await toxic creation; invoke named application case; assert assigned error/retry count or observable effect. Avoid guessing activation with sleeps or asserting exact wall-clock duration.
- **Cleanup:** in `finally`/fixture teardown delete named toxic, test prescribed recovery with fresh connection when required, close application clients, delete owned proxy, stop only fixture-owned process. Shared `/reset` affects every proxy; use scoped deletion when shared.
- **Limits:** TCP only; not DNS failure, UDP loss, disk fault, database crash or HTTP 503. Downstream timeout can hide an already-committed write: assert assigned idempotency/persisted outcome independently. TLS hostname must still match supplied certificate. Transport scheduling remains real-time.

## 3. WireMock / MockServer — deterministic HTTP boundary fixtures

**Primary:** WireMock [3.13.2 source](https://github.com/wiremock/wiremock/tree/3.13.2), [Apache-2.0](https://github.com/wiremock/wiremock/blob/3.13.2/LICENSE.txt). [JSON mappings][wm-stub], [JUnit lifecycle][wm-junit], [record/playback][wm-record]. Embedded JVM server or already-selected standalone JAR; containers optional.

**Packet → fixture:** assigned stock-unavailable case expects application error after exactly two HTTP attempts → authorized `mappings/stock-unavailable.json`:

```json
{
  "request": {"method": "GET", "url": "/stock/sku-1"},
  "response": {
    "status": 503, "headers": {"Content-Type": "application/json"},
    "jsonBody": {"code": "UNAVAILABLE"}
  }
}
```

Application uses supplied base-URL injection; test calls its real stock/order API and asserts assigned domain error. JVM verification: `verify(2, getRequestedFor(urlEqualTo("/stock/sku-1")));`. Other languages query `POST /__admin/requests/count` with same matcher, asserting `count == 2` [verification][wm-verify].

- **Actual boundary:** application → real HTTP client/serialization/socket → mock HTTP server. Provider implementation is substituted. Useful for retry, headers, parsing, pagination and assigned failure responses; mock does not prove provider conformance.
- **Readiness/cleanup:** await server start and successful mapping registration; standalone fixture polls admin endpoint with packet deadline and checks loaded mapping. `@WireMockTest` starts/stops server, resets mappings/requests per method, and fails unmatched requests by default. Standalone tests explicitly assert unmatched journal empty, verify positive request count, then reset mappings, scenario state and journal; stop owned server after application workers exit.
- **Record/replay:** supplied recordings become reviewed mappings/body files. If capture itself is assigned, record only specified interactions; freeze values, redact credentials, retain contract-significant headers/body fields, then replay offline with proxy fallback disabled. Never silently re-record to make failed test pass. Recorder's JSON matching defaults ignore extra fields and array order: tighten where assigned contract requires [details][wm-record].
- **Limits:** shared scenario counters/journals need per-test instance or assigned serialization. Fixed fixtures do not cover provider drift, real quotas, provider-side authorization or unspecified TLS behavior. Keep journal enabled; expected 404 must not accidentally pass on unmatched-request 404.

**Existing MockServer users:** [8.0.0 source](https://github.com/mock-server/mockserver-monorepo/tree/mockserver-8.0.0), [Apache-2.0](https://github.com/mock-server/mockserver-monorepo/blob/mockserver-8.0.0/LICENSE.md). [Expectations][ms-expect] support matchers, priority and finite `times`; [recorded expectations][ms-record] export reusable JSON. Preserve existing client/fixtures rather than add WireMock. Await expectation registration; assert request counts/sequence; [reset][ms-reset] clears expectations and recorded state. Clear only owned matchers when shared; retain replay-only behavior and same provider-conformance limit.

## 4. Ephemeral databases / reset — isolate real state without requiring containers

**Primary Python option:** pytest-postgresql [9.1.0 release/docs][pytest-doc], [tagged source](https://github.com/dbfixtures/pytest-postgresql/tree/v9.1.0), [LGPL-3.0-or-later metadata](https://github.com/dbfixtures/pytest-postgresql/blob/v9.1.0/pyproject.toml). Requires Python ≥3.10, psycopg 3 and selected PostgreSQL server binaries (supported minimum 14), or assigned existing server via `postgresql_noproc`.

**Packet → fixture → boundary:** selected native `pg_ctl`, approved migrations/seeds and duplicate-order oracle → process + function database fixtures → application's normal driver over TCP → real PostgreSQL. No SQLite/H2 substitute for PostgreSQL semantics.

```python
from pathlib import Path
from pytest_postgresql import factories

postgresql_proc = factories.postgresql_proc(
    executable=ASSIGNED_PG_CTL, port=None,
    load=[assigned_migrations, Path("tests/fixtures/orders.sql")],
)
postgresql = factories.postgresql("postgresql_proc")

def test_duplicate_order(postgresql, app_factory):
    with app_factory(dsn=postgresql.info.dsn) as app:
        assert app.create_order(key="same").id == app.create_order(key="same").id
    assert postgresql.execute(
        "SELECT count(*) FROM orders WHERE idempotency_key = %s", ("same",)
    ).fetchone() == (1,)
```

- **Readiness/isolation:** session fixture starts process; loads migrations/seeds into template; function fixture clones template and yields connected psycopg client. Use supplied executable explicitly; validate assigned server version/settings through connection. Await schema/seed completion before application starts; retain whole-command deadline.
- **Cleanup:** application context closes workers/pools first; function fixture closes client and drops owned test database; session fixture stops process/removes data directory. Native cleanup is best-effort on stop failures; preserve failure evidence rather than equate fixture return with guaranteed cleanup [source][pytest-process]. Existing-server `noproc` manages test databases, not server lifetime.
- **Limits:** database create/drop privileges and owned names required; parallel workers need isolated databases/processes. Resetting same database under concurrent tests races. Native executor defaults to `-F` (`fsync` disabled), so durability caveat also applies [source][pytest-executor]. Transaction rollback around test connection cannot undo commits made by application's other connections.

**Already using Testcontainers PostgreSQL?** [Go `Snapshot`/`Restore`][go-doc] and [Node `snapshot()`/`restoreSnapshot()`][node-doc] reuse migrated database templates. Close connections before snapshot/restore; use non-system database, not `postgres`. Restoring one shared database is serial; parallel cases need separate owned databases.

**.NET reset complement:** Respawn [7.0.0 source/docs][respawn], [Apache-2.0](https://github.com/jbogard/Respawn/blob/v7.0.0/LICENSE). For already-selected database, `var reset = await Respawner.CreateAsync(conn, new RespawnerOptions { DbAdapter = DbAdapter.Postgres });`, then `await reset.ResetAsync(conn)` before each case and reload approved seed. Open real connection first; supplied schema/table exclusions preserve migration history. Library orders DELETEs using foreign-key metadata; it does not provision server or recreate full database state. Keep tests serial per database, close app writers before reset/disposal, and explicitly check required sequence/identity behavior.

## Could existing small fixture suffice?

**Yes.** Supplied fixture already starts/connects to selected service, waits meaningfully, injects endpoint, isolates state and tears down? Add named cases plus small SQL/JSON fixture there. Supplied DSN + owned per-test database may need only migration/seed and teardown hooks. Existing HTTP server fixture serving fixed responses with request verification can cover small assigned HTTP cases.

Add library only for concrete missing mechanism: repeated container lifecycle, prescribed TCP faults, reusable HTTP matching/replay, or reliable database clone/reset. No requirement for container adoption, fleet, new development environment or Charlie-side environment decisions. Deliver application assertions, fixture files and evidence from exact assigned command when execution is separately authorized.

## Official documentation / implementation references

[go-doc]: https://golang.testcontainers.org/modules/postgres/
[rs-doc]: https://rust.testcontainers.org/quickstart/testcontainers/
[py-doc]: https://testcontainers-python.readthedocs.io/en/latest/modules/postgres/README.html
[node-doc]: https://node.testcontainers.org/modules/postgresql/
[jvm-doc]: https://java.testcontainers.org/modules/databases/postgres/
[net-doc]: https://dotnet.testcontainers.org/modules/postgres/
[go-wait]: https://github.com/testcontainers/testcontainers-go/blob/v0.44.0/modules/postgres/wait_strategies.go
[go-source]: https://github.com/testcontainers/testcontainers-go/blob/v0.44.0/modules/postgres/postgres.go
[py-source]: https://github.com/testcontainers/testcontainers-python/blob/testcontainers-v4.15.0/src/testcontainers/postgres.py
[node-source]: https://github.com/testcontainers/testcontainers-node/blob/v12.2.0/packages/modules/postgresql/src/postgresql-container.ts
[jvm-source]: https://github.com/testcontainers/testcontainers-java/blob/2.0.5/modules/postgresql/src/main/java/org/testcontainers/postgresql/PostgreSQLContainer.java
[net-source]: https://github.com/testcontainers/testcontainers-dotnet/blob/4.15.0/src/Testcontainers.PostgreSql/PostgreSqlBuilder.cs
[toxi]: https://github.com/Shopify/toxiproxy/blob/v2.12.0/README.md
[wm-stub]: https://wiremock.org/docs/stubbing/
[wm-junit]: https://wiremock.org/docs/junit-jupiter/
[wm-record]: https://wiremock.org/docs/record-playback/
[wm-verify]: https://wiremock.org/docs/verifying/
[ms-expect]: https://www.mock-server.com/mock_server/creating_expectations.html
[ms-record]: https://www.mock-server.com/proxy/record_and_replay.html
[ms-reset]: https://www.mock-server.com/mock_server/clearing_and_resetting.html
[pytest-doc]: https://pypi.org/project/pytest-postgresql/9.1.0/
[pytest-process]: https://github.com/dbfixtures/pytest-postgresql/blob/v9.1.0/pytest_postgresql/factories/process.py
[pytest-executor]: https://github.com/dbfixtures/pytest-postgresql/blob/v9.1.0/pytest_postgresql/executors/proc.py
[respawn]: https://github.com/jbogard/Respawn/blob/v7.0.0/README.md
