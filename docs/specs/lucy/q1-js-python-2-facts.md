# Q1 js-python source facts — 2

Future-tool source facts for a later catalog, from the frozen js-python packet only. Not live Orchestra integrations, a lane, or approval of no-exec, offline, or redistribution. Each row has one selected distribution, a license-text hash distinct from the artifact digest, a concrete analysis use, verified output and exits, and config, network, children, and writes. No signature was proved. An unknown prerequisite hash is not an installer.

## mypy 2.4.1

- Artifact: Published PyPI digests, not a local re-hash or signature: sdist `mypy-2.4.1.tar.gz` sha256 `63b590965691e540a335fa74dadf31a7069142f6b72e234689bbd244edf55623`; wheel `mypy-2.4.1-py3-none-any.whl` sha256 `1784648d6ec8c2b5465e3f26241b845a0b3cb4e56c993c64abe16989e7698999`. Script `mypy = mypy.__main__:console_entry`.
- License: MIT. Text sha256 `fdf1cd17f50e1305ed8cfd37467312d27a984648dba622cef70573b5512e4e1b` is the tagged LICENSE fetch, not a published digest and not either package hash. The file also carries bundled-piece text. Expression MIT; license-files include `mypy/typeshed/LICENSE`. Text: https://github.com/python/mypy/blob/v2.4.1/LICENSE
- Use: Type-check: `mypy my_program.py` (folders accepted). `--config-file` selects config. `--install-types` installs packages and is not this check.
- Output/exits: Not JSON. Non-serious text may use stdout; serious paths stderr. Summary when errors and `error_summary`; success line if notes only or silence. Starts 0; 1 for non-note messages without blockers; 2 for blockers or a prompted install. `fast_exit` hard-exits; else `sys.exit` only if non-zero. Success completes at 0.
- Effects: Config: flag or discovered file; `MYPY_CACHE_DIR`, `MYPYPATH`, `MYPY_NUM_WORKERS`. Network: the check calls no registry; plugins are arbitrary code; `--install-types` is a separate install. Children: not established. Writes: `.mypy_cache` unless `cache_dir` is `os.devnull`.
- Limits: Diagnostic JSON not captured. Plugins are unbounded trust. Typeshed license text is not closed.

Sources: https://github.com/python/mypy/blob/v2.4.1/mypy/main.py · https://github.com/python/mypy/blob/v2.4.1/mypy/build.py · https://pypi.org/pypi/mypy/2.4.1/json

## pylint 4.1.3

- Artifact: Published PyPI digests, not native checksums or a signature: sdist `pylint-4.1.3.tar.gz` sha256 `9928603068edfa0d1a3c167f174b99d4b97c3db75d32d0fcdd029770b4713a9`; wheel `pylint-4.1.3-py3-none-any.whl` sha256 `a85357cae24f33ad8d86c8f3daaa92c600ae4012b54a57299cee76000e9364cf`. Script `pylint = pylint:run_pylint`.
- License: GPL-2.0-or-later. Text sha256 `f97b14080de8b8490d60eb3d620ebc419943e0779466d1dd0d5d6f68fe195dcd` is the tagged GPLv2 body, not either package digest. Or-later is pyproject and PyPI metadata, not a grant read out of the template paragraphs. Text: https://github.com/pylint-dev/pylint/blob/v4.1.3/LICENSE
- Use: Lint named files: `pylint <files>`, passed to `linter.check`. `pylint-config`, `pyreverse`, and `symilar` are other scripts.
- Output/exits: Default text to stdout; `--output-format` selects another reporter. Schema not captured. Bits OR into `msg_status`: F=1, E=2, W=4, R=8, C=16, I=0. No files plus several preprocessing errors exit 32. Then `exit-zero` forces 0; fail-on yields `msg_status` or 1; a score meeting `fail-under` yields 0, a lower score yields `msg_status` or 1; no score returns `msg_status`. Silence alone is not success.
- Effects: Config: default files and command-line plugins load before the check. Network: plugins are arbitrary code; the core path is local AST lint. Children: default job starts no workers; parallel jobs use `ProcessPoolExecutor`; plugins and `init-hook` run project code. Writes: stdout; `DEFAULT_PYLINT_HOME` is a user cache; no documented result file.
- Limits: Plugin and init-hook trust is unbounded.

Sources: https://github.com/pylint-dev/pylint/blob/v4.1.3/pylint/lint/run.py · https://github.com/pylint-dev/pylint/blob/v4.1.3/pylint/constants.py · https://github.com/pylint-dev/pylint/blob/v4.1.3/pyproject.toml

## Pysa pyre-check 0.10.0 (PyPI); GitHub tags stop at v0.9.25

- Artifact: Wheel `pyre_check-0.10.0-py3-none-manylinux1_x86_64.whl` sha256 `715d1c4ec3ab5823bb6c9168a4954cb419d995d637e3e9617d9af1ff49be18b6`, local hash equals the PyPI digest, not a signature. No sdist. `pyre.bin` is a 131170904-byte ELF x86-64, libc-family only. Script `pyre=Pysa.client.pyre:main`; Python >=3.9. Pyrefly is Requires-Dist; a miss is not a download. Unknown hash is not an installer.
- License: MIT. Member LICENSE sha256 `da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93` is not the wheel digest. Audit skipped it (byte cap); this pass matched the wheel, then hashed the member. `pyre.bin` notices not extracted: not a redistribution closure. Text: https://files.pythonhosted.org/packages/24/3b/bea383248304b63dac47759378e729ba51a4a1f7d5ed216503753bbf034c/pyre_check-0.10.0-py3-none-manylinux1_x86_64.whl#pyre_check-0.10.0.dist-info/LICENSE
- Use: Taint analysis: `pyre analyze`, default taint. Not a separate binary. Flags: `--save-results-to`, `--output-format json|sharded-json`, `--pyrefly-binary`. `--use-pyre1` fails. Not executed.
- Output/exits: Not SARIF. `--save-results-to` creates the dir; binary 0 does not forward stdout. Files: `taint-output.json` or `taint-output@*.json`, `taint-metadata.json`, `errors.json`, `rule_coverage.json`, `file_coverage.txt`. Pyrefly 0/1 success, else 15; binary 10/11 become 9/10. Config 6, Click 12, other exceptions 2, missing pyrefly 16.
- Effects: Config: project config, models, and code; logger names any executable. Network: client opens no HTTP; a logger child can; libc-only linkage does not prove `pyre.bin` never sockets; pyrefly unverified. Children: pyrefly check or buck-check after buck2 bxl, plus `pyre.bin`; no watchman. Writes: `.pyre` logs, results dir, `pysa-pyrefly-` report removed unless debug.
- Limits: Linux x86_64 wheel only. Issue keys undecoded. Sockets unverified.

Sources: https://pypi.org/pypi/pyre-check/0.10.0/json · https://files.pythonhosted.org/packages/24/3b/bea383248304b63dac47759378e729ba51a4a1f7d5ed216503753bbf034c/pyre_check-0.10.0-py3-none-manylinux1_x86_64.whl

## griffe 2.4.1

- Artifact: Published PyPI digests, not a signature: sdist `griffe-2.4.1.tar.gz` sha256 `766123e26ec35b2ead63202e9e43ec309d876085d571b7df288256cd6fe4a3ef`; wheel `griffe-2.4.1-py3-none-any.whl` sha256 `ca58ccdb1d8590ad062fad837a875dd704f94acf7a0104795a098a991ceaf728`. Script `griffe = griffecli:main`. Depends on same-version `griffelib` and `griffecli`. `pypi` extra optional.
- License: ISC. Text sha256 `d746d07b994c49910d0212f098ec5981658f95cadb82d725ad52d72afb99ad88` is the tagged LICENSE, not a published digest or either package hash. Copyright (c) 2021 Timothée Mazzucotelli and contributors. Text: https://github.com/mkdocstrings/griffe/blob/2.4.1/LICENSE
- Use: API-breakage check: `griffe check mypackage`. `griffe dump PACKAGE` is a different command. `--extensions` loads extensions. `-b`/`-a` need the `pypi` extra.
- Output/exits: `check` prints breakage lines to stderr. `dump` writes JSON to stdout or a file. `check` returns 0 if clean, 1 for breakages or extension-load errors, 2 on handled GitError. `dump` returns 1 for extension-load errors or an incomplete load, and 0 only for a complete load. Malformed specs and dependency failures are unmapped.
- Effects: Config: no separate check config; `--search` changes import path; extensions load only if passed. Network: a local git ref needs none; `-b`/`-a` hit a registry; extensions are arbitrary code. Children: git-ref check runs git; `-b`/`-a` can run `sys.executable -m pip install`. Writes: temporary worktree created and removed; PyPI loads can fill `user_cache_dir("griffe")`; `dump -o` writes a file.
- Limits: Dump schema not captured. Exit map leaves malformed specs and dependency failures unmapped. Extensions and the pip child need isolation.

Sources: https://github.com/mkdocstrings/griffe/blob/2.4.1/packages/griffecli/src/griffecli/_internal/cli.py · https://github.com/mkdocstrings/griffe/blob/2.4.1/packages/griffelib/src/griffe/_internal/loader.py · https://pypi.org/pypi/griffe/2.4.1/json

## atheris 3.1.0

- Artifact: Wheel `atheris-3.1.0-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl`, 36875908 bytes, sha256 `ec5e11f21a4c197fe91f7aea2b2de88e623c73a21fc07b105ac6329a1588457b`. Local re-hash equals the PyPI digest; not a signature. No sdist. Not pure Python. No console script and no fuzzer executable.
- License: Apache-2.0 text. Member LICENSE sha256 `58d1e17ffe5109a7ae296caafcadfdbe6a7d176f0bc4ab01e12a689b0499d8bd` is not the wheel digest. Audit skipped it (byte cap); this pass matched the wheel, then hashed the member. PyPI license fields null. Does not qualify bundled compiler-rt/libFuzzer; no NOTICE. Text: https://files.pythonhosted.org/packages/0a/88/fd6ad595dafa9c7ce56dbfcaff0c7244988dac3af86c771166c6516ccf6b/atheris-3.1.0-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl#atheris-3.1.0.dist-info/licenses/LICENSE
- Use: In-process fuzzer, not a scanner. `atheris.Setup(sys.argv, TestOneInput)` then `atheris.Fuzz()`. Flag `-atheris_runs=N`. Other single-dash flags are libFuzzer; `--` ignored. Positional non-flags are corpus dirs. Needs CPython 3.12. No selected source build.
- Output/exits: Text, not JSON/SARIF. Uncaught-exception marker plus traceback means the target raised. `Fuzz()` does not return. Numeric `exit`/`_exit` status unknown; no code claimed. Graceful case, where external coverage.py can emit HTML (not an Atheris format): `-atheris_runs` elapsed, a Python exception, or `sys.exit`. A native crash or libFuzzer `-runs` does not produce that HTML.
- Effects: Config: no config file; Setup callable runs on bytes; `instrument_imports` runs import-time code; custom mutator/crossover are user callables. Network: no client in Python modules or those `.so` strings; user code can connect. Not an offline proof. Children: in-process default; user `-fork` can spawn, default unread. Writes: stderr, corpus inputs, `crash-` files under `artifact_prefix` (default unread).
- Limits: Unverified: `Fuzz()` status, `artifact_prefix` and `-fork` defaults, libFuzzer/Clang identity, notice closure.

Sources: https://pypi.org/pypi/atheris/3.1.0/json · https://files.pythonhosted.org/packages/0a/88/fd6ad595dafa9c7ce56dbfcaff0c7244988dac3af86c771166c6516ccf6b/atheris-3.1.0-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl

## Django check Django 6.1.3

- Artifact: Sdist `django-6.1.3.tar.gz`, 11306257 bytes, sha256 `b5d2d9e35295065d13b1927b3f19a59bd119f737aa6299def14ccca1ae3c8c0d`, local hash matches the PyPI digest. Not a signature. Published wheel not selected. Script `django-admin=django.core.management:execute_from_command_line`. Python >=3.12 plus settings. Part of Django, not a separate package.
- License: BSD-3-Clause. Text sha256 `b846415d1b514e9c1dff14a22deb906d794bc546ca6129f950a18cd091e2a669` matches cached LICENSE and the sdist member, not the sdist digest. Not redistribution approval. Text: https://raw.githubusercontent.com/django/django/6.1.3/LICENSE
- Use: System check: `django-admin check` or `python -m django check`. `--fail-level` defaults to ERROR; `--database` is not default. `--skip-checks` is absent.
- Output/exits: Human text, not JSON/SARIF. Footer: no issues (N silenced), one issue, or N issues. Serious issues are `SystemCheckError` on stderr; other visible issues stderr; none visible stdout. Fail-level exits 1. Success terminates 0. Unknown command exits 1. Invalid arguments exit 2 (CPython 3.12 argparse).
- Effects: Config: `DJANGO_SETTINGS_MODULE` or `--settings`, then `django.setup()`. Fail-level ERROR; database off unless named. Apps and cache backends execute. Network: `check.py` and `django/core/checks` show no HTTP client; default path does not connect. Not an offline proof: setup imports, including `AppConfig.ready`, can open the network. Children: `check.py` spawns none; project code may. Writes: stdout/stderr only; project code can write.
- Limits: Contrib checks, including admin and gis, were not scanned for sockets. Bundling not qualified. Needs Python >=3.12 and settings.

Sources: https://files.pythonhosted.org/packages/55/79/49a609ea76ec51404b482932e33f1e6858946b920232c11b11a25bea3032/django-6.1.3.tar.gz · https://pypi.org/pypi/Django/6.1.3/json · https://raw.githubusercontent.com/django/django/6.1.3/django/core/management/base.py
