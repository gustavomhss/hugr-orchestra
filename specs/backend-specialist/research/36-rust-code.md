# R36 — Rust backend implementation recipes

Research snapshot: 2026-10-03. Evidence: current primary Rustdocs, published package provenance, pinned upstream manifests and implementation source. Examples source-checked; compilation/runtime checks below **assigned, not executed**.

Applicability: already-selected Rust/Axum backend. The backend specialist receives complete contract/design, domain APIs, error schema, paths, dependency lock/toolchain and checks; applies selected recipe. Examples bind supplied `AppState`, `state.users`, `User`, `ApiError`, `ApiProblem`; these names stand for supplied implementation, not generated business logic. Paths below are concrete example destinations, replaced by task's fixed paths before dispatch.

## Ranking: implementation removed, not claimed LOC savings

| Rank | Selected mechanism | Handwritten work displaced | Guarantee boundary |
|---|---|---|---|
| 1 | Serde + Garde + `axum-valid` | DTO deserializer, per-field/nested validation branches, error accumulation, per-handler validation invocation/rejection glue | Typed decode + runtime validation before handler; not permanent domain validity |
| 2 | Axum/Tower HTTP layer composition | Custom timeout futures, limited-body wrappers, request-ID generation/response propagation across selected routes | Trait-checked service composition; runtime policy depends on order, placement and body consumption |
| 3 | `utoipa-axum` route/schema co-registration | Separate route-string/method registration, OpenAPI path/component registries and hand-maintained schema JSON | Same annotation drives routing and specification; actual business responses remain unchecked |
| 4 | `axum-extra::TypedPath` derive | Path extractor impl, URL formatter/percent encoding, repeated route literal | Compile-time capture/field agreement and handler/path association; runtime parameter parsing |

Savings are structural judgments from generated/delegated implementations, not measured developer-time or line-count benchmarks. Rank 3 rises for DTO-heavy APIs with mandatory OpenAPI; rank 4 fits backend-generated links/redirects and typed route tables.

## Confirmed version, feature, license and source pins

Use exact Cargo requirements (`version = "=…"`) for selected recipe dependencies, plus supplied lockfile. Feature lists below are recipe-specific. Source links pin full published VCS commits; license identifiers verified in upstream package manifests.

| Crate pin | Features / compatibility | Declared Rust floor | License; pinned source |
|---|---|---|---|
| `axum =0.8.9` | Keep existing runtime features; `json`, `macros` for examples; `http1`/`tokio` for serving | 1.80 | MIT; [c59208c86fded335cd85e388030ad59347b0e5ae](https://github.com/tokio-rs/axum/tree/c59208c86fded335cd85e388030ad59347b0e5ae/axum) |
| `axum-extra =0.12.6` | `default-features=false`, `typed-routing`; pulls `routing`, `axum-macros 0.5.1`, requires Axum `^0.8.9` | 1.80 | MIT; [same source pin](https://github.com/tokio-rs/axum/tree/c59208c86fded335cd85e388030ad59347b0e5ae/axum-extra) |
| `serde =1.0.229` | `derive`, default `std` | 1.56 | MIT OR Apache-2.0; [7fc3b4c30c94f73a96ebd1553f2b090d928fc3a8](https://github.com/serde-rs/serde/tree/7fc3b4c30c94f73a96ebd1553f2b090d928fc3a8/serde) |
| `garde =0.23.0` | `derive`; `serde` enabled through `axum-valid/into_json`; selected rules need no `full` | 1.87 | MIT OR Apache-2.0; [64dc05aa9cabb58219c0779acc9b95d8b0a4906a](https://github.com/jprochazk/garde/tree/64dc05aa9cabb58219c0779acc9b95d8b0a4906a/garde) |
| `axum-valid =0.25.0` | `default-features=false`, `garde,json,422,into_json`; Axum `^0.8`, Garde `^0.23.0` | 1.88 | MIT; [83116785e63fc3c1c16ef8d2c9ca2b41ded96ab2](https://github.com/gengteng/axum-valid/tree/83116785e63fc3c1c16ef8d2c9ca2b41ded96ab2) |
| `tower =0.5.3` | `util` for `ServiceExt::oneshot` checks | 1.64 | MIT; [4b0a6b0e688bd177eb2c9c97f5268dd9703c66fc](https://github.com/tower-rs/tower/tree/4b0a6b0e688bd177eb2c9c97f5268dd9703c66fc/tower) |
| `tower-http =0.7.1` | `default-features=false`, `timeout,limit,request-id`; HTTP/body 1, Tower service/layer 0.3 | 1.65 | MIT; [c9414514a421b07b6520e040a3fd6a579b0c5e1b](https://github.com/tower-rs/tower-http/tree/c9414514a421b07b6520e040a3fd6a579b0c5e1b/tower-http) |
| `utoipa =6.0.0`, `utoipa-axum =0.3.0` | Utoipa `macros,axum_extras`; binder requires Utoipa `^6.0.0`, Axum `^0.8.4` | Both 1.88 | Both MIT OR Apache-2.0; [baa4d04c78fdcc86622e1a2775039fc1621157c0](https://github.com/juhaku/utoipa/tree/baa4d04c78fdcc86622e1a2775039fc1621157c0) |

Published provenance examples: [Axum](https://docs.rs/crate/axum/0.8.9/source/.cargo_vcs_info.json), [Garde](https://docs.rs/crate/garde/0.23.0/source/.cargo_vcs_info.json), [Utoipa binder](https://docs.rs/crate/utoipa-axum/0.3.0/source/.cargo_vcs_info.json). Other listed pins checked through each package's same versioned provenance file. Floors describe direct crates, not resolved transitive MSRV; supplied toolchain/lockfile must satisfy whole graph.

Compatibility facts: Axum 0.8 uses `/{id}`, not legacy `/:id`. Axum's optional docs-only Tower HTTP 0.6 dependency does not prevent direct Tower HTTP 0.7 composition through shared HTTP 1 / Tower traits. Utoipa 6 defaults to OpenAPI **3.1.0**; 3.2.0 is opt-in ([version enum](https://docs.rs/utoipa/6.0.0/utoipa/openapi/enum.OpenApiVersion.html)).

## 1 — Derive request decoding and validation; gate handler entry

**Supplied contract →** `POST /users`; required ASCII username, 3–32 bytes; age 18–120; unknown JSON fields rejected; success 201. Native validation rejection: 422 JSON Garde report; Axum's inner extraction errors retain their own status/body. Task supplies domain create API and other error mappings.

**Exact mechanism →** `serde::Deserialize`, `#[serde(deny_unknown_fields)]`, `garde::Validate`, field rules, `axum_valid::Garde<Json<T>>` as final body extractor:

```rust
use axum::{extract::State, http::StatusCode, Json};
use axum_valid::Garde;

#[derive(serde::Deserialize, garde::Validate)]
#[serde(deny_unknown_fields)]
pub struct CreateUser {
    #[garde(ascii, length(bytes, min = 3, max = 32))]
    pub username: String,
    #[garde(range(min = 18, max = 120))]
    pub age: u8,
}
impl axum::extract::FromRef<AppState> for () {
    fn from_ref(_: &AppState) {}
}
pub async fn create_user(
    State(state): State<AppState>,
    Garde(Json(input)): Garde<Json<CreateUser>>,
) -> Result<(StatusCode, Json<User>), ApiError> {
    let user = state.users.create(input).await?;
    Ok((StatusCode::CREATED, Json(user)))
}
```

**Code/artifacts →** `src/http/dto.rs`, `src/http/users.rs`: compiled deserializer/validator impls and extractor adapter; no generated source file. `#[garde(dive)]` reuses nested validators; `inner(...)` handles collection elements. Unannotated fields fail derive unless `allow_unvalidated` is enabled; deliberate exemptions use `#[garde(skip)]`.
**Manual business logic →** Authorization, uniqueness, persistence/transaction semantics, cross-record rules and prescribed error conversion stay in supplied domain API. Custom synchronous rules use `#[garde(custom(validate_field))]`, function signature `fn(&Field, &Context) -> garde::Result`; asynchronous DB checks stay outside derive.
**Limits →** `Garde` is a public, mutable wrapper, not an unforgeable validated domain type. State requires `FromRef<AppState>` for validation context—even context `()`; use existing impl or above impl, never duplicate it. `into_json` affects validation failures only: malformed JSON remains 400 text, missing/unknown/wrongly typed fields 422 text, wrong content type 415. Uniform problem JSON needs task-specified rejection mapping. `deny_unknown_fields` cannot combine with `flatten`; `Option` needs `required` when absence must fail.
**Typed-domain extension, when already specified →** `#[derive(serde::Deserialize)] #[serde(try_from = "String")] struct Email(String);` delegates decoding to supplied `TryFrom<String>` (`Error: Display`). Private field + checked constructors preserve invariant; derive does not invent predicate. This replaces handwritten Serde visitor, not business validation.
**Assigned checks →** `r36_validation`: P valid boundary values create expected user; N short/non-ASCII username, ages 17/121, missing/extra fields, malformed JSON and wrong media type yield specified statuses/content types with no persisted user. JSON validation body must deserialize as pinned `garde::Report` with expected field path; do not assume `{field: message}` shape. Supplied compile-fail fixture with unannotated field must fail for missing Garde rule.
**Primary evidence →** [Garde rules](https://docs.rs/garde/0.23.0/garde/), [derive field check](https://github.com/jprochazk/garde/blob/64dc05aa9cabb58219c0779acc9b95d8b0a4906a/garde_derive/src/check.rs), [actual extractor](https://github.com/gengteng/axum-valid/blob/83116785e63fc3c1c16ef8d2c9ca2b41ded96ab2/src/garde.rs), [rejection mapping](https://github.com/gengteng/axum-valid/blob/83116785e63fc3c1c16ef8d2c9ca2b41ded96ab2/src/lib.rs), [Serde attributes](https://serde.rs/container-attrs.html).

## 2 — Compose selected HTTP policies instead of writing middleware

**Supplied contract →** Selected existing JSON router subtree; request-to-response timeout 2 seconds → empty 504; request body limit 65,536 bytes → 413; preserve supplied `x-request-id`, otherwise generate UUID and return ID on success and policy failures. Limits/order/placement already decided.

```rust
use std::time::Duration;
use axum::http::StatusCode;
use tower::ServiceBuilder;
use tower_http::{limit::RequestBodyLimitLayer, timeout::TimeoutLayer};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};

let app = app.layer(
    ServiceBuilder::new()
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(TimeoutLayer::with_status_code(
            StatusCode::GATEWAY_TIMEOUT, Duration::from_secs(2),
        ))
        .layer(RequestBodyLimitLayer::new(65_536)),
);
```

**Code/artifacts →** `src/http/router.rs`: composed `Layer`/`Service` types replace custom future polling/cancellation, body length tracking, header/extension propagation. Request order follows `ServiceBuilder` top-to-bottom; response order reverses. Propagation surrounds timeout and limit, so early responses retain ID.
**Guarantees/manual work →** Compiler checks service/body/error compatibility. HTTP timeout preserves inner error type (`Infallible` for Axum); unlike `tower::timeout`, it returns HTTP response directly. Business handlers, operation-specific cancellation semantics and custom error envelopes remain manual.
**Limits →** Apply after selected routes exist; later routes are not retroactively wrapped. Timeout is cooperative, ends when response is produced, excludes subsequent response-body streaming, and cannot undo side effects or stop detached tasks. Body limit rejects excessive `Content-Length` immediately; without header it errors only when body is consumed beyond limit. JSON extractor maps that length error to 413; arbitrary streaming consumers need supplied mapping. Request-ID layers preserve existing response IDs too; incoming ID is correlation data, not identity. Backpressure/concurrency policy is separate: Axum router is always-ready, so ordinary per-route concurrency limits do not prove global bounded admission.
**Assigned checks →** `r36_http_layers`: P fast valid request reaches real handler and returns same/generated ID; exact-limit valid padded JSON accepted. N limit+1 rejected both with `Content-Length` and streamed without it; supplied delayed route returns empty 504 under paused Tokio time; 413/504 both carry ID. Fixture must consume streamed body. Task's cancellation check covers intended domain semantics separately.
**Primary evidence →** [ordering/placement/backpressure](https://docs.rs/axum/0.8.9/axum/middleware/index.html), [timeout implementation](https://github.com/tower-rs/tower-http/blob/c9414514a421b07b6520e040a3fd6a579b0c5e1b/tower-http/src/timeout/service.rs), [body-limit semantics](https://github.com/tower-rs/tower-http/blob/c9414514a421b07b6520e040a3fd6a579b0c5e1b/tower-http/src/limit/mod.rs), [request IDs](https://docs.rs/tower-http/0.7.1/tower_http/request_id/index.html).

## 3 — Register endpoint once; derive schemas and collect OpenAPI

**Supplied contract →** `GET /users/{id}` with `id: u64`; 200 `User`, path parse failure 400 text, missing user 404 `ApiProblem`, internal failure 500 `ApiProblem`. Owner supplies exact serialized DTOs and error mapping. Keep existing code-first Rust backend.

```rust
use axum::{extract::{Path, State}, Json};
use utoipa_axum::{router::OpenApiRouter, routes};

// Add #[derive(utoipa::ToSchema)] to supplied User and ApiProblem DTOs.
#[utoipa::path(get, path = "/users/{id}", params(("id" = u64, Path)),
    responses((status = 200, body = User),
              (status = 400, body = String, content_type = "text/plain"),
              (status = 404, body = ApiProblem), (status = 500, body = ApiProblem)))]
async fn get_user(Path(id): Path<u64>, State(state): State<AppState>)
    -> Result<Json<User>, ApiError> {
    Ok(Json(state.users.get(id).await?))
}
let (router, spec): (axum::Router, _) = OpenApiRouter::new()
    .routes(routes!(get_user)).with_state(state).split_for_parts();
let json = spec.to_pretty_json()?;
```

**Code/artifacts →** `src/http/users.rs`, `src/http/router.rs`, supplied `src/bin/export_openapi.rs`; `#[utoipa::path]` emits metadata implementation, `ToSchema` schema builders, `routes!` collects referenced schemas and runtime methods/paths together. Exporter writes artifact via `std::fs::write("artifacts/openapi.json", json)?`. Generation is macro expansion plus runtime document assembly/serialization, not automatic build-time file output or a supplied generator CLI.
**Manual business logic →** Handler body, actual `IntoResponse`/status mapping, auth enforcement, domain failures and descriptions. `IntoResponses`/`ToResponse` derives can reuse response documentation; they do not implement HTTP response behavior.
**Limits →** Annotations do not prove runtime body/status matches spec. `ToSchema` supports only subset of Serde attributes; mirror representable Garde/`TryFrom` predicates with supplied schema metadata, e.g. `#[schema(minimum = 18, maximum = 120)]`; custom wire conversions may require `value_type`/`schema_with`. For `Garde<Json<T>>`, explicitly provide `request_body = T` rather than rely on wrapper inference. Only `routes!` registrations collected; raw `.route(...)` entries bypass documentation. Duplicate method registrations can panic at router construction. UUID/time/chrono DTO support needs matching Utoipa feature.
**Assigned checks →** `r36_openapi`: P compare parsed artifact against supplied expected paths/methods, parameter type/requiredness, status/media-type/schema references and reachable components; exercise real router's 200 payload. N invalid ID → documented 400, missing user → documented 404 body; supplied removed-registration/wrong-schema mutants must break artifact assertions. Expected route list comes from supplied contract, not regenerated output.
**Primary evidence →** [binder API](https://docs.rs/utoipa-axum/0.3.0/utoipa_axum/), [actual route macro and tests](https://github.com/juhaku/utoipa/blob/baa4d04c78fdcc86622e1a2775039fc1621157c0/utoipa-axum/src/lib.rs), [schema attributes/Serde limits](https://docs.rs/utoipa/6.0.0/utoipa/derive.ToSchema.html), [Utoipa features](https://docs.rs/utoipa/6.0.0/utoipa/).

## 4 — Derive typed route extraction and reverse URLs

**Supplied contract →** `/users/{id}`, unsigned integer ID, typed backend links and handler registration. Task preselects this registration recipe for endpoint; example independent of rank 3.

```rust
use axum::{extract::State, Json, Router};
use axum_extra::routing::{RouterExt, TypedPath};

#[derive(serde::Deserialize, TypedPath)]
#[typed_path("/users/{id}")]
struct UserPath { id: u64 }

async fn show_user(UserPath { id }: UserPath, State(state): State<AppState>)
    -> Result<Json<User>, ApiError> {
    Ok(Json(state.users.get(id).await?))
}
let app: Router = Router::new().typed_get(show_user).with_state(state);
let uri = UserPath { id: 7 }.to_uri();
```

**Code/artifacts →** `src/http/paths.rs`, `src/http/router.rs`, supplied link call sites: macro emits `TypedPath::PATH`, `FromRequestParts<S>` via Axum `Path`, and percent-encoding `Display`; `typed_get` derives route literal from handler's first argument. Replaces separate extractor, formatter and route string.
**Manual business logic/limits →** Domain lookup, authorization, error envelope and method choice remain manual. Typed path must be first handler argument; body consumer stays last. Capture/field mismatch fails compilation; numeric decode failure remains runtime 400. Derive does not support generics; custom field `Display` must agree with `Deserialize`. `with_query_params` can panic for unsupported serialization shapes. Nest prefixes and deployment base URLs are outside typed path's local string; supplied URL policy must account for them. Do not register same method/path again through rank 3.
**Assigned checks →** `r36_typed_paths`: P `UserPath { id: 7 }.to_uri()` equals `/users/7` and real typed route resolves seeded user; N `/users/not-a-number` → 400; supplied compile-fail fixture changing capture to `{uid}` with field `id` must fail for field mismatch, while matching fixture compiles. For supplied string-key paths, include reserved-character percent-encoding round-trip case.
**Primary evidence →** [TypedPath API](https://docs.rs/axum-extra/0.12.6/axum_extra/routing/trait.TypedPath.html), [macro expansion source](https://github.com/tokio-rs/axum/blob/c59208c86fded335cd85e388030ad59347b0e5ae/axum-macros/src/typed_path.rs).

## Application/check boundary

Task's existing `tests/http_contract.rs` owns named runtime checks above; supplied compile-fail fixtures own macro-negative checks. Exercise actual constructed router with `tower::ServiceExt::oneshot`, not duplicated validation/route logic. Tokio `test-util,macros,rt,time` needed for paused-time checks; supplied dependency cache/toolchain must already support selected commands.
Assigned commands from supplied backend crate directory: `cargo check --locked --offline --all-targets`; `cargo test --locked --offline --test http_contract`; task's exact existing compile-fail target. Expected named tests must actually execute; skips, absent tests or compile failures from unrelated imports/features are not evidence. No new harness needed for recipe application.

Surveyed alternative: [Aide 0.15.1](https://docs.rs/aide/0.15.1/aide/) generates operation IO from extractor/return traits plus `schemars::JsonSchema`; useful within existing Aide stack. Its published dependencies pin Schemars `^0.9.0` and optional Axum Extra `^0.10`, unlike selected `0.12.6`; not interchangeable derive/adapter traits. Selected Utoipa binder keeps this recipe's route/spec linkage explicit. Axum's [FromRequest derive](https://docs.rs/axum/0.8.9/axum/extract/derive.FromRequest.html) is smaller adjunct for supplied custom rejection wrapper (`via(Json), rejection(ApiError)`); error conversion remains manual.

Bottom line: highest backend-code leverage comes from generated decode/validation and reused HTTP service implementations. Route/schema derives remove repeatable boundary code; domain semantics stay explicit and supplied. Research produces only this report; Rust execution evidence remains pending assigned implementation checks.
