# Rails

## Applicability

A component whose endpoints are Rails controllers on Rails `8.1.4` (Ruby `4.0.7`). Typed checks, when the project uses them: Sorbet `0.6.13532` with Tapioca `0.20.0`, or RBS `4.2.0` with Steep `2.1.0` and rbs_rails `0.13.1`. Read [Ruby](../../languages/ruby.md) first; its error, thread and tool rules apply unchanged.

## Non-trigger

- Rack apps, Sinatra or Grape endpoints mounted inside Rails: Rails filters and strong parameters do not run there.
- Adding Sorbet or RBS to an untyped project, or raising a file's `# typed:` sigil, unless the packet assigns it.
- Changing middleware, `rescue_from` handlers, `config/application.rb` or global callbacks unless the packet assigns it.

## Inputs

- The `config/routes.rb` scope that owns the path, the controller (`ActionController::API` or `Base`) and its `before_action` chain.
- The principal accessor, the error envelope and the status codes.
- The test framework and command, and the type system with its commands.

## Steps

1. Add the route inside the existing scope, e.g. `resources :tasks, only: %i[create]` under the parent resource. Confirm with `bin/rails routes -g tasks`.
2. Accept only declared parameters: `params.expect(task: [:title, :due_on])`. A missing or wrongly shaped key raises `ActionController::ParameterMissing`, which Rails renders as 400. `permit` drops unknown keys silently unless the project raises on them.
3. Load through the principal: `current_user.projects.find(params[:project_id])`. `ActiveRecord::RecordNotFound` becomes 404, so another tenant's row is never fetched and then checked.
4. Write inside `ActiveRecord::Base.transaction do ... end` with `save!` or `create!`. A plain `save` returns `false` without rolling back, and `raise ActiveRecord::Rollback` rolls back silently, so the caller still sees success. Lock rows with `lock!` or `with_lock`.
5. Send mail, enqueue jobs and publish events after the commit: `after_commit`, or `ActiveRecord.after_all_transactions_commit { }` inside service code.
6. A uniqueness validation is not a guarantee under concurrency. Keep the unique index and map `ActiveRecord::RecordNotUnique` to the contract's 409.
7. Render model errors with the contract's status: `render json: { errors: task.errors }, status: :unprocessable_content`.
8. Generate migrations with `bin/rails generate migration`, review them, and follow [migration phases](../../data/migration-phase.md). Never edit an applied migration or `db/schema.rb` by hand.

## Tools and outputs

- Tests through routing: `ActionDispatch::IntegrationTest` or RSpec request specs. Controller tests skip routing and middleware.
- Sorbet: give each method you add a `sig { params(...).returns(...) }` where the file's sigil and neighbors expect one. After a model, schema or Rails DSL change, regenerate with the project's `bin/tapioca dsl <Constants>`; run `bin/tapioca gems` only when the packet changed `Gemfile.lock`. Check with `bundle exec srb tc`.
- RBS: write signatures under `sig/` next to the existing ones, regenerate model signatures with the project's rbs_rails task, and check with `bundle exec steep check <paths>`.
- Both type systems run only the project's pinned gems. If Tapioca, Sorbet, Steep or rbs_rails is absent from `Gemfile.lock` or unpinned, return a `packet` blocker. Never install anything.
- Outputs: handwritten routes, controllers, models, migrations reviewed after generation, signatures and tests. Never hand-edit `sorbet/rbi/dsl/`, `sorbet/rbi/gems/` or generated RBS.

## Limits and checks

- Tapioca DSL generation boots the app, so it needs the database configuration. A boot failure is a `packet` blocker, not a type error.
- `T.unsafe`, `T.untyped`, `# typed: ignore` and `steep:ignore` silence the check instead of passing it; never add them to clear an error.
- Checks through routing: the success status and body, a parameter failure, unauthenticated and forbidden cases, another principal's row as 404, and each mapped conflict.
