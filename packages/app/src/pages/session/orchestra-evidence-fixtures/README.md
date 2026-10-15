# Captured runner output

Bun 1.3.14, Vitest 4.1.7, Playwright 1.59.1, pytest 9.0.3, Go 1.27.1 and Cargo 1.98.0 logs were recovered from the interrupted implementation. Absolute fixture paths were replaced by `/repo`; output is test input, not proof that this application passed those suites.

The former illustrative Jest log was replaced on 2026-10-03 by actual Jest 30.2.0 output (exit 1). Reproduce from this directory:

```sh
bunx jest@30.2.0 --runInBand --config '{"rootDir":".","testMatch":["**/jest-fail.case.cjs","**/jest-pass.case.cjs"]}'
```

The `.case.cjs` inputs intentionally include a failure. Normal Bun test discovery does not select them. No Jest runtime dependency is added to the app.

## Parser review regressions

The following additional logs are actual captures from the checked-in inputs, using Jest 30.2.0, pytest 9.0.3 and Bun 1.3.14. Reporter-only trailing whitespace is trimmed for clean Git diffs; spaces inside nodeids remain intact. Run from this directory (redirect both stdout and stderr to capture the reporter):

```sh
bunx jest@30.2.0 --ci --runInBand --verbose=false --config '{"rootDir":".","testMatch":["**/jest-console.case.cjs","**/jest-pass.case.cjs"]}'
bunx jest@30.2.0 --ci --runInBand --verbose=false --config '{"rootDir":".","testMatch":["**/jest-console-fail.case.cjs","**/jest-pass.case.cjs"]}'
python3 -m pytest -q --tb=short 'pytest_nodeid_case.py::test_label[hello world]'
python3 -m pytest -q --tb=short 'pytest_nodeid_case.py::test_label[hello - world]'
bun test ./bun-ghost.case.ts
```

`jest-console.txt` passes and contains a reporter heading, while `jest-console-fail.txt` also has a real failing test named `Console`. Both pytest captures intentionally fail; the second has an ambiguous summary delimiter. `bun-ghost.txt` passes while test stdout prints a fake failure record, so its output must remain raw.

`pw-extra-failure-row.invalid.txt` is an explicitly adversarial footer derived from the captured Playwright format, with an extra failure row. It is not claimed to be a genuine standard-reporter result.
