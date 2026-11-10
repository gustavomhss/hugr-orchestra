import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Layer, type Scope } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { GitCli } from "@orchestra/core/git-cli"
import { Tool } from "@orchestra/core/tool/tool"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { ReviewPREvidenceV2 } from "../src/v2/workflow/review-pr-evidence"
import { governanceLayer, session, worktree } from "./fixture/v2-governance"

const gitLayer = AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>
const reason = (error: Tool.Failure) => {
  const value = error.metadata?.reason
  if (typeof value !== "string") throw new Error("expected error has no reason")
  return value
}

const run = <A, E>(
  body: (
    directory: string,
    cli: GitCli.Interface,
    git: (...args: string[]) => Effect.Effect<string>,
  ) => Effect.Effect<A, E, GitCli.Service | Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        expectSpawn(import.meta.path)
        const directory = yield* worktree
        const cli = yield* GitCli.Service
        const git = (...args: string[]) =>
          cli
            .run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", ...args], {
              cwd: directory,
            })
            .pipe(
              Effect.flatMap((result) =>
                result.exitCode === 0
                  ? Effect.succeed(result.stdout.toString("utf8").trim())
                  : Effect.die(new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`)),
              ),
            )
        yield* git("init", "-q", "-b", "base")
        return yield* body(directory, cli, git)
      }).pipe(Effect.provide(gitLayer)),
    ),
  )

const write = (directory: string, file: string, text: string | Uint8Array) =>
  Effect.promise(async () => {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true })
    await fs.writeFile(path.join(directory, file), text)
  })

const commit = (directory: string, git: (...args: string[]) => Effect.Effect<string>, file: string, text: string | Uint8Array, message: string) =>
  Effect.gen(function* () {
    yield* write(directory, file, text)
    yield* git("add", "-A")
    yield* git("commit", "-q", "-m", message)
  })

test("diverged refs use the unique merge-base and exclude dirty bytes", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      const id = yield* session({ directory, agent: "maestro" }).pipe(Effect.provide(governanceLayer(directory)))
      expect(id.startsWith("ses_")).toBe(true)
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "base")
      yield* git("branch", "head")
      yield* git("checkout", "-q", "head")
      yield* commit(directory, git, "src/a.ts", "export const a = 2\n", "head")
      yield* git("checkout", "-q", "base")
      yield* commit(directory, git, "package.json", "{}\n", "base-manifest-after-fork")
      yield* write(directory, "src/dirty.ts", "DIRTY_ONLY_BYTES\n")
      const prepared = yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "base", headRef: "head" })
      expect(prepared.baseSHA).not.toBe(prepared.baseCommit)
      expect(prepared.baseCommit).toBe(yield* git("rev-parse", "base"))
      expect(prepared.headSHA).toBe(prepared.headCommit)
      expect(prepared.changedPaths).toEqual(["src/a.ts"])
      expect(yield* git("ls-tree", "-r", "--name-only", prepared.baseCommit)).toContain("package.json")
      expect(prepared.baseFiles).toContain("src/a.ts")
      expect(prepared.baseFiles).not.toContain("package.json")
      expect(prepared.headFiles).toContain("src/a.ts")
      expect(prepared.headFiles).not.toContain("package.json")
      expect(prepared.baseFiles).not.toContain("src/dirty.ts")
      expect(prepared.headFiles).not.toContain("src/dirty.ts")
      expect(prepared.diff).toContain("+export const a = 2")
      expect(prepared.diff).not.toContain("DIRTY_ONLY_BYTES")
      expect(prepared.changes).toEqual([
        { path: "src/a.ts", added: [{ line: 1, text: "export const a = 2" }], removed: 1 },
      ])
      const raw = yield* cli.run(
        ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--no-renames", prepared.baseSHA, prepared.headSHA, "--"],
        { cwd: directory, maxOutputBytes: 8 * 1024 * 1024, timeout: "30 seconds" },
      )
      expect(prepared.sha256).toBe(createHash("sha256").update(raw.stdout).digest("hex"))
      expect(prepared.diff).toBe(raw.stdout.toString("utf8"))
      yield* ReviewPREvidenceV2.recheck(cli, directory, prepared)
      yield* git("checkout", "-q", "head")
      yield* commit(directory, git, "src/a.ts", "export const a = 3\n", "moved")
      expect(reason(yield* ReviewPREvidenceV2.recheck(cli, directory, prepared).pipe(Effect.flip))).toBe("ref-moved")
    }),
  ),
)

test("a dirty worktree with no committed difference is rejected", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "base")
      yield* write(directory, "src/dirty.ts", "DIRTY_ONLY_BYTES\n")
      expect(reason(yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "base", headRef: "base" }).pipe(Effect.flip))).toBe("empty-diff")
    }),
  ),
)

test("missing, non-commit and option-like refs are rejected before Git sees them as options", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "base")
      const blob = yield* git("hash-object", "-w", "--", "src/a.ts")
      const rejected = [
        ["", "head"],
        ["base\n--upload-pack=evil", "head"],
        ["base\0--exec", "head"],
        ["--upload-pack=evil", "head"],
        ["-c", "head"],
        ["missing-ref", "head"],
        [blob, "head"],
      ] as const
      for (const [baseRef, headRef] of rejected) {
        const error = yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef, headRef }).pipe(Effect.flip)
        expect(["invalid-reference", "resolve-failed"]).toContain(reason(error))
      }
    }),
  ),
)

test("space and leading-dash paths stay exact; a newline path is unsupported rather than dropped", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "base")
      yield* git("branch", "head")
      yield* git("checkout", "-q", "head")
      yield* commit(directory, git, "src/my file.ts", "export const spaced = 1\n", "space")
      yield* commit(directory, git, "-lead.ts", "export const dashed = 1\n", "dash")
      yield* commit(directory, git, "bin.dat", Buffer.from([0, 1, 2, 3]), "binary")
      const prepared = yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "base", headRef: "head" })
      expect([...prepared.changedPaths].sort()).toEqual(["-lead.ts", "bin.dat", "src/my file.ts"])
      expect(prepared.changes.map((change) => change.path).sort()).toEqual([...prepared.changedPaths].sort())
      expect(prepared.changes.find((change) => change.path === "bin.dat")).toEqual({ path: "bin.dat", added: [], removed: 0 })
      yield* write(directory, "weird\nname.ts", "newline\n")
      yield* git("add", "-A")
      yield* git("commit", "-q", "-m", "newline")
      expect(reason(yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "base", headRef: "head" }).pipe(Effect.flip))).toBe("unsupported-diff-path")
    }),
  ),
)

test("a criss-cross history is an ambiguous merge-base, not a guessed one", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* commit(directory, git, "base.txt", "base\n", "A")
      yield* git("branch", "left")
      yield* git("checkout", "-q", "left")
      yield* commit(directory, git, "left.txt", "left\n", "L")
      const leftParent = yield* git("rev-parse", "HEAD")
      yield* git("checkout", "-q", "base")
      yield* commit(directory, git, "right.txt", "right\n", "R")
      yield* git("checkout", "-q", "left")
      yield* git("merge", "-q", "--no-ff", "-m", "ML", "base")
      yield* git("checkout", "-q", "base")
      yield* git("merge", "-q", "--no-ff", "-m", "MR", leftParent)
      expect(reason(yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "left", headRef: "base" }).pipe(Effect.flip))).toBe("merge-base-ambiguous")
    }),
  ),
)

test("HEAD~1 is a commit-ish and an empty merge-base tree is an empty inventory", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* git("commit", "--allow-empty", "-q", "-m", "empty")
      yield* git("checkout", "-q", "-b", "head")
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "head")
      const prepared = yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "HEAD~1", headRef: "HEAD" })
      expect(prepared.baseFiles).toEqual([])
      expect(prepared.changedPaths).toEqual(["src/a.ts"])
      expect(prepared.changes.map((change) => change.path)).toEqual(["src/a.ts"])
      expect(prepared.headFiles).toContain("src/a.ts")
    }),
  ),
)

test("non-UTF-8 diff bytes fail before a lossy string is used", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "base")
      yield* git("branch", "head")
      yield* git("checkout", "-q", "head")
      yield* write(directory, "src/bad.txt", Buffer.from([0x68, 0xc3, 0x28, 0x0a]))
      yield* git("add", "-A")
      yield* git("commit", "-q", "-m", "bad-text")
      expect(reason(yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "base", headRef: "head" }).pipe(Effect.flip))).toBe("unsupported-diff-encoding")
    }),
  ),
)

test("a non-UTF-8 filename in the merge-base tree fails list-encoding", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => fs.writeFile(Buffer.concat([Buffer.from(directory + path.sep), Buffer.from([0xc3, 0x28])]), "ok\n"))
      yield* git("add", "-A")
      yield* git("commit", "-q", "-m", "bad-name")
      yield* git("branch", "head")
      yield* git("checkout", "-q", "head")
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "head")
      expect(reason(yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "base", headRef: "head" }).pipe(Effect.flip))).toBe("list-encoding")
    }),
  ),
)

test("a committed diff over 4MiB fails truncated instead of looking empty", () =>
  run((directory, cli, git) =>
    Effect.gen(function* () {
      yield* commit(directory, git, "src/a.ts", "export const a = 1\n", "base")
      yield* git("branch", "head")
      yield* git("checkout", "-q", "head")
      yield* commit(directory, git, "src/big.txt", Buffer.alloc(4_500_000, 0x61), "big")
      expect(reason(yield* ReviewPREvidenceV2.prepare(cli, { worktree: directory, baseRef: "base", headRef: "head" }).pipe(Effect.flip))).toBe("truncated")
    }),
  ),
  120_000,
)
