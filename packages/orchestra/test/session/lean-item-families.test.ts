import { expect } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { InstanceRef } from "../../src/effect/instance-ref"
import { Session } from "../../src/session/session"
import { MessageID } from "../../src/session/schema"
import { ShellTool } from "../../src/tool/shell"
import { LegacyLeanCapture } from "../../src/tool/lean-capture"
import { LegacyLeanOutput } from "../../src/session/lean-output"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

async function setup(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe", timeout: 120000 })
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ])
  if (code !== 0) throw new Error(`Native fixture setup failed: ${JSON.stringify(args)} (${code})\n${stdout}${stderr}`)
}

it.instance("real Cargo pytest Go and Vitest preserve independent native item controls", () => Effect.gen(function* () {
  const instance = yield* InstanceRef
  if (!instance) throw new Error("Native family instance missing")
  const directory = instance.directory
  // venv puts executables in Scripts on Windows and bin elsewhere.
  const venv = path.join(directory, ".venv", process.platform === "win32" ? "Scripts" : "bin")
  yield* Effect.promise(async () => {
    for (const executable of ["go", "cargo", "python3", "npm"]) {
      if (!Bun.which(executable)) throw new Error(`Required public native fixture binary unavailable: ${executable}`)
    }
    await Bun.write(path.join(directory, "go.mod"), "module example.test\n\ngo 1.20\n")
    await Bun.write(path.join(directory, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) =>
      `func TestCase${i}(t *testing.T) {}`).join("\n")}\n`)
    await Bun.write(path.join(directory, "Cargo.toml"), '[package]\nname="native_item_fixture"\nversion="0.1.0"\nedition="2021"\n[lib]\npath="native.rs"\n')
    await Bun.write(path.join(directory, "native.rs"), Array.from({ length: 30 }, (_, i) => `#[test] fn case_${i}() { assert_eq!(1, 1); }`).join("\n"))
    await Bun.write(path.join(directory, "test_native.py"), Array.from({ length: 30 }, (_, i) => `def test_case_${i}():\n    assert 1 == 1\n`).join("\n"))
    // Public pinned fixture dependencies only; no provider credentials or paid model.
    await setup(["python3", "-m", "venv", ".venv"], directory)
    await setup([path.join(venv, "python"), "-m", "pip", "install", "pytest==9.0.3", "pluggy==1.6.0"], directory)
    await Bun.write(path.join(directory, "package.json"), JSON.stringify({ private: true, type: "module", devDependencies: { vitest: "3.2.4" } }))
    await setup(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], directory)
    // Globals, not `import ... from "vitest"`: a Windows full suite resolved that import to the repository's vitest
    // while the fixture's own runner ran the file, and two vitest instances fail with "failed to find the current suite".
    await Bun.write(path.join(directory, "vitest.config.mjs"), 'export default { test: { globals: true, pool: "forks", minWorkers: 1, maxWorkers: 1 } }\n')
    await Bun.write(path.join(directory, "native.test.js"), `${Array.from({ length: 20 }, (_, i) =>
      `test("native ${i}", () => expect(1).toBe(1));`).join("\n")}\n`)
  })
  const sessions = yield* Session.Service
  yield* Effect.acquireRelease(Effect.sync(() => {
    const previous = process.env.PATH
    process.env.PATH = [venv, path.join(directory, "node_modules/.bin"), previous].join(path.delimiter)
    return previous
  }), (previous) => Effect.sync(() => {
    if (previous === undefined) delete process.env.PATH
    else process.env.PATH = previous
  }))
  const session = yield* sessions.create({ permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  const shellInfo = yield* ShellTool
  const shell = yield* shellInfo.init()
  const families = [
    // 0.4.0's Cargo grammar accepts Windows target\debug\deps\*.exe spellings, so Cargo reduces on every OS.
    // Serial lib tests, as in lean-session-families: a plain `cargo test` interleaves the doctest header on stderr with
    // the lib results on stdout, which the engine declines (unsupported_output) on some runs.
    { itemID: "cargo", command: "cargo test --lib -- --test-threads=1", reduce: true },
    { itemID: "pytest", command: "pytest", reduce: true },
    { itemID: "go", command: "go test -v .", reduce: true },
    // No Vitest profile reduces its plaintext; Lean 2.0's lossless cleanup still strips its terminal escapes.
    { itemID: "vitest", command: "vitest run", reduce: true },
  ] as const
  for (const family of families) {
    const owner = { sessionID: session.id, callID: `native-${family.itemID}` }
    // Real native producer issues capability. Test never calls LegacyLeanCapture.record.
    const output = yield* shell.execute({ command: family.command, workdir: directory, timeout: 120000 }, {
      ...owner, messageID: MessageID.ascending(), agent: "maestro", messages: [], abort: AbortSignal.any([]),
      metadata: () => Effect.void, ask: () => Effect.void,
    })
    expect(output.metadata.exit).toBe(0)
    expect(output.metadata.truncated).toBe(false)
    expect(output.metadata.timeout).toBe(false)
    expect(output.metadata.aborted).toBe(false)
    const binding = LegacyLeanCapture.bind(output, output, owner)
    expect(binding).toBeDefined()
    const input = { output, binding, owner, command: family.command, enabled: true,
      limits: { maxLines: 10000, maxBytes: 1000000 } }
    const telemetry = { owner: { projectID: instance.project.id, location: directory, ...owner },
      model: { provider: "public-fixture", id: "no-model-call" } }
    const project = (value: Parameters<typeof LegacyLeanOutput.project>[0]) => Effect.promise(() => LegacyLeanOutput.project(value))
    const selected = yield* project({ ...input, telemetry })
    const metrics = LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))
    if (family.reduce && metrics?.status !== "applied") throw new Error(`Native ${family.itemID} positive baseline declined: ${JSON.stringify(metrics)}\n${output.output}`)
    expect(metrics).toMatchObject({ itemID: family.itemID, engine: LeanEngine.current, eligible: true,
      status: family.reduce ? "applied" : "passthrough" })
    expect(metrics?.bytes.before).toBe(Buffer.byteLength(output.output, "utf8"))
    expect(metrics?.bytes.after).toBe(Buffer.byteLength(selected.output, "utf8"))
    if (family.reduce) expect(selected.output.length).toBeLessThan(output.output.length)
    else expect(selected.output).toBe(output.output)
    expect(yield* project({ ...input, items: { [family.itemID]: false } })).toBe(output)
    // Disabling either Cargo or Vitest cannot remove another family's default reducer.
    for (const items of [{ cargo: false }, { vitest: false }]) {
      const current = yield* project({ ...input, items })
      expect(current.output).toBe(items[family.itemID as keyof typeof items] === false ? output.output : selected.output)
    }
    const appended = { ...output, output: `${output.output}\n\nPOLICY KEEP 😀` }
    expect(yield* project({ ...input, output: appended, items: { [family.itemID]: false } })).toBe(appended)
    const changed = { ...output, output: `PLUGIN KEEP\n${output.output}` }
    expect(yield* project({ ...input, output: changed })).toBe(changed)
    // The whole-view budget refuses a profile reduction; Vitest has none, and its lossless cleanup only shrinks the view.
    const limited = yield* project({ ...input, limits: { maxLines: 1, maxBytes: 1 } })
    if (family.itemID === "vitest") expect(limited.output).toBe(selected.output)
    else expect(limited).toBe(output)
  }
  yield* Effect.promise(() => Bun.write(path.join(directory, "failure_test.go"),
    'package example\nimport "testing"\nfunc TestFailure(t *testing.T) { t.Fatal("NATIVE FAILURE MUST KEEP 😀") }\n'))
  const owner = { sessionID: session.id, callID: "native-failure" }
  const output = yield* shell.execute({ command: "go test -v .", workdir: directory, timeout: 120000 }, {
    ...owner, messageID: MessageID.ascending(), agent: "maestro", messages: [], abort: AbortSignal.any([]),
    metadata: () => Effect.void, ask: () => Effect.void,
  })
  expect(output.metadata.exit).toBe(1)
  expect(output.output).toContain("NATIVE FAILURE MUST KEEP 😀")
  // Failures are attested too (Lean 2.0 keeps failure lines whole); this small one stays below the summary threshold.
  const binding = LegacyLeanCapture.bind(output, output, owner)
  expect(binding).toBeDefined()
  const selected = yield* Effect.promise(() => LegacyLeanOutput.project({ output, binding, owner, command: "go test -v .", enabled: true,
    limits: { maxLines: 10000, maxBytes: 1000000 }, telemetry: {
      owner: { projectID: instance.project.id, location: directory, ...owner }, model: { provider: "public-fixture", id: "no-model-call" },
    } }))
  expect(selected.output).toBe(output.output)
  expect(LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))).toMatchObject({ itemID: "go", producer: "native-shell",
    eligible: true, status: "passthrough", reason: "below_threshold", bytes: { saved: 0 } })
}), 240000)
