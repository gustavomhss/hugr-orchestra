# R42 — closed-scope backend implementation leverage

Research snapshot: **2026-10-03**. Primary release metadata, tagged manifests, implementation, examples and test assertions inspected. Static research only; commands and acceptance cases below were **not executed**.

## Decision

Choose four mechanisms. Rank reflects useful implementation produced/reused inside an already-chosen stack, not measured speed or universal expertise.

| Rank | Mechanism | Useful leverage | Fit boundary |
|---|---|---|---|
| 1 | Ash + AshPostgres resource/action DSL | Resource declarations drive callable action interfaces, persistence behavior and migration/snapshot generation | Existing Ash application; architecture already chosen |
| 2 | Spatie Laravel Data | One typed payload definition reuses construction, validation, nested mapping and serialization | Laravel request/response boundaries with explicit business rules |
| 3 | Alba + Typelizer | Ruby response implementation also produces TypeScript response types | Rails application with these integrations already selected |
| 4 | Ecto transaction composition + Oban workers | Reuse atomic enqueue, job construction, retry scheduling and execution machinery | Existing Ecto/Oban application; useful without adopting Ash |

**Charlie packet:** owner supplies exact lockfile/runtime, initialized tools, schema/API contract, tenant/role rules, business transitions, target-file allowlist, fixtures and named acceptance commands. Cards below supply reference designs; owner resolves project-specific names before assignment. Charlie implements supplied decisions. Missing facts or out-of-scope generated files return as contract gaps—not investigation, diagnosis, architecture, scope or permission choices.

Use native commands/libraries directly. Wrapper payoff not established. Framework migration is a separate owner decision. Generated CRUD, serializers and types do not establish business authorization.

## Current primary versions, source and license

GitHub latest-release metadata checked except Ecto, whose current version was checked through Hex. These are research pins, not instructions to upgrade an existing project. Runtime floors below are direct manifest constraints; complete dependency resolution remains untested.

| Project / observed release | Tagged source / license evidence | Direct compatibility |
|---|---|---|
| [Ash 3.34.0](https://github.com/ash-project/ash/releases/tag/v3.34.0), Oct 3 | [mix.exs][ash-meta]; [MIT](https://github.com/ash-project/ash/blob/v3.34.0/LICENSES/MIT.txt) | Elixir `~> 1.11`; Ecto `~> 3.14`; generator tasks optionally depend on Igniter |
| [AshPostgres 2.14.0](https://github.com/ash-project/ash_postgres/releases/tag/v2.14.0), Oct 3 | [mix.exs][pg-meta]; [MIT](https://github.com/ash-project/ash_postgres/blob/v2.14.0/LICENSES/MIT.txt) | Elixir `~> 1.13`; Ash `~> 3.34`; Ecto/Ecto SQL `~> 3.13` |
| [Laravel Data 4.23.0](https://github.com/spatie/laravel-data/releases/tag/4.23.0), May 8 | [composer.json][data-meta]; [MIT](https://github.com/spatie/laravel-data/blob/4.23.0/LICENSE.md) | PHP `^8.1`; Illuminate contracts 10–13 |
| [Alba 4.0.0](https://github.com/okuramasafumi/alba/releases/tag/v4.0.0), Aug 28 | [gemspec][alba-meta]; [MIT](https://github.com/okuramasafumi/alba/blob/v4.0.0/LICENSE.txt) | Ruby `>= 3.0` |
| [Typelizer 0.14.0](https://github.com/skryukov/typelizer/releases/tag/v0.14.0), Oct 2 | [gemspec][type-meta]; MIT declared there and in [RubyGems metadata](https://rubygems.org/api/v1/gems/typelizer.json) | Ruby `>= 2.7`; Railties `>= 6.1`; pair inherits Alba's higher floor |
| [Ecto 3.14.2](https://hex.pm/api/packages/ecto/releases/3.14.2), Aug 14 | [mix.exs][ecto-meta]; [Apache-2.0](https://github.com/elixir-ecto/ecto/blob/v3.14.2/LICENSE.md) | Elixir `~> 1.14` |
| [Oban 2.24.0](https://github.com/oban-bg/oban/releases/tag/v2.24.0), Aug 25 | [mix.exs][oban-meta]; [Apache-2.0](https://github.com/oban-bg/oban/blob/v2.24.0/LICENSE.txt) | Elixir `~> 1.15`; Ecto SQL `~> 3.10` |

Typelizer caveat: tagged tree contains no LICENSE/COPYING-named file, although gemspec lists `LICENSE.txt`. MIT declaration verified; bundled license text not verified. Full tree API returned `truncated: false` and known `typelizer.gemspec` as positive control. Upstream Typelizer dummy app targets Rails 7.1; that is source evidence, not proof of every permitted Rails/Alba combination.

## 1. Ash: declared domain action → callable implementation + migrations

**Supplied contract / chosen stack:** initialized Elixir/Ash/AshPostgres application, existing `MyApp.Expenses.Expense`, domain and Postgres repo. Expense has UUID `id`, UUID `tenant_id`, `status` in `draft|approved`; add nullable UTC-microsecond `approved_at`. Existing route `POST /expenses/:id/approve` accepts empty body. Same-tenant manager may approve draft; 200 returns `{id, status: "approved", approved_at: <UTC ISO8601>}`; repeated transition 409; anonymous 401; other tenant/nonmanager 403. Owner supplies actor lookup and existing error envelopes.

**Native implementation:** add action below inside existing resource; add `code_interface do; define :approve; end`. Configure `Ash.Policy.Authorizer` with supplied manager-and-tenant predicate; provide actor at action construction/call. Add timestamp attribute declaration, then `mix ash.codegen add_expense_approval`.

```elixir
update :approve do
  accept []
  require_atomic? true
  change filter(expr(status == :draft))
  change set_attribute(:status, :approved)
  change set_attribute(:approved_at, &DateTime.utc_now/0)
end
```

**Output:** edited resource DSL compiles callable `approve` interface and reuses Ash action/validation/persistence machinery; AshPostgres emits Ecto migration source plus resource snapshots for schema delta. For an owner-authorized new resource, native `mix ash.gen.resource` also emits resource source and registers it with domain; it requires available Igniter.

**Remaining implementation:** exact authorizer policies, actor propagation, controller wiring, public-field selection and mapping stale-record failure to 409. Review generated migration against supplied schema. Supplied SQL filter enforces transition against stored state; endpoint tests must establish resulting behavior.

**Precise limit:** Ash defaults authorization on, but resource without authorizers permits requests. `accept []` limits input, not who may call action. Ash core does not generate this HTTP endpoint. Migration generation cannot choose business transitions, backfills or rollout strategy. Avoid `--dev` workflow for this card: documented squash process rolls dev migrations back.

**Targets:** `lib/my_app/expenses/expense.ex`, `lib/my_app_web/controllers/expense_approval_controller.ex`, generated `priv/repo/migrations/*_add_expense_approval.exs` and corresponding `priv/resource_snapshots/` artifacts, plus tests below; owner enumerates exact snapshot files.

**Assigned acceptance A1:** `mix test test/my_app/expenses/approval_test.exs test/my_app_web/controllers/expense_approval_controller_test.exs`. Assert policy matrix and unchanged rows on denial; success records timestamp; replay returns 409. Supplied Postgres concurrency harness uses independent connections: simultaneous approvals yield one success and one conflict. Apply generated migration in supplied test DB and exercise real data layer, not ETS substitute.

**Inspected evidence:** [generator golden assertions](https://github.com/ash-project/ash/blob/v3.34.0/test/mix/tasks/ash.gen.resource_test.exs), [code interfaces](https://github.com/ash-project/ash/blob/v3.34.0/test/code_interface_test.exs), [atomic filter implementation](https://github.com/ash-project/ash/blob/v3.34.0/lib/ash/resource/change/filter.ex), [stale-record assertions](https://github.com/ash-project/ash/blob/v3.34.0/test/actions/atomic_update_test.exs), [RBAC positive/negative cases](https://github.com/ash-project/ash/blob/v3.34.0/test/policy/rbac_test.exs), [migration unique-index/FK ordering assertions](https://github.com/ash-project/ash_postgres/blob/v2.14.0/test/migration_generator_test.exs). [Authorization defaults](https://github.com/ash-project/ash/blob/v3.34.0/documentation/topics/security/actors-and-authorization.md); [migration workflow](https://github.com/ash-project/ash_postgres/blob/v2.14.0/documentation/topics/development/migrations-and-tasks.md).

## 2. Laravel Data: payload contract → executable DTO boundary

**Supplied contract / chosen stack:** existing Laravel app with Data 4.23.0 and compatible pinned Pest. `PATCH /orders/:order/lines/:line` permits `quantity` and `note` only. Quantity: integer-valued 1–1000, integer strings allowed; omission preserves value. Note: nullable string, max 200 characters; omission preserves, null clears. Existing policy permits same-tenant order editor; anonymous 401, denied editor/tenant 403, finalized order 409. Invalid/unknown body fields return 422. Success 200 returns stored `{quantity: integer, note: string|null}`. Owner supplies model/action and existing error envelopes.

**Native command:** `php artisan make:data UpdateLineData` creates `app/Data/UpdateLineData.php`. Fill constructor with imported Data/Optional/validation classes:

```php
final class UpdateLineData extends Data
{
    public function __construct(
        #[IntegerType, Min(1), Max(1000)] public int|Optional $quantity,
        #[Max(200)] public string|null|Optional $note,
    ) {}
}
```

**Output:** command emits empty class shell; authored property contract drives reused Laravel validation, typed object creation and `toArray()` mapping that omits `Optional` values. Request injection validates automatically; non-request arrays must use `UpdateLineData::validateAndCreate($payload)` under default strategy. Library leverage is shared executable behavior, not automatic endpoint generation.

**Remaining implementation:** explicit unknown-key rejection, policy call, order/line tenant association checks, finalized-state rule, transaction and applying only emitted payload keys. Keep input/output DTOs distinct where field exposure differs. Constructor typing alone does not authorize persistence.

**Precise limit:** tagged `BuiltInTypesRuleInferrer` maps PHP `int` to Laravel **`numeric`**, despite introductory documentation showing `integer`; explicit `IntegerType` is required here. Laravel integer validation is not strict JSON-number validation. `from(array)` does not normally validate; already-created objects are assumed valid. Optional, nullable and lazy fields have different semantics.

**Targets:** `app/Data/UpdateLineData.php`, `app/Http/Controllers/UpdateLineController.php`, existing `app/Actions/UpdateLine.php`, `tests/Feature/UpdateLineTest.php`.

**Assigned acceptance D1:** `vendor/bin/pest tests/Feature/UpdateLineTest.php`. Exercise actual HTTP/controller/action: omitted note retained; null clears; quantity `"2"` accepted; `1.5`, 0, 1001 and null rejected; oversized note/unknown price field rejected. Wrong tenant/editor denial and finalized conflict leave row unchanged. Valid patch changes only supplied permitted fields.

**Inspected evidence:** [actual generator stub](https://github.com/spatie/laravel-data/blob/4.23.0/stubs/data.stub), [inference source](https://github.com/spatie/laravel-data/blob/4.23.0/src/RuleInferrers/BuiltInTypesRuleInferrer.php), [validation assertions](https://github.com/spatie/laravel-data/blob/4.23.0/tests/ValidationTest.php), [validation entrypoints](https://github.com/spatie/laravel-data/blob/4.23.0/docs/validation/introduction.md), [optional-value example](https://github.com/spatie/laravel-data/blob/4.23.0/docs/as-a-data-transfer-object/optional-properties.md). TypeScript export requires separate Spatie transformer integration; not counted as bundled Data output.

## 3. Rails: serializer DSL → JSON implementation + generated response types

**Supplied contract / chosen stack:** Rails with Alba 4.0.0 and Typelizer 0.14.0 already wired. Existing `ApplicationResource` includes Alba and `helper Typelizer::DSL`; inflector and type-output directory already configured. Invoice schema supplies UUID ID, integer `amount_cents` within JavaScript safe-integer range, nullable timestamp `paid_at`, and tenant ID. `GET /invoices/:id` returns 200 with rootless `{id: string, amountCents: number, paidAt: string|null}`; UTC ISO8601 milliseconds; `paidAt` always present. Owner supplies tenant-scoped query/policy: anonymous 401, missing/other-tenant invoice 404.

**Native DSL:** authored resource uses `transform_keys :lower_camel`, `attributes :id, :amount_cents`, explicit `typelize id: :string, amount_cents: :number`, and `typelize :string, nullable: true, optional: false` before computed `paid_at` attribute using `invoice.paid_at&.utc&.iso8601(3)`. Runtime `InvoiceResource.new(invoice).serialize` implements response. Run `bin/rails typelizer:types` for types only.

**Generated output**, modulo configured export style:

```typescript
type Invoice = {
  id: string;
  amountCents: number;
  paidAt: string | null;
};
```

**Remaining implementation:** controller lookup/authorization, timestamp conversion, explicit type annotations for computed values, and matching existing import/export conventions. Assert actual JSON against supplied response contract; database column inference alone is not wire-contract evidence.

**Precise limit:** Typelizer produces static types; those do not validate requests or runtime responses. Conditional fields and nullable fields require different annotations; custom Ruby blocks are not inferred business semantics. Alba field selection does not scope record access. Keep existing serializer if project selected another supported integration; adopting Alba solely for this card needs separate owner decision.

**Targets:** `app/resources/invoice_resource.rb`, `app/controllers/invoices_controller.rb`, configured `app/javascript/types/Invoice.ts` and `index.ts`, `spec/requests/invoices_spec.rb`, `spec/types/invoice_contract.ts`.

**Assigned acceptance R1:** `bundle exec rspec spec/requests/invoices_spec.rb`; `bin/rails typelizer:types`; supplied existing frontend `npm run typecheck` includes type fixture. Assert exact response keys, cents as number, UUID as string, UTC formatting and present-null timestamp. Other tenant returns supplied 404. Type fixture accepts valid nullable response and intentionally rejects numeric ID/missing `paidAt`. Require named generated files and expected fields; command success alone can mean nothing generated.

**Inspected evidence:** [Alba executable examples](https://github.com/okuramasafumi/alba/blob/v4.0.0/README.md), [conditional-output assertions](https://github.com/okuramasafumi/alba/blob/v4.0.0/test/usecases/conditional_attributes_test.rb), [Typelizer Alba guide](https://github.com/skryukov/typelizer/blob/v0.14.0/docs/guides/alba.md), [manual typing](https://github.com/skryukov/typelizer/blob/v0.14.0/docs/guides/manual-typing.md), [serializer fixture](https://github.com/skryukov/typelizer/blob/v0.14.0/spec/app/app/serializers/alba/ar/post_serializer.rb) → [generated snapshot](https://github.com/skryukov/typelizer/blob/v0.14.0/spec/__snapshots__/AlbaArPost.ts.snap), [generator assertions](https://github.com/skryukov/typelizer/blob/v0.14.0/spec/typelizer/generator_spec.rb). [Native task](https://github.com/skryukov/typelizer/blob/v0.14.0/lib/tasks/generate.rake) explicitly skips when serializer list empty.

## 4. Ecto + Oban: supplied transaction/job contract → reusable worker machinery

**Supplied contract / chosen stack:** initialized Elixir/Ecto/Postgres/Oban app, existing named `Ecto.Multi` transaction, queue and test harness. Order schema: UUID `id`/`tenant_id`, `draft|submitted` status, integer `lock_version`, stored recipient. `POST /orders/:id/submit` permits same-tenant editor; draft→submitted returns 200 `{id, status: "submitted"}`; repeat/stale version 409; anonymous 401; unauthorized 403. Use supplied `optimistic_lock(:lock_version)` changeset. Order update and job insert commit together. Job carries order ID; tenant/address come from stored order. Retry budget 5, queue `receipts`, insertion dedupe 60 seconds; existing sender uses stable `receipt:<order-id>:v1` idempotency key.

**Native library:** `use Oban.Worker, queue: :receipts, max_attempts: 5, unique: [period: 60, keys: [:order_id]]`; implement `perform/1`. Extend existing transaction with native `Oban.insert`, not raw insertion into jobs table:

```elixir
Ecto.Multi.new()
|> Ecto.Multi.update(:order, submission_changeset)
|> Oban.insert(:receipt, fn %{order: order} ->
  MyApp.ReceiptWorker.new(%{order_id: order.id})
end)
|> MyApp.Repo.transact()
```

**Output/reuse:** authored transaction and worker modules; macro supplies job-construction/default callbacks, library supplies durable job lifecycle and retry machinery. Runtime output is order update plus job row, not generated application business source. Existing retry scheduler replaces custom timer/process/queue implementation.

**Remaining implementation:** supplied versioned transition and stale-to-409 mapping, policy, actual receipt formatting, sender call and stable key derivation; transient sender failures return `{:error, reason}`. `perform/1` must handle JSON string-keyed args. Same database/repo transaction required for atomic enqueue. This card extends an existing Multi; Ecto itself recommends ordinary `Repo.transact(fn -> ... end)` for many static flows.

**Precise limit:** job insertion uniqueness is not exactly-once execution, external-effect idempotency or execution concurrency control. OSS uniqueness uses locks/queries and documents possible races; Pro's stronger uniqueness is separate paid functionality. Worker callback success does not prove transaction rollback or retry scheduling. Delivery idempotency relies on supplied sender/provider contract.

**Targets:** `lib/my_app/orders.ex`, `lib/my_app/receipt_worker.ex`, `test/my_app/order_submission_test.exs`, `test/my_app/receipt_worker_test.exs`; use existing route, queue and sender interfaces.

**Assigned acceptance O1:** `mix test test/my_app/order_submission_test.exs test/my_app/receipt_worker_test.exs`. Use supplied SQL Sandbox with `Oban.Testing.with_testing_mode(:manual, ...)`: success persists matching job; denial persists neither change nor job; forced enclosing rollback after successful submit removes both. Independent-connection concurrency case: one 200, one 409, one receipt job. `perform_job` checks string-key args, payload, transient error result and same key on replay; supplied sender fixture checks deduped effect. Callback tests do not establish scheduler retry lifecycle; that needs supplied engine-integration acceptance if assigned.

**Inspected evidence:** [Ecto.Multi example/rollback semantics](https://github.com/elixir-ecto/ecto/blob/v3.14.2/lib/ecto/multi.ex), [Multi assertions](https://github.com/elixir-ecto/ecto/blob/v3.14.2/test/ecto/multi_test.exs), [Oban Multi insertion source](https://github.com/oban-bg/oban/blob/v2.24.0/lib/oban.ex), [transaction and dedupe assertions](https://github.com/oban-bg/oban/blob/v2.24.0/test/oban/engine_test.exs), [worker/default/backoff assertions](https://github.com/oban-bg/oban/blob/v2.24.0/test/oban/worker_test.exs), [manual vs inline tests](https://github.com/oban-bg/oban/blob/v2.24.0/guides/testing/testing.md), [uniqueness limits](https://github.com/oban-bg/oban/blob/v2.24.0/guides/learning/unique_jobs.md).

## Evaluated, below top-four cutoff

- **Saloon 4.5.0** ([release](https://github.com/saloonphp/saloon/releases/tag/v4.5.0), Oct 3; [manifest](https://github.com/saloonphp/saloon/blob/v4.5.0/composer.json), PHP `^8.2`, [MIT](https://github.com/saloonphp/saloon/blob/v4.5.0/LICENSE)): useful native Connector/Request library for supplied outbound API contracts; reuses HTTP/auth/response/testing plumbing. [Inspected mocks](https://github.com/saloonphp/saloon/blob/v4.5.0/tests/Unit/MockClientTest.php) distinguish request/connector/URL matching and unmatched-request failure. Good fit when integration class family is already needed; less source production than selected mechanisms.
- **Crescat Saloon SDK Generator 1.6.0** ([release](https://github.com/crescat-io/saloon-sdk-generator/releases/tag/v1.6.0), Mar 26; [manifest](https://github.com/crescat-io/saloon-sdk-generator/blob/v1.6.0/composer.json), PHP `^8.2`, [MIT](https://github.com/crescat-io/saloon-sdk-generator/blob/v1.6.0/LICENSE.md)): Saloon-documented **third-party** generator. Existing CLI `sdkgenerator generate:sdk contract.yaml --type=openapi --name=Partner --output=generated/partner` emits Connector, Requests, Resources and component-schema Data DTOs. Auth/error/pagination and wire-contract completion remain implementation work.
- Concrete generator limits: [request test](https://github.com/crescat-io/saloon-sdk-generator/blob/v1.6.0/tests/Unit/Generators/RequestGeneratorTest.php) expects `array_filter(['channel_id' => $this->channelId])`, which removes legitimate 0/false values; [DTO source](https://github.com/crescat-io/saloon-sdk-generator/blob/v1.6.0/src/Generators/DtoGenerator.php) sets property defaults to null; [generated Pest stub](https://github.com/crescat-io/saloon-sdk-generator/blob/v1.6.0/src/Stubs/pest-resource-test-func.stub) checks sent class and HTTP 200. Those outputs are scaffolding, not supplied contract acceptance. Generator itself pins Laravel plugin `^4.0`; do not assume latest plugin compatibility. Native Saloon classes avoid making generator repair part of an unrelated task.
- **Pest 5.3.0** ([release](https://github.com/pestphp/pest/releases/tag/v5.3.0), Oct 1; [manifest](https://github.com/pestphp/pest/blob/v5.3.0/composer.json), PHP `^8.4`, [MIT](https://github.com/pestphp/pest/blob/v5.3.0/LICENSE.md)): acceptance runner, not backend implementation generator. Retain project's compatible pin; latest Pest is not automatic fit for Data's PHP floor. Data and Saloon upstream Pest assertions were inspected as evidence; no suite-pass claim made.

**Bottom line:** route closed implementation packets by existing stack. Strong gain comes from declarative behavior and generated artifacts with named acceptance cases. Support breadth grows across payload boundaries, response contracts, domain actions/persistence and transactional jobs; business design and permission decisions stay supplied inputs.

[ash-meta]: https://github.com/ash-project/ash/blob/v3.34.0/mix.exs
[pg-meta]: https://github.com/ash-project/ash_postgres/blob/v2.14.0/mix.exs
[data-meta]: https://github.com/spatie/laravel-data/blob/4.23.0/composer.json
[alba-meta]: https://github.com/okuramasafumi/alba/blob/v4.0.0/alba.gemspec
[type-meta]: https://github.com/skryukov/typelizer/blob/v0.14.0/typelizer.gemspec
[ecto-meta]: https://github.com/elixir-ecto/ecto/blob/v3.14.2/mix.exs
[oban-meta]: https://github.com/oban-bg/oban/blob/v2.24.0/mix.exs
