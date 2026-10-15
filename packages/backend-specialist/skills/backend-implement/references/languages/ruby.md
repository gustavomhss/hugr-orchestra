# Ruby

## Applicability

An assigned change to a Ruby service component. The frozen tuple is Ruby `4.0.7` and Rails `8.1.4`. Typed checks, when the project uses them: Sorbet `0.6.13532` (`sorbet` and `sorbet-runtime`) with Tapioca `0.20.0`, or RBS `4.2.0` with Steep `2.1.0` and rbs_rails `0.13.1`. The project's `Gemfile.lock` governs; where it differs from this tuple, the version notes below are unverified for that project.

After this card, read only the references the assigned component uses:

- [Rails](../frameworks/ruby/rails.md): routes, controllers, Active Record writes and typed checks on Rails.

The general procedures in [cancellation](../lifetimes/cancellation.md) and [atomic writes](../data/transaction.md) still apply; this card gives their Ruby form.

## Non-trigger

- A gem that merely appears in `Gemfile.lock`. Select by the component the packet assigns.
- Choosing a framework, ORM, job backend or type system, or raising the Ruby line or a gem to reach a newer helper. Each is a `packet` blocker.
- Sinatra, Hanami or Grape components: no reference is authored for them. Follow the packet and the surrounding code.

## Inputs

- The Ruby version (`.ruby-version` or the `Gemfile`'s `ruby` line), `Gemfile.lock`, the app server and the test command with its working directory.
- The files to change and the existing patterns to follow.
- Which type system the project uses: a `sorbet/` directory with `# typed:` sigils, or a `sig/` directory with a `Steepfile`, or neither.

## Steps

1. Run every gem executable through the lock: `bundle exec <cmd>` or the project's `bin/` binstub, never a global gem.
2. Rescue specific classes. A bare `rescue` catches `StandardError` only; never rescue `Exception`, which also swallows `Interrupt` and `SystemExit`. Re-raise what you cannot map, and release resources in `ensure` or a block form (`File.open { }`, `transaction { }`).
3. Classify errors by class, never by message text. Raise `DomainError` inside the `rescue`; Ruby keeps the original as `cause`.
4. Keep no request state in class variables, class-level instance variables or globals. A threaded server such as Puma runs requests concurrently in one process.
5. Never wrap I/O in `Timeout.timeout`: it raises at an arbitrary point and can leave a connection or transaction half done. Use the client's own timeout options.
6. Join every thread you start, and give it its own database connection through the framework's executor or connection pool; never share one connection between threads.
7. Answer success only after the commit returned.

## Tools and outputs

- Scoped to the packet's files: the project's test command (`bin/rails test <file>:<line>` or `bundle exec rspec <file>:<line>`) and the linter the packet names (for example `bundle exec rubocop <files>`).
- Typed checks are never shipped in the toolkit: they are project dependencies and must match the project's pin. Run the project's own pinned version through the project's own command (`bundle exec srb tc`, `bundle exec steep check <paths>`, or the project's binstub). If the tool is absent from `Gemfile.lock` or unpinned, return a `packet` blocker. Never install anything.
- Outputs: handwritten application and test code. Generated code (RBI, RBS, schema dumps) is regenerated from its inputs, never edited.
- Toolkit engines, only for the artifacts the packet assigns: [ast-grep](../recipes/external/ast-grep.md) for bounded syntax rewrites.

## Limits and checks

- A static type check passing is not behavior evidence; only the assigned tests are.
- With `sorbet-runtime`, a `sig` is also checked at runtime, so a wrong signature fails tests with a `TypeError`.
- A test run that reports pending or skipped examples is not evidence for those cases; report them.
