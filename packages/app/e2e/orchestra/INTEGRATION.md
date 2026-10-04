# Integrated Orchestra verification

Run from `packages/app`, holding the shared machine E2E lock when applicable:

```sh
PLAYWRIGHT_PORT=5030 bunx playwright test --config e2e/orchestra/integration.config.ts
```

This builds the production frontend with explicit mocked API binding
`http://127.0.0.1:4096` and previews it on an independent port. Preview environment
variables cannot alter a previously built bundle's API binding. The suite includes
the existing regression, smoke and user-story specs as well as Orchestra features;
performance workloads retain their separate runner.

Three `@development-only` cases operate the real DebugBar direction override to
exercise English with forced RTL. DebugBar is intentionally absent from production.
The normal `playwright.config.ts` runner, used by CI, executes all three; the
production runner executes English LTR and actual Arabic RTL with provider/portal
alignment, keyboard and focus checks. Neither changing only `html.dir` nor adding
a debug button to a production bundle substitutes for those proofs.

The native-frame and dialog-lifetime specs also compile isolated real components
with fixture providers. Passing them is not packaged Electron or OS hit-zone proof.
Recorded screenshots and benchmark receipts must name their tested source/bundle.
