import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { readdir, readFile, symlink, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewHistory } from "../../src/review-toolkit/history"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

/** Two commits on a.ts (the second adds `needle`), an uncommitted edit, and a symlink that leaves the repository. */
const repo = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const outside = await tmpdir()
  const root = dir.path
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "review@example.com")
  await git(root, "config", "user.name", "Review")
  await writeFile(path.join(root, "a.ts"), "export const a = 1\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "first")
  await writeFile(path.join(root, "a.ts"), "export const a = 1\nexport const needle = 2\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "second adds needle")
  await writeFile(path.join(outside.path, "secret.txt"), "secret\n")
  await symlink(outside.path, path.join(root, "away"))
  await writeFile(path.join(root, "a.ts"), "export const a = 1\nexport const needle = 3\n")
  return { root, async [Symbol.asyncDispose]() { await dir[Symbol.asyncDispose](); await outside[Symbol.asyncDispose]() } }
}), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))

const context = (repository: string): ReviewHistory.Context => ({ repository, executionSessionID: "ses_review" })

/** Every file under the repository with its content digest, the git directory included. */
const fingerprint = async (root: string) => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const files = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const file = path.join(entry.parentPath, entry.name)
    return `${path.relative(root, file)} ${createHash("sha256").update(await readFile(file)).digest("hex")}`
  }))
  return files.sort()
}

it.live("log, blame, pickaxe and show read history and leave the repository unchanged", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    const before = yield* Effect.promise(() => fingerprint(dir.root))

    const log = yield* ReviewHistory.run({ op: "log", path: "a.ts" }, context(dir.root))
    expect(log.text).toContain("second adds needle")
    expect(log.text).toContain("first")
    expect(log.uri).toBe(ReviewHistory.uri("ses_review", log.historyID))
    expect(log.raw).toBe(log.text)
    expect(log.truncated).toBe(false)
    expect((yield* ReviewHistory.run({ op: "log", range: "HEAD~1..HEAD" }, context(dir.root))).text).not.toContain("first")

    const blame = yield* ReviewHistory.run({ op: "blame", path: "a.ts", rev: "HEAD" }, context(dir.root))
    expect(blame.text).toContain("export const needle = 2")
    expect(blame.text).toContain("Review")

    const pickaxe = yield* ReviewHistory.run({ op: "pickaxe", pattern: "needle" }, context(dir.root))
    expect(pickaxe.text).toContain("second adds needle")
    expect(pickaxe.text).not.toContain("first")
    const regex = yield* ReviewHistory.run({ op: "pickaxe", pattern: "need.e = [0-9]", regex: true, path: "a.ts" }, context(dir.root))
    expect(regex.text).toContain("second adds needle")

    const show = yield* ReviewHistory.run({ op: "show", rev: "HEAD~1" }, context(dir.root))
    expect(show.text).toContain("first")
    expect(show.text).toContain("+export const a = 1")
    expect((yield* ReviewHistory.run({ op: "show" }, context(dir.root))).text).toContain("+export const needle = 2")

    expect(yield* Effect.promise(() => fingerprint(dir.root))).toEqual(before)
  }), 60_000,
)

it.live("refuses other ops, unknown fields, option-like values and paths outside the repository", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    const before = yield* Effect.promise(() => fingerprint(dir.root))
    const refused = (input: unknown) => Effect.gen(function* () {
      const error = yield* Effect.flip(ReviewHistory.run(input, context(dir.root)))
      expect(error.code, JSON.stringify(input)).toBe("refused")
      return error.reason
    })
    yield* refused({ op: "push" })
    yield* refused({ op: "log", args: ["--all"] })
    yield* refused({ op: "log", pattern: "needle" })
    yield* refused({ op: "show", range: "HEAD~1..HEAD" })
    yield* refused({ op: "log", range: "HEAD~1..HEAD", rev: "HEAD" })
    yield* refused({ op: "blame" })
    yield* refused({ op: "pickaxe" })
    expect(yield* refused({ op: "show", rev: "--output=pwned" })).toContain("looks like an option")
    expect(yield* refused({ op: "log", range: "-p" })).toContain("looks like an option")
    expect(yield* refused({ op: "pickaxe", pattern: "-x" })).toContain("looks like an option")
    expect(yield* refused({ op: "log", path: "--all" })).toContain("looks like an option")
    yield* refused({ op: "log", rev: "HEAD\n--all" })
    yield* refused({ op: "log", rev: "" })
    expect(yield* refused({ op: "log", path: "../outside" })).toContain("outside the repository")
    expect(yield* refused({ op: "blame", path: path.join(path.dirname(dir.root), "x.ts") })).toContain("outside the repository")
    expect(yield* refused({ op: "blame", path: "away/secret.txt" })).toContain("outside the repository")
    expect(yield* refused({ op: "log", path: ".git/config" })).toContain("git directory")
    // A real git failure is "failed", not a refusal.
    const failed = yield* Effect.flip(ReviewHistory.run({ op: "show", rev: "no-such-rev" }, context(dir.root)))
    expect(failed.code).toBe("failed")
    expect(yield* Effect.promise(() => fingerprint(dir.root))).toEqual(before)
    expect(yield* Effect.promise(() => Bun.file(path.join(dir.root, "pwned")).exists())).toBe(false)
  }), 60_000,
)

it.live("caps the text and keeps the raw output for the citation", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    yield* Effect.promise(async () => {
      await writeFile(path.join(dir.root, "big.txt"), "x".repeat(ReviewHistory.Limits.textBytes * 2) + "\n")
      await git(dir.root, "add", "big.txt")
      await git(dir.root, "commit", "-q", "-m", "big")
    })
    const show = yield* ReviewHistory.run({ op: "show", path: "big.txt" }, context(dir.root))
    expect(Buffer.byteLength(show.raw)).toBeGreaterThan(ReviewHistory.Limits.textBytes * 2)
    expect(show.text).toContain(`full output at ${show.uri}`)
    expect(Buffer.byteLength(show.text)).toBeLessThan(ReviewHistory.Limits.textBytes + 512)
    expect(show.truncated).toBe(false)
  }), 60_000,
)
