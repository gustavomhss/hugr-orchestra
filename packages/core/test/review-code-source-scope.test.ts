import { expect } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { GitCli } from "@orchestra/core/git-cli"
import { AppProcess } from "@orchestra/core/process"
import { ReviewCodeSource } from "../src/review/code-source"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([GitCli.node, AppProcess.node])))
const selected = "src/visible.ts"
const excluded = "outside/secret.ts"
const capturedText = 'export const selectedValue = "CAPTURED-SELECTED"\n'
const excludedText = 'export const outsideValue = "CAPTURED-OUTSIDE"\n'
const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
).pipe(Effect.map((dir) => dir.path))

const fixture = Effect.gen(function* () {
  const root = yield* temporary
  const probe = yield* temporary
  const cli = yield* GitCli.Service
  const git = (args: ReadonlyArray<string>) => cli.run([...args], { cwd: root }).pipe(Effect.map((result) => {
    expect(result.exitCode).toBe(0)
    return result.text().trim()
  }))
  yield* git(["init", "-q", "--initial-branch=base"])
  for (const args of [
    ["config", "user.email", "source-scope@example.com"], ["config", "user.name", "source-scope"],
    ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"],
  ]) yield* git(args)
  yield* Effect.promise(() => Bun.write(path.join(root, selected), capturedText))
  yield* Effect.promise(() => Bun.write(path.join(root, excluded), excludedText))
  yield* git(["add", "--", selected, excluded])
  yield* git(["commit", "-q", "-m", "captured"])
  const commit = yield* git(["rev-parse", "HEAD"])
  const tree = yield* git(["rev-parse", "HEAD^{tree}"])
  const oid = yield* git(["rev-parse", `HEAD:${selected}`])
  const sha256 = createHash("sha256").update(JSON.stringify({
    commit, files: [{ path: selected, oid, mode: "100644", size: Buffer.byteLength(capturedText) }], notExamined: [],
  })).digest("hex")
  // Host-only additive authority. Passing a wider local object compiles against the pre-scope CodeSource API.
  const source = { worktree: root, directory: probe, commit, tree, scope: { sha256, files: [selected] } }
  yield* Effect.promise(() => Bun.write(path.join(root, selected), 'export const selectedValue = "LIVE-EDIT"\n'))
  yield* Effect.promise(() => Bun.write(path.join(root, excluded), 'export const outsideValue = "LIVE-OUTSIDE"\n'))
  yield* Effect.promise(() => Bun.write(path.join(probe, selected), 'export const selectedValue = "PROBE-EDIT"\n'))
  yield* Effect.promise(() => Bun.write(path.join(probe, excluded), 'export const outsideValue = "PROBE-OUTSIDE"\n'))
  return { root, probe, commit, tree, oid, source }
})

const refusal = <A, R>(effect: Effect.Effect<A, Research.Error, R>) => effect.pipe(Effect.match({
  onFailure: (error) => error.code,
  onSuccess: () => "unexpected-success",
}))

it.live("source authority preserves a selected captured read and refuses an excluded regular file", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    const view = yield* ReviewCodeSource.open(made.source)
    expect(view.worktree).toBe(made.root)
    expect(view.commit).toBe(made.commit)
    expect(view.tree).toBe(made.tree)
    expect(view.files.blobs.get(selected)).toBe(made.oid)
    // Complete tree metadata is retained for cache identity; it must not itself grant a model read.
    expect(view.files.regular?.has(excluded)).toBe(true)
    expect(yield* ReviewCodeSource.read(view, selected)).toBe(capturedText)
    expect(yield* refusal(ReviewCodeSource.read(view, excluded))).toBe("reference_invalid")
  })
})

it.live("the lexical projection physically omits excluded files after worktree and probe mutations", () => {
  expectSpawn(import.meta.path)
  return Effect.gen(function* () {
    const made = yield* fixture
    const view = yield* ReviewCodeSource.open(made.source)
    const projected = yield* ReviewCodeSource.project(view)
    expect(projected.directory).not.toBe(made.root)
    expect(projected.directory).not.toBe(made.probe)
    expect(view.commit).toBe(made.commit)
    expect(view.tree).toBe(made.tree)
    expect(yield* Effect.promise(() => Bun.file(path.join(projected.directory, selected)).text())).toBe(capturedText)
    expect(yield* Effect.promise(() => Bun.file(path.join(projected.directory, excluded)).exists())).toBe(false)
    expect(yield* Effect.promise(() => fs.readdir(projected.directory))).toEqual(["src"])
    expect(projected.skipped).toEqual([])
  })
})
