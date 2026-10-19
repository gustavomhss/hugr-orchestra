import { expect, test } from "bun:test"
import path from "path"
import { createServer } from "node:net"
import { mkdir, readFile, symlink, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { ProbeRun } from "../src/research-toolkit/probe/run"
import type { Probe } from "../src/research-toolkit/probe/types"
import { testEffect } from "./lib/effect"
import { jail } from "./lib/sandbox-host"
import { expectSpawn } from "./fixture/omni-expect"
import { git } from "./fixture/git"
import { tmpdir } from "./fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// Probes run only inside the host's real jail; where there is none the probe refuses, which the last tests cover.
const live = jail ? it.live : it.live.skip

const BROKEN = `export const n: number = "x"\n`
const FIXED = `export const n: number = 1\n`

/** A git repository with a planted type error in HEAD, the project's own typescript, and a fixed worktree. */
const repo = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = dir.path
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "probe@example.com")
  await git(root, "config", "user.name", "Probe")
  await mkdir(path.join(root, "src"))
  await mkdir(path.join(root, "node_modules"))
  await symlink(path.dirname(Bun.resolveSync("typescript/package.json", import.meta.dir)), path.join(root, "node_modules", "typescript"))
  await writeFile(path.join(root, ".gitignore"), "node_modules\n")
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, types: [] }, include: ["src"] }))
  await writeFile(path.join(root, "src", "a.ts"), BROKEN)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "planted")
  await writeFile(path.join(root, "src", "a.ts"), FIXED)
  return dir
}), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))

const context = (worktree: string, extra?: Partial<ProbeRun.Context>): ProbeRun.Context => ({
  worktree, executionSessionID: "ses_probe", dispatchID: `dispatch_${Math.random()}`, remainingSeconds: 60, ...extra,
})

const script = (source: string, extra?: Partial<Probe.ProbeInput>): Probe.ProbeInput => ({
  snapshot: { kind: "worktree" }, runner: { kind: "script", language: "js", source }, ...extra,
})

live("typecheck on a commit snapshot reproduces the planted error in original coordinates; the fixed worktree does not", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    const input = { runner: { kind: "typecheck", project: "tsconfig.json" }, expect: { diagnosticCode: "TS2322" } } as const
    const planted = yield* ProbeRun.run({ ...input, snapshot: { kind: "commit", revision: "HEAD" } }, context(dir.path))
    expect(planted.verdict, planted.stderr.tail).toBe("reproduced")
    expect(planted.snapshot.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(planted.diagnostics?.[0]).toMatchObject({ path: "src/a.ts", line: 1, column: 14, code: "TS2322" })
    expect(planted.memoryCap).toBe(ProbeRun.memoryCap())
    expect(planted.runner.argv).toContain("--max-old-space-size=1024")
    // Diagnostic lines are structured: the condensed tail names each distinct error once, by its original site.
    expect(planted.stdout.tail).toContain("error TS2322: Type 'string' is not assignable to type 'number'. (first at src/a.ts:1:14)")
    expect(planted.stdout.tail).not.toContain("a.ts(1,14)")
    const fixed = yield* ProbeRun.run({ ...input, snapshot: { kind: "worktree" } }, context(dir.path))
    expect(fixed.verdict).toBe("not_reproduced")
    expect(fixed.snapshot.dirtyDigest).toMatch(/^[0-9a-f]{64}$/)
  }), 120_000,
)

live("unused: true proves an unused symbol with TS6133 (T-P3)", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    yield* Effect.promise(() => writeFile(path.join(dir.path, "src", "b.ts"), "const spare = 1\nexport {}\n"))
    const input = { snapshot: { kind: "worktree" }, runner: { kind: "typecheck", project: "src/b.ts" }, expect: { diagnosticCode: "TS6133" } } as const
    expect((yield* ProbeRun.run(input, context(dir.path))).verdict).toBe("not_reproduced")
    const unused = yield* ProbeRun.run(input, context(dir.path, { unused: true }))
    expect(unused.verdict).toBe("reproduced")
    expect(unused.diagnostics?.find((item) => item.code === "TS6133")).toMatchObject({ path: "src/b.ts", line: 1, column: 7 })
  }), 120_000,
)

live("a script cannot reach the network from the jail", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    const accepted = { count: 0 }
    const server = createServer((socket) => {
      accepted.count++
      socket.destroy()
    })
    yield* Effect.acquireRelease(Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))),
      () => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))))
    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0
    const source = `const s=require("net").connect(${port},"127.0.0.1");s.on("connect",()=>{console.log("connected");process.exit(0)});s.on("error",(e)=>{console.log("refused "+e.code);process.exit(0)})`
    const result = yield* ProbeRun.run(script(source, { expect: { stdoutIncludes: "connected" } }), context(dir.path))
    expect(result.verdict, result.stdout.tail + result.stderr.tail).toBe("not_reproduced")
    expect(accepted.count).toBe(0)
  }), 60_000,
)

live("a script cannot write outside the scratch: the original worktree is unchanged", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    const target = path.join(dir.path, "src", "a.ts")
    const source = `const fs=require("fs");for(const f of [${JSON.stringify(target)},"src/a.ts"]){try{fs.writeFileSync(f,"pwned");console.log("wrote "+f)}catch(e){console.log("denied "+e.code)}}`
    const result = yield* ProbeRun.run(script(source, { expect: { stdoutIncludes: "wrote" } }), context(dir.path))
    expect(result.verdict, result.stdout.tail + result.stderr.tail).toBe("not_reproduced")
    expect(yield* Effect.promise(() => readFile(target, "utf8"))).toBe(FIXED)
  }), 60_000,
)

live("a repository test guard yields blocked_by_repo_guard; the host hands the child neither CI nor ORCHESTRA_LOCAL_TESTS", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    yield* Effect.promise(async () => {
      await writeFile(path.join(dir.path, "bunfig.toml"), `[test]\npreload = ["./guard.ts"]\n`)
      await writeFile(path.join(dir.path, "guard.ts"),
        `if (process.env.CI !== "true" && process.env.ORCHESTRA_LOCAL_TESTS !== "1") { console.error("${ProbeRun.GUARD}; tests run on GitHub Actions."); process.exit(1) }\n`)
      await writeFile(path.join(dir.path, "x.test.ts"), `import { test } from "bun:test"\ntest("x", () => {})\n`)
    })
    const guarded = yield* ProbeRun.run({ snapshot: { kind: "worktree" }, runner: { kind: "test", file: "x.test.ts", name: "x" } }, context(dir.path))
    expect(guarded.verdict, guarded.stderr.tail).toBe("blocked_by_repo_guard")
    expect(guarded.runner.argv.slice(-2)).toEqual(["-t", "x"])
    const env = yield* ProbeRun.run(script(`console.log(JSON.stringify([process.env.CI ?? null, process.env.ORCHESTRA_LOCAL_TESTS ?? null, process.env.NODE_OPTIONS ?? null]))`),
      context(dir.path))
    expect(env.stdout.tail).toBe("[null,null,null]")
  }), 120_000,
)

live("the timeout stops the probe and names it", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    const result = yield* ProbeRun.run(script("setInterval(() => {}, 1000)", { timeoutSeconds: 30 }), context(dir.path, { remainingSeconds: 2 }))
    expect(result.verdict).toBe("timeout")
    expect(result.exitCode).toBeNull()
    expect(result.durationMs).toBeLessThan(20_000)
  }), 60_000,
)

// Only where the result declares an rss cap is it enforced; elsewhere the result says heap-only (JE-AC-P6).
const capped = jail && ProbeRun.memoryCap() === "rss" ? it.live : it.live.skip
capped("a tree over the RSS cap is killed as memory_exceeded (J4.7)", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    // A non-zero fill touches every page, so the bytes are resident.
    const result = yield* ProbeRun.run(script("const held = Buffer.alloc(400 * 1024 * 1024, 1); setTimeout(() => console.log(held.length), 30000)"),
      context(dir.path, { rssBytes: 150 * 1024 * 1024 }))
    expect(result.verdict, result.stderr.tail).toBe("memory_exceeded")
    expect(result.memoryCap).toBe("rss")
    expect(result.durationMs).toBeLessThan(20_000)
  }), 60_000,
)

live("a second probe in the same dispatch waits, then fails busy", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* repo
    const shared = context(dir.path, { queueSeconds: 1 })
    const [first, second] = yield* Effect.all([
      ProbeRun.run(script("setTimeout(() => console.log('done'), 4000)"), shared),
      Effect.sleep("300 millis").pipe(Effect.andThen(ProbeRun.run(script("console.log(1)"), shared)), Effect.flip),
    ], { concurrency: 2 })
    expect(first.verdict).toBe("passed")
    expect(second).toMatchObject({ code: "probe_denied", reason: "busy" })
  }), 60_000,
)

it.live("a path outside the snapshot is refused before anything runs (J4.2)", () =>
  Effect.gen(function* () {
    if (process.platform === "win32") return
    const dir = yield* repo
    const error = yield* ProbeRun.run({ snapshot: { kind: "worktree" }, runner: { kind: "typecheck", project: "../../etc/hosts" } }, context(dir.path)).pipe(Effect.flip)
    expect(error).toMatchObject({ code: "probe_denied" })
    expect(error.reason).toStartWith("path-outside-snapshot")
  }), 60_000,
)

test.if(process.platform === "win32")("Windows answers probe_unsupported_platform", async () => {
  const error = await Effect.runPromise(ProbeRun.run(script("1"), context(process.cwd())).pipe(Effect.flip, Effect.provide(LayerNode.compile(AppProcess.node))))
  expect(error).toMatchObject({ code: "probe_unsupported_platform" })
})
