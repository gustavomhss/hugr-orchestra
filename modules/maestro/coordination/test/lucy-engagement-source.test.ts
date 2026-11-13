import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Layer, type Scope } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { GitCli } from "@orchestra/core/git-cli"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewEngagementSourceV2 } from "../src/v2/workflow/review-engagement-source"
import { ReviewEngagementEvidenceV2 } from "../src/v2/workflow/review-engagement-evidence"
import { worktree } from "./fixture/v2-governance"

const gitLayer = AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>
const oversize = 4 * 1024 * 1024 + 1

test("region read returns immutable blob text oid and sha256 despite dirty bytes", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    const bytes = Buffer.from("a\r\nb\n")
    yield* stage(directory, git, "note.txt", bytes)
    yield* git("commit", "-q", "-m", "note")
    const oid = yield* git("rev-parse", "HEAD:note.txt")
    const prepared = manifest(yield* git("rev-parse", "HEAD"), "note.txt", oid, bytes.length)
    const region = yield* ReviewEngagementSourceV2.read(cli, { worktree: directory, prepared, path: "note.txt", startLine: 1, endLine: 2 })
    expect(region).toEqual({ path: "note.txt", oid, sha256: createHash("sha256").update(bytes).digest("hex"), startLine: 1, endLine: 2, text: "a\r\nb" })
    yield* write(directory, "note.txt", "dirty\n")
    const again = yield* ReviewEngagementSourceV2.read(cli, { worktree: directory, prepared, path: "note.txt", startLine: 1, endLine: 1 })
    expect(again.text).toBe("a\r")
    expect(again.oid).toBe(oid)
    expect(again.sha256).toBe(region.sha256)
  })),
)

test("region bounds membership whitespace binary encoding and oversize refuse", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    const note = Buffer.from("alpha\nbeta\n")
    const blank = Buffer.from(" \n\t\n")
    const binary = Buffer.from([0x61, 0x00, 0x62])
    const weird = Buffer.from([0xff, 0xfe])
    const huge = Buffer.alloc(oversize, 0x61)
    for (const [file, text] of [["note.txt", note], ["blank.txt", blank], ["bin.txt", binary], ["weird.txt", weird], ["huge.txt", huge]] as const) yield* stage(directory, git, file, text)
    yield* git("commit", "-q", "-m", "reads")
    const files = [yield* identity(git, "note.txt", "100644"), yield* identity(git, "blank.txt", "100644"), yield* identity(git, "bin.txt", "100644"), yield* identity(git, "weird.txt", "100644"), yield* identity(git, "huge.txt", "100644")]
    const prepared = { revision: "HEAD", commit: yield* git("rev-parse", "HEAD"), sha256: "ab".repeat(32), files, notExamined: [] }
    const cases: ReadonlyArray<readonly [string, string, number, number]> = [
      ["engagement-region", "other.txt", 1, 1], ["engagement-region", "note.txt", 0, 1],
      ["engagement-region", "note.txt", 2, 1], ["engagement-region", "note.txt", 1, 401],
      ["engagement-region", "note.txt", 3, 3], ["engagement-region", "blank.txt", 1, 2],
      ["engagement-encoding", "bin.txt", 1, 1], ["engagement-encoding", "weird.txt", 1, 1],
      ["engagement-blob", "huge.txt", 1, 1],
    ]
    for (const [code, file, startLine, endLine] of cases) expect(yield* refused(ReviewEngagementSourceV2.read(cli, { worktree: directory, prepared, path: file, startLine, endLine }))).toBe(code)
  })),
)

test("same-length cat-file bytes that miss the object id refuse", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    const bytes = Buffer.from("alpha\n")
    yield* stage(directory, git, "note.txt", bytes)
    yield* git("commit", "-q", "-m", "blob")
    const prepared = manifest(yield* git("rev-parse", "HEAD"), "note.txt", yield* git("rev-parse", "HEAD:note.txt"), bytes.length)
    const flipped = wrap(cli, (args, opts) => cli.run(args, opts).pipe(Effect.map((result) => {
      if (!args.includes("cat-file") || result.stdout.length === 0) return result
      const stdout = Buffer.from(result.stdout)
      stdout[0] = stdout[0] ^ 0xff
      return { ...result, stdout }
    })))
    expect(yield* refused(ReviewEngagementSourceV2.read(flipped, { worktree: directory, prepared, path: "note.txt", startLine: 1, endLine: 1 }))).toBe("engagement-blob")
  })),
)

test("git runs set GIT_NO_REPLACE_OBJECTS", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "a.ts", "a\n")
    yield* git("commit", "-q", "-m", "flag")
    const seen: string[] = []
    const watching = wrap(cli, (args, opts) => {
      seen.push([opts.env?.GIT_NO_REPLACE_OBJECTS ?? "unset", opts.env?.GIT_NO_LAZY_FETCH ?? "unset", opts.env?.GIT_ALLOW_PROTOCOL ?? "unset"].join(":"))
      return cli.run(args, opts)
    })
    const prepared = yield* ReviewEngagementEvidenceV2.prepare(watching, { worktree: directory })
    expect(prepared.commit).toBe(yield* git("rev-parse", "HEAD"))
    yield* ReviewEngagementSourceV2.read(watching, { worktree: directory, prepared, path: "a.ts", startLine: 1, endLine: 1 })
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((value) => value === "1:1:")).toBe(true)
  })),
)

test("SHA256 object format returns verified immutable blob regions", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "a.ts", "sha256\n")
    yield* git("commit", "-q", "-m", "sha256")
    const oid = yield* git("rev-parse", "HEAD:a.ts")
    expect(oid).toMatch(/^[0-9a-f]{64}$/)
    const prepared = manifest(yield* git("rev-parse", "HEAD"), "a.ts", oid, 7)
    const region = yield* ReviewEngagementSourceV2.read(cli, { worktree: directory, prepared, path: "a.ts", startLine: 1, endLine: 1 })
    expect(region.text).toBe("sha256")
    expect(region.oid).toBe(oid)
  }), true),
)

const run = <A>(body: (directory: string, cli: GitCli.Interface, git: (...args: string[]) => Effect.Effect<string>) => Effect.Effect<A, unknown, GitCli.Service | Scope.Scope>, sha256 = false) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const directory = yield* worktree
    const cli = yield* GitCli.Service
    const git = (...args: string[]) => cli.run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", ...args], { cwd: directory }).pipe(Effect.flatMap((result) => result.exitCode === 0 ? Effect.succeed(result.stdout.toString("utf8").trim()) : Effect.die(new Error(`git ${args.join(" ")}`))))
    yield* git("init", "-q", "-b", "base", ...(sha256 ? ["--object-format=sha256"] : []))
    return yield* body(directory, cli, git)
  }).pipe(Effect.provide(gitLayer))))

const refused = <A>(effect: Effect.Effect<A, { metadata?: { reason?: unknown } }>) =>
  effect.pipe(Effect.match({
    onFailure: (error) => { const value = error.metadata?.reason; if (typeof value !== "string") throw new Error("expected error has no reason"); return value },
    onSuccess: () => "unexpected-success",
  }))

const write = (directory: string, file: string, text: string | Uint8Array) => Effect.promise(async () => { await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true }); await fs.writeFile(path.join(directory, file), text) })
const stage = (directory: string, git: (...args: string[]) => Effect.Effect<string>, file: string, text: string | Uint8Array) => Effect.gen(function* () { yield* write(directory, file, text); yield* git("add", "--", file) })
const identity = (git: (...args: string[]) => Effect.Effect<string>, file: string, mode: "100644" | "100755") => Effect.gen(function* () {
  expect((yield* git("ls-tree", "HEAD", "--", file)).startsWith(`${mode} blob `)).toBe(true)
  return { path: file, oid: yield* git("rev-parse", `HEAD:${file}`), mode, size: Number(yield* git("cat-file", "-s", `HEAD:${file}`)) }
})
const manifest = (commit: string, file: string, oid: string, size: number): ReviewEngagementEvidenceV2.Prepared => ({ revision: "HEAD", commit, sha256: "ab".repeat(32), files: [{ path: file, oid, mode: "100644", size }], notExamined: [] })
const wrap = (cli: GitCli.Interface, run: GitCli.Interface["run"]): GitCli.Interface => ({ ...cli, run })
