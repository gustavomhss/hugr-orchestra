# JavaScript and Python Q1 fact qualification

Version-specific primary-source facts for five prospective integrations. Runtime integration and lane qualification remain pending. License-text hashes identify the named license file; package integrity and artifact hashes identify distributions. Upstream command examples below still require a separate Orchestra invocation contract.

## typescript-eslint 8.72.2

Library. No independent executable, and no `typescript-eslint` binary to invent.

- **License:** `MIT`. Primary text is [`packages/typescript-eslint/LICENSE` at `v8.72.2`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.72.2/packages/typescript-eslint/LICENSE). License-text SHA-256 `2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0`. The same digest matches `package/LICENSE` inside `typescript-eslint-8.72.2.tgz` and the repo-root `LICENSE` at `v8.72.2`. Per-package `LICENSE` files exist; this hash is the meta-package text, not a hash of every per-package file.
- **Distribution:** npm `typescript-eslint@8.72.2`. The tag and the published `package.json` have `exports` and no `bin`. `engines` is `node ^18.18.0 || ^20.9.0 || >=21.1.0`. `peerDependencies` are `eslint ^8.57.0 || ^9.0.0 || ^10.0.0` and `typescript >=4.8.4 <6.1.0`. No artifact hash was recorded for this package beyond the license-text digest.
- **Invocation:** no independent CLI. The host is ESLint, which loads exports `parser`, `plugin`, and `configs`. That loading is host-owned.
- **Output:** in-process ESLint plugin, parser, and config objects (`dist/index.d.ts` exports `parser`, `plugin`, `configs`). No stdout contract of its own.
- **Exit:** published 8.72.2 dist JavaScript has no `process.exit`. Process exit belongs to the ESLint host, not this package.
- **Network:** no independent process. Dist files contain `http` strings in comments and docs. No CLI fetch was identified as a tool effect. That does not demonstrate the absence of network use inside the peer toolchain.
- **Config:** consumed via ESLint config. It does not read its own config file.
- **Children:** peer `typescript` is loaded in-process by the parser and plugin, not spawned as a CLI by this package.
- **Writes:** no CLI writes. The ESLint host may cache; that cache is not defined here.
- **Primary sources:** [`package.json` at `v8.72.2`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.72.2/packages/typescript-eslint/package.json) (no `bin`, peers, engines); [`typescript-eslint-8.72.2.tgz`](https://registry.npmjs.org/typescript-eslint/-/typescript-eslint-8.72.2.tgz) (published `LICENSE`, no `bin`, no `process.exit` in dist JavaScript).

## api-extractor 7.60.1

npm package `@microsoft/api-extractor`. Binary name `api-extractor`.

- **License:** `MIT`. Primary text is `package/LICENSE` inside [`api-extractor-7.60.1.tgz`](https://registry.npmjs.org/@microsoft/api-extractor/-/api-extractor-7.60.1.tgz) (Microsoft MIT notice). License-text SHA-256 `5515f89b040fb8890f6d93af1d101aab674c9163ee8d94b2dfb4a74e9deac7fe`. There is no git tag `api-extractor_v7.60.1`. The Rushstack `main` `LICENSE` was not used.
- **Distribution:** `bin` `api-extractor` maps to `./bin/api-extractor` (`#!/usr/bin/env node`; requires `start.js`). `engines` is `node >=20.9.0`. Published package integrity `sha512-1FJ/Z30xLL3pWn6oYSJCjGsnlEWkWivwmVeCB7YrRPe+47J7H54NVR+m/1PIL1RYsh/mZsxm/FwirreD72G76g==`. Artifact SHA-256 of the tarball `ff39de30768e74339ba06d4c62b195337d5ef816562711f203ea24f077adcc1a`. No GitHub release asset.
- **Invocation:** from 7.60.1 `lib-commonjs`, tool filename `api-extractor`; actions `init` and `run`; global `--debug` / `-d`; `run` flags `--config`, `--local`, `--verbose`, `--diagnostics`, `--typescript-compiler-folder`, `--print-api-report-diff`. Which of those a review passes is host-owned. This note does not supply a closed argv.
- **Output:** stdout prints the configuration path, then `API Extractor completed successfully` or completed with errors or warnings. The tool description names an `.api.md` report, a `.d.ts` rollup, and an `.api.json` doc model. Paths come from `api-extractor.json`.
- **Exit:** `start.js` calls `process.exit(1)` on unexpected rejection. `CommandLine` sets `process.exitCode` to 1 before execute, then 0 if `onExecuteAsync` resolves. Run failure throws `AlreadyReportedError`, so `exitCode` stays 1. Warnings also throw `AlreadyReportedError` (exit 1), not only errors. Exit 1 is not uniquely an error-severity verdict.
- **Network:** `https://` hits in 7.60.1 `lib-commonjs` `.js` files are doc strings (banner `api-extractor.com`, GitHub and npmjs links). No `fetch` or `node:http` / `node:https` import was identified in those files. That is not a demonstrated absence of every network effect.
- **Config:** reads `api-extractor.json`, or the file given by `--config`. A missing config throws.
- **Children:** optional `--typescript-compiler-folder` points at a TypeScript package. It is not spawned in `RunAction.js`.
- **Writes:** generates the API report, declaration rollup, and doc model when configured, and also reads the project. This note records no no-write mode.
- **Primary source:** [`api-extractor-7.60.1.tgz`](https://registry.npmjs.org/@microsoft/api-extractor/-/api-extractor-7.60.1.tgz) (`LICENSE`, `bin`, argv, exit, output strings).

## publint 0.3.25

npm package `publint`. Binary name `publint`.

- **License:** `MIT`. Primary text is [`LICENSE` at tag `publint@0.3.25`](https://github.com/publint/publint/blob/publint@0.3.25/LICENSE). License-text SHA-256 `bd1a0d615fd1b83d6c7638457aa21cada2d7280f10ddac0d6be89660a1a5b7f9`. Copyright line in that text: Copyright (c) 2026 Bjorn Lu and publint contributors.
- **Distribution:** `bin` `publint` maps to `./src/cli.js`. Published package integrity `sha512-WMMbn/d7JqRlfXQL/JUI4n5skC8cJ5WVr8/wT5mmiYWkUdENkZr1I5rgs2+dQPVRgoJd+JRYtB46MTsuDylw9g==`. No separate native asset. Node CLI; the shebang is in `packages/publint/src/cli.js`.
- **Invocation:** tag `cli.md` and `cli.js` publish `publint [path]` (default command `run`). Flags: `--level suggestion|warning|error` (default `suggestion`), `--pack auto|npm|yarn|pnpm|bun|false` (default `auto`), `--strict` (default false). `publint deps` is deprecated. A host-owned invocation that needs to skip packing must pass `--pack false`. The default does not. Passing that flag is not a demonstrated no-exec property.
- **Output:** stdout prints `Running publint v<version> for <name>`, then `All good!` or numbered Errors, Warnings, and Suggestions.
- **Exit:** `process.exit(1)` if the tarball cannot be read or `package.json` is missing. `process.exitCode` is set to 1 if any message type is `error`. `--strict` rewrites warning messages to `error` before that check (`shared/core.js`). Suggestions alone do not set `exitCode`. Default success is process exit 0. Exit 1 is therefore not only a lint-error verdict.
- **Network:** local filesystem and tarball lint. Registry fetch is not in `cli.js`. That does not demonstrate that a package-manager child has no network effect.
- **Config:** reads `package.json`. No separate publint config file in `cli.js`.
- **Children:** default `--pack auto` calls `packages/pack` `src/node/pack.js`, which `exec()`s `npm`, `pnpm`, `yarn`, or `bun pack` via `tinyexec`. Yarn 1 is rejected. `--pack false` skips packing.
- **Writes:** default packing creates a temporary package tarball with the selected package manager. `--destination` is an internal pack-helper option, not a publint CLI flag. The public CLI exposes `--level`, `--pack`, and `--strict` only. `--pack false` avoids that packing write. It does not prove the process writes nothing else.
- **Primary sources:** [`cli.js`](https://github.com/publint/publint/blob/publint@0.3.25/packages/publint/src/cli.js) (argv, output, exit); [`shared/core.js`](https://github.com/publint/publint/blob/publint@0.3.25/packages/publint/src/shared/core.js) (`--strict` promotes warnings to errors); [`pack.js`](https://github.com/publint/publint/blob/publint@0.3.25/packages/pack/src/node/pack.js) (child package-manager `pack`).

## arethetypeswrong 0.18.5

Published package `@arethetypeswrong/cli`. Binary name `attw`.

- **License:** `MIT`. Primary text is `package/LICENSE` inside [`cli-0.18.5.tgz`](https://registry.npmjs.org/@arethetypeswrong/cli/-/cli-0.18.5.tgz) (Copyright 2023 Andrew Branch). License-text SHA-256 `4c430bf315121c661bb68f5be994d1aab2c52962e6e914a4e5d31495cf1aa175`. Git tags for `@arethetypeswrong/cli` stop at 0.18.3. Version 0.18.5 has no git tag. The `main` `LICENSE` was not used as the version pin.
- **Distribution:** `bin` is `attw`. Published package integrity `sha512-gM+8vRsQOD/Uc7EnBedUhkG5OCsDWE4uoak5QvomGpMpaky0Eh41p04nIMgrWb8EOmqZUJGc6zz9hsP6E56R7g==`. Artifact SHA-256 of the tarball `7e4b04d7395956163a029518ef733b7b34f68cdeb0119f7100b3a606f4b04c6b`. Node shebang is in `dist/index.js`. Depends on `@arethetypeswrong/core`. `versions.core` is printed at runtime; the exact core version was not copied from an installed tree and is not recorded here.
- **Invocation:** published `dist/index.js` is `attw [file-directory-or-package-spec]`. Recorded flags: `--pack` / `-P`, `--from-npm` / `-p`, `--definitely-typed`, `--format auto|json|ascii|table|table-flipped` (default `auto`), `--quiet`, entrypoint flags, `--ignore-rules`, `--profile` (default `strict`), `--summary`, `--emoji`, `--color`, `--config-path` (default `./.attw.json`). Entrypoint-flag spellings were not expanded in the frozen row; do not invent them. A host-owned invocation must choose file versus registry and whether to pack. `--from-npm` fetches. `--pack` runs `npm pack`. Omitting `--pack` on a directory prompts before packing. None of those choices is a demonstrated offline or no-exec property.
- **Output:** JSON format writes analysis JSON to stdout. Other formats use `render.typed` or `render.untyped`. `--quiet` discards stdout.
- **Exit:** `getExitCode` returns 0 if there are no types or no non-ignored problems, and 1 if any remaining problem exists. The JSON path calls `process.exit(1)` when that value is 1. Other formats set `process.exitCode`. `handleError` uses commander exit code 3. Untyped analysis does not set a failing code (`getExitCode` returns 0). Exit 0 is not a "types are correct" verdict, and exit 1 is not the only failure code.
- **Network:** `--from-npm` fetches the registry (error text `error while fetching package`). The recorded local file mode does not perform that fetch. That distinction is a published-source fact, not a runtime demonstration that local mode has no network effect.
- **Config:** `readConfig` of `.attw.json` or `--config-path`. `--profile` mutates options.
- **Children:** `--pack` runs `execSync('npm pack')` in the directory and unlinks the tgz. If `--pack` is omitted on a directory, a prompt asks before pack.
- **Writes:** deletes the packed tgz it created. It does not otherwise document an output file. Stdout is the report. Deleting the tgz is itself a write.
- **Primary source:** [`cli-0.18.5.tgz`](https://registry.npmjs.org/@arethetypeswrong/cli/-/cli-0.18.5.tgz) (`LICENSE`, argv, `getExitCode`, `npm pack`, registry fetch).

## pip-audit 2.10.1

Python package. No separate binary asset. Console entry is `pip-audit`; the module entry published in the tagged README is `python -m pip_audit`.

- **License:** `Apache-2.0`. Primary text is [`LICENSE` at tag `v2.10.1`](https://raw.githubusercontent.com/pypa/pip-audit/v2.10.1/LICENSE). License-text SHA-256 `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594`. The PyPI license field is empty. The expression is taken from the tagged `LICENSE` text, not from a badge.
- **Distribution:** artifact SHA-256 of sdist `pip_audit-2.10.1.tar.gz` is `1eb4565d19ebe5d48996f4b770b4d2b32887e12cb12cfa637f1a064011b55ffc`. Artifact SHA-256 of wheel `pip_audit-2.10.1-py3-none-any.whl` is `99ef3f600a317c1945f1e89e227ef26e1c2d618429b8bd3fa6f4f7c440c4611a`.
- **Invocation:** the tagged README embeds `pip-audit [-h] [-V] [-l] [-r REQUIREMENT] [--locked] [-f FORMAT] [-s SERVICE] ... [project_path]` and `python -m pip_audit --help`. The ellipsis is in the source; this note does not expand `--help`. A host-owned closed-review invocation must never include `--fix`. That constraint does not make any other flag combination offline-safe or no-exec.
- **Output:** formats `columns` (default), `json`, `cyclonedx-json`, `cyclonedx-xml`, and `markdown`. `-o FILE` writes a file; otherwise stdout.
- **Exit:** at tag `v2.10.1`, `_cli.py` exits 1 for findings only while the vulnerable package count differs from the fixed package count. A successful `--fix` of every vulnerable package does not exit 1. `_fatal` also exits 1 for operational failures, so code 1 is not uniquely a vulnerability verdict. `--dry-run` without `--fix` skips the audit. `--fix --dry-run` still audits and describes would-fix operations.
- **Network:** default service is `pypi`. Choices are `osv`, `pypi`, and `esms`. `--osv-url` defaults to `https://api.osv.dev/v1/query`. Index URLs are also part of the recorded network surface. No offline mode is recorded in these rows.
- **Config:** the same settings are also read from `PIP_AUDIT_FORMAT`, `PIP_AUDIT_VULNERABILITY_SERVICE`, `PIP_AUDIT_DESC`, `PIP_AUDIT_PROGRESS_SPINNER`, and `PIP_AUDIT_OUTPUT`. A host-owned invocation must treat those variables as config, not as inert environment.
- **Children:** `--disable-pip` exists because default resolution uses pip. pip is not a vendored binary of this package. Disabling pip is not recorded as eliminating every child or network effect.
- **Writes:** HTTP cache (pip cache by default), `-o FILE`, and `--fix` upgrades dependencies. `--fix` writes dependency upgrades, which is why a closed review must not pass it.
- **Primary sources:** [`README.md` at `v2.10.1`](https://raw.githubusercontent.com/pypa/pip-audit/v2.10.1/README.md) (argv, output, exit, network, pip, cache, fix); [PyPI JSON for 2.10.1](https://pypi.org/pypi/pip-audit/2.10.1/json) (sdist and wheel SHA-256); [`_cli.py` at `v2.10.1`](https://raw.githubusercontent.com/pypa/pip-audit/v2.10.1/pip_audit/_cli.py) (vulnerability, fix, and error exit conditions, and dry-run branches; no generic "exit 1 means vulnerable" verdict).
