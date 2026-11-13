import { expect, test } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import { access, chmod, mkdir, readFile, readdir, writeFile } from "fs/promises"
import { createHash } from "crypto"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import shfmt from "../../src/backend-toolkit/packs/shfmt"
import cargoMachete from "../../src/backend-toolkit/packs/cargo-machete"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewLocalTools } from "../../src/review-toolkit/local-tools"
import { expectSpawn } from "../fixture/omni-expect"
import { FileDigests } from "../fixture/file-digests"
import { removeExecuted, tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

for (const [tool, pin, count] of [["shfmt", shfmt, 8], ["cargo-machete", cargoMachete, 231]] as const) {
  it.live(`${tool} prepares pinned bytes and every notice, then requires a real host probe`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
    const hosted = <A, E, R>(work: Effect.Effect<A, E, R>) => work.pipe(Effect.provideService(ReviewLocalTools.Root, temp.path))
    const calls: Array<{ input: Parameters<typeof ResearchProcess.run>[0]; outcome: ResearchProcess.Outcome }> = []
    const run: typeof ResearchProcess.run = (input) => Effect.gen(function* () {
      expect(yield* Effect.promise(() => readdir(input.cwd))).toEqual([])
      expect(input.env.HOME).toBe(input.cwd)
      for (const key of ["USERPROFILE", "APPDATA", "LOCALAPPDATA"]) expect(input.env[key]).toBe(input.cwd)
      for (const key of ["CARGO", "CARGO_PKG_NAME", "RUSTUP_HOME", "GOFLAGS"]) expect(input.env[key]).toBeUndefined()
      expect(input.timeoutMs).toBeLessThanOrEqual(5_000)
      expect(input.maxBytes).toBeLessThanOrEqual(4096)
      expect(input.maxRssBytes).toBeGreaterThan(0)
      expect(input.maxRssBytes).toBeLessThanOrEqual(128 * 1024 * 1024)
      const outcome = yield* ResearchProcess.run(input)
      calls.push({ input, outcome })
      return outcome
    })
    expect((yield* hosted(ReviewLocalTools.locate(tool))).ok).toBe(false)
    const result = yield* hosted(ReviewLocalTools.prepare(tool, run))
    if (!result.ok) throw new Error(`host preparation failed: ${result.reason}; observed ${JSON.stringify(calls.map((call) => ({ code: call.outcome.exitCode, stdout: call.outcome.stdout.data.toString("utf8"), failure: call.outcome.failure })))}`)
    expect(result.identity).toMatchObject({ id: tool, version: pin.version, proof: "version-probe" })
    expect(calls).toHaveLength(1)
    expect(yield* Effect.promise(() => access(calls[0].input.cwd).then(() => false, () => true))).toBe(true)
    expect(calls[0].input.command).toBe(result.identity.executable)
    expect(calls[0].input.args).toEqual(["--version"])
    expect(calls[0].outcome.stdout.data.toString("utf8").trim()).toBe(tool === "shfmt" ? `v${pin.version}` : pin.version)
    expect(result.identity.integrity).toBe(pin.binaryIntegrity[result.identity.target])
    expect(`sha256-${createHash("sha256").update(yield* Effect.promise(() => readFile(result.identity.executable))).digest("base64")}`).toBe(result.identity.integrity)
    const directory = path.dirname(result.identity.executable)
    expect(pin.notices).toHaveLength(count) // Independently audited inventory, not a length computed by the mapper.
    for (const notice of pin.notices) {
      const bytes = yield* Effect.promise(() => readFile(path.join(directory, "notices", notice.filename)))
      expect(`sha256-${createHash("sha256").update(bytes).digest("base64")}`).toBe(notice.integrity)
    }
    const before = yield* Effect.promise(() => FileDigests.capture(temp.path))
    expect(yield* hosted(ReviewLocalTools.locate(tool))).toEqual(result)
    expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual(before)

    const wrongVersion: ResearchProcess.Outcome = { ...calls[0].outcome,
      stdout: { data: Buffer.from("wrong version\n"), bytes: 14, truncated: false } }
    expect(yield* hosted(ReviewLocalTools.prepare(tool, () => Effect.succeed(wrongVersion)))).toEqual({ ok: false, reason: "host-version-mismatch" })
    expect((yield* hosted(ReviewLocalTools.locate(tool))).ok).toBe(false)
    const missingLoader: ResearchProcess.Outcome = { ...calls[0].outcome, exitCode: 3221225781,
      stdout: { data: Buffer.alloc(0), bytes: 0, truncated: false } }
    expect(yield* hosted(ReviewLocalTools.prepare(tool, () => Effect.succeed(missingLoader)))).toEqual({ ok: false, reason: "host-runtime-unavailable" })
    expect((yield* hosted(ReviewLocalTools.locate(tool))).ok).toBe(false)
    const faults: ResearchProcess.Outcome[] = [
      { ...calls[0].outcome, timedOut: true }, { ...calls[0].outcome, overflow: true },
      { ...calls[0].outcome, memoryExceeded: true }, { ...calls[0].outcome, failure: "launch failed" },
      { ...calls[0].outcome, exitCode: null },
      { ...calls[0].outcome, stdout: { ...calls[0].outcome.stdout, truncated: true } },
      { ...calls[0].outcome, stderr: { ...calls[0].outcome.stderr, truncated: true } },
    ]
    for (const outcome of faults) expect(yield* hosted(ReviewLocalTools.prepare(tool, () => Effect.succeed(outcome)))).toEqual({ ok: false, reason: "host-runtime-unavailable" })
    expect((yield* hosted(ReviewLocalTools.prepare(tool, run))).ok).toBe(true)

    const original = yield* Effect.promise(() => readFile(result.identity.executable))
    expect(yield* hosted(ReviewLocalTools.prepare(tool, () => Effect.gen(function* () {
      yield* Effect.promise(() => removeExecuted(result.identity.executable))
      yield* Effect.promise(() => writeFile(result.identity.executable, "changed during version probe").then(() => chmod(result.identity.executable, 0o755)))
      return calls[0].outcome
    })))).toEqual({ ok: false, reason: "host-binary-mismatch" })
    expect((yield* hosted(ReviewLocalTools.locate(tool))).ok).toBe(false)
    yield* Effect.promise(() => writeFile(result.identity.executable, original))
    expect((yield* hosted(ReviewLocalTools.prepare(tool, run))).ok).toBe(true)
    yield* Effect.promise(() => removeExecuted(result.identity.executable))
    expect((yield* hosted(ReviewLocalTools.locate(tool))).ok).toBe(false)
    yield* Effect.promise(() => writeFile(result.identity.executable, "changed binary").then(() => chmod(result.identity.executable, 0o755)))
    expect(yield* hosted(ReviewLocalTools.locate(tool))).toEqual({ ok: false, reason: "host-binary-mismatch" })
    yield* Effect.promise(() => writeFile(result.identity.executable, original).then(() => chmod(result.identity.executable, 0o755)))
    expect((yield* hosted(ReviewLocalTools.locate(tool))).ok).toBe(false)
    expect((yield* hosted(ReviewLocalTools.prepare(tool, run))).ok).toBe(true)

    if (tool === "shfmt") {
      const child = path.join(temp.path, "fresh-process.ts")
      yield* Effect.promise(() => Bun.write(child, [
        `import { Effect } from ${JSON.stringify(pathToFileURL(Bun.resolveSync("effect", import.meta.dir)).href)}`,
        `import { ReviewLocalTools } from ${JSON.stringify(new URL("../../src/review-toolkit/local-tools.ts", import.meta.url).href)}`,
        `console.log(JSON.stringify(await Effect.runPromise(ReviewLocalTools.locate(process.argv[3] as ReviewLocalTools.Tool).pipe(Effect.provideService(ReviewLocalTools.Root, process.argv[2])))))`,
      ].join("\n")))
      const unchanged = yield* Effect.promise(() => FileDigests.capture(temp.path))
      const fresh = yield* ResearchProcess.run({ command: process.execPath, args: ["run", child, temp.path, tool],
        cwd: temp.path, env: ResearchProcess.environment(), timeoutMs: 30_000, maxBytes: 4096 })
      expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual(unchanged)
      expect(fresh.exitCode).toBe(0)
      expect(fresh.stdout.data.toString("utf8").trim()).toBe(JSON.stringify({ ok: false, reason: "host-runtime-unprepared" }))
    }
    const evidence = path.resolve(import.meta.dir, "../../../../test-ci-evidence")
    yield* Effect.promise(() => mkdir(evidence, { recursive: true }).then(() => Bun.write(path.join(evidence, `local-tool-${tool}-${result.identity.target}.json`), JSON.stringify({
      ...result.identity, installedNotices: count, actualVersionProbes: calls.length, scope: "installation and host-version probe only", analysisQualified: false,
    }, null, 2))))
  }), 300_000)
}

it.live("unqualified host never acquires or invokes a tool", () => Effect.gen(function* () {
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const before = yield* Effect.promise(() => FileDigests.capture(temp.path))
  const result = yield* ReviewLocalTools.prepare("shfmt", () => Effect.die("unexpected probe")).pipe(
    Effect.provideService(ReviewLocalTools.Root, temp.path), Effect.provideService(BackendToolkit.Target, { unsupported: "test-host" }),
  )
  expect(result).toEqual({ ok: false, reason: "host-runtime-unqualified" })
  expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual(before)
}))

test("version probe environment strips Cargo's subcommand sentinel without changing parent env", () => {
  const input = { PATH: "host-path", cargo: "cargo", Cargo: "cargo", userprofile: "real-home", USERPROFILE: "real-home", APPDATA: "real-data", LOCALAPPDATA: "real-local", CARGO: "cargo", CARGO_PKG_NAME: "project", RUSTUP_HOME: "user", GOFLAGS: "project flags" }
  const result = ReviewLocalTools.environment("/probe-home", input)
  for (const key of ["cargo", "Cargo", "userprofile"]) expect(result[key]).toBeUndefined()
  for (const key of ["USERPROFILE", "APPDATA", "LOCALAPPDATA"]) expect(result[key]).toBe("/probe-home")
  expect(result.CARGO).toBeUndefined()
  expect(result.CARGO_PKG_NAME).toBeUndefined()
  expect(result.RUSTUP_HOME).toBeUndefined()
  expect(result.GOFLAGS).toBeUndefined()
  expect(result.HOME).toBe("/probe-home")
  expect(input.CARGO).toBe("cargo")
})

it.live("unknown tool ids never acquire or invoke a tool", () => Effect.gen(function* () {
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  for (const tool of ["unknown", "__proto__", ""]) {
    const input = tool as ReviewLocalTools.Tool // Exercise the runtime boundary from an untyped caller.
    expect(yield* ReviewLocalTools.prepare(input, () => Effect.die("unexpected probe")).pipe(Effect.provideService(ReviewLocalTools.Root, temp.path))).toEqual({ ok: false, reason: "host-tool-unknown" })
    expect(yield* ReviewLocalTools.locate(input).pipe(Effect.provideService(ReviewLocalTools.Root, temp.path))).toEqual({ ok: false, reason: "host-tool-unknown" })
  }
  expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual([])
}))
