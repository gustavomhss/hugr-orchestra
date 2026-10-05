# R48 — Python implementation variants

2026-10-04. **Research only; source/docs/examples/tests inspected, not run during R48.** Both metadata worktree and `charlie-plugin` returned HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0` via `git rev-parse HEAD`.
Consumed frozen brief and leads at `/Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/{skill-variants-plan.md,38-python-composer.md,34-generated-tests.md}`. Authored kernels below are unexecuted, not generated applications or runtime qualification.

## Version boundary and composition

Source baselines: **CPython 3.12.11; FastAPI 0.118.0 / Starlette 0.48.0 / Pydantic 2.11.7 / SQLAlchemy 2.0.43; Django 5.2.6 / DRF 3.16.1; Flask 3.1.2; HTTPX 0.28.1**. These are pinned research examples, not “latest” or upgrade instructions. FastAPI's inspected manifest admits Starlette `>=0.40.0,<0.49.0` and selected Pydantic version; this is dependency-range evidence, not exercised compatibility. [F0]
Owner supplies selected component/paths, behavior and acceptance IDs, Python/framework/ORM/driver lock, ASGI/WSGI and server facts, schema/constraints, auth policy, transaction/delivery semantics, fixtures and permitted effects. Charlie implements those facts; no project diagnosis, catalog discovery, architecture selection or permission inference. Repair diagnosis comes from owner; new features need behavior, not invented diagnosis.

| Extract into | Instruction boundary |
|---|---|
| Shared scope guidance | Implement supplied contract; map failures/reproducers to assigned checks; escalate missing/conflicting behavior. Local SQL, joins, loaders, helper boundaries and equivalent locking implementations remain Charlie's judgment. |
| Python language rule | Annotations alone do not validate input; `with`/`finally` delimit cleanup; `async def` does not convert blocking calls into nonblocking I/O. |
| Runtime rule | asyncio cancellation (`CancelledError` inherits `BaseException` in 3.12.11), loop affinity, ASGI send/disconnect versus WSGI iteration. These are not universal “Python web” semantics. [PY,ST,S,L] |
| Framework/library reference | Pydantic presence/coercion; FastAPI dependency lifetime; DRF serializer/permission dispatch; SQLAlchemy session ownership; Django transaction API. Load only selected version's applicable section. |
| Narrow task recipe | Cards below compose endpoint/write, stream, auth or assigned-test procedures. A Python file, installed dependency or monorepo neighbor is not a trigger. |

**Loading proposal:** supplied component facts → shared scope + Python basics + selected runtime/framework/ORM references + assigned task cards. Card comparisons are authoring material: runtime payload includes only selected branch, never all-framework manuals. This describes content composition, not an implemented loader/router.
**Tool guidance:** E = existing scoped read/edit tools; T = existing pinned project runner. Reusable guidance owns command shapes such as `python -m pytest <assigned-nodeid>` or `python manage.py test <assigned-label>`, adapted to supplied runner/CWD. Caller supplies target, environment and execution scope, not every SQL statement/helper/CLI argument. All commands/checks here remain unexecuted.
**Composer boundary:** retain supplied existing qualified/unqualified distinction. A selected qualified recipe is usable only within its pinned qualification/input envelope; unqualified output is scaffolding when explicitly assigned, not executable assurance. Consume mode and expected artifacts, not merely syntax/quality labels. R38 is a historical lead, not authority to reopen producer defects. Selected FastAPI guidance may use existing `hugr-compose` → `fastapi_meta_compose` route with supplied recipe/resolved inputs [C]; delegation output is a pointer, not evidence delegate ran. Missing approved route/qualification returns blocker. Producer repairs, qualification redesign and blanket recipe execution are outside this research.

## Variant cards — all assigned checks proposed, unexecuted

### V1 — FastAPI/Pydantic v2 endpoint with SQLAlchemy async write
- **Trigger / non-trigger:** assigned FastAPI endpoint using selected v2 DTOs and `AsyncSession`; not DRF, incidental Pydantic installation, plain Starlette or sync SQLAlchemy.
- **Supplied input:** request/response fields, omission/null/coercion/extra-field policy, principal adapter, DB invariants/dialect, existing session factory and transaction ownership.
- **Steps:** declare input/output DTOs; use `model_validate`/`model_dump` for v2 operations, `from_attributes=True` only with intentionally loaded ORM attributes. `str | None` without default is still required; PATCH uses supplied optionality and `exclude_unset=True`, preserving explicit null. Apply owner predicate; enter transaction before reads/writes; flush/materialize response scalars, commit before success. [P,S]
- **Changed instruction:** one session per concurrent task; no shared session under `gather`. Preload relationships (`selectinload` or explicit refresh) before response conversion; serialization cannot await lazy/expired attribute I/O. An auth query may already autobegin a shared session: use supplied ownership boundary, not another blind `begin()`. Do not place success-critical commit after dependency `yield`. [S,F1]
- **Tool route → output:** E + T; optional packet-selected qualified Composer route → DTOs, route/service transaction and scoped tests, with mode/artifact provenance if generated.
- **Local choices / blocker:** query shape, locking versus equivalent conditional SQL, DTO projection/helper layout are local; missing transaction boundary, dialect or coercion contract blocks relevant work.
- **Assigned checks:** valid payload; omitted/null/boolean/string/numeric/extra-field cases; output field restriction; rollback and competing writes in P-DEBIT; unloaded relationship must not become accidental response-time SQL.

### V2 — Django/DRF serializer and ORM transaction
- **Trigger / non-trigger:** assigned DRF 3.16.1 endpoint with Django ORM multi-write behavior; not third-party async DRF, read-only async query alone or SQLAlchemy models.
- **Supplied input:** V1 business facts plus model fields, database alias, `ATOMIC_REQUESTS` state, middleware/runtime and existing serializer/view conventions.
- **Steps:** use explicit serializer fields, `is_valid(...)`, then `validated_data`; `required=False`, `allow_null=True` and `partial=True` solve different problems. Default `IntegerField` coerces `"70"`/`70.0`; strict JSON integer requires pre-coercion validation. Serializer walks writable fields, so reject unknown input explicitly if contract forbids it. [R2]
- **Changed instruction:** core DRF `APIView.dispatch` calls handler synchronously; Django async-view support does not make `async def post` valid there. Put whole write unit inside sync `transaction.atomic()` and evaluate `select_for_update()` inside it. For an already-selected native Django async caller, bridge one complete sync transaction via `sync_to_async(..., thread_sensitive=True)`; do not scatter awaits across it or pass DB handles across threads. Django 5.2 async ORM has no async transaction support. Catch DB errors outside failed atomic block. [R0,D1,D2]
- **Tool route → output:** E + T, Django test label or existing pytest integration → serializer, sync view/service and atomic write tests.
- **Local choices / blocker:** ORM expressions, eager loading, lock order and service extraction are local; ambiguous cross-database atomicity or request transaction ownership returns owner question.
- **Assigned checks:** same P-DEBIT state oracle as V1; serializer coercion/extra/null cases; rollback after first write; real commit/locking fixture using `TransactionTestCase`/`APITransactionTestCase`, not ordinary `TestCase`'s enclosing transaction. [DT,RT]

### V3 — Streaming response and resource lifetime
- **Trigger / non-trigger:** supplied streaming/export behavior whose iterator owns or borrows resources; not ordinary materialized JSON response.
- **Supplied input:** stream format, snapshot/order rules, bounds, whether DB is used during iteration or only auth, selected runtime/server ASGI spec, disconnect expectations and resource owner.
- **FastAPI/Starlette steps:** authorize before headers; keep stream-used resources alive through response invocation, explicitly finalize iterator/cursor/session on completion and disconnect. FastAPI 0.118.0 keeps `yield` dependencies through response; auth-only resources may be released earlier using selected ownership pattern. Plain Starlette has no FastAPI dependency stack. In Starlette 0.48, ASGI ≥2.4 send `OSError` raises `ClientDisconnect` before background callback, so cleanup cannot rely solely on `BackgroundTask`; use response-owned `finally`/context cleanup and explicit iterator close. [F1,ST]
- **Django steps:** `StreamingHttpResponse` needs sync iterator under WSGI, async iterator under ASGI; wrong kind is adapted by consuming into a list. Streaming iteration occurs outside `ATOMIC_REQUESTS`; commit writes before returning response, not inside lazy stream. Flask-specific context rule is V5. [D2,D3]
- **Tool route → output:** E + T using assigned direct ASGI/WSGI or live transport fixture → stream producer, response-lifetime cleanup and bounded lifecycle tests.
- **Local choices / blocker:** chunk size, projection and close-wrapper layout are local; missing snapshot/cancellation policy or incompatible supplied runtime requirement blocks architectural workaround.
- **Assigned checks:** first chunk before producer exhaustion; exact output/order; resource remains usable during iteration; closed after EOF, producer failure and early disconnect; verify selected server's disconnect path rather than buffered body alone. [STT,H]

### V4 — Supplied authorization policy at framework enforcement points
- **Trigger / non-trigger:** implementing specified owner/tenant/role/scope policy; not selecting identity provider, diagnosing auth architecture or broad security audit.
- **Supplied input:** trusted principal source, credential mode, scope/role meanings, visibility predicate, create ownership, denial status/headers and cookie/CSRF policy.
- **FastAPI steps:** token extraction/OpenAPI `Security(..., scopes=...)` metadata is not token verification or policy enforcement; selected dependency must verify supplied credential contract and check `SecurityScopes`. Bind principal to query/create predicates. Plain Starlette handlers receive `Request` and require explicit parsing/validation/auth wiring; copying `Depends` parameters does not inject them. [FA,ST0]
- **DRF steps:** authentication identifies; permission classes authorize. Custom retrieval calls `check_object_permissions` when object checks are selected; lists need filtered queryset, creates need explicit policy/server ownership because generic object checks do not cover either. DRF 3.16.1 exempts views from Django ≥5.1 `LoginRequiredMiddleware`; implement assigned permission classes. Preserve SessionAuthentication CSRF and authenticator-dependent 401/403 behavior. [R0,R1,RA]
- **Tool route → output:** E + T → selected dependency/permission/decorator plus query/create wiring and explicit denial mappings; Flask uses supplied decorator/`before_request` convention, not DRF hooks.
- **Local choices / blocker:** reusable principal/predicate helper is local; missing policy or conflicting 403-versus-concealed-404 behavior returns owner decision, not invented policy.
- **Assigned checks:** real valid/invalid credentials, owner/non-owner, allowed/denied scopes, list invisibility, forged owner input; selected session mode tests CSRF with enforcement enabled. Forced authentication alone cannot establish credential or CSRF checks. [RT]

### V5 — Flask sync/WSGI endpoint and context-bound stream
- **Trigger / non-trigger:** assigned Flask 3.1.2 sync/WSGI component; not Quart, native ASGI or an inferred migration because `async` appears elsewhere.
- **Supplied input:** selected parser/validator, sync ORM/driver and transaction conventions, request/context needs, existing auth hooks and any supplied job-admission interface.
- **Steps:** explicitly parse/validate request and shape response; annotations do not furnish FastAPI DTO binding. Use selected sync ORM transaction before returning success. For streaming, acquire/close stream resource with iterator lifetime; use `stream_with_context` only when iterator needs request context, otherwise copy required values before returning. [L]
- **Changed instruction:** native Flask WSGI async view creates per-request event loop and still occupies worker; unfinished `asyncio.create_task` jobs are cancelled when view completes. Do not transfer request-detached ASGI task/session assumptions. If durable follow-up is assigned, call supplied job interface with IDs, not live request/ORM objects. [L]
- **Tool route → output:** E + T with Flask test client → sync view/blueprint, generator/context wrapper and resource tests; no async framework adoption.
- **Local choices / blocker:** local validation mapper, context-value copy and generator helpers are implementation choices; required outliving-request work without supplied admission architecture is upstream blocker.
- **Assigned checks:** valid/invalid HTTP request through real hooks; DB rollback; stream consumes request value correctly and closes resource after explicit response close; request context alone is not full request dispatch. [LT]

### V6 — Assigned behavior tests with framework-correct transport/fixtures
- **Trigger / non-trigger:** explicit endpoint/transaction/stream/auth test assignment; not repository-wide fuzzing, review or discovery because pytest is installed.
- **Supplied input:** R34 requirement IDs, input domain, independent oracle, prescribed cases, fixture reset/fault semantics, versions, runner/CWD and bounded budget.
- **Steps:** FastAPI/Starlette sync tests enter `with TestClient(app)` for lifespan; async DB tests use same-loop `AsyncClient(transport=ASGITransport(app=app))` with existing lifespan fixture, selecting asyncio for asyncio-only driver. HTTPX 0.28.1 accumulates body chunks and joins them after app completion: use assigned direct/live transport for streaming timing/disconnect. DRF uses `APIClient(..., enforce_csrf_checks=True)` for selected session policy and transaction-capable fixture for commit/lock checks; Flask explicitly consumes/closes streaming response. [FT,STC,H,RT,LT]
- **Generated cases:** selected operation strategy from supplied schema may exercise wire conformance; Hypothesis may generate assigned amounts/sequences. Preserve deterministic race/rollback/denial cases and independent DB reads; generated schema-valid responses cannot prove ledger atomicity. Reset state per example/shrink; retain concrete reproducer. R34's exact tool/runner pins apply only when selected.
- **Tool route → output:** E authors tests; T executes assigned checks under supplied scope → requirement→test→oracle→cases mapping and execution/reproducer evidence, including skips and reached actions.
- **Local choices / blocker:** fixtures, strategies and assertion layout remain local; absent target-dialect or live-disconnect fixture is evidence gap for owner, not license to install infrastructure or claim substitute coverage.
- **Assigned checks:** known-valid control reaches success; known-invalid/violating control fails intended assertion; selected cases actually execute. Ordinary Django `TestCase` can mask missing transaction around row locks and never commits `on_commit` callbacks; capture callbacks tests registration, real commit fixture tests commit behavior. [D2,DT]

## Same business endpoint — two implementations, source-only

**Hypothetical supplied P-DEBIT:** `POST /accounts/{account_id}/debits`, JSON body `{"amount":70}`, amount strict integer 1..1000000, reject extras/coercion; authenticated owner only, concealed 404 for other/missing account, insufficient funds 409, success 201 `{debit_id,balance}`. Account decrement and ledger insert commit together; competing calls cannot overdraw. Single PostgreSQL DB, READ COMMITTED isolation, row locking and nonnegative-balance constraint supplied. Native validation responses explicitly selected here: FastAPI 422, DRF 400; an identical error-wire contract would require assigned mapping rather than silent default transfer.
Bindings supplied by existing component: FastAPI `router`, `sessions` (`async_sessionmaker` yielding fresh sessions), `require_principal`; DRF `BearerAuthentication` with challenge header; each framework's `Account`/`Debit` models. Auth adapters enforce same credential policy and return principal ID. Django `ATOMIC_REQUESTS=False` for this example; bind `DebitView.as_view()` at matching URL. Application imports/model declarations/auth implementation omitted; these are endpoint kernels, not standalone projects.

```python
# FastAPI 0.118.0, Pydantic 2.11.7, SQLAlchemy 2.0.43
from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

class DebitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: int = Field(strict=True, ge=1, le=1000000)

class DebitOut(BaseModel):
    debit_id: int
    balance: int

@router.post("/accounts/{account_id}/debits", status_code=201, response_model=DebitOut)
async def debit(account_id: int, body: DebitIn, actor=Depends(require_principal)):
    async with sessions() as db, db.begin():
        account = await db.scalar(
            select(Account).where(Account.id == account_id, Account.owner_id == actor.id).with_for_update()
        )
        if account is None:
            raise HTTPException(404, "not found")
        if account.balance < body.amount:
            raise HTTPException(409, "insufficient funds")
        account.balance -= body.amount
        entry = Debit(account_id=account.id, amount=body.amount)
        db.add(entry)
        await db.flush()
        result = DebitOut(debit_id=entry.id, balance=account.balance)
    return result
```

```python
# Django 5.2.6, DRF 3.16.1
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

class DebitIn(serializers.Serializer):
    amount = serializers.IntegerField(min_value=1, max_value=1000000)

    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) != {"amount"} or type(data["amount"]) is not int:
            raise serializers.ValidationError("invalid payload")
        return super().to_internal_value(data)

class DebitView(APIView):
    authentication_classes = [BearerAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, account_id):
        body = DebitIn(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            account = get_object_or_404(
                Account.objects.select_for_update(), pk=account_id, owner_id=request.user.pk
            )
            if account.balance < body.validated_data["amount"]:
                return Response({"detail": "insufficient funds"}, status=409)
            account.balance -= body.validated_data["amount"]
            account.save(update_fields=["balance"])
            entry = Debit.objects.create(account_id=account.pk, amount=body.validated_data["amount"])
            result = {"debit_id": entry.pk, "balance": account.balance}
        return Response(result, status=201)
```

**Assigned comparison checks:** owner balance 100, debit 70 → 201/balance 30 and matching ledger; two concurrent 70 requests → one 201, one 409, balance 30 and one ledger entry; injected failure after account update/before ledger → neither change persists. Independent connections/state reads required. Amount values `"70"`, `70.0`, `true`, null, missing amount and forged owner field reject. Framework imports/fixtures/snippets not executed.

## Selection and wrong-transfer examples
- **Positive:** supplied FastAPI async debit → V1+V4+assigned V6; supplied DRF debit → V2+V4+assigned V6. Streaming export adds only selected V3 branch; supplied Flask WSGI export → V5 plus applicable V3/V6 clauses.
- **Negative:** DRF component with FastAPI test utility dependency does not load V1; Pydantic-only DTO edit does not load ORM transaction recipe; ordinary JSON GET does not load stream manual; test assignment does not authorize all OpenAPI operations.
- **Version failure:** FastAPI 0.106.0–0.117.x dependency cleanup occurs before response send; transferring 0.118.0 DB-borrowing stream recipe can use an already-released resource. Conversely 0.118.0 auth-only dependency may retain DB through slow stream. Its `Depends` constructor accepts `dependency/use_cache`, not newer `scope="function"`; do not backport rolling-doc syntax. [F1,F2]
- **Runtime failure:** replacing sync DRF transaction with `async def post` plus `async with transaction.atomic()` fails both dispatcher and transaction boundaries. Moving Flask background `create_task` work from long-lived-loop assumptions loses unfinished work at request completion. [R0,D1,L]
- **Language/library failure:** Pydantic v1-style assumption “`Optional` means omittable” changes required-field contract under v2; DRF `allow_null=True` also does not mean `required=False`. Explicit presence/coercion tests accompany selected recipe. [P,R2]

## Primary evidence inspected — tagged snapshots, not runtime results
- **F0/F1/F2:** FastAPI 0.118.0 [manifest](https://github.com/fastapi/fastapi/blob/0.118.0/pyproject.toml), [yield/stream version history](https://github.com/fastapi/fastapi/blob/0.118.0/docs/en/docs/advanced/advanced-dependencies.md), [Depends signature](https://github.com/fastapi/fastapi/blob/0.118.0/fastapi/params.py).
- **FA/FT:** FastAPI [scope-checking example](https://github.com/fastapi/fastapi/blob/0.118.0/docs_src/security/tutorial005_an_py310.py), [async-test/lifespan guide](https://github.com/fastapi/fastapi/blob/0.118.0/docs/en/docs/advanced/async-tests.md), [dependency exception/finalization tests](https://github.com/fastapi/fastapi/blob/0.118.0/tests/test_dependency_contextmanager.py); [sync helper versus framework dispatch](https://github.com/fastapi/fastapi/blob/0.118.0/docs/en/docs/async.md).
- **P:** Pydantic 2.11.7 [migration semantics/examples](https://github.com/pydantic/pydantic/blob/v2.11.7/docs/migration.md), [strict-mode input-path distinctions](https://github.com/pydantic/pydantic/blob/v2.11.7/docs/concepts/strict_mode.md). JSON-mode strict UUID parsing differs from strict Python-object parsing; don't interchange validation entrypoints blindly.
- **S:** SQLAlchemy 2.0.43 [async sessions, concurrency, eager loading, expiry and loop ownership](https://github.com/sqlalchemy/sqlalchemy/blob/rel_2_0_43/doc/build/orm/extensions/asyncio.rst); inspected transaction/eager-loading examples in that file.
- **D1/D2/D3:** Django 5.2.6 [async/transaction boundary](https://github.com/django/django/blob/5.2.6/docs/topics/async.txt), [atomic/stream/on_commit semantics](https://github.com/django/django/blob/5.2.6/docs/topics/db/transactions.txt), [StreamingHttpResponse iterator conversion source](https://github.com/django/django/blob/5.2.6/django/http/response.py).
- **R0/R1/RA:** DRF 3.16.1 [dispatch and middleware exemption](https://github.com/encode/django-rest-framework/blob/3.16.1/rest_framework/views.py), [permission/list/create guidance](https://github.com/encode/django-rest-framework/blob/3.16.1/docs/api-guide/permissions.md), [authentication/CSRF source](https://github.com/encode/django-rest-framework/blob/3.16.1/rest_framework/authentication.py).
- **R2/RT:** DRF [Serializer validation source](https://github.com/encode/django-rest-framework/blob/3.16.1/rest_framework/serializers.py), [IntegerField/required/null source](https://github.com/encode/django-rest-framework/blob/3.16.1/rest_framework/fields.py), [test-client/transaction guide](https://github.com/encode/django-rest-framework/blob/3.16.1/docs/api-guide/testing.md), [permission tests](https://github.com/encode/django-rest-framework/blob/3.16.1/tests/test_permissions.py).
- **ST0/ST/STC:** Starlette 0.48.0 [Request endpoint contract](https://github.com/encode/starlette/blob/0.48.0/docs/routing.md), [stream/send/disconnect source](https://github.com/encode/starlette/blob/0.48.0/starlette/responses.py), [TestClient lifespan/loop guidance](https://github.com/encode/starlette/blob/0.48.0/docs/testclient.md).
- **STT/DT:** Starlette [disconnect tests](https://github.com/encode/starlette/blob/0.48.0/tests/test_responses.py) explicitly exercise receive-disconnect versus ASGI 2.4 send failure and close async generator; Django [locking tests](https://github.com/django/django/blob/5.2.6/tests/select_for_update/tests.py) use separate connection and `TransactionTestCase`, with backend-feature skips. Read assertions, not claimed passing suites.
- **L/LT:** Flask 3.1.2 [WSGI async/background lifetime](https://github.com/pallets/flask/blob/3.1.2/docs/async-await.rst), [stream context examples](https://github.com/pallets/flask/blob/3.1.2/docs/patterns/streaming.rst), [TestStreaming context/close tests](https://github.com/pallets/flask/blob/3.1.2/tests/test_helpers.py), [request-context versus dispatch tests](https://github.com/pallets/flask/blob/3.1.2/docs/testing.rst).
- **H/PY:** HTTPX 0.28.1 [ASGITransport buffering/receive source](https://github.com/encode/httpx/blob/0.28.1/httpx/_transports/asgi.py); CPython 3.12.11 [cancellation exception hierarchy](https://github.com/python/cpython/blob/v3.12.11/Lib/asyncio/exceptions.py).
- **C:** inspected pinned `charlie-plugin/packages/opencode/src/plugin/hugr-composer/tools.ts:14–43` under worktree path above: existing compose bridge call shape. Producer qualification status remains supplied version-specific fact; historical R38 producer modes are not current qualification proof.
