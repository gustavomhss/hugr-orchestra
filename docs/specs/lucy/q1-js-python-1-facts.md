# Q1 js-python source facts — 1

Source and package facts for six candidate future tools. Not a live Orchestra integration, lane decision, no-exec or offline proof, or redistribution approval. License-text hashes are not artifact hashes. Publisher digests are not local rehashes. No signature was verified. Nothing was executed.

## tsgo typescript/v7.0.2

- **Artifact:** `typescript-darwin-arm64.tgz`, tag `typescript/v7.0.2`, jakebailey. Downloaded sha256 `902e2fe1cf0799198ef902c6b8c310a450fef629a6baba41d45641ef75c04ebd` (9270373) matches the API digest. Contains `package/lib/tsc`, Mach-O `cffaedfe`, `@typescript/typescript-darwin-arm64` 7.0.2, no bin. Source archive sha256 `25cca8ec9d89e4ceec5181a677ded2c6d690fa18b81e1277846303973eb71fcf` not built. `@typescript/native-preview` is another channel.
- **License:** Apache-2.0 sha256 `a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47` is LICENSE text, also source-archive and `package/LICENSE`, not the artifact hash. `NOTICE.txt` sha256 `f5c708b59114507b8b27b48181b6883d106bbca0c1634bbee45b5e344237b66b` names DefinitelyTyped MIT, Unicode, DOM/W3C, golang BSD-3-Clause plus patent notice, MIT, Apache-2.0; not a component certificate. https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/LICENSE
- **Use:** Compiler `package/lib/tsc`. README name `tsc`; preview `npx tsgo`; no package bin. `--lsp`/`--api`, else `execute.CommandLine`. `--lsp` needs `--stdio`; `--pipe`/`--socket` ignored. `--api` is stdio or a local `--pipe`.
- **Output/exits:** Text diagnostics, not SARIF or JSON. `--lsp` stdio and stderr. `--api` MessagePack, JSON-RPC if `--async`. `os.Exit(runMain())`. 0 Success, 1 DiagnosticsPresent_OutputsSkipped, 2 DiagnosticsPresent_OutputsGenerated, 3 InvalidProject_OutputsSkipped, 4 ProjectReferenceCycle_OutputsSkipped, 5 NotImplemented. `--lsp`/`--api`: 2 parse error, 1 if Run fails, 0 if nil. Missing `--stdio` is lsp.go only, not api.go.
- **Effects:** Config: argv, tsconfig, and ATA prefs. `plugins` declared, not loaded outside tests. Network: no production HTTP client. Default `--lsp`: npm child's configured registry, not a module hostname. Children: `npm install --ignore-scripts` only. Writes: emit from config/argv; ATA user-cache or temp; `--pprofDir`; `--pipe` deletes an existing socket, then listens.
- **Limits:** darwin-arm64 only. ATA npm hash unknown, not an autoinstall binary. Not offline-proved. README: Microsoft CLA. Mach-O `net/http` is not an import.

Sources: https://api.github.com/repos/microsoft/typescript-go/releases/tags/typescript/v7.0.2 https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/cmd/tsgo/main.go https://raw.githubusercontent.com/microsoft/typescript-go/typescript/v7.0.2/LICENSE

## dependency-cruiser 18.7.2

- **Artifact:** npm `dependency-cruiser-18.7.2.tgz`. Integrity `sha512-3Pkco0Kx3GI8tG6DTUDfl9RSZVOXMqD+lvili8m0qw2+zhGFcZMyPspUgb7Crqps1UkL23SFXslpj7a9hj11+A==`. Local sha256 `e6c062071a7c7d9502adec40a39192b7014cd804b55e5fe17845f22082ae9d18` matches it. Bins `dependency-cruiser`, `dependency-cruise`, `depcruise` to `bin/dependency-cruiser.mjs`, plus `depcruise-baseline`, `depcruise-fmt`, `depcruise-wrap-stream-in-html`. Node `^22||^24||>=26`.  `watskeburt` 6.0.0 declared, not bundled.
- **License:** MIT sha256 `046799de79c54f5366624ef97e3d5518afbefcd784a23aa74ef58d8f8bfcb2be` (Sander Verweij) is LICENSE text, not the tarball hash. Plugins and executed configs are user code. https://raw.githubusercontent.com/sverweij/dependency-cruiser/v18.7.2/LICENSE
- **Use:** Dependency-rule cruise of files or directories via `bin/dependency-cruiser.mjs`. No positional, and not `--info`/`--init`, prints help. Default reporter `err` to stdout. `--no-config` skips the file.
- **Output/exits:** `err` is violation text plus error and warn counts. JSON exit is hardcoded 0. Bin sets `process.exitCode` from `cli()` or 1 on throw, and does not call `process.exit`. Stale baseline adds only if severity is error (default warn). Commander 15 `help()` exits with `exitCode` or 0. Node 22 uses that code, normally 0 if unset.
- **Effects:** Config: `.dependency-cruiser` json/js/cjs/mjs/ts/cts/mts; JS/TS/extensionless executed, JSON/JSON5 parsed. Network: no `fetch(` or `node:http(s)` in published scripts; executed config and `plugin:` can open any network. Children: `spawnSync('dot')` only for dot-webpage, not DOT text; `--affected` and git cache import `watskeburt`. `--cache` off unless set. Writes: `--init` creates `.dependency-cruiser.js` if absent; reports, baseline, and cache.
- **Limits:** `dot` and git are PATH tools, not shipped binaries. `watskeburt` hash is not this artifact. Executed config is a trust boundary. Not offline-proved.

Sources: https://registry.npmjs.org/dependency-cruiser/-/dependency-cruiser-18.7.2.tgz https://registry.npmjs.org/dependency-cruiser/18.7.2 https://nodejs.org/docs/latest-v22.x/api/process.html

## knip 6.45.1

- **Artifact:** npm `knip-6.45.1.tgz`. Integrity `sha512-zp3zXKy2cZWiIttdlWU5fisKxVQaLSU6471ej0KGz1GdHdaHxpzTAO/LIyFNc3gU3v1W7LJaqvYumoO3l/u+6A==`. Local sha256 `499f07ae7839508f05affe2d5870f069ab5164a873b45145c3d22670bb5b8c18` matches it. Bins `knip` to `bin/knip.js`, `knip-bun` to `bin/knip-bun.js`. Node `^20.19.0 || >=22.12.0`.  `knip@6.45.1` page one had no binaries; `v6.45.1` 404s.
- **License:** ISC sha256 `2f654153561e7d8b90fdbf448a7de09725f936533fc9c7b485190c036d089341` is LICENSE text, not the tarball hash. Copies ISC/MIT from `@npmcli/package-json`, `@pnpm/deps.graph-sequencer`, `file-entry-cache`, `json-parse-even-better-errors`. Bundling not qualified. https://raw.githubusercontent.com/webpro-nl/knip/knip@6.45.1/LICENSE
- **Use:** Unused files, exports, and dependencies via `knip`. Needs `package.json`. Config: `knip.json`, `knip.jsonc`, `.knip.json`, `.knip.jsonc`, `knip.ts`, `knip.js`, `knip.config.ts`, `knip.config.js`, or `package.json#knip`. Reporter `symbols`. `--max-issues` 0.
- **Output/exits:** `symbols` tables non-empty issues, then hints, or `Excellent, Knip found no issues.` at zero. `json` is `{ issues: [...] }`. Parse error exits 1; help/version exit 0. Else exitCode 2 on load failure or catch, 1 if errors exceed max unless `--no-exit-code`. Hint-as-error flags default false. `--fix` still reports.
- **Effects:** Config: JSON/JSONC/YAML/TOML parsed; JS/TS via jiti, function exports called. No `--config` searches `KNIP_CONFIG_LOCATIONS` before `package.json#knip`, then `{}`. Network: published `.js` has no fetch/http/undici; executed config can open any network. Children: git only from husky, lefthook, and railway. Writes: stdout unless `--cache`, `--output-file`, or `--fix`; removal needs `--allow-remove-files`.
- **Limits:** git is unhashed PATH, not an autoinstall binary. Executed config is a trust boundary. Page one is not a full asset census. Not offline-proved.

Sources: https://registry.npmjs.org/knip/-/knip-6.45.1.tgz https://github.com/webpro-nl/knip/releases/tag/knip@6.45.1 https://raw.githubusercontent.com/webpro-nl/knip/knip@6.45.1/LICENSE

## bandit 1.9.4

- **Artifact:** PyPI sdist sha256 `b589e5de2afe70bd4d53fa0c1da6199f4085af666fde00e8a034f152a52cd628`; wheel `bandit-1.9.4-py3-none-any.whl` sha256 `f89ffa663767f5a0585ea075f01020207e966a9c0f2b9ef56a57c7963a3f6f8e`. Published digests, not a local rehash or the license hash. No native asset. Console entry `bandit` (`cli/main.py`).
- **License:** Apache-2.0 sha256 `09e8a9bcec8067104652c168685ab0931e7868f9c8284b66f5ae6edae5f1130b` is the tagged LICENSE fetched earlier, not a PyPI digest of that file. https://github.com/PyCQA/bandit/blob/1.9.4/LICENSE
- **Use:** Python security scan `bandit -r <dir>`. Also `-c`/`--configfile`, `--ini`, `-f`, `-o`, `--exit-zero`. Default format is absent from these facts and is not invented.
- **Output/exits:** `output_results` to stdout or `-o`. Man-page formats: screen, json, csv, txt, xml, yaml, html, custom. Completed scan exits 1 if `results_count > 0` unless `--exit-zero`, else 0. Exit 2: config, profile, usage, or baseline errors, and no targets.
- **Effects:** Config: `BanditConfig` from `-c`/`--configfile`; `--ini` overrides. All tests unless `-p`/`-t`/`-s`. Network: `cli/main.py` opens no client; its only https string is help text, which does not certify other modules. Children: no subprocess on that scan path. Writes: `-o` writes the report; else stdout. `-b` is read, not written.
- **Limits:**  License hash is not a PyPI digest. Default format unknown. CLI-path facts are not a package-wide offline or no-child guarantee.

Sources: https://github.com/PyCQA/bandit/blob/1.9.4/bandit/cli/main.py https://github.com/PyCQA/bandit/blob/1.9.4/doc/source/man/bandit.rst https://pypi.org/pypi/bandit/1.9.4/json

## diff-cover 11.0.1

- **Artifact:** PyPI sdist `diff_cover-11.0.1.tar.gz` sha256 `18fff3b9df6f28c62953859fb16302d1dec0189d79f3ea437c0bcad5cc60dcf3`; wheel sha256 `40d559e47ee9bcec35194fd9726d408a242608c54fbd0cdab244ae4324c1c7da`. Published digests, not the license hash. No native asset. Script `diff-cover` = `diff_cover.diff_cover_tool:main`.
- **License:** Apache-2.0 sha256 `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` is the tagged LICENSE computed on fetch, not a published LICENSE digest. PyPI expression Apache-2.0. https://github.com/Bachmann1234/diff-cover/blob/v11.0.1/LICENSE
- **Use:** Diff coverage: `diff-cover <coverage.xml>`. Defaults `--compare-branch origin/main`, `--fail-under 0`, `--diff-range-notation ...`, optional `--config-file`. `--diff-file` skips live git.
- **Output/exits:** Stdout unless `--quiet`. `--format html|json|markdown` writes `diff-cover.html`, `.json`, or `.md` unless a path is given. `github-annotations` stays on stdout. `sys.exit(main())`: 0 success, 1 error, including missing git. 0 if percent meets `--fail-under` or changed lines are below `--minimum-change`; else 1. That numeric default is unknown.
- **Effects:** Config: `--config-file` merges over those defaults; filename search was not copied. Network: this path reads local coverage and a local git diff; `diff_cover_tool.py` has no registry client. Not a whole-package certificate. Children: git diff with mnemonic/noprefix off, `--no-color`, `--no-ext-diff`, `-U0`, `<branch><notation>HEAD`; also unstaged, `--cached`, and `git ls-files`. `--diff-file` skips that. Writes: report files only for those formats. Default is stdout.
- **Limits:** git is a PATH tool unless `--diff-file`, not a hashed autoinstall binary. Config search and `--minimum-change` default unknown. Not offline-proved beyond the cited module.

Sources: https://github.com/Bachmann1234/diff-cover/blob/v11.0.1/diff_cover/diff_cover_tool.py https://github.com/Bachmann1234/diff-cover/blob/v11.0.1/diff_cover/git_diff.py https://github.com/Bachmann1234/diff-cover/blob/v11.0.1/pyproject.toml

## pyright 1.1.414

- **Artifact:** npm `pyright@1.1.414`. Integrity `sha512-FPZZb51jepDX4eP7TEYDeNFtmE3WgwkkEcJpvH3/QmUSsj0EAy3LXu+xB4T/FWDejtsXlCfFr/rbWFjwuwuXww==`. No local sha256, so not a local rehash. Bins `pyright` to `index.js`, `pyright-langserver` to `langserver.index.js`. Node `>=14.0.0`. `index.js` requires `./dist/pyright`. Node entry, not a native compiler. A same-version PyPI wrapper calls `install_pyright`; it is not this compiler.
- **License:** MIT sha256 `f7c936bc43f132b08497ac952e9376cbc102e5eedb4bf6ec902ea8442bd9c68d` is tagged `LICENSE.txt` computed on fetch, not an npm LICENSE digest. https://github.com/microsoft/pyright/blob/1.1.414/LICENSE.txt
- **Use:** Type check `pyright --outputjson <files>`. Also `-p`/`--project` and `--threads`. `argv[2]==worker` is internal, not a user command.
- **Output/exits:** Default: per-file diagnostics plus `N errors, N warnings, N informations`. `--outputjson` prints JSON (`version`, `time`, `generalDiagnostics`, `summary`); other logs go to stderr. 0 NoErrors, 1 ErrorsReported, 2 FatalError, 3 ConfigFileParseError, 4 ParameterError. `main` sets `process.exitCode`, not `process.exit`. Only `--warnings` adds warnings to the error count. `--level` is the emission floor.
- **Effects:** Config: `pyrightconfig.json`, `pyproject.toml`, or `-p`. Network: the npm entry does not download the compiler. Wrapper `install_pyright` uses the network and is not claimed closed-offline. Children: `--threads` starts Node workers. Writes: stdout/stderr; `--createstub` writes stubs. No output-file flag in captured usage.
- **Limits:** Publisher sha512 is not a recorded local hash. The wrapper target has no hash here.

Sources: https://github.com/microsoft/pyright/blob/1.1.414/packages/pyright-internal/src/pyright.ts https://registry.npmjs.org/pyright/1.1.414 https://github.com/RobertCraigie/pyright-python/blob/v1.1.414/src/pyright/cli.py
