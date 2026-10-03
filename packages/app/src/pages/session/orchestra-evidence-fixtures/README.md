# Captured runner output

Bun 1.3.14, Vitest 4.1.7, Playwright 1.59.1, pytest 9.0.3, Go 1.27.1 and Cargo 1.98.0 logs were recovered from the interrupted implementation. Absolute fixture paths were replaced by `/repo`; output is test input, not proof that this application passed those suites.

The former illustrative Jest log was replaced on 2026-10-03 by actual Jest 30.2.0 output (exit 1). Reproduce from this directory:

```sh
bunx jest@30.2.0 --runInBand --config '{"rootDir":".","testMatch":["**/jest-*.case.cjs"]}'
```

The `.case.cjs` inputs intentionally include a failure. Normal Bun test discovery does not select them. No Jest runtime dependency is added to the app.
