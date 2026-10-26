# C-R1 · `atlas_memory_emit` kind `project` proposes the rule instead of writing it (R1, Orchestra side)

Model: `opencode-go/beam-free`
Lane: C · Depends on: B-R1-01 (Atlas `proposeProjectRule`), C01 (regenerated `@orchestra/atlas-boundary` with it)
Worktree: the lane worktree given by the runner. Work only there.

## Goal
A native seat's `atlas_memory_emit` with a project rule `{rule, scope}` no longer writes `memory.jsonl`: it appends a
`memory-proposal` through `proposeProjectRule`, returns the new outcome `proposed` with the proposal id, and tells the
member the rule waits for the steward (D18). Task and PR entries are unchanged. Indexing by a person is C01/C02.

## Read first
- `specs/atlas-ui/build/DECISIONS.md` D14, D18; `specs/atlas-ui/build/issues/b-o.md` item 5.
- `removed-v1/src/tool/atlas-memory.ts:1-8` (imports) and `:93-167` (`AtlasMemoryEmitTool`).
- `removed-v1/src/maestro/atlas-memory.ts:39-53` (`MemoryOutcome`, `Receipt`).
- `modules/atlas/boundary/src/generated/native-memory.d.ts`: confirm it declares `proposeProjectRule(input: AtlasBinding,
  entry: unknown, at: string): ProposalVerdict` (C01 regenerated it). If it does not, stop and report.
- `removed-v1/test/tool/atlas-memory.test.ts:1-110` (the `tools(scanner)` fixture, `lines`, `receiptOf`) and
  `:150-200`.
- `removed-v1/test/research/atlas-owners.test.ts:28-60` (fixtures), `:100-105`, `:150-200`.
- `packages/jimmy-specialist/skills/jimmy-discovery/references/atlas.md:25-36`.

## Change
1. `removed-v1/src/maestro/atlas-memory.ts`:
   a. Replace `export type MemoryOutcome = "admitted" | "refused" | "unavailable" | "uncertain"` with
      `export type MemoryOutcome = "admitted" | "proposed" | "refused" | "unavailable" | "uncertain"`.
   b. In `export type Receipt = {`, after the line `  ref?: RecordRef` add `  proposalId?: string`.
2. `removed-v1/src/tool/atlas-memory.ts`:
   a. Before the line `import type { BoundEntry } from "@orchestra/atlas-boundary/native-memory"` add
      `import { proposeProjectRule } from "@orchestra/atlas-boundary/native-memory"`.
   b. In the `description:` string of `AtlasMemoryEmitTool`, replace
      `or a project rule {rule, scope, grounding?} (never set frecency).` with
      `or a project rule {rule, scope} (never set frecency or grounding). A project rule is not written: it is proposed to the steward and joins your rules only once a person indexes it.`
      and replace `Outcomes: admitted (with its record ref), refused` with
      `Outcomes: admitted (with its record ref), proposed (a project rule, with its proposal id), refused`.
   c. Inside the `try:` arrow, after the line
      `                    if (reconciled.store === "unavailable") return { outcome: "unavailable", store: "unavailable" }` add:
      ```ts
                          // R1 (D18): a project rule is proposed for the steward; the member never writes it itself.
                          if (Object.hasOwn(input.entry, "rule")) {
                            const proposed = proposeProjectRule(memory.binding, input.entry, new Date().toISOString())
                            if (!proposed.ok) return { outcome: "refused", refusal: proposed }
                            return {
                              outcome: "proposed",
                              proposalId: proposed.proposalId,
                              ...(proposed.reconciled && { reconciled: true as const }),
                            }
                          }
      ```
      (An already-indexed identical rule is still found by `reconcile` above and reported `admitted` + `reconciled`.)
   d. In the `const receipt: AtlasMemory.Receipt = {` literal, after the line `            ...(verdict.ref && { ref: verdict.ref }),`
      add `            ...(verdict.proposalId && { proposalId: verdict.proposalId }),`.
   e. Replace the `note:` expression (the 8 lines from `              note:` through `                    : "Not confirmed as remembered.",`) with:
      ```ts
                    note:
                      verdict.outcome === "admitted"
                        ? verdict.reconciled
                          ? "Already recorded; nothing new was written."
                          : "Remembered."
                        : verdict.outcome === "proposed"
                          ? verdict.reconciled
                            ? "Already proposed; nothing new was written. It joins your rules only once a person indexes it."
                            : "Proposed for the steward; it joins your rules only once a person indexes it."
                          : verdict.outcome === "refused"
                            ? "Not remembered."
                            : "Not confirmed as remembered.",
      ```
3. `packages/jimmy-specialist/skills/jimmy-discovery/references/atlas.md`:
   a. Replace the line `- Project: \`rule\`, \`scope\`, optional \`grounding\`.` with
      `- Project: \`rule\`, \`scope\`. A project rule is a proposal: a person indexes or discards it, and it reaches your header only once indexed.`
   b. In the line starting `Reconcile-before-write is native.`, replace `Preserve \`admitted\`, \`refused\`,` with
      `Preserve \`admitted\`, \`proposed\`, \`refused\`,`.
4. `removed-v1/test/tool/atlas-memory.test.ts`: add `import { readFileSync } from "node:fs"` after
   `import { mkdir } from "node:fs/promises"`, and append this case at the end of the file:
   ```ts
   it.instance(
     "a project rule is proposed to the steward and never written to memory",
     () =>
       Effect.gen(function* () {
         const directory = (yield* TestInstance).directory
         const t = yield* tools("clean")
         const rule = { rule: "run go vet before the handler tests", scope: "packages/api" }
         const first = yield* t.emit(rule)
         const receipt = receiptOf(first)
         expect(receipt).toMatchObject({ op: "emit", outcome: "proposed" })
         expect(typeof receipt.proposalId).toBe("string")
         expect(JSON.parse(first.output).note).toBe("Proposed for the steward; it joins your rules only once a person indexes it.")
         expect(yield* lines).toBe(0)
         const again = receiptOf(yield* t.emit(rule))
         expect(again).toMatchObject({ outcome: "proposed", proposalId: receipt.proposalId, reconciled: true })
         const review = readFileSync(path.join(directory, ".atlas/review.jsonl"), "utf8").split("\n").filter(Boolean)
         expect(review).toHaveLength(1)
         const grounded = receiptOf(yield* t.emit({ ...rule, grounding: "packages/api@abc" }))
         expect(grounded).toMatchObject({ outcome: "refused", refusal: { ok: false, refusal: "template-invalid" } })
       }).pipe(Effect.provide(layer)),
     { git: true },
   )
   ```
5. `removed-v1/test/research/atlas-owners.test.ts` (rules reach a header only once indexed, so the tests that
   need a rule in the header write it as the steward's host action would, through `memory.write`):
   a. After the `function receipt(result: Tool.ExecuteResult) {…}` block add:
      ```ts
      // R1: the emit tool only proposes a rule; indexing writes it as the member through the bound Memory, as here.
      const indexRule = Effect.fn("AtlasOwnersTest.indexRule")(function* (member: "backend" | "jimmy" | "archie", rule: string) {
        const memory = yield* AtlasMemory.open(execution, { id: member, native: true })
        if ("unavailable" in memory) throw new Error(memory.unavailable)
        const written = memory.write({ rule, scope: "source" })
        if (!written.ok) throw new Error(JSON.stringify(written))
      })
      ```
   b. Replace the two lines
      ```ts
            const rule = yield* emit.execute({ entry: { rule: `${member} rule only`, scope: "source" } }, context(member))
            expect(receipt(rule).outcome).toBe("admitted")
      ```
      with
      ```ts
            const proposed = yield* emit.execute({ entry: { rule: `${member} rule only`, scope: "source" } }, context(member))
            expect(receipt(proposed).outcome).toBe("proposed")
            yield* indexRule(member, `${member} rule only`)
      ```
   c. Replace EVERY occurrence (there are two) of the line
      ```ts
            expect(receipt(yield* emit.execute({ entry: { rule: `${member} interleaved rule`, scope: "source" } }, ctx)).outcome).toBe("admitted")
      ```
      with
      ```ts
            yield* indexRule(member, `${member} interleaved rule`)
      ```
      (Each write still appends one memory line, so the decay waves and the `lines` count of 9 are unchanged.)

## Touch only
- `removed-v1/src/maestro/atlas-memory.ts`
- `removed-v1/src/tool/atlas-memory.ts`
- `packages/jimmy-specialist/skills/jimmy-discovery/references/atlas.md`
- `removed-v1/test/tool/atlas-memory.test.ts`
- `removed-v1/test/research/atlas-owners.test.ts`

## Done when
- `grep -n "proposeProjectRule" removed-v1/src/tool/atlas-memory.ts` prints 2 lines.
- `grep -n "\"proposed\"" removed-v1/src/maestro/atlas-memory.ts removed-v1/src/tool/atlas-memory.ts` prints 3 lines.
- `grep -n "interleaved rule\`, scope: \"source\" } }, ctx" removed-v1/test/research/atlas-owners.test.ts` prints nothing.
- Lead acceptance: `bun run test:ci orchestra test/tool/atlas-memory.test.ts test/research/atlas-owners.test.ts
  test/tool/task-atlas-resume.test.ts test/maestro/backend-memory-result.test.ts` is green, and
  `gh workflow run typecheck.yml --ref <branch>` is green.

## Do not
- Run tests, typecheck, builds or installs on this machine.
- Edit `modules/atlas/**` or the generated boundary (`modules/atlas/boundary/src/generated/*`).
- Change the task/PR write path, `reconcile`, `selectedRef` or the recall tool.
- Commit, push or switch branches. The lead commits.
- Make a choice the brief does not make. If something does not match the brief, stop and report exactly what differs.
