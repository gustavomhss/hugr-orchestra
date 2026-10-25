# C-R5 · `AtlasResume.admit` accepts an explicit `RecordRef` (R5, Orchestra side)

Model: `opencode-go/beam-free`
Lane: C · Depends on: none in the boundary (it uses `resolveFold(unit, ref)` and `RecordRef`, both exported today). The
host route that lists checkpoints (`listResumable`, B-R5-01) and dispatches the chosen one is C01/C02.
Worktree: the lane worktree given by the runner. Work only there.

## Goal
A resume dispatched for a checkpoint a person picked admits exactly that record: `AtlasResume.admit` takes an optional
`ref`, and when it is given Atlas resolves that record instead of the session's latest admitted receipt, so a session
with several checkpoints and no receipt is admitted rather than refused `ambiguous` (D23). With no `ref`, nothing changes.

## Read first
- `specs/atlas-ui/build/DECISIONS.md` D23; `specs/atlas-ui/build/issues/b-o.md` item 6.
- `removed-v1/src/maestro/atlas-resume.ts` (113 lines): `admit` at 21-71, `selectedRef` at 76-98.
- `modules/atlas/packages/adapter-io/src/native-memory.ts:182-198` (`resolveFold(unit, ref?)`: an explicit ref is looked up
  by `eventId`, then owner and unit are checked — a foreign or mismatched ref is refused, never admitted).
- `removed-v1/src/tool/task.ts:537` (the existing caller; it passes no ref and stays unchanged).
- `removed-v1/test/tool/task-atlas-resume.test.ts:1-100` (fixtures `remember`, `seed`, `offline`, `UNIT`, `OLDER`,
  `NEWER`), `:272-297` (`admissionsOf`, `key`) and the `ambiguous` case at `:379-400`.

## Change
1. `removed-v1/src/maestro/atlas-resume.ts`:
   a. Replace `import type { FoldVerdict, ResumeUnit } from "@orchestra/atlas-boundary/native-memory"` with
      `import type { FoldVerdict, RecordRef, ResumeUnit } from "@orchestra/atlas-boundary/native-memory"`.
   b. In the `admit` input type, after the line `  ctx: Tool.Context` add:
      ```ts
        // R5 (D23): the checkpoint a person picked from the owner's own list. Atlas still checks owner, kind and unit.
        ref?: RecordRef
      ```
   c. Replace `          try: () => memory.resolveFold(unit, selectedRef(history, key)),` with
      `          try: () => memory.resolveFold(unit, input.ref ?? selectedRef(history, key)),`.
   d. Replace the comment line above `export const admit` that reads
      `// unit's latest admitted checkpoint into the child Session once per logical resume. Every verdict, a fold or a refusal,`
      with
      `// unit's latest admitted checkpoint (or the one an explicit ref names) into the child Session once per logical resume. Every verdict, a fold or a refusal,`.
2. `removed-v1/test/tool/task-atlas-resume.test.ts`:
   a. Add the imports `import { AtlasResume } from "@/maestro/atlas-resume"` (after the `AtlasMemory` import) and
      `import type { Tool } from "@/tool/tool"` (after the `Truncate` import).
   b. Inside `describe("tool.task Atlas resume admission", () => {`, after the `"two own records without a receipt yield one
      ambiguous notice…"` case, add:
      ```ts
        it.instance(
          "an explicit ref admits the picked record where two own records and no receipt would be ambiguous",
          () =>
            Effect.gen(function* () {
              const store = yield* remember(OLDER, NEWER)
              const [older] = store.refs as [RecordRef, RecordRef]
              const seeded = yield* seed()
              const agents = yield* Agent.Service
              const agent = yield* agents.get("backend")
              const ctx: Tool.Context = {
                sessionID: seeded.chat.id,
                messageID: seeded.assistant.id,
                callID: "call_explicit",
                agent: "maestro",
                agentID: "maestro",
                abort: new AbortController().signal,
                messages: [],
                metadata: () => Effect.void,
                ask: () => Effect.void,
              }
              const picked = yield* offline(AtlasResume.admit({ agent, sessionID: seeded.chat.id, unit: UNIT, ctx, ref: older }))
              const admissions = admissionsOf(picked)
              expect(admissions).toMatchObject([
                { key: key(store.projectID, seeded.chat, "call_explicit"), verdict: { ok: true, ref: older } },
              ])
              expect(admissions[0]!.text).toContain(OLDER.stoppedAt)
              expect(admissions[0]!.text).not.toContain(NEWER.stoppedAt)
              // A ref no record carries is refused by Atlas, never replaced by another checkpoint.
              const missing = { contentHash: "0".repeat(64), eventId: "0".repeat(64) }
              const refused = yield* offline(
                AtlasResume.admit({ agent, sessionID: seeded.chat.id, unit: UNIT, ctx: { ...ctx, callID: "call_missing" }, ref: missing }),
              )
              expect(admissionsOf(refused)).toMatchObject([{ verdict: { ok: false, refusal: "record-not-found" } }])
            }),
          { git: true },
        )
      ```

## Touch only
- `removed-v1/src/maestro/atlas-resume.ts`
- `removed-v1/test/tool/task-atlas-resume.test.ts`

## Done when
- `grep -n "input.ref ?? selectedRef(history, key)" removed-v1/src/maestro/atlas-resume.ts` prints 1 line.
- `grep -n "ref?: RecordRef" removed-v1/src/maestro/atlas-resume.ts` prints 1 line.
- `grep -n "AtlasResume.admit" removed-v1/src/tool/task.ts` still prints exactly the one unchanged line.
- Lead acceptance: `bun run test:ci orchestra test/tool/task-atlas-resume.test.ts test/research/atlas-owners.test.ts
  test/session/atlas-resume-compaction.test.ts` is green, and `gh workflow run typecheck.yml --ref <branch>` is green.

## Do not
- Run tests, typecheck, builds or installs on this machine.
- Change `task.ts`, `AtlasMemory.UnitParam` or the task tool's schema (a model never passes a ref; the host route does).
- Change the admission key: once-per-logical-resume still holds for an explicit ref.
- Commit, push or switch branches. The lead commits.
- Make a choice the brief does not make. If something does not match the brief, stop and report exactly what differs.
