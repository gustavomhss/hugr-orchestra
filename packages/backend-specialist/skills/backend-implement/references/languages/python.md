# Python

## Applicability

An assigned change to an async Python service component. The frozen tuple is CPython `3.12.11`, FastAPI `0.118.0` on Starlette `0.48.0`, Pydantic `2.11.7`, SQLAlchemy `2.0.43` with its asyncio extension, and HTTPX `0.28.1` for tests. The project's lock file governs; where it differs from this tuple, the version notes below are unverified for that project.

After this card, read only the references the assigned component uses:

- [FastAPI](../frameworks/python/fastapi.md): path operations, dependencies and responses on FastAPI.
- [Pydantic v2](../libraries/python/pydantic.md): request, response and settings models.
- [SQLAlchemy async](../libraries/python/sqlalchemy.md): `AsyncSession` reads and writes.

The general procedures in [cancellation](../lifetimes/cancellation.md) and [atomic writes](../data/transaction.md) still apply; this card gives their Python form.

## Non-trigger

- A package that merely appears in the lock file or a neighbor service. Select by the component the packet assigns.
- Choosing a framework, ORM, driver or async runtime, or raising the Python line or a dependency to reach a newer helper. Each is a `packet` blocker.
- Django, DRF, Flask, plain Starlette or synchronous SQLAlchemy components: no reference is authored for them. Follow the packet and the surrounding code; never port async code into them.

## Inputs

- The Python version, the lock file, the ASGI server and the test runner command with its working directory.
- The modules to change and the existing patterns to follow (session factory, principal dependency, error mapping).
- The async database driver the engine URL names. No driver version is frozen here; the lock file's governs.

## Steps

1. Validate at the boundary. Annotations alone check nothing at runtime; input becomes trusted only after a Pydantic model or the project's validator accepted it.
2. Never call blocking I/O inside `async def`. `async def` does not make a synchronous driver, `requests` call or file read nonblocking; use the async API the project already uses. Offload unavoidable blocking work with `await asyncio.to_thread(fn, *args)` only when the packet allows it.
3. Let cancellation through. `asyncio.CancelledError` derives from `BaseException`, so `except Exception` does not catch it. Clean up in `finally` or `async with`, and re-raise a caught `CancelledError`; never turn it into a normal return.
4. Join every task you start. Prefer `async with asyncio.TaskGroup() as tg:` (3.11+), which cancels siblings when one fails. A bare `asyncio.create_task` needs a kept reference and an awaited end; the loop holds tasks weakly.
5. Keep loop affinity. An async engine, session or client belongs to the event loop that created it; never share it across loops or threads.
6. Classify errors by exception type, never by message text. Chain with `raise DomainError(...) from err` so the cause survives.
7. Answer success only after the commit returned.

## Tools and outputs

- Scoped to the packet's modules: `python -m pytest <assigned-nodeid>` from the runner's working directory, plus the type checker and linter the packet names.
- Outputs: handwritten route, service, repository and test code. Generated code is regenerated from its inputs, never edited.
- Toolkit engines, only for the artifacts the packet assigns: [ast-grep](../recipes/external/ast-grep.md) for bounded syntax rewrites, [buf](../recipes/external/buf.md) for Protobuf schema checks, [kiota](../recipes/external/kiota.md) for API clients from an OpenAPI description, [datamodel-codegen](../recipes/external/datamodel-codegen.md) for Pydantic v2 models from an OpenAPI document or JSON Schema.

## Limits and checks

- Enter `with TestClient(app) as client:` so lifespan startup and shutdown run; a bare `TestClient(app)` skips them.
- Async database tests use `httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")` on the same loop as the engine, with the project's async test plugin.
- HTTPX `0.28.1` `ASGITransport` collects the whole body before returning it, so it cannot prove streaming timing or a client disconnect. Use a real server fixture for those claims.
- `pytest` passing with skipped or deselected cases is not evidence for those cases; report them.
