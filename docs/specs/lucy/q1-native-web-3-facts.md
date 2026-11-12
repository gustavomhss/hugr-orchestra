# Q1 native-web source facts — 3

Future source facts for five PHP tools, from the frozen native-web packet only. They describe upstream artifacts and behavior. They are not a live Orchestra integration, lane, noexec or offline guarantee, or redistribution approval.

## PHPStan 2.3.5

- **Artifact:** `phpstan.phar`, 30523570 bytes, https://github.com/phpstan/phpstan/releases/download/2.3.5/phpstan.phar. Publisher digest sha256:4b3ed7850a20b092331bd1040e4f54a1d3c0559b4cf006431073997ebcb4324b, not a local rehash. `.asc` sha256:1de22125124bb7cf112beef3cec10807a69056deead440d6ffc7599d859bb77a; signature unverified.
- **License:** MIT. LICENSE SHA-256 `f9e4f43eb1c32f7c4f5bcdb0860de5ba71712c3c1547eeb0d1e4b3c43313ec81` is not the phar hash: https://raw.githubusercontent.com/phpstan/phpstan/2.3.5/LICENSE. Notices unextracted; bundling not license-qualified.
- **Use:** Static analysis. `analyse`/`analyze` takes optional cwd-relative paths. Bare `vendor/bin/phpstan` analyses only if a discoverable cwd config already has paths and level. Config requires `parameters.level`; CLI `"0"` does not apply. Bins `phpstan` and `phpstan.phar`; PHP `^7.4|^8.0`.
- **Output/exits:** Table prints no-errors or a found-count. JSON has totals, file messages, and non-file errors. Exit 0 if clean, 1 if errors; warnings do not force 1. `--fail-without-result-cache` forces 2 only when the cache was unused and the formatter exit was already 0. `--generate-baseline` exits 0 on a written non-empty baseline and 1 if no baseline errors unless `--allow-empty-baseline`. `--fix` exits 0 only when every fixable error was fixed; fixes have a 10-round limit, and remaining fixable errors exit 1.
- **Effects:** Config: optional NEON; bootstrap is `require_once`. Network: no default step in the pinned command/config, and no socket-absence proof; Pro uses `--pro`/`--watch`; bootstrap files and extensions can also use arbitrary network. Children: fork or spawn `worker` batches; project code runs only via bootstrap or extensions. Writes: cache under `sys_get_temp_dir()/phpstan` unless `tmpDir` (skipped on serious errors; off with `--debug`). Baseline, `--fix`, and cache clear are explicit.
- **Limits:** Local phar hash unknown. Signature unverified. Bundling not license-qualified.

Sources: https://api.github.com/repos/phpstan/phpstan/releases/tags/2.3.5 · https://raw.githubusercontent.com/phpstan/phpstan/2.3.5/LICENSE · https://phpstan.org/user-guide/command-line-usage

## Psalm 7.3.1

- **Artifact:** `psalm.phar`, publisher digest sha256:b854f07b92291a263366cdc4c6e13ea64fc74619a539e77b72c98b51e3ab4db3 (72583957 bytes), not a local rehash. `.asc` sha256:2c4dfbf448d6ec41e140c4e7806aeeb1aca9e2b1ce70e415153c270b1c0805a2; signature unverified. Packagist dist is zipball `81bda61675df22fc4e5e1ceab1c33f4c61a4830b` with no sha256.
- **License:** MIT. LICENSE SHA-256 `15f22151f145b1420b3704e01b57b879b00f0f8ae78b26eba6c7b7b3b18c19e4` is not the phar hash: https://raw.githubusercontent.com/vimeo/psalm/7.3.1/LICENSE. Notices unextracted; bundling not license-qualified.
- **Use:** Issue scan. `./vendor/bin/psalm` with no extra flags scans `projectFiles`. The tag also ships `psalm.phar`.
- **Output/exits:** Named files may be scanned too. Report JSON is an input to `psalm-review` and is not fully specified. Tagged doc: 0 if clean, 1 if the run failed, 2 if issues were found. Source exits 2 on `error_count`, except a GitHub Actions taint SARIF write. Setup failures, including an unwritable `psalm.xml`, use `exit(1)`. Explicit `exit(0)` is only `--init`. Analysis success is documented 0 plus falling off the end.
- **Effects:** Config: project config and a cache directory. Network: `--shepherd` sends build info to https://shepherd.dev; project config and executed code can reach arbitrary hosts. Children: `--threads` runs analysis threads; other children unknown. Writes: cache directory; `--consolidate-cache` rewrites an index and a data file.
- **Limits:** Bytes not locally hashed. Signature unverified. Bundling not license-qualified.

Sources: https://raw.githubusercontent.com/vimeo/psalm/7.3.1/LICENSE · https://raw.githubusercontent.com/vimeo/psalm/7.3.1/docs/running_psalm/command_line_usage.md · https://github.com/vimeo/psalm/releases/tag/7.3.1

## composer audit Composer 2.11.2

- **Artifact:** Selected dist is `composer.phar`, not a separate audit binary: https://github.com/composer/composer/releases/download/2.11.2/composer.phar (3815650 bytes). Local sha256:dd158c0afd41d15fac89e1b4e47b5d42911fe316c3687cd5edac98319b25d028, not a publisher digest (Releases API 403). Root 2.11.2, reference `12c820dbc3f030954b1d09f5884fcf1e9d29d6cb`. Signature unchecked.
- **License:** MIT for Composer; audit has no separate file. LICENSE SHA-256 `7855ac293067aebe7e51afdd23b9dea54b8be24187dbecc9b9142581c37f596c` is not the phar hash: https://raw.githubusercontent.com/composer/composer/2.11.2/LICENSE. Notices unextracted; bundling not license-qualified.
- **Use:** Security-advisory audit: `composer audit`. Default format is table (also plain, json, summary). Also `--locked`, `--abandoned`, `--ignore-unreachable`, and `--direct`. Not every flag.
- **Output/exits:** Text or JSON reports advisories, plus optional unreachable repos, abandoned packages, filters, and cooldown. Empty install with root requires returns 1; no requires returns 0. Status 0 is clean, 1 is issues, capped at 255. Bundled symfony/console v5.4.55 autoExit calls `exit`; `bin/composer` does not. A non-positive exception code becomes 1.
- **Effects:** Config: loads Composer config; `--locked` requires a lock. Allowed plugins run unless `--no-plugins` or `--no-scripts`. Network: queries configured advisory repos; `packagist.org` becomes `repo.packagist.org`. `--ignore-unreachable` records a failure and does not prevent the fetch. Children: audit does not spawn; plugins and scripts can. Writes: no project report. HTTP cache writes possible; path unread. `--no-cache` uses nul or `/dev/null`.
- **Limits:** Signature unchecked. No publisher timestamp. Bundling not license-qualified. Cache path unknown.

Sources: https://github.com/composer/composer/releases/download/2.11.2/composer.phar · https://raw.githubusercontent.com/composer/composer/2.11.2/LICENSE · https://raw.githubusercontent.com/composer/composer/2.11.2/src/Composer/Command/AuditCommand.php

## Infection 0.35.10

- **Artifact:** `infection.phar`, 1475963 bytes, https://github.com/infection/infection/releases/download/0.35.10/infection.phar. Local sha256:aa8ac8aeb3d7b96d4e66119908c1654c6bbf29472ef8bf1d1e84900fd01d6b31 matches the recorded release digest, not a fresh publisher-API digest. Manifest 0.35.10; console v7.4.3. `.asc` unchecked; signature unverified.
- **License:** BSD-3-Clause. LICENSE SHA-256 `4e8d9ddf2b11e7c27d944f23e475338b134f990b55272990bad1af2651f90294` is not the phar hash: https://raw.githubusercontent.com/infection/infection/0.35.10/LICENSE. Notices not inventoried; bundling unqualified, not excluded.
- **Use:** Mutation testing. Default `run`; an unknown first argument is rewritten to `run`. Non-cli/phpdbg/embed SAPI, or a failed phar requirement check, exits 1. Config is mandatory (`infection.json5`, `infection.json`, then `.dist`). Default framework name is phpunit.
- **Output/exits:** Human progress, not JSON or SARIF. Optional loggers write named files only. Success is 0 and failure is 1; autoExit exits that code, capped at 255. Failure also covers failed initial tests, a missed MSI floor, or too many timeouts. A caught exception uses a positive code, else 1.
- **Effects:** Config selects the framework and can enable Stryker; extensions can run arbitrary code. Network: Stryker PUT to dashboard.stryker-mutator.io only if `logs.stryker` is set. Tests can open arbitrary hosts. Children: phpunit or simple-phpunit on PATH, cwd, or `cwd/bin`, unless `--skip-initial-tests`; then killers. `--dry-run` skips killers. No hashed PHPUnit binary is implied. Writes: `tmpDir` (default `sys_get_temp_dir()/infection`) holds initial config and coverage XML; cleanup deletes it.
- **Limits:** Signature unverified. Bundling not license-qualified. Generated names not fully listed.

Sources: https://github.com/infection/infection/releases/download/0.35.10/infection.phar · https://raw.githubusercontent.com/infection/infection/0.35.10/LICENSE · https://raw.githubusercontent.com/infection/infection/0.35.10/src/Command/RunCommand.php

## Roave dev-latest@9fb1049dda127f1732cac541e68f8e490db77825

- **Artifact:** Metapackage, no bin or scripts. Packagist `dev-latest` at commit `9fb1049dda127f1732cac541e68f8e490db77825` (2026-11-12T14:42:16Z). `dist.shasum` is empty. Point-in-time zip sha256:1a534aa307242051f6ad6814b3b8bf9512893910403bc8409614c6a9059b3c9b (22445 bytes) after a codeload redirect, not a registry checksum. Stable identity is the commit. Tags and releases were empty. `dev-master` has no dist and is not the install target.
- **License:** MIT. LICENSE SHA-256 `7bf6792803a9ddca3d6799fd7e6bafde7ae4bf62bb5cd2111947e61873315dc7` is not the zip hash: https://raw.githubusercontent.com/Roave/SecurityAdvisories/9fb1049dda127f1732cac541e68f8e490db77825/LICENSE. Only `dev-latest` is installable; no stable tag will exist.
- **Use:** Conflict constraints (1124 names), not a scanner or executable. Checks run on `composer require` and `composer update`, including a dry-run. A valid lock `install` does not check. Root project only; stability must allow dev. Install: `composer require --dev roave/security-advisories:dev-latest`.
- **Output/exits:** No package output. README says vulnerable requires fail; solver text was not executed. No Roave exit code. Host Composer 2.11.2 documents 0 OK, 1 unknown, 2 solving error. That mapping is documented, not observed.
- **Effects:** Config: conflicts only. Network: none in the package; install needs Packagist and the GitHub zipball. Other project repos are a host trust constraint. Children: none. Writes: none in the package. Host require/update writes consumer `composer.json`, lock, and vendor.
- **Limits:** No registry checksum. Zip hash is point-in-time. Exit 2 was not observed.

Sources: https://repo.packagist.org/p2/roave/security-advisories~dev.json · https://raw.githubusercontent.com/Roave/SecurityAdvisories/9fb1049dda127f1732cac541e68f8e490db77825/LICENSE · https://raw.githubusercontent.com/Roave/SecurityAdvisories/9fb1049dda127f1732cac541e68f8e490db77825/README.md
