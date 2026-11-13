import { expect } from "bun:test"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Scope } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { GitCli } from "@orchestra/core/git-cli"
import { AppProcess } from "@orchestra/core/process"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { ReviewTools } from "@orchestra/core/review/tools"
import { SessionSchema } from "@orchestra/core/session/schema"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { testEffect } from "../../../../packages/core/test/lib/effect"
import { ReviewBindingV2 } from "../src/v2/tools/review-binding"

// Fixture Scope is the frozen review-pr.ts caller seam, not a PR-controller proof.
const it = testEffect(AppNodeBuilder.build(LayerNode.group([GitCli.node, AppProcess.node])))
const file = "src/a.ts"
const bytes = "export const captured = \"lucy-code-bytes\"\n"
const lead = { role: "lead" as const, retained: "review:test/retained.json", cap: 0 }

const seeded = Effect.gen(function* () {
  const worktree = yield* Effect.acquireRelease(
    Effect.promise(async () => fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "lucy-code-")))),
    (dir) => Effect.promise(() => fs.rm(dir, { recursive: true, force: true })),
  )
  const cli = yield* GitCli.Service
  const git = (args: string[]) =>
    cli.run(args, { cwd: worktree }).pipe(
      Effect.flatMap((result) => (result.exitCode === 0 ? Effect.succeed(result.text().trim()) : Effect.die(result.text()))),
    )
  yield* Effect.promise(async () => {
    await fs.mkdir(path.join(worktree, "src"))
    await fs.writeFile(path.join(worktree, file), bytes)
  })
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.email", "lucy@example.com"],
    ["config", "user.name", "Lucy"],
    ["config", "commit.gpgsign", "false"],
    ["add", "-A"],
    ["commit", "-q", "-m", "base"],
  ]) yield* git(args)
  const full = yield* git(["rev-parse", "HEAD"])
  const tree = yield* git(["rev-parse", `${full}^{tree}`])
  expect(full).not.toBe(tree)
  return { worktree, full, tree }
})

it.live("lead codeSource is the captured full commit and outlives a short read", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* seeded
    const worktree = made.worktree
    const full = made.full
    const tree = made.tree
    const processes = yield* AppProcess.Service
    const sessionID = SessionSchema.ID.make("ses_code_lead")
    const snapshot = yield* Effect.scoped(Effect.gen(function* () {
      const parentScope = yield* Scope.Scope
      const copies = yield* Effect.cached(Effect.all({
        head: ReviewScratch.create({ worktree, revision: full }),
        base: ReviewScratch.create({ worktree, revision: full }),
      }, { concurrency: 1 }).pipe(
        Effect.provideService(AppProcess.Service, processes),
        Effect.provideService(Scope.Scope, parentScope),
      ))
      const held = { worktree, diff: "", cache: `lucy-code-${full.slice(0, 12)}`, lenses: [] as string[], ledger: ReviewProbe.ledger(), copies, headCommit: full }
      yield* ReviewTools.bind(sessionID, yield* ReviewBindingV2.reviewBinding(held)({ sessionID, ...lead }))
      const source = yield* Effect.scoped(Effect.gen(function* () {
        const read = yield* ReviewTools.readCode(sessionID)
        expect(read.source.directory).not.toBe(worktree)
        expect(yield* Effect.promise(() => fs.readFile(path.join(read.source.directory, file), "utf8"))).toBe(bytes)
        expect(read.source.worktree).toBe(worktree)
        expect(read.source.commit).toBe(full)
        expect(read.source.commit).not.toBe(tree)
        return read.source
      }))
      expect(existsSync(path.join(source.directory, file))).toBe(true)
      expect((yield* Effect.scoped(ReviewTools.readCode(sessionID))).source.directory).toBe(source.directory)
      expect(source.commit).not.toBe((yield* copies).head.revision)
      return source.directory
    }))
    expect(existsSync(snapshot)).toBe(false)
    expect((yield* ReviewTools.readCode(sessionID).pipe(Effect.scoped, Effect.flip)).message).toContain("review-code-binding-missing")
  }),
)

it.live("omitted headCommit does not invent a semantic commit", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* seeded
    const worktree = made.worktree
    const full = made.full
    const processes = yield* AppProcess.Service
    const sessionID = SessionSchema.ID.make("ses_code_omit")
    yield* Effect.scoped(Effect.gen(function* () {
      const parentScope = yield* Scope.Scope
      const copies = yield* Effect.cached(Effect.all({
        head: ReviewScratch.create({ worktree, tree: true }),
        base: ReviewScratch.create({ worktree, tree: true }),
      }, { concurrency: 1 }).pipe(
        Effect.provideService(AppProcess.Service, processes),
        Effect.provideService(Scope.Scope, parentScope),
      ))
      const held = { worktree, diff: "", cache: `lucy-omit-${full.slice(0, 12)}`, lenses: [] as string[], ledger: ReviewProbe.ledger(), copies }
      yield* ReviewTools.bind(sessionID, yield* ReviewBindingV2.reviewBinding(held)({ sessionID, ...lead }))
      const read = yield* Effect.scoped(ReviewTools.readCode(sessionID))
      expect(read.source.commit).toBeUndefined()
      expect((yield* copies).head.kind).toBe("worktree")
      expect((yield* copies).head.revision).toBe(full)
    }))
  }),
)
