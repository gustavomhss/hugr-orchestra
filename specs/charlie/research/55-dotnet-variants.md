# R55 — .NET/C# backend implementation skill variations

Research date: 2026-10-04. Status: source-only research; proposed selection cases and behavior controls **UNEXECUTED**. Cards are extraction candidates, not installed/exercised skills.
Own metadata-only detached worktree: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/charlie-r55-dotnet-variants`; `git rev-parse --show-toplevel --git-dir HEAD` returned baseline `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`; `git rev-parse --abbrev-ref HEAD` returned `HEAD`.
Inputs read: [frozen skill-variants brief][brief] and [.NET source lead R40][lead]. R40's JSON generator boundary retained; broader packet requirements refined by frozen contract's explicit local coding freedom.

## Version and evidence boundary

Profiles below are selected research comparators, not discovered application facts or upgrade recommendations. Implementation uses caller's exact deployed pins; SDK version, runtime patch and TFM are separate facts. `.0` tags anchor historical behavior, not preferred deployment patches.

| Profile / inspected baseline | Minimal APIs versus controllers | Runtime/serialization difference |
| --- | --- | --- |
| B8: `net8.0`; runtime/ASP.NET Core `8.0.0`; EF comparator `8.0.0` | Minimal DataAnnotations need explicit selected validation path; `[ApiController]` uses MVC model-state filter unless suppressed. | STJ resolver chains and generic `JsonStringEnumConverter<TEnum>` available; `BackgroundService.ExecuteAsync` synchronous prefix runs during startup. [MVC8][mvc8], [host8][host8], [JSON][json] |
| B9: `net9.0`; runtime/ASP.NET Core `9.0.0`; EF comparator `9.0.0` | Same validation split; do not copy .NET 10 `AddValidation` recipe backward. | `JsonStringEnumMemberName` introduced in .NET 9; hosted-service startup prefix still synchronous. [JSON][json], [host9][host9] |
| B10: `net10.0`; runtime/ASP.NET Core/EF Core `10.0.12` | Minimal built-in validation requires `AddValidation` plus usable generated metadata; MVC keeps separate `[ApiController]` pipeline. | Entire `ExecuteAsync` scheduled on background task; HTTP JSON binding uses `PipeReader`, affecting custom converters. [validation][validation], [filter10][filter10], [host10][host10], [pipes][pipes] |

- Verified `v10.0.12` tag commits: runtime `4271d88e0aebf3d04f188f1334c2220d80555ef6`; ASP.NET Core `cb21a42eafcd44cc35fad48d99dc82ff7512ce2f`; EF Core `001bfac21c1910cdf1110ca256c9ea0a06f374ca`. Dapper `2.1.66`: `bd4f75b512de3e00f2c2631d5309961a1ecfea23`.
- EF Core 8 and 9 target .NET 8; EF Core 10 targets .NET 10. `net8.0` therefore does not imply EF 8, and EF 10 does not become compatible through changing HTTP style. Provider/driver compatibility remains separately pinned. [EF versions][efversions]
- JSON/hosting comparisons use matching STJ and `Microsoft.Extensions.Hosting.Abstractions` versions. Explicit package overrides can change behavior independently of TFM; select from actual supplied assembly/package pins.
- Dapper comparator is classic `Dapper 2.1.66`, whose targets include `net8.0` and `netstandard2.0`; Dapper.AOT is separate tooling, not implied by this reference. [project][dapperproject], [command source][dappercommand]
- Sources: official Microsoft docs plus tagged dotnet/Dapper source. Microsoft Learn responses contain multiple monikers, including .NET 11; only selected-version sections support these cards. .NET 11 asynchronous-validation features are outside scope. Source inspection establishes procedures, not runtime compatibility or performance results.

## Shared packet and role

- Caller supplies assigned behavior/change mode, component paths and writable scope, selected endpoint style/data library, public signatures/routes/DTOs, validation/error/response goldens, identity/tenant source, schema revision, transaction/isolation/retry/idempotency rules, cancellation boundary and resource owner. Repair gets supplied diagnosis; new feature gets behavior, without invented diagnosis prerequisite.
- Caller supplies exact SDK/C# language version/TFM/runtime/ASP.NET/package/provider/driver/DB pins, RID and CoreCLR/trimmed/Native AOT target; prepared dependencies/configuration, existing registration seams, check entrypoints/working directory, expected outcomes and artifact destinations. Incidental package references do not select variants.
- Charlie chooses private helpers, query shape, parameter objects, DTO mapping implementation and fixtures within supplied behavior. Can correct implementation mistakes inside scope. Missing material contract/version/ownership fact returns focused blocker; project discovery/diagnosis, public-contract redesign, architecture selection and independent review stay upstream.
- Technical scope selects cards; authorization remains caller/host-owned. Consume existing harness/Atlas facilities. No blanket repository/service/DI layers, permission edits, loader/router construction or harness rebuild. Executing assigned checks is evidence collection, not self-review or approval.
- Prospective tools only: **B** = prepared `dotnet build <project> --no-restore`; **H** = assigned HTTP/DB/host test entrypoint, e.g. `dotnet test <tests> --no-restore --filter <assigned-filter>`; **P** = assigned `dotnet publish <project> --no-restore -c Release -r <RID>` plus published-artifact checks. Caller fixes permitted environment/objectives; Charlie may choose bounded flags/fixtures. None run during research.

## Same task across endpoint styles and data libraries

Illustrative caller-supplied `OrderTxn`, not proposed application contract: existing SQL Server schema/version/driver packet; `POST /orders` accepts `CreateOrder(sku, quantity, note)`, quantity positive. Use supplied tenant identity and pricing rule. Atomically decrement stock only when enough remains, insert order, insert existing outbox record. Insufficient stock maps to frozen 409 problem; malformed/invalid input to frozen 400. Return 201, `Location: /orders/{id}`, `OrderDto` with supplied camelCase names, decimal total, explicit nullable note and string state. Outbox dispatch already belongs to selected worker design.
Atomicity covers stock + order + outbox. Packet specifies isolation, stable IDs and replay policy; example permits no automatic request replay. For these compositions, operation owns transaction; DI owns injected EF context, Dapper factory transfers connection ownership. Same task uses same prepared DB/schema and wire goldens in every row.

| Composition | HTTP procedure | Transaction procedure |
| --- | --- | --- |
| Minimal + EF (B8/B9/B10) | C1 validation branch; `TypedResults.Created(uri, dto)` plus supplied problem results. | C3: explicit transaction, conditional `ExecuteUpdateAsync`, check affected row, add order/outbox, `SaveChangesAsync`, commit. |
| Controllers + EF (B8/B9/B10) | C2 MVC binding/model-state pipeline; `ActionResult<OrderDto>` and `Created(uri, dto)`. | Same C3 unit of work; HTTP style does not make context thread-safe. |
| Minimal + Dapper (B8/B9/B10) | Same C1 wire contract; HTTP token passed into C4. | C4: open owned connection, begin transaction, parameterized conditional update and inserts; every command receives same transaction/token. |
| Controllers + Dapper (B8/B9/B10) | Same C2 wire contract; action token passed into C4. | Same C4; MVC action lifetime does not create database transaction. |

Conditional update predicate includes tenant + SKU + sufficient quantity. Charlie may choose equivalent safe query implementation; row-count/conflict semantics stay frozen. `ExecuteUpdate` bypasses tracking and executes immediately; later `SaveChanges` cannot retroactively include it in its automatic transaction. [EF bulk operations][efbulk]

## Concrete variant cards

### C1 — Minimal API endpoint implementation
- **Apply / non-trigger:** caller assigns `MapPost`/route-handler behavior on B8/B9/B10. Controller-only action, worker-only change, or unrelated ASP.NET dependency does not trigger.
- **Supplied:** shared packet plus endpoint signature/binding sources, endpoint-group conventions, selected validation mechanism and its registration/assembly facts, result/status metadata and HTTP JSON options.
- **Steps:** B8/B9 implement/invoke selected explicit handler/filter validator before writes. B10 retains caller's selected validator; when built-in validation is selected, consume prepared `AddValidation` path and discoverable metadata. Missing metadata can let invalid input reach handler. Treat JSON binding errors separately from semantic validation. Cross-assembly types need owner-prepared generation/registration. [validation][validation], [filter10][filter10]
- **Steps:** bind `CancellationToken` from request; propagate through awaited work. Emit prescribed `TypedResults` and, when signature allows, `Results<Created<OrderDto>, ValidationProblem, ProblemHttpResult>` union. Preserve metadata for automatic/filter errors as well as handler branches; result unions alone do not document whole pipeline. [binding][binding], [results][results]
- **Manual / generated:** manual handler, private validation/mapping and fixtures; selected Request Delegate Generator emits binding glue, B10 validation generator emits metadata. Neither generates business rules or transaction policy.
- **Tools / output:** B + H → scoped endpoint diff, generated artifacts only per caller policy, actual 201/400/409 HTTP evidence and metadata checks.
- **Local / blocker:** choose private validator/helper layout; missing style/version/validation ownership or incompatible shared DTO generation goes upstream. Do not suppress diagnostics or redesign public DTO to conceal mismatch.
- **Assigned checks:** V + R + C below; B10 negative metadata/registration control, B8/B9 invalid-but-parseable input control.

### C2 — Controller action implementation
- **Apply / non-trigger:** assigned MVC `ControllerBase` action on B8/B9/B10. Minimal route handler does not acquire MVC behavior by sharing DTO attributes.
- **Supplied:** shared packet plus route/action signature, `[ApiController]` status, `ApiBehaviorOptions` suppression/custom-response settings, formatter/content-negotiation rules and controller JSON options.
- **Steps:** preserve selected binding attributes and model-state short circuit when enabled; otherwise use supplied explicit validation path. Manual domain checks follow successful binding. Return supplied 201/Location/DTO with MVC result helpers and matching response metadata; use established validation/problem factory for frozen error shape. [controllers][controllers], [mvc8][mvc8]
- **Steps:** action `CancellationToken` binds `HttpContext.RequestAborted`; thread into C3/C4. MVC `AddJsonOptions` and Minimal `ConfigureHttpJsonOptions` are different options paths. `HttpResults` also work in controllers but bypass configured MVC formatters; do not substitute silently. [mvcct][mvcct], [json][json], [actionresults][actionresults]
- **Manual / generated:** manual action/DTO mapping/fixtures; MVC binding/filter/result execution is framework runtime behavior, not generated business code. C5 supplies JSON source generation only when selected.
- **Tools / output:** B + H → scoped action diff and real-pipeline response/binding evidence, including automatic 400 branches that direct action calls bypass.
- **Local / blocker:** choose private mappings and action-internal structure; supplied contract inconsistent with global formatter/filter behavior requires upstream decision, not global option changes.
- **Assigned checks:** V + R + C; compare Minimal and MVC goldens, including `Content-Type`, property names and approved negotiation behavior.

### C3 — EF Core transactional persistence
- **Apply / non-trigger:** assigned relational EF unit of work, source comparators 8.0.0/9.0.0/10.0.12. Dapper-only task or EF package elsewhere does not trigger.
- **Supplied:** shared packet plus entity/model/schema revision, provider pins, context/factory ownership, tracking/concurrency tokens, isolation and configured execution strategy. Version determines translated SQL capabilities; successful C# compilation is insufficient.
- **Steps:** await context operations sequentially. One scoped context is not concurrent-safe; `Task.WhenAll` on its queries/writes remains invalid. Factory-created context is caller-code-disposed; injected scoped context belongs to DI. [context][context], [efdetector][efdetector]
- **Steps:** for `OrderTxn`, begin owned transaction before conditional stock update; require affected row; avoid stale tracked stock overwrites; add order/outbox, save, commit; asynchronously dispose owned transaction on every exit. A single ordinary `SaveChanges` is already atomic under supporting provider, but this multi-operation task needs explicit boundary. Borrowed transaction is neither committed nor disposed locally. [transactions][transactions], [efbulk][efbulk]
- **Steps:** pass token to query/write/transaction APIs; provider cancellation support varies. If existing retrying execution strategy applies, whole transaction must be replayed through supplied strategy with approved replay semantics; do not retry individual writes or infer rollback after ambiguous commit. [efasync][efasync], [transactions][transactions]
- **Manual / generated:** manual LINQ, mapping, transaction and outcome handling; EF translates SQL at runtime. Migrations/compiled models only if separately assigned and prepared, not incidental output of this card.
- **Tools / output:** B + H against actual selected relational DB → implementation/query diff, atomicity/concurrency evidence. **Local:** choose projection/predicates/helper shape. **Blocker:** unknown provider compatibility, ownership or replay semantics.
- **Assigned checks:** T + C; last-stock race uses independent request contexts; deliberate overlapping-operation control exercises same-context restriction.

### C4 — Dapper connection/transaction implementation
- **Apply / non-trigger:** selected classic Dapper 2.1.66 command/query path on B8/B9/B10. EF-only unit of work or Dapper.AOT request does not select this recipe automatically.
- **Supplied:** shared packet plus ADO.NET provider/version, SQL dialect, schema, row/column mapping, command timeout, and owned versus borrowed connection/transaction contract.
- **Steps:** owned connection: `OpenAsync(ct)` → begin transaction → conditional update/row-count check → order/outbox inserts → commit; await disposal on every exit. Pass token to transaction APIs according to supplied cancellation boundary; cleanup uses separate bounded owner policy. Use `new CommandDefinition(sql, args, transaction: tx, cancellationToken: ct)` for each Dapper async command. SQL values are parameters; database null/decimal handling follows frozen mapping. [command][dappercommand], [async][dapperasync]
- **Steps:** keep reader/stream enumeration inside connection lifetime. Dapper's open-if-closed/close-if-opened behavior does not create multi-command transaction or transfer disposal ownership. Borrowed connection/transaction stays owner-managed; mixed EF/Dapper work must share actual connection and transaction, not merely connection string. [async][dapperasync], [transactions][transactions]
- **Manual / generated:** manual SQL, parameters, mapping and resource/transaction boundary. Classic Dapper materializes results at runtime; no generated repository or migration required.
- **Tools / output:** B + H with selected provider → bounded SQL/handler diff, affected-row and rollback evidence, release/ownership evidence.
- **Local / blocker:** choose SQL layout, projections and parameter objects; unknown dialect, transaction owner, timeout/cancellation expectations or proposed Native AOT compatibility goes upstream.
- **Assigned checks:** T + C; negative controls omit transaction on one command, replace token with default, or dispose borrowed connection. Require meaningful failure under selected provider, not presumed generic exception.

### C5 — System.Text.Json contract/source-generation implementation
- **Apply / non-trigger:** assigned JSON wire/payload change or already-selected source-generated/trimmed/AOT serialization path. Newtonsoft.Json-only, pure SQL or worker scheduling changes do not trigger merely because STJ is referenced.
- **Supplied:** shared packet plus serializer call sites/resolver ordering, exact STJ pin, request/response/collection/polymorphic roots, runtime types behind `object`, error-extension payloads, names/null/numeric/enum/converter rules and generated-file policy.
- **Steps:** ordinary reflection-backed STJ assignment updates supplied DTO/converter/options path without introducing generator. When source generation is selected, write context declarations/attributes; wire context into actual Minimal HTTP options or MVC formatter options, and explicit non-HTTP serializer calls. Ensure chain covers every exercised body, including errors; framework metadata may cover built-in problem types. [JSON][json], [generator][jsongen]
- **Steps:** generated path needs metadata mode or both modes for request deserialization and streaming; fast-path-only is no generated JSON reader. Preserve options consistently with wire goldens. B8's STJ 8 cannot use STJ 9 enum-name attribute; B10 custom converters must handle `HasValueSequence`/`ValueSequence` as well as `ValueSpan`. [JSON][json], [pipes][pipes]
- **Manual / generated:** manual DTO/context declarations, converters, integration and fixtures; reflection path discovers contracts at runtime. Selected generated path emits `JsonTypeInfo<T>` plus eligible fast-path writers. JSON metadata is distinct from B10 validation metadata and Request Delegate Generator output.
- **Tools / output:** B + H; P only for assigned publish target → context/integration diff, generated output per policy, actual request/response goldens and published-RID evidence. CoreCLR success does not establish Native AOT compatibility.
- **Local / blocker:** choose private converter/helper implementation and edge fixtures; unknown polymorphic set or public representation goes upstream. MVC Native AOT is unsupported in compared ASP.NET profiles; EF Native AOT remains experimental, classic Dapper has dynamic-code paths. STJ context does not make whole selected stack AOT-compatible. [AOT][aot], [EF AOT][efaot], [Dapper source][dappercommand]
- **Assigned checks:** R for either path; J for selected generated path with prepared reflection-disabled known-root positive and isolated missing-root negative; B10 multi-segment converter fixture for either path.

### C6 — Cancellation and background-service lifetime
- **Apply / non-trigger:** assigned existing hosted worker/item processing or request-to-existing-durable-job handoff on B8/B9/B10. Request-only endpoint does not justify adding queue/worker; request cancellation still uses C1/C2+C3/C4.
- **Supplied:** shared packet plus chosen host/queue/outbox API, startup/readiness hook, concurrency limit, job payload, claim/ack/retry rules, shutdown deadline, per-item scope ownership and cancellation-after-admission semantics.
- **Steps:** persist admitted work through existing transaction contract; pass durable IDs/data, not `HttpContext`, request-scoped context or request token into detached work. Hosted service is singleton: create/dispose async scope per item/unit of work or use supplied context factory; await owned operations before releasing scope. [scoped worker][scoped]
- **Steps:** worker uses `stoppingToken` plus supplied job/deadline tokens, not original HTTP disconnect token. Cleanup needs owner-defined bounded policy; canceled request token is not reliable rollback/cleanup budget. Cancellation is cooperative, and commit may already have succeeded.
- **Version step:** B8/B9 synchronous prefix of `ExecuteAsync` runs in startup call; B10 entire method runs on background task. Required readiness belongs in supplied `StartAsync`/lifecycle hook, not assumed pre-first-await work. Keep long-lived work represented by returned task. [host8][host8], [host9][host9], [host10][host10]
- **Manual / generated:** manual worker loop, scopes, token linkage and existing job adapter; no generator invents durability, exactly-once delivery or retry policy.
- **Tools / output:** B + H host/DB integration → worker diff and startup/shutdown/scope evidence. **Local:** private batching/helpers/fixtures within fixed concurrency/ack semantics. **Blocker:** missing durable owner, readiness or shutdown policy.
- **Assigned checks:** W + C; compare request abort before commit versus after durable admission; independent live scopes for concurrent items, disposal after awaited work.

## Wrong transfers to reject

| Tempting transfer | Concrete failure / correct instruction |
| --- | --- |
| “DataAnnotations automatically reject every Minimal request like `[ApiController]`.” | B8/B9 need explicit selected validator; B10 needs registration plus usable metadata. Valid JSON with quantity 0 must exercise semantic rejection before writes. |
| “Request-scoped DbContext makes `Task.WhenAll` safe.” | Scope controls lifetime, not concurrent access. Serialize operations; separate contexts need separate units of work or explicitly shared transaction design. |
| “Async methods/canceled HTTP request guarantee DB rollback.” | Dapper SQL argument `{ cancellationToken = ct }` is not `CommandDefinition.CancellationToken`; EF/provider may not honor token. Commit/disconnect race may leave committed state. Preserve owner's outcome/reconciliation policy. |
| “EF SaveChanges atomicity transfers to prior bulk SQL or Dapper commands.” | Earlier `ExecuteUpdate` needs explicit encompassing transaction; each Dapper command must enlist same owned/borrowed transaction. Same connection string does not mean same transaction. |
| “Source-generate `OrderDto` and Native AOT is done.” | Request/collection/polymorphic/error roots and actual resolver path still matter; fast-path-only cannot deserialize. MVC/data-library compatibility is separate upstream fact. |
| “Return same C# object/result helper in either HTTP style.” | Bare Minimal DTO defaults to 200, losing 201/Location; MVC `IActionResult` is not Minimal `IResult`. Controller `HttpResults` bypass MVC formatters. Assert actual wire shape, not helper name or OpenAPI alone. |

## Proposed selection cases and assigned checks — UNEXECUTED

Selection positives: supplied B8 Minimal+EF8 `OrderTxn` → C1+C3; B9 controllers+Dapper → C2+C4; B10 Minimal+EF10+generated JSON → C1+C3+C5; supplied worker-only processing → C6 plus assigned persistence card. Same endpoint/data choice composes across supported baselines; no Cartesian-product skill duplication.
Selection negatives: JSON-only assignment with incidental EF reference → C5, not C3; plain Dapper reference → not Dapper.AOT; B8 packet → not B10 validation APIs; MVC+Native AOT conflict or omitted endpoint style → upstream blocker, not repository scan/framework migration. Existing controller without `[ApiController]` must not receive automatic-400 assumptions.
Following controls are future assignments. Charlie returns raw evidence and scoped fixes; independent reviewer/lead decides acceptance. Use actual endpoint/host/provider path, seeded positive fixture and deliberately broken isolated control; empty selection/skipped fixture is not success.

| ID / assigned owner | Positive behavior and negative control |
| --- | --- |
| V — endpoint implementer | Valid order reaches writes; syntactically valid quantity 0/nested invalid input gives frozen 400 with DB unchanged. Exercise real pipeline. Remove selected validator/B10 registration or metadata in isolated fixture: invalid input now reaching handler must fail contract check. Malformed JSON alone cannot prove validation. |
| R — endpoint/JSON implementer | Verify 201, Location, content type and golden body: decimal, null note, enum spelling, no entity/navigation leakage; verify 400/409 bodies separately. Replace Created with bare DTO or alter naming/options in isolated fixture: wire assertion fails. Assert assigned response metadata separately. |
| T — persistence implementer | Successful order commits stock/order/outbox; failure after stock update but before final insert leaves seeded state unchanged. Two requests compete for last unit: one success, one conflict, one order/outbox. Cross-tenant fixture remains isolated. Remove transaction/enlistment: rollback check fails or provider rejects command. EF-only controlled overlap of real operations on one context must expose unsupported concurrency; normal path awaits sequentially. |
| C — endpoint/persistence implementer | Controlled provider operation held before commit: abort real HTTP request, verify supplied cancellation outcome and resource release with prepared provider. Omit propagated token in isolated control: cancellation observation/bounded-release assertion fails. Separate abort-after-commit fixture verifies committed result is not described as rollback; supplied reconciliation policy handles ambiguous commit. |
| J — JSON implementer | Prepared `JsonSerializerIsReflectionEnabledByDefault=false`; assert runtime flag. Known roots round-trip through actual HTTP path; isolated unregistered `ProbeOnlyRoot` via context overload rejects missing metadata. Cover collection/polymorphic/error paths; B10 converter reads multi-segment value. If assigned AOT, repeat on published RID artifact, not only CoreCLR tests. |
| W — worker implementer | Host startup/readiness barrier behaves under selected hosting version; stop interrupts delay/work and awaits disposal. Concurrent items hold independent live scopes; admitted outbox work survives original request disposal. Isolated captured request context, dropped stopping token or readiness placed only before first await in B10 must fail corresponding scope/shutdown/startup assertion. |

## Extraction recommendation

Author shared implementation-scope/packet guidance first; C# runtime ownership/cancellation rule next. Keep C1/C2 as endpoint-style references with version branches, C3/C4 as persistence references, C5/C6 as narrow cross-cutting recipes. Compose one selected endpoint card + selected data card + only assigned JSON/worker overlays. R40 supplies source-generator leaf detail; R55 supplies framework/lifetime transfer boundaries. This is descriptive composition, not implemented inheritance/router/permission machinery.

## Primary sources inspected

[brief]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/skill-variants-plan.md
[lead]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/40-jvm-dotnet.md
[validation]: https://github.com/dotnet/AspNetCore.Docs/blob/c680a4e48c897413c82b15a756cd0cd8e1899adc/aspnetcore/release-notes/aspnetcore-10/includes/ValidationSupportMinAPI.md
[filter10]: https://github.com/dotnet/aspnetcore/blob/cb21a42eafcd44cc35fad48d99dc82ff7512ce2f/src/Http/Routing/src/ValidationEndpointFilterFactory.cs
[controllers]: https://learn.microsoft.com/en-us/aspnet/core/web-api/?view=aspnetcore-8.0
[mvc8]: https://github.com/dotnet/aspnetcore/blob/v8.0.0/src/Mvc/Mvc.Core/src/Infrastructure/ModelStateInvalidFilter.cs
[mvcct]: https://github.com/dotnet/aspnetcore/blob/v9.0.0/src/Mvc/Mvc.Core/src/ModelBinding/Binders/CancellationTokenModelBinder.cs
[binding]: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/parameter-binding?view=aspnetcore-9.0
[results]: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/responses?view=aspnetcore-9.0
[actionresults]: https://learn.microsoft.com/en-us/aspnet/core/web-api/action-return-types?view=aspnetcore-9.0#httpresults-type
[efversions]: https://learn.microsoft.com/en-us/ef/core/what-is-new/
[context]: https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/
[efdetector]: https://github.com/dotnet/efcore/blob/001bfac21c1910cdf1110ca256c9ea0a06f374ca/src/EFCore/Infrastructure/Internal/ConcurrencyDetector.cs
[transactions]: https://learn.microsoft.com/en-us/ef/core/saving/transactions
[efbulk]: https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete
[efasync]: https://learn.microsoft.com/en-us/ef/core/miscellaneous/async
[dapperproject]: https://github.com/DapperLib/Dapper/blob/bd4f75b512de3e00f2c2631d5309961a1ecfea23/Dapper/Dapper.csproj
[dappercommand]: https://github.com/DapperLib/Dapper/blob/bd4f75b512de3e00f2c2631d5309961a1ecfea23/Dapper/CommandDefinition.cs
[dapperasync]: https://github.com/DapperLib/Dapper/blob/bd4f75b512de3e00f2c2631d5309961a1ecfea23/Dapper/SqlMapper.Async.cs#L653-L670
[json]: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation
[jsongen]: https://github.com/dotnet/runtime/blob/4271d88e0aebf3d04f188f1334c2220d80555ef6/src/libraries/System.Text.Json/gen/JsonSourceGenerator.Roslyn4.0.cs
[pipes]: https://github.com/dotnet/AspNetCore.Docs/blob/c680a4e48c897413c82b15a756cd0cd8e1899adc/aspnetcore/includes/net10pipereader.md
[aot]: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/native-aot?view=aspnetcore-10.0
[efaot]: https://learn.microsoft.com/en-us/ef/core/performance/nativeaot-and-precompiled-queries
[scoped]: https://learn.microsoft.com/en-us/dotnet/core/extensions/scoped-service
[host8]: https://github.com/dotnet/runtime/blob/v8.0.0/src/libraries/Microsoft.Extensions.Hosting.Abstractions/src/BackgroundService.cs
[host9]: https://github.com/dotnet/runtime/blob/v9.0.0/src/libraries/Microsoft.Extensions.Hosting.Abstractions/src/BackgroundService.cs
[host10]: https://github.com/dotnet/runtime/blob/4271d88e0aebf3d04f188f1334c2220d80555ef6/src/libraries/Microsoft.Extensions.Hosting.Abstractions/src/BackgroundService.cs
