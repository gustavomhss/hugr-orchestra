import { expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import type { File } from "@orchestra/core/file"
import { Snapshot } from "@orchestra/core/snapshot"
import { Seats } from "@orchestra/maestro/seats"
import { ConductorV2 } from "../src/v2/conductor"

// Maestro's conductor limits: board reads before board changes, no merges, a read budget a dispatch resets, and a write
// budget measured on the worktree. The worktree here is a list of trees, each the diff against the first one.

const worktree = (trees: ReadonlyArray<ReadonlyArray<File.Diff>>) => {
  const state = { at: 0 }
  const snapshot: Snapshot.Interface = {
    capture: () => Effect.succeed(Snapshot.ID.make(`tree-${state.at}`)),
    files: () => Effect.succeed([]),
    diff: (input) => Effect.succeed(input.from === input.to ? [] : (trees[Number(input.to.slice(5))] ?? [])),
    preview: () => Effect.succeed([]),
    restore: () => Effect.void,
    checkout: () => Effect.void,
  }
  return { snapshot, change: () => state.at++ }
}

const diff = (file: string, lines: number) => ({ path: file, status: "modified", additions: lines, deletions: 0, patch: "" }) as File.Diff

const call = (conductor: ReturnType<typeof ConductorV2.make>, tool: string, args: Record<string, unknown> = {}, agent = "maestro") =>
  Effect.runPromiseExit(conductor.run({ tool, args, sessionID: "ses_a", callID: "call", agent }, Effect.succeed("ok")))

const refusal = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) && exit.cause.toString().includes("Tool safety HOLD") ? String(exit.cause) : undefined

test("a board change or a carded dispatch needs a board_read of its project this drain", async () => {
  const conductor = ConductorV2.make(worktree([]).snapshot)
  expect(refusal(await call(conductor, "board_issue", { project: "ORC", title: "x" }))).toContain("maestro-board-unread")
  expect(refusal(await call(conductor, "task", { subagent_type: "backend", card: "ORC-4" }))).toContain("maestro-board-unread")
  expect(refusal(await call(conductor, "board_read", {}))).toBeUndefined()
  expect(refusal(await call(conductor, "board_move", { project: "ORC", number: 4 }))).toContain("maestro-board-unread")
  await call(conductor, "board_read", { project: "ORC" })
  expect(refusal(await call(conductor, "board_move", { project: "ORC", number: 4 }))).toBeUndefined()
  expect(refusal(await call(conductor, "task", { subagent_type: "backend", card: "ORC-4" }))).toBeUndefined()
  expect(refusal(await call(conductor, "board_project", { name: "New" }))).toBeUndefined()
  conductor.idle("ses_a")
  expect(refusal(await call(conductor, "board_move", { project: "ORC", number: 4 }))).toContain("maestro-board-unread")
})

test("Maestro never merges a pull request from the shell", async () => {
  const conductor = ConductorV2.make(worktree([]).snapshot)
  expect(refusal(await call(conductor, "bash", { command: "cd repo && gh pr merge 12 --squash" }))).toContain("board_queue")
  expect(refusal(await call(conductor, "bash", { command: "gh pr view 12" }))).toBeUndefined()
})

test("the eleventh read goes to the research seat, and a settled foreground dispatch resets the count", async () => {
  const conductor = ConductorV2.make(worktree([]).snapshot)
  for (const tool of ["read", "grep", "glob", "webfetch", "websearch", "read", "read", "read", "read", "read"])
    expect(refusal(await call(conductor, tool))).toBeUndefined()
  const held = refusal(await call(conductor, "grep"))
  expect(held).toContain("maestro-read-budget")
  expect(held).toContain(`\`${Seats.research()?.id}\``)
  await call(conductor, "task", { subagent_type: "jimmy", background: true })
  expect(refusal(await call(conductor, "read"))).toContain("maestro-read-budget")
  await call(conductor, "task", { subagent_type: "jimmy" })
  expect(refusal(await call(conductor, "read"))).toBeUndefined()
})

test("a failed call does not count, and other agents are not limited", async () => {
  const conductor = ConductorV2.make(worktree([]).snapshot)
  for (const _ of Array.from({ length: 12 })) {
    await Effect.runPromiseExit(
      conductor.run({ tool: "read", args: {}, sessionID: "ses_a", callID: "call", agent: "maestro" }, Effect.fail("missing")),
    )
    expect(refusal(await call(conductor, "read", {}, "backend"))).toBeUndefined()
  }
  expect(refusal(await call(conductor, "read"))).toBeUndefined()
})

test("Maestro's changes past the budget stand, then further edits are refused and a shell that changes more locks it", async () => {
  const tree = worktree([[], [diff("a.ts", 15)], [diff("a.ts", 15), diff("b.ts", 10)], [diff("a.ts", 15), diff("b.ts", 10), diff("c.ts", 1)]])
  const conductor = ConductorV2.make(tree.snapshot)
  expect(refusal(await call(conductor, "edit", { filePath: "a.ts" }))).toBeUndefined()
  tree.change()
  expect(refusal(await call(conductor, "edit", { filePath: "b.ts" }))).toBeUndefined()
  tree.change()
  expect(refusal(await call(conductor, "edit", { filePath: "c.ts" }))).toContain("maestro-write-budget")
  expect(refusal(await call(conductor, "bash", { command: "git status" }))).toBeUndefined()
  tree.change()
  expect(refusal(await call(conductor, "bash", { command: "git status" }))).toContain("writePaths")
  conductor.idle("ses_a")
  expect(refusal(await call(conductor, "edit", { filePath: "c.ts" }))).toBeUndefined()
})

test("without snapshots nothing is measured", async () => {
  const conductor = ConductorV2.make({ ...worktree([]).snapshot, capture: () => Effect.succeed(undefined) })
  for (const _ of Array.from({ length: 5 })) expect(refusal(await call(conductor, "write", { filePath: "x.ts" }))).toBeUndefined()
})
