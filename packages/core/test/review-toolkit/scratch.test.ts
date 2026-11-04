import { expect } from "bun:test"
import path from "path"
import { existsSync } from "fs"
import { mkdir, readdir, readFile, readlink, symlink, writeFile } from "fs/promises"
import { Effect, Exit } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewScratch } from "../../src/review-toolkit/scratch"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

const BASE = "export const limit = 1\nexport const name = \"base\"\n"
const HEAD = "export const limit = 2\nexport const name = \"base\"\n"
const DIRTY = "export const limit = 3\nexport const name = \"base\"\n"

/** Base commit, head commit, then a dirty edit, an untracked file, an ignored dependency and a link leaving the tree. */
const repo = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await mkdir(path.join(dir.path, "outside"))
  await writeFile(path.join(dir.path, "outside", "secret.txt"), "outside\n")
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "scratch@example.com")
  await git(root, "config", "user.name", "Scratch")
  await writeFile(path.join(root, ".gitignore"), "node_modules\n")
  await writeFile(path.join(root, "package.json"), "{}\n")
  await writeFile(path.join(root, "src", "a.ts"), BASE)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "src", "a.ts"), HEAD)
  await symlink(path.join(dir.path, "outside"), path.join(root, "escape"))
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  await writeFile(path.join(root, "src", "a.ts"), DIRTY)
  await writeFile(path.join(root, "src", "new.ts"), "export {}\n")
  await mkdir(path.join(root, "node_modules", "dep"), { recursive: true })
  await writeFile(path.join(root, "node_modules", "dep", "index.js"), "module.exports = 1\n")
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

/** Every entry under the worktree but .git, with its bytes or link target. */
async function image(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  const nested = await Promise.all(entries.filter((entry) => entry.name !== ".git").map(async (entry) => {
    const relative = path.join(prefix, entry.name)
    if (entry.isSymbolicLink()) return [`${relative} -> ${await readlink(path.join(root, relative))}`]
    if (entry.isDirectory()) return [`${relative}/`, ...await image(root, relative)]
    return [`${relative}: ${(await readFile(path.join(root, relative))).toString("base64")}`]
  }))
  return nested.flat().sort()
}

it.live("base and head copies hold their trees, a hunk reverts only in the copy, and the worktree stays byte-identical", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const before = yield* Effect.promise(() => image(fixture.root))
    const copies = yield* Effect.scoped(Effect.gen(function* () {
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      expect(base.kind).toBe("commit")
      expect(base.revision).toMatch(/^[0-9a-f]{40}$/)
      expect(head.kind).toBe("worktree")
      expect(base.scratch).not.toBe(head.scratch)
      expect(yield* Effect.promise(() => readFile(path.join(base.root, "src", "a.ts"), "utf8"))).toBe(BASE)
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(DIRTY)
      expect(existsSync(path.join(head.root, "src", "new.ts"))).toBe(true)
      expect(existsSync(path.join(base.root, "src", "new.ts"))).toBe(false)

      // The digest follows the tree's content: a second copy of the same tree matches, a different tree does not.
      expect(head.digest).toMatch(/^[0-9a-f]{64}$/)
      expect(base.digest).not.toBe(head.digest)
      expect((yield* ReviewScratch.create({ worktree: fixture.root, tree: true })).digest).toBe(head.digest)
      expect((yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })).digest).not.toBe(head.digest)

      yield* ReviewScratch.revert(head, { path: "src/a.ts", line: 1, current: ["export const limit = 3"], original: ["export const limit = 1"] })
      expect(yield* Effect.promise(() => readFile(path.join(head.root, "src", "a.ts"), "utf8"))).toBe(BASE)
      const mismatch = yield* ReviewScratch.revert(head, { path: "src/a.ts", line: 1, current: ["export const limit = 3"], original: [] }).pipe(Effect.flip)
      expect(mismatch.reason).toBe("scratch-hunk-mismatch: src/a.ts:1")
      expect(yield* Effect.promise(() => readFile(path.join(fixture.root, "src", "a.ts"), "utf8"))).toBe(DIRTY)
      return [base, head]
    }))
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    copies.forEach((copy) => expect(existsSync(copy.scratch)).toBe(false))
  }), 120_000,
)

it.live("a path that leaves the copy, lexically or through a link, is refused", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      expect(yield* ReviewScratch.resolve(head, "src/a.ts")).toBe(path.join(head.root, "src", "a.ts"))
      expect(yield* ReviewScratch.resolve(head, "src/missing/new.test.ts")).toBe(path.join(head.root, "src", "missing", "new.test.ts"))
      // The dependency link points at the original worktree; the tracked link points outside the repository.
      expect(existsSync(path.join(head.root, "node_modules", "dep", "index.js"))).toBe(true)
      const refused = ["../outside/secret.txt", "/etc/passwd", "node_modules/dep/index.js", "escape/secret.txt", "escape/new.txt", "src/\0a.ts"]
      yield* Effect.forEach(refused, (file) => Effect.gen(function* () {
        const error = yield* ReviewScratch.resolve(head, file).pipe(Effect.flip)
        expect(error.reason).toBe(`scratch-path-outside: ${file}`)
      }))
      const written = yield* ReviewScratch.revert(head, { path: "node_modules/dep/index.js", line: 1, current: ["module.exports = 1"], original: ["module.exports = 2"] }).pipe(Effect.flip)
      expect(written.reason).toBe("scratch-path-outside: node_modules/dep/index.js")
    }))
    expect(yield* Effect.promise(() => readFile(path.join(fixture.root, "node_modules", "dep", "index.js"), "utf8"))).toBe("module.exports = 1\n")
  }), 120_000,
)

it.live("the copy is removed when the review scope ends, also when the review fails", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const seen: string[] = []
    const exit = yield* Effect.exit(Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      seen.push(head.scratch)
      expect(existsSync(head.root)).toBe(true)
      return yield* Effect.fail("review failed")
    })))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(seen.map((scratch) => existsSync(scratch))).toEqual([false])
  }), 120_000,
)
