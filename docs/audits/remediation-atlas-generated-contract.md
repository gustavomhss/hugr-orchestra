# L11: official generated-artifact qualification

Lead-owned plan, requiring independent review before implementation. Source65 is already qualified; this stage produces and tests the actual installed boundary. It adds no runtime product API and no generic CI mode or environment switch.

## Exact request and custody

Use the existing official launcher:

```sh
bun run test:ci core test/atlas-generated-artifact.test.ts --timeout 900000 --os linux
```

The existing request reader may emit one additional boolean output only when the normalized request is exactly package `core`, directory `packages/core`, runner `bun`, and args `["test/atlas-generated-artifact.test.ts", "--timeout", "900000"]`. No substring/filter, alternate timeout, extra selector, env switch or automatic generator dispatch is accepted as this qualification request. Ordinary tests and other workflows retain their behavior.

Add one pinned `upload-artifact` step after Run tests, gated on that boolean and Linux. Use `always()` to preserve failure evidence, the existing upload action SHA `ea165f8d65b6e75b540449e92b4886f43607fa02`, retention seven days and `if-no-files-found: error`. Its only path is the dedicated `test-ci-evidence/atlas-generated/` directory. No credentials, dependency trees or unrelated workspace files enter it. No new workflow, runner type, package or CLI option is needed.

## Producer test

Add one Core hosted-only test and, if useful, its narrowly scoped fixture. Require Linux and hosted run identity explicitly. Call `expectSpawn(import.meta.path)` in its body. Invoke the actual official generator through `AppProcess` supplied by `AppNodeBuilder`; no raw spawn or local generator execution. All child work, output readers and cleanup must be joined; failures fail the test, and owned containment is never a success criterion.

From `modules/atlas/boundary`, run `bun run generate`; hash the exact 18 generated JS/declaration files; run `bun run generate` again and require exact hash equality; then run `bun run check:generated` and require success. Each command is bounded and its actual exit/truncation outcome recorded. A test-level 15-minute timeout contains the complete stage; it does not certify successful child cleanup after expiry. Root will inspect command and job outcomes.

Copy only the 18 actual output files into the dedicated artifact directory, preserving their boundary-relative names. Capture a provenance JSON with the hosted snapshot SHA, run ID/attempt, OS/arch, actual Bun and Node versions, request, generator SHA256, root and nested lock SHA256, actual source-file hash manifest, pre-generation hashes, both generated manifests, generated diff identity and command outcomes. Create a failure-stage receipt as work progresses; failed or partial output must never be labeled qualified. Include no process environment dump. Root independently verifies artifact paths and hashes before recovering the producer's exact bytes into the integration branch; generated source is never hand-edited.

## Installed product witness

After official generation, import the actual package export `@orchestra/atlas-boundary/native-memory`, not a source bundle or test-specific re-export. Reuse only the controlled POSIX scanner and binding setup from the existing fixture; do not invoke its source-bundling `make` function. Use actual durable files in an owned temporary repository.

At minimum, verify public `reconcile({rule, scope})` is absent before proposal; propose and decide indexed; require a single immutable receipt; reopen using a fresh public `createNativeMemory(binding)` and require `reconcile` returns present with the exact decision ref. Then retry the same decision, require identical ref/receipt bytes, and verify a scanner-induced refusal produces neither an active rule nor a decision receipt for that refused proposal. Read files only as witnesses; never duplicate the production projection algorithm. Preserve the public scanner gate and actual source65 tests unchanged.

The installed witness and provenance require full Root and independent review before serial typechecking and the one hosted request. A passing run qualifies only that snapshot's generated Linux boundary; full Atlas/Vitest/Own and final aggregate CI remain separate gates. Later Atlas source changes invalidate the generated qualification and justify regeneration.
