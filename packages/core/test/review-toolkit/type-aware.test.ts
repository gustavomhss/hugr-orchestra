import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewTypeAware } from "../../src/review-toolkit/type-aware"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const live = jail ? it.live : it.live.skip

test("the type-aware argv is closed", () => {
  const command = ReviewTypeAware.argv("/pin/oxlint", "/scratch/oxlint.json", ["/repo/src/a.ts"])
  expect(command).toContain("--type-aware")
  expect(command).toContain("--deny")
  expect(command).toContain("typescript/no-floating-promises")
  expect(command.some((arg) => arg === "--fix" || arg.startsWith("--fix"))).toBe(false)
  expect(command).not.toContain("--type-check")
  expect(command.at(-1)).toBe("/repo/src/a.ts")
})

live("an untrusted target and the repo lane do not run typed lint", () =>
  Effect.gen(function* () {
    const made = yield* repo(FLOATING)
    const untrusted = yield* ReviewAnalyze.run(input(made, { trusted: false, packs: ["oxlint-type-aware"] }))
    expect(untrusted.checks).toContainEqual({
      id: "oxlint-type-aware", pack: "oxlint-type-aware", version: "1.91.0", lane: "build",
      status: "not-run", reason: "build lane off (D6)", workspaceExecuted: false,
    })
    const below = yield* ReviewAnalyze.run(input(made, { lane: "repo", packs: ["oxlint-type-aware"] }))
    expect(below.checks).toContainEqual({
      id: "oxlint-type-aware", pack: "oxlint-type-aware", version: "1.91.0", lane: "build",
      status: "not-run", reason: "lane: build is above repo", workspaceExecuted: false,
    })
  }),
)

live("this repository cites typecheck.yml and does not run typed lint", () =>
  Effect.gen(function* () {
    const made = yield* repo(FLOATING, {
      "package.json": JSON.stringify({ name: "orchestra", scripts: { test: "echo 'do not run tests from root' && exit 1" } }) + "\n",
      ".github/workflows/typecheck.yml": "name: typecheck\n",
    })
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["oxlint-type-aware"] }))
    expect(result.checks).toContainEqual({
      id: "oxlint-type-aware", pack: "oxlint-type-aware", version: "1.91.0", lane: "build",
      status: "not-run", reason: ReviewAnalyze.TYPECHECK_CI, workspaceExecuted: false,
    })
  }),
)

const qualified = process.platform === "linux" && process.arch === "x64" && jail ? it.live : it.live.skip

qualified("Linux x64 runs the pinned type-aware rule and does not write the source", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* repo(FLOATING)
    const before = yield* Effect.promise(() => Bun.file(path.join(made.root, "src", "a.ts")).text())
    const result = yield* ReviewAnalyze.run(input(made, { packs: ["oxlint-type-aware"] })).pipe(
      Effect.provideService(BackendToolkit.Root, path.join(made.dir.path, "toolkit")),
    )
    const check = result.checks.find((item) => item.id === "oxlint-type-aware")
    expect(check).toMatchObject({ status: "fail", workspaceExecuted: true, version: "1.91.0" })
    const text = yield* Effect.promise(() => Bun.file(artifact(made.store, check?.uri)).text())
    expect(text).toContain("typescript(no-floating-promises)")
    expect(yield* Effect.promise(() => Bun.file(path.join(made.root, "src", "a.ts")).text())).toBe(before)
    expect(ReviewCatalog.current.route.tiers.find((tier) => tier.id === "deep")?.built).toBe(true)
  }),
  110_000,
)

const FLOATING = `export function returnsPromise() {\n  return Promise.resolve(1)\n}\nreturnsPromise()\n`

const input = (made: { root: string; store: string }, extra: Partial<ReviewAnalyze.RunInput>): ReviewAnalyze.RunInput => ({
  worktree: made.root,
  base: "base",
  tier: "standard",
  store: made.store,
  changed: { "src/a.ts": [{ start: 4, end: 4 }] },
  trusted: true,
  lane: "build",
  packs: [],
  scope: "diff",
  ...extra,
})

const repo = (source: string, extra: Readonly<Record<string, string>> = {}) => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "type-aware@example.com")
  await git(root, "config", "user.name", "Type Aware")
  await writeFile(path.join(root, "src", "a.ts"), source)
  await writeFile(path.join(root, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, target: "ES2022" },
    files: ["src/a.ts"],
  })}\n`)
  for (const [name, text] of Object.entries(extra)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), text)
  }
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
