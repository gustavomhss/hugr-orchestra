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
alignment, keyboard and focus checks, and asserts that no DebugBar direction
control ships. Neither changing only `html.dir` nor adding a debug button to a
production bundle substitutes for those proofs.

Sixteen `@source-fixture` cases in `governance-lifetime.spec.ts`,
`theme-first-paint.spec.ts` and `startup-branding.spec.ts` import unbundled
fixture or renderer modules through Vite. Run them on the development server;
they do not exist in production assets. All nineteen development/source cases
remain in the default CI runner:

```sh
PLAYWRIGHT_PORT=5031 bunx playwright test --grep '@development-only|@source-fixture'
```

The native-frame spec starts its own isolated real-component server and also
runs alongside production verification. Passing it is not packaged Electron or OS hit-zone proof.
Recorded screenshots and benchmark receipts must name their tested source/bundle.
