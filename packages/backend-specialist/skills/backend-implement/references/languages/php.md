# PHP

## Applicability

An assigned change to a PHP service component. The frozen tuple is PHP `8.5.11` and Laravel `13.35.0`, with typed checks through Larastan `3.12.3` on PHPStan `2.3.0` when the project uses them. The project's `composer.lock` governs; where it differs from this tuple, the version notes below are unverified for that project.

After this card, read only the references the assigned component uses:

- [Laravel](../frameworks/php/laravel.md): routes, form requests, Eloquent writes and Larastan checks on Laravel.

The general procedure in [atomic writes](../data/transaction.md) still applies; this card gives its PHP form.

## Non-trigger

- A package that merely appears in `composer.lock`. Select by the component the packet assigns.
- Choosing a framework, ORM, queue or static analyser, or raising the PHP line or a package to reach a newer helper. Each is a `packet` blocker.
- Symfony, Slim or plain PHP components: no reference is authored for them. Follow the packet and the surrounding code.

## Inputs

- The PHP version (`composer.json` `require.php` and the runtime), `composer.lock`, the test command and its working directory.
- The execution model: one process per request (PHP-FPM) or a long-lived worker (Octane, RoadRunner, FrankenPHP worker mode).
- The files to change, the existing patterns to follow, and the PHPStan configuration file and its `level`.

## Steps

1. Keep `declare(strict_types=1);` where the file has it, and type every parameter, property and return you add.
2. Compare with `===` and `!==`. Loose `==` converts types, so `"abc" == 0` and `null == false` mislead.
3. Decode JSON with `json_decode($raw, true, 512, JSON_THROW_ON_ERROR)`; without the flag, invalid input returns `null` silently.
4. Catch specific exception classes. `catch (\Exception)` misses `\Error` such as `TypeError`; catch `\Throwable` only at a boundary that maps it. Wrap with `new DomainException("create task", previous: $e)` so the cause survives.
5. In a long-lived worker, keep no request state in static properties, singletons or globals; it leaks into the next request.
6. Answer success only after the commit returned.

## Tools and outputs

- Scoped to the packet's files: the project's test command (`php artisan test --filter <name>`, `vendor/bin/phpunit --filter <name>` or `vendor/bin/pest --filter <name>`) and the formatter the packet names (for example `vendor/bin/pint <files>`).
- Typed checks are never shipped in the toolkit: they are project dependencies and must match the project's pin. Run the project's own pinned PHPStan through the project's own command (`vendor/bin/phpstan analyse <paths>` or its `composer` script) at the configured level. If PHPStan or Larastan is absent from `composer.lock` or unpinned, return a `packet` blocker. Never install anything.
- Outputs: handwritten application and test code. Generated code is regenerated from its inputs, never edited.
- Toolkit engines, only for the artifacts the packet assigns: [ast-grep](../recipes/external/ast-grep.md) for bounded syntax rewrites.

## Limits and checks

- Never raise or lower the configured level, and never add `phpstan-baseline.neon` entries, `@phpstan-ignore` comments or `ignoreErrors` patterns to clear an error you introduced.
- PHPStan passing is not behavior evidence; only the assigned tests are.
- A test run that reports skipped or incomplete tests is not evidence for those cases; report them.
