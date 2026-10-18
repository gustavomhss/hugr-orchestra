# FastAPI

## Applicability

A component whose path operations are registered on FastAPI `0.118.0` (Starlette `0.48.0` underneath). Read [Python](../../languages/python.md) first; its cancellation, blocking-call and test rules apply unchanged. Request and response models follow [Pydantic v2](../../libraries/python/pydantic.md).

## Non-trigger

- Plain Starlette routes: handlers receive `Request` and get no dependency injection; copying `Depends` parameters into them injects nothing.
- DRF, Flask or a FastAPI dependency imported only by a test utility.
- Changing the app factory, middleware order, lifespan or global exception handlers unless the packet assigns it.

## Inputs

- The `APIRouter` that owns the path, its prefix and its dependencies.
- The session and principal dependencies, the response model and the error envelope with its status codes.
- Whether validation errors keep FastAPI's default 422 body or map to the project's envelope.

## Steps

1. Register on the existing router:
   ```python
   @router.post("/accounts/{account_id}/debits", status_code=201, response_model=DebitOut)
   async def debit(account_id: int, body: DebitIn, actor: Principal = Depends(require_principal)) -> DebitOut:
       ...
   ```
   Path parameters come from the signature, the body from the model parameter. A failed parse returns 422 before the function runs, unless the project installed a `RequestValidationError` handler.
2. Use `async def` when the function awaits the async session. A plain `def` runs in a worker thread; never mix blocking calls into `async def`.
3. Dependencies use `Depends(callable)`. In `0.118.0` its parameters are `dependency` and `use_cache`; there is no `scope` argument. Code after `yield` in a dependency runs after the response is sent, including after a streaming body ends, so a commit there cannot change the status already sent. Commit inside the path operation before returning.
4. Enforce the supplied policy in the principal dependency. `Security(dep, scopes=[...])` only declares scopes for OpenAPI; the dependency must verify the credential and check `SecurityScopes.scopes` itself. Bind the principal into every query predicate and created row.
5. Raise `HTTPException(status_code=409, detail=...)` for a mapped outcome, or a domain exception the project's `exception_handler` maps. Never return an error body with a 200 status.
6. Streaming: authorize and validate before returning `StreamingResponse(gen(), media_type=...)`. Resources the generator uses stay open through a `yield` dependency or are owned by the generator itself; close cursors and sessions in the generator's `finally`. On Starlette `0.48.0`, a client disconnect during send raises `ClientDisconnect`, so a `BackgroundTask` is not a cleanup guarantee.

## Tools and outputs

- `APIRouter`, `Depends`, `Security`, `SecurityScopes`, `HTTPException`, `status`, `StreamingResponse`, `BackgroundTasks`.
- Tests through the real app: `with TestClient(app) as client:` for sync tests, `httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")` for async database tests. `app.dependency_overrides` may supply a fixture principal, but then credential checks need their own test with real tokens.
- Outputs: handwritten routes, dependencies and tests. OpenAPI output is derived, never edited.

## Limits and checks

- `response_model` filters the returned object to the model's fields and validates it; a mismatch is a server error, not a client 422.
- From 0.106 through 0.117, `yield` dependencies were cleaned up before the response was sent, so a streaming body could not use their session. Never transfer either ordering across versions.
- A sync `def` dependency or route shares a bounded thread pool; a blocking call there still stalls other requests under load.
- Checks through the app: the success status and body, each mapped error status, a validation failure, an unauthorized and a forbidden case, and a disconnect case with a real server when streaming is assigned.
