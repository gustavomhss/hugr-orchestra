# qa/vite

A pinned Vite project that serves as the dev-server workload of the [QA harness](../README.md). It holds a
`package.json` (a `dev` script that runs `vite`, with Vite as the only dev dependency) and a `package-lock.json` that
fixes the dependency tree. It has no source files of its own.

## What uses it

- `qa/src/fetch.rs` copies these two files into the per-OS cache (`qa/.cache/<os>-<arch>/vite`) and installs from the lock.
- QA-B starts `npm run dev` there (npm, sh, node, esbuild), waits for `ready`, fetches `/@vite/client` and stops it.
  Runners: `qa/src/rust/suites.rs` and `qa/node/workloads.mjs`.
- The QA-E agent loop runs `npm ls --depth=0` in it (`qa/workloads/agent.json`).

Both files are inputs, not code. Update the lock together with `package.json`; the harness then runs offline.

## Who runs it

Someone running `qa/run`. No workflow under `.github/workflows` runs the QA harness today.

Back to [Omni](../../README.md) or the [QA harness](../README.md).
