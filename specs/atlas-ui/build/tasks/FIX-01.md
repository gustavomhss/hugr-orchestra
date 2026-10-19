# FIX-01 · Fix the type errors CI found in four new Atlas tests

Model: `opencode-go/deepseek-v4.1-flash`
Lane: FIX · Depends on: lanes B-K and B-O merged into `atlas-ui-study`
Worktree: the lane worktree given by the runner. Work only there.

## Goal
`npm run typecheck` in `modules/atlas` stops reporting the eleven errors below. Only test files change.

CI errors (run 39195720551, job atlas):
- `packages/adapter-io/test/governed-emit-replace.test.ts(27,3/27,15)`: `ReconcileApi` is imported from `@atlas/tools`, but `WireSeams.classifier` is the `@atlas/knowledge` `ReconcileApi`.
- `packages/adapter-io/test/open-questions-source.test.ts(28,145/28,161)`: `string` is not assignable to `PredicateSlot` / `Tier`.
- `packages/cli/test/promote-select-cli.test.ts(5,15)`: `@atlas/adapter-io` has no exported member `Hash`.
- `packages/cli/test/promote-select-cli.test.ts(42,12 … 57,12)`: object is possibly `undefined` (`calls[0]`).
- `packages/cli/test/ratify-cli.test.ts(6,15/6,28)`: `CurrentFact` and `GroundedFact` are not exported from `../src/ratify-cli.js`.

## Read first
All paths are under `modules/atlas/packages/`.
- `adapter-io/test/governed-emit-replace.test.ts:15-30`
- `adapter-io/test/open-questions-source.test.ts:1-35`
- `cli/test/promote-select-cli.test.ts:1-60`
- `cli/test/ratify-cli.test.ts:1-10`

## Change
1. `adapter-io/test/governed-emit-replace.test.ts`. Replace the two lines
   ```ts
   import type { T0Heuristic, TruthGate, ReconcileApi } from "@atlas/tools"
   import type { GroundedFact } from "@atlas/knowledge"
   ```
   with
   ```ts
   import type { T0Heuristic, TruthGate } from "@atlas/tools"
   import type { GroundedFact, ReconcileApi } from "@atlas/knowledge"
   ```
2. `adapter-io/test/open-questions-source.test.ts`.
   a. After the last `import` line at the top, add:
      ```ts
      import type { Tier } from "@atlas/contracts"
      import type { PredicateSlot } from "@atlas/knowledge"
      ```
      If the file already imports from `@atlas/knowledge` with `import type { … }`, add `PredicateSlot` to that list instead of adding a second line. Do the same for `@atlas/contracts` and `Tier`.
   b. Replace `    const rows = [` (the array of `{ nodeKey, tier, claimNorm, anchor, slot, authoring }` objects) with:
      ```ts
          const rows: readonly { nodeKey: string; tier: Tier; claimNorm: string; anchor: string; slot: PredicateSlot; authoring: string }[] = [
      ```
3. `cli/test/promote-select-cli.test.ts`.
   a. Replace `import type { Hash, PromoteOut, PromoteSelect } from "@atlas/adapter-io"` with two lines:
      ```ts
      import type { Hash } from "@atlas/contracts"
      import type { PromoteOut, PromoteSelect } from "@atlas/adapter-io"
      ```
   b. In this file, replace every `calls[0].` with `calls[0]!.`. Exactly the occurrences inside `it(...)` bodies; there are five or more. `calls[0].select!.held` becomes `calls[0]!.select!.held`.
4. `cli/test/ratify-cli.test.ts`. Replace `import type { CurrentFact, GroundedFact, RatifyPorts } from "../src/ratify-cli.js"` with:
   ```ts
   import type { RatifyPorts } from "../src/ratify-cli.js"
   import type { CurrentFact } from "@atlas/adapter-io"
   import type { GroundedFact } from "@atlas/knowledge"
   ```
   If `@atlas/adapter-io` is already imported with a value import (`import { readReview, foldReview } from "@atlas/adapter-io"`), keep it and add the separate `import type` line as written.

## Touch only
- `modules/atlas/packages/adapter-io/test/governed-emit-replace.test.ts`
- `modules/atlas/packages/adapter-io/test/open-questions-source.test.ts`
- `modules/atlas/packages/cli/test/promote-select-cli.test.ts`
- `modules/atlas/packages/cli/test/ratify-cli.test.ts`

## Done when
- `grep -n 'ReconcileApi } from "@atlas/tools"' modules/atlas/packages/adapter-io/test/governed-emit-replace.test.ts` prints nothing.
- `grep -c 'calls\[0\]\.' modules/atlas/packages/cli/test/promote-select-cli.test.ts` prints `0`.
- `grep -n 'from "../src/ratify-cli.js"' modules/atlas/packages/cli/test/ratify-cli.test.ts` shows only `RatifyPorts`.
- Lead acceptance: the atlas CI job.

## Do not
- Change any file under `src/`.
- Run tests, typecheck, builds or installs. Commit, push or switch branches.
