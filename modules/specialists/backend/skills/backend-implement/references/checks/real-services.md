# Real services and databases

## Applicability

Assigned tests that must exercise an already-selected real dependency, such as a database or broker, through the application's production driver.

## Non-trigger

- An existing fixture that already starts, connects, waits, isolates and tears down the service. Add the named cases there.
- Choosing services, a container runtime or a development environment.

## Inputs

- The selected service version, image or native executable, and the connection settings and extensions.
- The application factory, migration hook and connection injection, and an independent observation query.
- State ownership and namespaces, fixture lifetime and cleanup order.
- Startup and whole-command deadlines.

## Steps

1. Start the service with the existing lifecycle library or fixture, and register cleanup immediately.
2. Wait for real readiness: the library's wait strategy, then a bounded authenticated query through the returned endpoint, then the supplied migrations and seeds.
3. Start the application with the injected endpoint and run the named cases through its real boundary.
4. Assert the application result and the independently committed state.
5. Tear down in order: application workers and pools first, then the service.

## Tools and outputs

- The existing container or native-process lifecycle library, or the supplied database fixture.
- Output: the cases, small fixture files, and the evidence from the exact assigned command.

## Limits and checks

- A running container is not a ready application. `SELECT 1` proves readiness only.
- A random port avoids port clashes only. It does not isolate databases, schemas, queues, files or reused volumes; parallel workers need their own owned state, and resetting one shared database under concurrent tests races.
- Rolling back the test connection cannot undo commits made by the application's other connections.
- Test database modules often disable durability settings such as `fsync`. Crash-durability cases need the settings the assignment specifies.
- Never substitute another engine, such as SQLite for PostgreSQL. Resource reapers are a fallback, not proof of cleanup.
- A missing service, executable or privilege is a `check-unavailable` blocker; never install or provision one yourself.
