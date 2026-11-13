import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Layer, type Scope } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { GitCli } from "@orchestra/core/git-cli"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewEngagementEvidenceV2 } from "../src/v2/workflow/review-engagement-evidence"
import { worktree } from "./fixture/v2-governance"

const gitLayer = AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>

test("committed inventory matches git identity and excludes dirty bytes", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "keep.ts", "kept\n")
    yield* stage(directory, git, "run.sh", "#!/bin/sh\n")
    yield* git("update-index", "--chmod=+x", "--", "run.sh")
    yield* git("commit", "-q", "-m", "tree")
    yield* write(directory, "keep.ts", "dirty\n")
    yield* write(directory, "only-dirty.ts", "nope\n")
    const prepared = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory })
    expect(prepared.revision).toBe("HEAD")
    expect(prepared.commit).toBe(yield* git("rev-parse", "HEAD"))
    expect(prepared.files).toEqual([yield* identity(git, "keep.ts", "100644"), yield* identity(git, "run.sh", "100755")])
    expect(prepared.notExamined).toEqual([])
    expect(prepared.files.some((file) => file.path === "only-dirty.ts")).toBe(false)
  })),
)

test("literal prefixes keep case sibling and metachar names and reject unmatched", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "src/a.ts", "a\n")
    const oid = yield* git("hash-object", "-w", "src/a.ts")
    for (const file of ["src2/b.ts", "Src/c.ts", "a[b].ts"]) yield* git("update-index", "--add", "--cacheinfo", `100644,${oid},${file}`)
    yield* git("commit", "-q", "-m", "names")
    const dot = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, paths: ["."] })
    const commit = yield* git("rev-parse", "HEAD")
    expect(dot.commit).toBe(commit)
    expect(dot.files.map((file) => file.path)).toEqual(["Src/c.ts", "a[b].ts", "src/a.ts", "src2/b.ts"])
    for (const [prefix, expected] of [["src", ["src/a.ts"]], ["src2", ["src2/b.ts"]], ["Src", ["Src/c.ts"]], ["a[b].ts", ["a[b].ts"]]] as const) {
      const selected = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, paths: [prefix] })
      expect(selected.commit).toBe(commit)
      expect(selected.files.map((file) => file.path)).toEqual([...expected])
    }
    for (const paths of [["src*"], ["SRC"], ["src/missing.ts"], ["src/a.ts/extra"]]) expect(yield* refused(ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, paths }))).toBe("engagement-scope")
  })),
)

test("unsafe bounds empty tree and missing ref refuse", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* git("commit", "--allow-empty", "-q", "-m", "empty")
    expect(yield* refused(ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory }))).toBe("engagement-empty")
    yield* stage(directory, git, "a.ts", "a\n")
    yield* git("commit", "-q", "-m", "one")
    const bad: ReadonlyArray<readonly [string, { revision?: string; paths?: readonly string[] }]> = [
      ["engagement-reference", { revision: "" }], ["engagement-reference", { revision: "-head" }],
      ["engagement-reference", { revision: "a\nb" }], ["engagement-reference", { revision: "a\rb" }],
      ["engagement-reference", { revision: "a\0b" }], ["engagement-reference", { revision: "h".repeat(1025) }],
      ["engagement-scope", { paths: [] }], ["engagement-scope", { paths: ["/abs.ts"] }],
      ["engagement-scope", { paths: ["C:/abs.ts"] }], ["engagement-scope", { paths: ["a\\b.ts"] }],
      ["engagement-scope", { paths: ["a/../b.ts"] }], ["engagement-scope", { paths: ["a/./b.ts"] }],
      ["engagement-scope", { paths: [""] }], ["engagement-scope", { paths: ["a.ts", "a.ts"] }],
      ["engagement-scope", { paths: ["a\0.ts"] }],
      ["engagement-scope", { paths: Array.from({ length: 257 }, (_, index) => `f${index}.ts`) }],
      ["engagement-git", { revision: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }],
    ]
    for (const [code, input] of bad) expect(yield* refused(ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, ...input }))).toBe(code)
  })),
)

test("same commit aliases share a digest and scope changes it", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "src/a.ts", "a\n")
    yield* stage(directory, git, "src2/b.ts", "b\n")
    yield* git("commit", "-q", "-m", "scope")
    const sha = yield* git("rev-parse", "HEAD")
    const head = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, revision: "HEAD" })
    const branch = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, revision: "base" })
    const full = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, revision: sha })
    expect([head.commit, branch.commit, full.commit]).toEqual([sha, sha, sha])
    expect(branch.sha256).toBe(head.sha256)
    expect(full.sha256).toBe(head.sha256)
    expect(head.revision).toBe("HEAD")
    expect(branch.revision).toBe("base")
    const left = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, paths: ["src/a.ts"] })
    const right = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, paths: ["src2/b.ts"] })
    expect(left.commit).toBe(sha)
    expect(right.commit).toBe(sha)
    expect(left.sha256).not.toBe(right.sha256)
    expect(left.files.map((file) => file.path)).toEqual(["src/a.ts"])
    expect(head.sha256).toBe(createHash("sha256").update(JSON.stringify({ commit: head.commit, files: head.files, notExamined: head.notExamined })).digest("hex"))
    yield* stage(directory, git, "src/a.ts", "changed\n")
    yield* git("commit", "-q", "-m", "same-path")
    const changed = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory })
    expect(changed.files.map((file) => file.path)).toEqual(head.files.map((file) => file.path))
    expect(changed.sha256).not.toBe(head.sha256)
  })),
)

test("recheck reports engagement-ref-moved after the revision advances", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "a.ts", "a\n")
    yield* git("commit", "-q", "-m", "first")
    const prepared = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, revision: "HEAD" })
    expect(prepared.commit).toBe(yield* git("rev-parse", "HEAD"))
    yield* stage(directory, git, "b.ts", "b\n")
    yield* git("commit", "-q", "-m", "second")
    expect(yield* refused(ReviewEngagementEvidenceV2.recheck(cli, directory, prepared))).toBe("engagement-ref-moved")
  })),
)

test("index symlink and gitlink are notExamined and regular files remain", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "plain.txt", "plain\n")
    yield* git("commit", "-q", "-m", "plain")
    const head = yield* git("rev-parse", "HEAD")
    yield* write(directory, "link-bytes", "dest")
    const linkOid = yield* git("hash-object", "-w", "link-bytes")
    yield* git("update-index", "--add", "--cacheinfo", `120000,${linkOid},link`)
    yield* git("update-index", "--add", "--cacheinfo", `160000,${head},modules/sub`)
    yield* git("commit", "-q", "-m", "special")
    const prepared = yield* ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory, paths: ["."] })
    expect(prepared.commit).toBe(yield* git("rev-parse", "HEAD"))
    expect(prepared.files).toEqual([yield* identity(git, "plain.txt", "100644")])
    expect(prepared.notExamined).toEqual([{ path: "link", reason: "symlink" }, { path: "modules/sub", reason: "submodule" }])
    expect(prepared.sha256).toBe(createHash("sha256").update(JSON.stringify({ commit: prepared.commit, files: prepared.files, notExamined: prepared.notExamined })).digest("hex"))
    yield* git("rm", "--cached", "--", "plain.txt")
    yield* git("commit", "-q", "-m", "only-skipped")
    expect(yield* refused(ReviewEngagementEvidenceV2.prepare(cli, { worktree: directory }))).toBe("engagement-empty")
  })),
)

test("ls-tree faults fail closed", () =>
  run((directory, cli, git) => Effect.gen(function* () {
    yield* stage(directory, git, "hello.ts", "z\n")
    yield* git("commit", "-q", "-m", "list")
    const oid = yield* git("rev-parse", "HEAD:hello.ts")
    const entry = Buffer.from(`100644 blob ${oid} 2\thello.ts`)
    const faults: ReadonlyArray<readonly [Buffer, boolean]> = [
      [Buffer.concat([entry, Buffer.from([0])]), true],
      [entry, false],
      [Buffer.concat([Buffer.from(`100644 blob ${oid} 2\t`), Buffer.from([0xff]), Buffer.from([0])]), false],
      [Buffer.concat([entry, Buffer.from([0]), entry, Buffer.from([0])]), false],
      [Buffer.from("nope\0"), false],
      [Buffer.from(`100664 blob ${oid} 2\thello.ts\0`), false],
      [Buffer.from(`100644 blob ${oid} 2\tsrc/../a.ts\0`), false],
      [Buffer.from(`100644 blob ${oid.toUpperCase()} 2\thello.ts\0`), false],
    ]
    const tab = wrap(cli, (args, opts) => args.includes("ls-tree") ? Effect.succeed(fake(Buffer.from(`100644 blob ${oid} 2\thello\tname.ts\0`), false)) : cli.run(args, opts))
    expect((yield* ReviewEngagementEvidenceV2.prepare(tab, { worktree: directory })).files.map((file) => file.path)).toEqual(["hello\tname.ts"])
    for (const [stdout, truncated] of faults) {
      const wrapped = wrap(cli, (args, opts) => args.includes("ls-tree") ? Effect.succeed(fake(stdout, truncated)) : cli.run(args, opts))
      expect(yield* refused(ReviewEngagementEvidenceV2.prepare(wrapped, { worktree: directory }))).toBe("engagement-list")
    }
  })),
)

const run = <A>(body: (directory: string, cli: GitCli.Interface, git: (...args: string[]) => Effect.Effect<string>) => Effect.Effect<A, unknown, GitCli.Service | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const directory = yield* worktree
    const cli = yield* GitCli.Service
    const git = (...args: string[]) => cli.run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", ...args], { cwd: directory }).pipe(Effect.flatMap((result) => result.exitCode === 0 ? Effect.succeed(result.stdout.toString("utf8").trim()) : Effect.die(new Error(`git ${args.join(" ")}`))))
    yield* git("init", "-q", "-b", "base")
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
const fake = (stdout: Buffer, truncated: boolean): GitCli.Result => ({ exitCode: 0, stdout, stderr: Buffer.alloc(0), truncated, text: () => stdout.toString("utf8") })
const wrap = (cli: GitCli.Interface, run: GitCli.Interface["run"]): GitCli.Interface => ({ ...cli, run })
