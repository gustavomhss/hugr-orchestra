# Laravel

## Applicability

A component whose endpoints are Laravel routes on Laravel `13.35.0` (PHP `8.5.11`), with typed checks through Larastan `3.12.3` on PHPStan `2.3.0` when the project uses them. Read [PHP](../../languages/php.md) first; its error, worker and tool rules apply unchanged.

## Non-trigger

- Lumen, Livewire components or Blade-only pages: no API contract runs through them.
- Adding Larastan to a project that lacks it, or changing its level. That is a `packet` blocker.
- Changing `bootstrap/app.php`, middleware groups, global exception rendering or service providers unless the packet assigns it.

## Inputs

- The route file and group that owns the path (`routes/api.php` and its middleware), the controller, form request, policy and API resource to follow.
- The principal accessor (guard), the error envelope and the status codes.
- The test framework and command, and the PHPStan configuration with its level.

## Steps

1. Register the route inside the existing group, e.g. `Route::post('/projects/{project}/tasks', [TaskController::class, 'store']);`. Confirm with `php artisan route:list --path=projects`. Never run `install:api` or scaffolding commands.
2. Validate in a `FormRequest`: `rules()` declares the input, `authorize()` the policy check. Use only `$request->validated()`, never `$request->all()`. A failure answers 422 JSON only when the request expects JSON; otherwise it redirects with 302.
3. Route model binding returns 404 for a missing row. For nested resources call `->scopeBindings()` so `{task}` must belong to `{project}`, and authorize through the policy (`Gate::authorize('update', $task)`), which throws 403.
4. Create rows from validated data on a model with `$fillable`; never `forceFill` or `unguard` request input.
5. Write inside `DB::transaction(fn () => ...)`. Lock rows with `lockForUpdate()` inside it. Dispatch jobs, mail and events after the commit: `DB::afterCommit(...)`, `->afterCommit()` on the dispatch, or `ShouldQueueAfterCommit`.
6. A `unique` validation rule is not a guarantee under concurrency. Keep the unique index and map `UniqueConstraintViolationException` to the contract's 409.
7. Return a `JsonResource`, setting non-default statuses explicitly: `TaskResource::make($task)->response()->setStatusCode(201)`.
8. Generate migrations with `php artisan make:migration`, review them, and follow [migration phases](../../data/migration-phase.md). Never edit an applied migration.

## Tools and outputs

- Feature tests through the HTTP kernel: `$this->actingAs($user)->postJson(...)`. Use `postJson`, `getJson` and friends so validation answers JSON. `actingAs` skips the credential check, so authentication needs its own test.
- Larastan: annotate relations you add with both template types, e.g. `/** @return HasMany<Task, $this> */`, and collection or array shapes where the neighbors do. Check with the project's `vendor/bin/phpstan analyse <paths>` at the configured level. If Larastan is absent from `composer.lock` or unpinned, return a `packet` blocker. Never install anything.
- Outputs: handwritten routes, controllers, form requests, policies, resources, migrations reviewed after generation and tests.

## Limits and checks

- Larastan boots the application to resolve facades and models, so analysis needs the app's configuration. A boot failure is a `packet` blocker, not a type error.
- Eloquent attributes without a `@property` docblock or cast are typed loosely, so a passing analysis does not prove the column type; the feature tests do.
- Checks through the kernel: the success status and body, a validation failure as 422, unauthenticated and forbidden cases, another principal's row as 404, and each mapped conflict.
