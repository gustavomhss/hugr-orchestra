import { expect } from "bun:test"
import { createHash } from "crypto"
import path from "path"
import { chmod, mkdir, readdir, readFile, rm, symlink, writeFile } from "fs/promises"
import { Effect, Fiber, Option, Schema } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewProbeMutants } from "../../src/review-toolkit/probe-mutants"
import { ReviewProbeRuntime } from "../../src/review-toolkit/probe-runtime"
import { ReviewProbeTargets } from "../../src/review-toolkit/probe-targets"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const hosted = jail && process.platform === "linux" && process.arch === "x64" ? it.live : it.live.skip
const ASSET = "https://github.com/sourcefrog/cargo-mutants/releases/download/v27.1.0/cargo-mutants-x86_64-unknown-linux-gnu.tar.gz"
const HASH = "dfe6dc37d0342c891d2829b5a695aa57c2d0edecef7e7d0399a30cc6e206411e"
const BYTES = 3233206
const CHANGED = 2
const SUMMARIES = ["Success", "CaughtMutant", "MissedMutant", "Unviable", "Timeout", "Failure"] as const
const manifest = "[package]\nname = \"probe_mutants_fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n"
const crate = (body: string, test: string) =>
  `pub fn changed(a: i32, b: i32) -> i32 {\n    ${body}\n}\n\npub fn untouched(n: i32) -> i32 {\n    n + 1\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn holds() {\n        ${test}\n    }\n}\n`
const STRONG_BASE = crate("a - b", "assert_eq!(changed(2, 3), 5);")
const STRONG_HEAD = crate("a + b", "assert_eq!(changed(2, 3), 5);")
const WEAK_HEAD = crate("a + b", "let _ = changed(2, 3);")
const SLEEP_HEAD = crate("a + b", "std::thread::sleep(std::time::Duration::from_secs(30));\n        assert_eq!(changed(2, 3), 5);")
const FAIL_HEAD = crate("a + b", "assert!(false);")
const NOTE_BASE = `// note\n${STRONG_HEAD}`
const NOTE_HEAD = `// noted\n${STRONG_HEAD}`
const many = (value: number) => Array.from({ length: 100 }, (_, index) => `pub fn f${index}() -> i32 { ${value} }`).join("\n") + "\n"
const Point = Schema.Struct({ line: Schema.Int, column: Schema.Int })
const Listed = Schema.Array(Schema.Struct({ name: Schema.String, file: Schema.String, span: Schema.Struct({ start: Point, end: Point }) }))
const ReportLine = Schema.Struct({
  kind: Schema.Literals(["mutants-report"]),
  report: Schema.Struct({
    total_mutants: Schema.Int, missed: Schema.Int, caught: Schema.Int, timeout: Schema.Int, unviable: Schema.Int,
    success: Schema.Int, cargo_mutants_version: Schema.String,
    outcomes: Schema.Array(Schema.Struct({ scenario: Schema.Unknown, summary: Schema.Literals(SUMMARIES) })),
  }),
})
const decodeJson = <A>(schema: Schema.Decoder<A>, text: string) =>
  Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text).pipe(Option.flatMap(Schema.decodeUnknownOption(schema)))
const present = <A>(value: Option.Option<A>, detail = "") => {
  expect(Option.isSome(value), detail).toBe(true)
  if (Option.isNone(value)) return yieldMissing<A>()
  return value.value
}
const yieldMissing = <A>(): A => { throw new Error("missing native evidence") }

const binary = Effect.acquireRelease(Effect.gen(function* () {
  const dir = yield* Effect.promise(() => tmpdir())
  const archive = path.join(dir.path, "cargo-mutants.tar.gz")
  const response = yield* Effect.promise(() => fetch(ASSET))
  if (!response.ok) return yield* Effect.die(`asset status ${response.status}`)
  const bytes = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))
  if (bytes.byteLength !== BYTES) return yield* Effect.die(`asset bytes ${bytes.byteLength}`)
  if (createHash("sha256").update(bytes).digest("hex") !== HASH) return yield* Effect.die("asset hash")
  yield* Effect.promise(() => writeFile(archive, bytes))
  const extracted = yield* ResearchProcess.run({
    command: "tar", args: ["-xzf", archive, "-C", dir.path], cwd: dir.path,
    env: { PATH: process.env.PATH ?? "" }, timeoutMs: 60_000, maxBytes: 1_000_000,
  })
  if (extracted.exitCode !== 0) return yield* Effect.die(extracted.stderr.data.toString("utf8"))
  const bin = path.join(dir.path, "cargo-mutants")
  yield* Effect.promise(() => chmod(bin, 0o755))
  return { dir, bin }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

const repo = (base: string, head: string, lock: boolean) => Effect.acquireRelease(Effect.gen(function* () {
  const dir = yield* Effect.promise(() => tmpdir())
  const root = path.join(dir.path, "repo")
  yield* Effect.promise(async () => {
    await mkdir(path.join(root, "src"), { recursive: true })
    await writeFile(path.join(root, "Cargo.toml"), manifest)
    await writeFile(path.join(root, "src", "lib.rs"), base)
  })
  if (lock) {
    const locked = yield* ResearchProcess.run({
      command: "cargo", args: ["generate-lockfile", "--offline"], cwd: root,
      env: { PATH: process.env.PATH ?? "", CARGO_NET_OFFLINE: "true" }, timeoutMs: 120_000, maxBytes: 1_000_000,
    })
    if (locked.exitCode !== 0) return yield* Effect.die(locked.stderr.data.toString("utf8") || "cargo generate-lockfile failed")
  }
  yield* Effect.promise(() => git(root, "init", "-q"))
  yield* Effect.promise(() => git(root, "config", "user.email", "probe@example.com"))
  yield* Effect.promise(() => git(root, "config", "user.name", "Probe"))
  yield* Effect.promise(() => git(root, "add", "."))
  yield* Effect.promise(() => git(root, "commit", "-q", "-m", "base"))
  yield* Effect.promise(() => writeFile(path.join(root, "src", "lib.rs"), head))
  yield* Effect.promise(() => git(root, "add", "."))
  yield* Effect.promise(() => git(root, "commit", "-q", "-m", "head"))
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

const hunk = (line: number, current: string, original: string): ReviewScratch.Hunk => ({ path: "src/lib.rs", line, current: [current], original: [original] })
const changedHunk = hunk(CHANGED, "    a + b", "    a - b")
const target = (startLine: number, endLine = startLine, file = "src/lib.rs"): ReviewProbeTargets.Mutants => ({ path: file, startLine, endLine })
const probe = (bin: string | undefined, input: ReviewProbeTargets.Mutants, context: ReviewProbeMutants.RunContext) =>
  ReviewProbeMutants.run(input, context).pipe(Effect.provideService(ReviewProbeMutants.Binary, bin))
const readAt = (root: string) => Effect.promise(() => readFile(path.join(root, "src", "lib.rs"), "utf8"))
const labels = (result: ReviewProbeRuntime.Result) => result.steps.map((item) => item.label)
const why = (result: ReviewProbeRuntime.Result) => [result.reason ?? "", ...result.steps.map((item) => item.reason ?? "")].join(" ")
const stepOf = (result: ReviewProbeRuntime.Result, label: string) => result.steps.find((item) => item.label === label)
const argvOf = (result: ReviewProbeRuntime.Result) => result.steps.flatMap((item) => item.argv)
const overlaps = (span: { start: { line: number; column: number }; end: { line: number; column: number } }, line: number) =>
  span.start.line <= line && (span.end.column === 1 ? span.end.line - 1 : span.end.line) >= line
const expectClosed = (argv: ReadonlyArray<string>, bin: string, root: string, seconds: number, phase: "list" | "mutants") => {
  const tail = phase === "list" ? ["--list", "--json"] : []
  expect(argv).toEqual([
    bin, "mutants", "--no-config", "--dir", root, "--in-diff", argv[6] ?? "", "--output", argv[8] ?? "",
    "--no-shuffle", "--timeout", String(seconds), "--build-timeout", String(seconds), "--cargo-arg=--offline", "--cargo-arg=--locked", ...tail,
  ])
  expect(argv.join(" ")).not.toMatch(/--in-place|revert/)
}
const listOf = (result: ReviewProbeRuntime.Result) => decodeJson(Listed, stepOf(result, "list")?.stdout.trim() ?? "")
const reportOf = (result: ReviewProbeRuntime.Result) =>
  decodeJson(ReportLine, (stepOf(result, "mutants")?.stdout ?? "").trim().split("\n").at(-1) ?? "")
const refused = (result: ReviewProbeRuntime.Result) => {
  expect(result.status, why(result)).toBe("not-run")
  expect(why(result)).not.toContain("not-built")
  expect(labels(result)).toEqual([])
  expect(argvOf(result)).toEqual([])
}

async function stray(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(entries.filter((entry) => entry.name !== ".git").map(async (entry) => {
    const full = path.join(root, entry.name)
    if (entry.name === "mutants.out") return [full]
    if (entry.isDirectory()) return stray(full)
    return []
  }))
  return nested.flat()
}
const waitProbe = (scratch: string, left: number): Effect.Effect<boolean> => Effect.gen(function* () {
  if (left === 0) return false
  const names = yield* Effect.promise(() => readdir(scratch).catch(() => [] as string[]))
  if (names.some((name) => name.startsWith("probe-"))) return true
  yield* Effect.sleep("250 millis")
  return yield* waitProbe(scratch, left - 1)
})

hosted("changed line is caught, untouched is not a mutant target, copies stay exact", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, STRONG_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const seconds = 180
      const result = yield* probe(tool.bin, target(CHANGED), { head, base, timeoutSeconds: seconds, hunks: [changedHunk] })
      const listed = present(listOf(result), JSON.stringify(result))
      const report = present(reportOf(result), JSON.stringify(result)).report
      const caught = report.outcomes.filter((row) => row.summary === "CaughtMutant")
      expect(result.status, why(result)).toBe("pass")
      expect(labels(result)).toEqual(["version", "list", "mutants"])
      expect(stepOf(result, "version")?.stdout).toContain("cargo-mutants 27.1.0")
      expectClosed(stepOf(result, "list")?.argv ?? [], tool.bin, head.root, seconds, "list")
      expectClosed(stepOf(result, "mutants")?.argv ?? [], tool.bin, head.root, seconds, "mutants")
      expect(listed.length).toBeGreaterThan(0)
      for (const row of listed) {
        expect(row.file).toBe("src/lib.rs")
        expect(row.name).not.toContain("untouched")
        expect(overlaps(row.span, CHANGED), row.name).toBe(true)
      }
      const listArgs = stepOf(result, "list")?.argv ?? []
      const runArgs = stepOf(result, "mutants")?.argv ?? []
      expect(runArgs).toEqual(listArgs.slice(0, -2))
      expect(path.relative(head.scratch, listArgs[6] ?? "")).toStartWith("probe-")
      expect(path.basename(listArgs[6] ?? "")).toBe("changed.diff")
      expect(path.basename(listArgs[8] ?? "")).toBe("out")
      expect(path.dirname(listArgs[6] ?? "")).toBe(path.dirname(listArgs[8] ?? ""))
      const diff = stepOf(result, "version")?.stderr ?? ""
      expect(diff).toContain("--- /dev/null")
      expect(diff).toContain("+++ b/src/lib.rs")
      expect(diff).toContain("+    a + b")
      expect(report.cargo_mutants_version).toBe("27.1.0")
      expect(report.outcomes.find((row) => row.scenario === "Baseline")?.summary).toBe("Success")
      expect(report.total_mutants).toBe(listed.length)
      expect(report.outcomes.filter((row) => row.scenario !== "Baseline")).toHaveLength(listed.length)
      expect(report.caught).toBe(caught.length)
      expect(report.caught).toBeGreaterThanOrEqual(1)
      expect(report.missed).toBe(0)
      expect(report.outcomes.filter((row) => row.summary === "Unviable").length).toBe(report.unviable)
      expect(report.outcomes.some((row) => row.summary === "MissedMutant")).toBe(false)
      expect(report.outcomes.some((row) => typeof row.scenario === "object" && row.scenario !== null && "Mutant" in row.scenario)).toBe(true)
      expect(yield* readAt(head.root)).toBe(STRONG_HEAD)
      expect(yield* readAt(base.root)).toBe(STRONG_BASE)
      expect(yield* readAt(fixture.root)).toBe(STRONG_HEAD)
      expect(yield* Effect.promise(() => stray(fixture.root))).toEqual([])
      expect(yield* Effect.promise(() => stray(head.root))).toEqual([])
    }))
  }), 300_000,
)
hosted("a weak oracle leaves a mutant missed and fails", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, WEAK_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* probe(tool.bin, target(CHANGED), { head, timeoutSeconds: 180, hunks: [changedHunk] })
      const report = present(reportOf(result), JSON.stringify(result)).report
      expect(result.status, why(result)).toBe("fail")
      expect(report.missed).toBeGreaterThanOrEqual(1)
      expect(report.outcomes.some((row) => row.summary === "MissedMutant")).toBe(true)
      expect(yield* readAt(head.root)).toBe(WEAK_HEAD)
    }))
  }), 300_000,
)
hosted("pinned binary refuses unsafe paths, ranges, and extensions before mutants", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, STRONG_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const safe = { head, timeoutSeconds: 30, hunks: [changedHunk] }
      const inputs: ReviewProbeTargets.Mutants[] = [
        target(40, 41), target(CHANGED, CHANGED, "src/lib.ts"), target(CHANGED, CHANGED, path.join(fixture.root, "src/lib.rs")),
        target(CHANGED, CHANGED, "../lib.rs"), target(CHANGED, CHANGED, "src/lib\0.rs"), target(CHANGED, CHANGED, "src/lib\r.rs"),
        target(CHANGED, CHANGED, "src\\lib.rs"), { path: "src/lib.rs", startLine: 1.5, endLine: 1.5 } as ReviewProbeTargets.Mutants,
      ]
      for (const input of inputs) refused(yield* probe(tool.bin, input, safe))
      refused(yield* probe(tool.bin, target(CHANGED), { ...safe, hunks: [] }))
      expect(yield* readAt(head.root)).toBe(STRONG_HEAD)
    }))
  }), 180_000,
)
hosted("a missing binary with a valid lock and hunk does not install", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo(STRONG_BASE, STRONG_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* probe(path.join(fixture.dir.path, "missing-cargo-mutants"), target(CHANGED), { head, timeoutSeconds: 30, hunks: [changedHunk] })
      refused(result)
      expect(argvOf(result).join(" ")).not.toMatch(/install|rustup|curl|wget/)
      expect(yield* readAt(head.root)).toBe(STRONG_HEAD)
    }))
  }), 180_000,
)
hosted("a symlink escape and a node_modules target are refused with no argv", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, STRONG_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      yield* Effect.promise(async () => {
        const outside = path.join(fixture.dir.path, "outside.rs")
        await writeFile(outside, STRONG_HEAD)
        await rm(path.join(head.root, "src/lib.rs"))
        await symlink(outside, path.join(head.root, "src/lib.rs"))
        await mkdir(path.join(head.root, "node_modules", "dep"), { recursive: true })
        await writeFile(path.join(head.root, "node_modules", "dep", "lib.rs"), "pub fn x() -> i32 { 1 }\n")
      })
      for (const file of ["src/lib.rs", "node_modules/dep/lib.rs"]) {
        const line = file === "src/lib.rs" ? CHANGED : 1
        const current = file === "src/lib.rs" ? "    a + b" : "pub fn x() -> i32 { 1 }"
        const context = { head, timeoutSeconds: 30, hunks: [{ ...hunk(line, current, ""), path: file }] }
        refused(yield* probe(tool.bin, target(line, line, file), context))
      }
      expect(yield* readAt(head.root)).toBe(STRONG_HEAD)
    }))
  }), 180_000,
)
hosted("a missing Cargo.lock is not-run before version and list", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, STRONG_HEAD, false)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* probe(tool.bin, target(CHANGED), { head, timeoutSeconds: 30, hunks: [changedHunk] })
      expect(result.status, why(result)).toBe("not-run")
      expect(labels(result)).not.toContain("version")
      expect(labels(result)).not.toContain("list")
      expect(labels(result)).not.toContain("mutants")
      expect(yield* readAt(head.root)).toBe(STRONG_HEAD)
    }))
  }), 180_000,
)
hosted("a failing baseline is not-run baseline-failed", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, FAIL_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* probe(tool.bin, target(CHANGED), { head, timeoutSeconds: 180, hunks: [changedHunk] })
      expect(result.status, why(result)).toBe("not-run")
      expect(why(result)).toContain("baseline-failed")
      expect(yield* readAt(head.root)).toBe(FAIL_HEAD)
    }))
  }), 300_000,
)
hosted("more than 64 enumerated mutants is not-run mutant-budget before execution", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const headSrc = many(2)
    const fixture = yield* repo(many(1), headSrc, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* probe(tool.bin, target(1, 100), {
        head, timeoutSeconds: 180,
        hunks: [{ path: "src/lib.rs", line: 1, current: headSrc.split("\n").slice(0, -1), original: many(1).split("\n").slice(0, -1) }],
      })
      const listed = present(listOf(result), JSON.stringify(result))
      expect(result.status, why(result)).toBe("not-run")
      expect(why(result)).toContain("mutant-budget")
      expect(labels(result)).toContain("list")
      expect(labels(result)).not.toContain("mutants")
      expect(listed.length).toBeGreaterThan(64)
      expect(yield* readAt(head.root)).toBe(headSrc)
    }))
  }), 300_000,
)
hosted("a comment-only changed line enumerates no mutants and is not-run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(NOTE_BASE, NOTE_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* probe(tool.bin, target(1), { head, timeoutSeconds: 180, hunks: [hunk(1, "// noted", "// note")] })
      expect(result.status, why(result)).toBe("not-run")
      expect(labels(result)).not.toContain("mutants")
      const list = stepOf(result, "list")
      expect(list?.exitCode).toBe(0)
      if (list?.stdout.trim() === "") expect(why(result)).toContain("no-mutants")
      else expect(present(listOf(result), JSON.stringify(result))).toEqual([])
      expect(yield* readAt(head.root)).toBe(NOTE_HEAD)
      expect(yield* Effect.promise(() => stray(head.root))).toEqual([])
    }))
  }), 300_000,
)
hosted("a 1s native timeout against a sleeping test is not-run and leaves the source", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, SLEEP_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const result = yield* probe(tool.bin, target(CHANGED), { head, timeoutSeconds: 1, hunks: [changedHunk] })
      expect(result.status, why(result)).toBe("not-run")
      expect(why(result)).toMatch(/timeout/i)
      expect(yield* readAt(head.root)).toBe(SLEEP_HEAD)
      expect(yield* readAt(fixture.root)).toBe(SLEEP_HEAD)
    }))
  }), 180_000,
)
hosted("cancellation while cargo-mutants is running removes probe scratch and keeps copies", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tool = yield* binary
    const fixture = yield* repo(STRONG_BASE, SLEEP_HEAD, true)
    yield* Effect.scoped(Effect.gen(function* () {
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const fiber = yield* Effect.forkScoped(probe(tool.bin, target(CHANGED), { head, base, timeoutSeconds: 180, hunks: [changedHunk] }))
      expect(yield* waitProbe(head.scratch, 80)).toBe(true)
      yield* Fiber.interrupt(fiber)
      const names = yield* Effect.promise(() => readdir(head.scratch))
      expect(names.filter((name) => name.startsWith("probe-"))).toEqual([])
      expect(yield* readAt(head.root)).toBe(SLEEP_HEAD)
      expect(yield* readAt(base.root)).toBe(STRONG_BASE)
      expect(yield* readAt(fixture.root)).toBe(SLEEP_HEAD)
    }))
  }), 300_000,
)
