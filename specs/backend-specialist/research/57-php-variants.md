# R57 — PHP / Laravel / Symfony implementation variants

Research snapshot: **2026-10-04**. **Source-only; every example, generator command, selection case and assigned test below remains unexecuted.** Research pins describe API evidence, not a resolved or exercised application environment.
Metadata worktree: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/backend-r57-php-variants`; `git rev-parse --show-toplevel HEAD` returned its `/private/var/...` equivalent and **`76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`**, matching requested baseline.
Frozen inputs read: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md` and sibling `42-web-backends.md` (R42). Source worktree HEAD also matched baseline.

## Family, exact pins and selection boundary

| Component / research pin | Primary evidence and relevant support boundary |
|---|---|
| **PHP 8.4.26**, released Sep 24, 2026 | [Release metadata][php-release]; [support calendar][php-support]: 8.4 active through Dec 2026, security through Dec 2028. Common runtime for both packets. PHP 8.2/8.3 remain security-supported; 8.5 also supported. |
| **Laravel 13.34.0**, released Sep 29 | [Release][laravel-release], [tagged manifest][laravel-meta]: PHP `^8.3`; Eloquent, validation, authorization and queue APIs pinned to same framework tag. [13.x support][laravel-support] through Mar 17, 2028 for security. Laravel 12 remains security-supported through Feb 24, 2027; do not assume every 13.34 API exists in an arbitrary 12.x pin. |
| **Symfony 7.4.20 LTS** | [Release calendar][symfony-release]: PHP >=8.2; bugs through Nov 2028, security through Nov 2029. HttpKernel, Serializer, Validator, Security and Messenger references below use **v7.4.20**. Current stable **8.1.8** requires PHP >=8.4 and support ends Jan 2027; 8.2 is development, not this packet. |
| **Doctrine ORM 3.7.3**, **Migrations 3.9.7** | [ORM manifest][orm-meta] accepts PHP `^8.1`, DBAL `^3.8.2 || ^4`, Symfony Console 7/8; [Migrations current docs][migration-ddl]. Doctrine packages have their own versions; Symfony version does not select them automatically. |
| **Laravel Octane 2.20.0** | [Tagged manifest][octane-meta] accepts Laravel 10–13 and PHP `^8.1`; packet inherits Laravel 13's higher PHP floor. Worker engine/binary and server mode must already be supplied. |
| **PostgreSQL 18.6** | [Primary release notes][postgres-release], released Aug 13, 2026. Reference transaction/migration fixture below; SQLite substitution does not establish row-lock behavior. |

Select from **assigned component**, behavior and supplied versions. Laravel's own manifest includes Symfony HttpKernel/HttpFoundation; their presence does not select Symfony controller/Messenger procedures. Full lockfile, extensions, bundle/transport versions and initialized test tools remain caller inputs.
R42 lead transfers: payload typing, validation and application authorization are separate; scaffolds leave business rules manual. Its Spatie Laravel Data **4.23.0** recipe composes only when that DTO boundary is explicitly assigned; it does not replace FormRequest automatically or justify installing Data.
Application authorization below implements **given product policy**. Maestro/caller tool permissions and file scope remain separate, host-enforced inputs. The backend specialist owns local coding and scoped corrections; architecture/stack choice, investigation/diagnosis and independent review stay upstream. Existing harness/Atlas supplies execution capability; these cards are descriptive research, not a loader or permission mechanism.

## Shared reference assignment T — same transactional endpoint and receipt job

These are **hypothetical supplied packets**, not findings about an application in this repository. Both stacks receive identical product behavior; only existing stack mechanics differ.
- Implement `POST /orders/{order}/submit` (`order` is UUID), JSON `{"expectedVersion":4}`. Consume only `expectedVersion`; ignore other fields, never assign client tenant/status/recipient. Require JSON integer >=1; reject `"4"`, `4.5`, `true`, null and omission with 422.
- Existing order: UUID `id`, immutable `tenant_id`, `draft|submitted` status, integer `version`, stored recipient. Same-tenant editor may submit. Anonymous 401; authenticated wrong tenant/noneditor 403; missing order 404; repeat/stale version 409. Access-denial cases use valid bodies; mixed-invalid precedence follows supplied API contract.
- Under one outermost DB transaction, lock/reload order, enforce policy and draft/version condition, set submitted status and UTC `submitted_at`, increment version. Return 200 `{id,status:"submitted",version:5}` only after commit and successful queue submission. Denial/conflict/DB failure changes nothing and schedules nothing.
- Schema subtask: add nullable `submitted_at`, SQL `timestamp(0) without time zone`, UTC by supplied convention; old rows remain null. No historical backfill. Reverse migration removes only that column; deployment/rollback window is supplied.
- Schedule `SendReceipt(orderId)` on existing `receipts` queue **after commit**. Worker reloads stored tenant/recipient from writer DB; these values remain immutable after submission. Supplied sender honors key `receipt:<order-id>:v1`; duplicates must reuse key. Missing order is permanent failure. Transient delivery error: **3 total attempts**, fixed **10-second** retry delay, then existing failed-job store/transport.
- Supplied reliability contract is committed-only dispatch, not atomic DB-plus-broker admission. Commit→publish crash/failure gap remains; existing owner recovery/error behavior handles it. An assignment demanding atomic admission needs an already-chosen durable mechanism from owner, not a silently invented outbox.
- Both packets supply actor lookup, registered policy/voter, JSON-only route and error envelope, models/entities, outermost transaction ownership, PostgreSQL fixture, sender interface, exact file allowlist and existing HTTP/concurrency/worker/migration test fixtures. Laravel packet has Redis queue; Symfony packet has routed AMQP transport with `auto_setup=false`, pre-created topology, Serializer type metadata and Validator enabled. Transport endpoints/versions and retry settings are supplied, not provisioned by the backend specialist.

| T operation | Laravel 13.34.0 path | Symfony 7.4.20 + Doctrine 3.7.3 path |
|---|---|---|
| HTTP boundary | Container resolves FormRequest; `authorize()` delegates to policy; `validated()` selects input | `#[MapRequestPayload]` maps/validates DTO; voter is a separate explicit authorization step |
| Persist transition | `DB::transaction` + Eloquent `lockForUpdate()` + explicit `save()` | `EntityManager::wrapInTransaction` + `find(..., LockMode::PESSIMISTIC_WRITE)` + entity mutation; wrapper flushes |
| Publish receipt | Register queued job's `afterCommit()` inside transaction | For this direct-action packet, dispatch through `MessageBusInterface` **after** outermost `wrapInTransaction()` returns |
| Retry budget | Job `$tries = 3`; `$backoff = 10` seconds | Transport `max_retries: 2`; `delay: 10000` milliseconds; `multiplier: 1`, `jitter: 0` |
| Reused process | Octane/`queue:work`: explicit per-call state or lifecycle-scoped binding | Messenger: stateless handler/services or registered `ResetInterface::reset()` |

## Card 1 — Laravel FormRequest → policy → Eloquent action

- **Trigger / non-trigger:** assigned Laravel 13.34 HTTP mutation using FormRequest/Eloquent. Not standalone Illuminate use, Symfony route, or an already-selected Data-only DTO task.
- **Supplied scope/facts:** T HTTP behavior, authenticated route, `OrderPolicy::submit` registration, route-model binding, immutable tenant, action and request/controller/model allowlist. Authentication infrastructure already exists.
- **Steps:** (1) Author request rule `['expectedVersion' => ['required', 'integer:strict', 'min:1']]`; do not cast before validation. (2) `authorize()` calls `$this->user()->can('submit', $this->route('order'))`; policy implements supplied tenant/editor rule. (3) Controller passes `validated('expectedVersion')` plus actor/ID into action; action rechecks policy on locked row, applies T via Card 3 and schedules Card 4. Select response fields explicitly. [Request][form-request], [resolution order][form-resolution], [integer implementation][laravel-validation], [policy delegation][authorizable].
- **Tools / output:** proposed `php artisan make:request SubmitOrderRequest` emits `app/Http/Requests/SubmitOrderRequest.php`; edit supplied `app/Policies/OrderPolicy.php`, `app/Actions/SubmitOrder.php`, `app/Http/Controllers/SubmitOrderController.php`. Native [request stub][request-stub] starts with `authorize()` returning `false` and empty rules: generated class is not finished behavior.
- **Manual / generated:** request shell generated; rules, policy, transaction, response and HTTP tests authored. Existing Eloquent model reused; no new model/CRUD family inferred.
- **Actual wrong transfer:** copying “typed DTO constructor validates input” into `new SubmitOrderInput((int) $request->input('expectedVersion'))` admits `"4"` and truncates `4.5`. Plain Laravel `integer` also accepts integer strings; `integer:strict` uses `is_int` at this pin. Conversely, retaining generated `authorize()` returning `false` denies valid editor.
- **Local judgment:** rule placement, field projection, action structure and scoped error mapping; caller need not supply each helper or query expression.
- **Upstream blocker:** unspecified product access matrix, binding/guard identity or unprovided error contract. **Assigned check L1, unexecuted:** `vendor/bin/phpunit tests/Feature/SubmitOrderTest.php`; valid editor→200/version 5; strict-type failures→422; other tenant/noneditor→403; denial leaves DB/queue unchanged; injected tenant/status/recipient ignored. Positive editor case catches untouched scaffold; string/fraction cases catch coercion transfer.

## Card 2 — Symfony mapped DTO → Validator → Security voter → Doctrine

- **Trigger / non-trigger:** T assigned to Symfony 7.4.20 controller with configured Serializer/Validator and Doctrine. Not Symfony Form submission, API Platform operation, Laravel's transitive Symfony dependency, or Symfony 5.4: [MapRequestPayload was introduced in 6.3][mapping-introduction].
- **Supplied scope/facts:** T route/actor, serializer property-type metadata, voter registration/decision strategy, JSON error envelope, entity/repository and controller/DTO/voter/action allowlist.
- **Steps:** (1) Manually define `SubmitOrderInput` constructor with `#[Positive] public readonly int $expectedVersion` (`Symfony\Component\Validator\Constraints\Positive`), no coercing normalizer. (2) Inject `#[MapRequestPayload(acceptFormat: 'json')] SubmitOrderInput $input`; JSON route format ensures API response rendering. (3) Explicitly call `denyAccessUnlessGranted('ORDER_SUBMIT', $order)` using supplied voter; action repeats policy on freshly locked entity, then Card 3. Only DTO field reaches mutation; never denormalize body into managed Order. [Payload attribute][map-payload], [resolver][payload-resolver], [type enforcement][serializer-types], [security call][symfony-controller].
- **Tools / output:** direct edits to `src/Dto/SubmitOrderInput.php`, `src/Controller/SubmitOrderController.php`, `src/Security/OrderVoter.php`, `src/Application/SubmitOrder.php`. No generator required; native controller resolver and container supply runtime mapping/validation, not business source.
- **Manual / generated:** DTO constraints, voter, action and JSON field projection authored; compiled container/framework metadata is runtime tooling output, not generated endpoint logic.
- **Actual wrong transfer:** adding Laravel-style `public function authorize(): bool` to DTO does nothing; MapRequestPayload never calls it. `#[MapRequestPayload]` alone does not authorize. Replacing Eloquent `save()` with `$em->persist($order); return $this->json(...)` without flush/transaction wrapper can return success without DB update.
- **Local judgment:** DTO names, constructor shape, repository query and domain-exception mapping; keep supplied policy/error contract intact.
- **Upstream blocker:** missing serializer type metadata/Validator/security registration or unspecified access decision semantics. **Assigned check S1, unexecuted:** `vendor/bin/phpunit tests/Functional/SubmitOrderTest.php`; same T cases as L1, plus fresh connection confirms persisted transition. Malformed JSON→400 and unsupported media→415 follow supplied envelope; constraint/type errors→422. Wrong-tenant valid DTO specifically catches inert `authorize()` method.

## Card 3 — transaction + migration, Active Record versus Unit of Work

- **Trigger / non-trigger:** assigned T persistence/schema delta on supplied PostgreSQL 18.6 fixture. Not read-only serialization, schema discovery, database choice, backfill planning or deployment rollout design.
- **Supplied scope/facts:** T timestamp delta, existing plain integer version (not Doctrine `#[Version]`), transaction ownership, connection, model/entity metadata, migration output allowlist and rollback window.
- **Steps, Laravel:** in `DB::transaction(...)`, issue fresh `Order::query()->whereKey($id)->lockForUpdate()->firstOrFail()`, check policy/status/version, assign timestamp/status/version and call `save()`. Closure may rerun when an assigned retry count permits concurrency retries: reload inside each attempt and keep external sender outside. PHP object mutations do not roll back automatically. [Transaction implementation][laravel-tx].
- **Steps, Doctrine:** inside `$em->wrapInTransaction(...)`, `find(Order::class, $id, LockMode::PESSIMISTIC_WRITE)` obtains/reloads locked entity (`Doctrine\DBAL\LockMode`); handle null as 404, check same facts and mutate. Wrapper calls `flush()` before commit; DBAL `Connection::transactional()` alone does not flush ORM changes. Failure closes EntityManager and detaches objects: discard mutated instances; further unit of work requires supplied manager-reset/reacquisition path. [Exact EntityManager source][entity-manager], [transaction distinction][doctrine-tx].
- **Tools / output:** Laravel `php artisan make:migration add_submitted_at_to_orders_table --table=orders` emits `database/migrations/<timestamp>_add_submitted_at_to_orders_table.php`; author `$table->timestamp('submitted_at', 0)->nullable()` and reverse drop. Symfony: author nullable `datetime_immutable` mapping, then existing `php bin/console doctrine:migrations:diff` emits `migrations/Version<timestamp>.php`; inspect SQL for exactly supplied column/type/nullability and reverse. [Laravel stub][migration-stub], [Doctrine diff source-doc][migration-diff].
- **Manual / generated:** Laravel emits blank up/down scaffold, not schema inference. Doctrine emits schema-diff SQL, not backfill/business design; generated drops of unrelated/unmapped tables must not enter assigned change. Mapping, casts, mutation and migration corrections remain manual.
- **Actual wrong transfer:** `$order->status = 'submitted';` followed only by transaction return is not Eloquent Unit-of-Work flushing. Opposite transfer treats `persist()` as immediate `save()`. Treating every Doctrine `diff` statement as requested may include `DROP TABLE example_table`—shown in upstream example. Treating transactional migration flags as portable DDL rollback fails on MySQL implicit commits; return mismatched DB packet upstream. [DDL boundary][migration-ddl].
- **Local judgment:** lock query details, timestamp conversion and exact migration SQL within given delta; no caller-prewritten SQL prerequisite.
- **Upstream blocker:** ambient transaction or closed-manager recovery not specified; unexpected schema drift; missing DB fixture/rollout facts. **Assigned P1/P2, unexecuted:** `vendor/bin/phpunit tests/Integration/SubmitOrderTransactionTest.php` and `vendor/bin/phpunit tests/Integration/SubmissionMigrationTest.php` in each supplied application. Independent connections: simultaneous same-version submissions→one 200, one 409, one queued receipt. Forced failure before commit leaves old row/no receipt; successful fresh read catches missing save/flush. Migration fixture checks old row retained/null, new timestamp round-trip, unchanged unrelated table, scoped reverse migration.

## Card 4 — Laravel queued job and transaction callback

- **Trigger / non-trigger:** T receipt implementation using Laravel 13.34 queue and existing Redis connection. Not synchronous dispatch, post-response work, choosing a broker or provisioning queue infrastructure.
- **Supplied scope/facts:** T sender/idempotency key, queue `receipts`, three total attempts, 10-second delay, failed-job storage, writer DB and existing worker fixture. No overriding `retryUntil()` or custom exception policy that changes budget.
- **Steps:** generate `ShouldQueue` job; payload holds scalar order ID only. Inside T transaction, after `save()`, call `SendReceipt::dispatch($order->id)->onConnection('redis')->onQueue('receipts')->afterCommit()`. Author `handle(ReceiptSender $sender)` using `Order::query()->useWritePdo()->find($this->orderId)` and stable key; transient exception escapes; missing order calls `$this->fail('Order missing'); return;`. Set job `public int $tries = 3; public int $backoff = 10;`. [Queue callbacks/payload][laravel-queue], [root commit/rollback][laravel-tx-manager], [worker budget][laravel-worker], [permanent failure][queue-fail].
- **Tools / output:** proposed `php artisan make:job SendReceipt`→`app/Jobs/SendReceipt.php`; existing fixture drives `php artisan queue:work redis --queue=receipts`. [Queued stub][job-stub] supplies empty constructor/handle and Queueable trait; framework supplies serialization/retry machinery.
- **Manual / generated:** job shell generated; ID payload, lookup, sender call, permanent/transient split and attempts/backoff authored. Laravel can serialize Eloquent identifiers and reload relations; do not transfer that special handling to ordinary Symfony messages. [Model restoration][model-restoration].
- **Actual wrong transfer:** publishing to Redis directly inside DB transaction (`SendReceipt::dispatch($id)` with connection `after_commit=false`) can expose uncommitted/rolled-back work. `afterCommit()` fixes timing; it does not make DB commit and Redis publish atomic. Queue uniqueness is not sender idempotency.
- **Local judgment:** concise handler structure and error adaptation to given sender; retry budget, external-effect semantics and crash recovery stay supplied.
- **Upstream blocker:** unavailable initialized queue/worker fixture, missing sender idempotency support, or stronger atomic-admission requirement. **Assigned L2, unexecuted:** `vendor/bin/phpunit tests/Integration/ReceiptQueueTest.php`; real isolated transport observes empty queue before commit/after rollback and receipt after commit; repeated delivery uses same key. Missing order fails immediately without sender call; three thrown transient failures reach failed storage. Allow fixture to observe would-be fourth attempt. Queue fake or direct `handle()` invocation alone cannot establish these properties.

## Card 5 — Symfony Messenger routing, stamps and retries

- **Trigger / non-trigger:** T uses Symfony 7.4.20 Messenger with supplied AMQP `receipts` routing. Not plain synchronous service invocation, Laravel queue job, or creating a new bus/transport.
- **Supplied scope/facts:** T outermost direct-action transaction, `SendReceipt` route, auto-configured handler, pre-created transport with auto-setup disabled, failure transport, serializer and retry strategy already set to T.
- **Steps:** author scalar-ID message and `#[AsMessageHandler]` callable `__invoke(SendReceipt $message): void`; reload entity and use supplied sender/key. For T, `$em->wrapInTransaction(...)` returns committed ID/result; only then `$bus->dispatch(new SendReceipt($id))`. Unrouted messages run synchronously; a PHP class name or attribute marking handler does not create async delivery. [Messenger primary docs][messenger].
- **Bus-mediated subvariant only when supplied:** if existing synchronous command handler owns mutation under `doctrine_transaction`, dispatch child receipt with `DispatchAfterCurrentBusStamp`. Supplied `dispatch_after_current_bus` must precede `doctrine_transaction` and participate across involved buses; owner must exclude enclosing ambient DB transaction. That order drains children after middleware commit and discards them on parent failure. [Exact stamp middleware][after-bus], [Doctrine middleware][doctrine-bus].
- **Tools / output:** manually author `src/Message/SendReceipt.php` and `src/MessageHandler/SendReceiptHandler.php`; existing worker fixture uses `php bin/console messenger:consume receipts`. No generated business source; native bus/envelope/transport supplies dispatch and retry mechanics. Retry configuration is supplied input, not permission to edit runtime config.
- **Actual wrong transfer:** `$bus->dispatch(new SendReceipt($id), [new DispatchAfterCurrentBusStamp()])` **inside ordinary controller-owned `wrapInTransaction()`** is not Laravel `afterCommit()`: a root bus call strips stamp and proceeds before enclosing DB commit. Copying `$tries=3` into message is ineffective; `max_retries: 3` means four attempts, not three. T requires `max_retries: 2`, `delay: 10000`, `multiplier: 1`, `jitter: 0`. [Retry source][messenger-retry].
- **Manual judgment / limit:** choose message fields and exception adapter; ordinary transient exception obeys finite strategy. At 7.4.20, `RecoverableMessageHandlingException` bypasses `max_retries`; missing order uses `UnrecoverableMessageHandlingException` and supplied failure transport. Neither stamp nor post-commit dispatch closes commit→broker crash gap. [Retry/failure semantics][messenger-failures].
- **Upstream blocker:** unknown middleware order/transaction ownership, missing routing or wrong supplied retry settings. **Assigned S2, unexecuted:** `vendor/bin/phpunit tests/Integration/ReceiptMessengerTest.php`; assert committed visibility, rollback suppression, async receipt, same key on redelivery, exactly three transient handler attempts then failure transport. Stamp-inside-controller negative fixture must expose premature publish; bus-mediated fixture throws parent failure and observes suppressed child. Existing real transport fixture required; in-memory transport alone does not establish broker timing/redelivery.

## Card 6 — PHP-FPM request lifetime versus reused application workers

- **Trigger / non-trigger:** supplied component runs T across Octane 2.20.0, Laravel `queue:work`, or Symfony Messenger 7.4.20; assigned service uses actor/tenant/request data. Mere Octane dependency or FPM-only deployment does not select long-lived HTTP worker instructions; queue runtime can differ from web runtime.
- **Supplied scope/facts:** exact PHP/framework pins above, actual SAPI/worker engine and installed binary versions, lifecycle/reset wiring, constructor/binding facts, actor/tenant fixture A→B and same-worker test facility. This is implementation from supplied lifetime facts, not a leak/performance diagnosis.
- **Steps, FPM:** keep request data per invocation; conventional request startup/shutdown resets userland application state. **FPM child processes can serve many requests** (`pm.max_requests`); “short-lived” describes PHP request state, not necessarily PID. Persistent resources/OPcache are separate. [FPM manual][fpm].
- **Steps, Laravel:** Octane boots application once. Pass actor/tenant as method arguments; avoid constructor-captured Request or mutable tenant stored in long-lived singleton/static. Where existing design requires scoped state, use supplied request/job-scoped binding, reacquired each lifecycle; a singleton retaining scoped object defeats reset. Laravel scoped instances flush per Octane request/queue job; arbitrary application globals do not. [Octane lifetime][octane], [scoped semantics][scoped], [queue reset source][queue-reset], [Octane reset source][octane-reset].
- **Steps, Symfony:** Messenger reuses services; keep handler stateless or implement `Symfony\Contracts\Service\ResetInterface::reset()` for assigned mutable service under existing autoconfiguration/reset wiring. Reacquire entities each message; rely on supplied Doctrine manager reset path after failed transaction, not a captured entity/closed manager. `--no-reset` disables reset. [Worker docs][messenger-state], [reset listener][messenger-reset].
- **Tools / output:** manually edit allowed `app/Services/ReceiptContext.php` or `src/Service/ReceiptContext.php` and callers; optional existing binding declaration only when assigned. Output is explicit per-call data flow/reset method, no generated code or server installation. Existing same-worker fixture invokes existing runtime; no Octane installer/startup auto-download path.
- **Actual wrong transfer:** singleton `$this->tenantId ??= $request->user()->tenant_id` seems request-local under FPM but retains tenant A for B under reused worker. Assuming Messenger resets every property automatically also fails: reset behavior must be registered and authored; `ResetInterface` is not a generic PHP shutdown hook.
- **Local judgment:** remove unnecessary mutable state or reset precisely assigned fields; caller supplies lifecycle/registration facts, not field-by-field implementation.
- **Upstream blocker:** unknown worker mode, missing existing same-worker fixture, reset registration outside scope or required provisioning. **Assigned W1, unexecuted:** `vendor/bin/phpunit tests/Integration/ReceiptWorkerStateTest.php`; existing fixture proves A then B use same worker lifetime, including exception in A. B uses its own HTTP actor or stored job tenant/recipient; A key unchanged. Scoped service is reacquired, resettable shared service reused. Deliberately retained singleton tenant should fail B assertion; fresh-process-per-case tests cannot expose transfer.

## Proposed selection cases and extraction

| Supplied assignment | Positive selection | Negative selection / named blocker |
|---|---|---|
| Laravel 13.34, PHP 8.4.26, FPM HTTP + Redis worker, T | Cards 1+3+4; Card 6 for job service | Symfony components in vendor do not select 2/5; FPM web mode does not imply short-lived queue worker |
| Symfony 7.4.20, Doctrine 3.7.3, mapped JSON + Messenger, T | Cards 2+3+5+6 | Laravel FormRequest/ShouldQueue and automatic Eloquent model restoration do not transfer |
| Existing migration-only assignment | Card 3 schema portion | Do not scaffold endpoint, policy or receipt worker |
| DTO-only Laravel Data 4.23 assignment from R42 | R42 DTO reference | Do not replace boundary with FormRequest or adopt Symfony mapping |
| Octane listed but target deployment unspecified | Return missing lifecycle fact | Dependency presence cannot establish running worker mode |
| Atomic DB+broker admission demanded, only after-commit route supplied | Return upstream reliability-contract gap | Neither native callback nor bus stamp proves atomic admission |

All selection/behavior cases above are **unexecuted proposals**. Named tests are assignment artifacts to bind to caller's existing fixtures, not claims that such tests exist here. Proposed wrong-transfer controls describe expected failures, not measured red/green results.
**Extract:** shared closed-scope behavior packet and failure vocabulary; PHP runtime-lifetime reference; separate Laravel and Symfony boundary references; paired persistence/migration recipe; narrow queue/Messenger recipes with transaction and attempt-unit distinctions. Compose by supplied task + stack + version + lifetime. Status: **researched only**; runtime skill authoring/installation/exercise remains later work.

## Primary source index

[php-release]: https://www.php.net/releases/index.php?json&version=8.4
[php-support]: https://www.php.net/supported-versions.php
[laravel-release]: https://github.com/laravel/framework/releases/tag/v13.34.0
[laravel-meta]: https://github.com/laravel/framework/blob/v13.34.0/composer.json
[laravel-support]: https://laravel.com/docs/13.x/releases#support-policy
[symfony-release]: https://symfony.com/releases
[orm-meta]: https://github.com/doctrine/orm/blob/3.7.3/composer.json
[octane-meta]: https://github.com/laravel/octane/blob/v2.20.0/composer.json
[postgres-release]: https://www.postgresql.org/docs/18/release-18-6.html
[form-request]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Foundation/Http/FormRequest.php
[form-resolution]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Validation/ValidatesWhenResolvedTrait.php
[laravel-validation]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Validation/Concerns/ValidatesAttributes.php
[authorizable]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Foundation/Auth/Access/Authorizable.php
[request-stub]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Foundation/Console/stubs/request.stub
[map-payload]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Component/HttpKernel/Attribute/MapRequestPayload.php
[mapping-introduction]: https://symfony.com/blog/new-in-symfony-6-3-mapping-request-data-to-typed-objects
[payload-resolver]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Component/HttpKernel/Controller/ArgumentResolver/RequestPayloadValueResolver.php
[serializer-types]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Component/Serializer/Normalizer/AbstractObjectNormalizer.php
[symfony-controller]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Bundle/FrameworkBundle/Controller/AbstractController.php
[laravel-tx]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Database/Concerns/ManagesTransactions.php
[entity-manager]: https://github.com/doctrine/orm/blob/3.7.3/src/EntityManager.php
[doctrine-tx]: https://www.doctrine-project.org/projects/doctrine-orm/en/3.7/reference/transactions-and-concurrency.html
[migration-stub]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Database/Migrations/stubs/migration.update.stub
[migration-diff]: https://github.com/doctrine/migrations/blob/3.9.7/docs/en/reference/generating-migrations.rst
[migration-ddl]: https://www.doctrine-project.org/projects/doctrine-migrations/en/3.9/explanation/implicit-commits.html
[laravel-queue]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Queue/Queue.php
[laravel-tx-manager]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Database/DatabaseTransactionsManager.php
[laravel-worker]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Queue/Worker.php
[queue-fail]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Queue/InteractsWithQueue.php
[job-stub]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Foundation/Console/stubs/job.queued.stub
[model-restoration]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Queue/SerializesAndRestoresModelIdentifiers.php
[messenger]: https://symfony.com/doc/7.4/messenger.html
[after-bus]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Component/Messenger/Middleware/DispatchAfterCurrentBusMiddleware.php
[doctrine-bus]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Bridge/Doctrine/Messenger/DoctrineTransactionMiddleware.php
[messenger-retry]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Component/Messenger/Retry/MultiplierRetryStrategy.php
[messenger-failures]: https://symfony.com/doc/7.4/messenger.html#retries-failures
[fpm]: https://www.php.net/manual/en/install.fpm.configuration.php
[octane]: https://laravel.com/docs/13.x/octane#dependency-injection-and-octane
[scoped]: https://laravel.com/docs/13.x/container#binding-scoped-singletons
[queue-reset]: https://github.com/laravel/framework/blob/v13.34.0/src/Illuminate/Queue/QueueServiceProvider.php
[octane-reset]: https://github.com/laravel/octane/blob/v2.20.0/src/Listeners/FlushTemporaryContainerInstances.php
[messenger-state]: https://symfony.com/doc/7.4/messenger.html#stateless-worker
[messenger-reset]: https://github.com/symfony/symfony/blob/v7.4.20/src/Symfony/Component/Messenger/EventListener/ResetServicesListener.php
