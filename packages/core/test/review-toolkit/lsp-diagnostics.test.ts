import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewLspDiagnostics } from "../../src/review-toolkit/lsp-diagnostics"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

it.live("the repo lane and an untrusted target do not ask the language server", () =>
  Effect.gen(function* () {
    const made = yield* repo()
    const calls: string[] = []
    const read = (input: { root: string }) => {
      calls.push(input.root)
      return Effect.die("language server must not run")
    }
    const repoLane = yield* ReviewAnalyze.run(input(made, { lane: "repo" })).pipe(Effect.provideService(ReviewAnalyze.ReadDiagnostics, read))
    const untrusted = yield* ReviewAnalyze.run(input(made, { trusted: false })).pipe(Effect.provideService(ReviewAnalyze.ReadDiagnostics, read))
    expect(calls).toEqual([])
    expect(repoLane.checks.some((check) => check.id === "lsp")).toBe(false)
    expect(untrusted.checks.some((check) => check.id === "lsp")).toBe(false)
  }),
)

it.live("a trusted build lane records the server's diagnostic and does not install one", () =>
  Effect.gen(function* () {
    const made = yield* repo()
    const read: typeof ReviewLspDiagnostics.read = (request) => Effect.succeed({
      status: "fail" as const,
      reason: "a.ts:1 fixture-diagnostic",
      workspaceExecuted: true,
      diagnostics: [{ path: "a.ts", severity: 1, message: "fixture-diagnostic", line: 1, character: 1 }],
      opened: request.files.length,
      skipped: 0,
    })
    const result = yield* ReviewAnalyze.run(input(made, {})).pipe(Effect.provideService(ReviewAnalyze.ReadDiagnostics, read))
    const check = result.checks.find((item) => item.id === "lsp")
    expect(check).toMatchObject({
      pack: "lsp", version: "project", lane: "build", status: "fail",
      reason: "a.ts:1 fixture-diagnostic", workspaceExecuted: true,
    })
    const text = yield* Effect.promise(() => Bun.file(artifact(made.store, check?.uri)).text())
    expect(text).toContain("fixture-diagnostic")
    expect(text).toContain("opened 1")
  }),
)

it.live("a copy with no language server records absence and does not fetch", () =>
  Effect.gen(function* () {
    const made = yield* repo()
    const result = yield* ReviewAnalyze.run(input(made, {}))
    expect(result.checks).toContainEqual({
      id: "lsp", pack: "lsp", version: "project", lane: "build", status: "not-run",
      reason: ReviewAnalyze.LSP_ABSENT, workspaceExecuted: false,
    })
    expect(result.checks.find((check) => check.id === "lsp")?.uri).toBeUndefined()
  }),
)

const input = (made: { root: string; store: string }, extra: Partial<ReviewAnalyze.RunInput>): ReviewAnalyze.RunInput => ({
  worktree: made.root,
  base: "base",
  tier: "standard",
  store: made.store,
  changed: { "src/a.ts": [{ start: 1, end: 1 }] },
  trusted: true,
  lane: "build",
  packs: [],
  scope: "diff",
  ...extra,
})

const repo = () => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "lsp@example.com")
  await git(root, "config", "user.name", "LSP")
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 1\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await git(root, "tag", "base")
  const store = path.join(dir.path, "store")
  await mkdir(store)
  return { dir, root, store }
}), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))

function artifact(store: string, uri: string | undefined) {
  const match = /^review:([0-9a-f-]{36})\/(.+)$/.exec(uri ?? "")
  if (!match) throw new Error(`artifact-unknown: ${uri}`)
  return path.join(store, match[1], match[2])
}
