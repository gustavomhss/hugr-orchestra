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
    await setup([path.join(directory, ".venv/bin/python"), "-m", "pip", "install", "pytest==9.0.3", "pluggy==1.6.0"], directory)
    await Bun.write(path.join(directory, "package.json"), JSON.stringify({ private: true, type: "module", devDependencies: { vitest: "3.2.4" } }))
    await setup(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], directory)
    await Bun.write(path.join(directory, "vitest.config.mjs"), 'export default { test: { pool: "forks", minWorkers: 1, maxWorkers: 1 } }\n')
    await Bun.write(path.join(directory, "native.test.js"), `import { test, expect } from "vitest";\n${Array.from({ length: 20 }, (_, i) =>
      `test("native ${i}", () => expect(1).toBe(1));`).join("\n")}\n`)
  })
  const sessions = yield* Session.Service
  yield* Effect.acquireRelease(Effect.sync(() => {
    const previous = process.env.PATH
    process.env.PATH = [path.join(directory, ".venv/bin"), path.join(directory, "node_modules/.bin"), previous].join(path.delimiter)
    return previous
  }), (previous) => Effect.sync(() => {
    if (previous === undefined) delete process.env.PATH
    else process.env.PATH = previous
  }))
  const session = yield* sessions.create({ permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  const shellInfo = yield* ShellTool
  const shell = yield* shellInfo.init()
  const families = [
    { itemID: "cargo", command: "cargo test", reduce: true },
    { itemID: "pytest", command: "pytest", reduce: true },
    { itemID: "go", command: "go test -v .", reduce: true },
    { itemID: "vitest", command: "vitest run", reduce: false },
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
    const selected = LegacyLeanOutput.project({ ...input, telemetry })
    const metrics = LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))
    if (family.reduce && metrics?.status !== "applied") throw new Error(`Native ${family.itemID} positive baseline declined: ${JSON.stringify(metrics)}\n${output.output}`)
    expect(metrics).toMatchObject({ itemID: family.itemID, engine: LeanEngine.current, eligible: true,
      status: family.reduce ? "applied" : "passthrough" })
    expect(metrics?.bytes.before).toBe(Buffer.byteLength(output.output, "utf8"))
    expect(metrics?.bytes.after).toBe(Buffer.byteLength(selected.output, "utf8"))
    if (family.reduce) expect(selected.output.length).toBeLessThan(output.output.length)
    else expect(selected.output).toBe(output.output)
    expect(LegacyLeanOutput.project({ ...input, items: { [family.itemID]: false } })).toBe(output)
    // Disabling either Cargo or Vitest cannot remove another family's default reducer.
    for (const items of [{ cargo: false }, { vitest: false }]) {
      const current = LegacyLeanOutput.project({ ...input, items })
      expect(current.output).toBe(items[family.itemID as keyof typeof items] === false ? output.output : selected.output)
    }
    const appended = { ...output, output: `${output.output}\n\nPOLICY KEEP 😀` }
    expect(LegacyLeanOutput.project({ ...input, output: appended, items: { [family.itemID]: false } })).toBe(appended)
    const changed = { ...output, output: `PLUGIN KEEP\n${output.output}` }
    expect(LegacyLeanOutput.project({ ...input, output: changed })).toBe(changed)
    expect(LegacyLeanOutput.project({ ...input, limits: { maxLines: 1, maxBytes: 1 } })).toBe(output)
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
  const binding = LegacyLeanCapture.bind(output, output, owner)
  expect(binding).toBeUndefined()
  const selected = LegacyLeanOutput.project({ output, binding, owner, command: "go test -v .", enabled: true,
    limits: { maxLines: 10000, maxBytes: 1000000 }, telemetry: {
      owner: { projectID: instance.project.id, location: directory, ...owner }, model: { provider: "public-fixture", id: "no-model-call" },
    } })
  expect(selected.output).toBe(output.output)
  expect(LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))).toMatchObject({ itemID: "go", producer: "unverified",
    eligible: false, status: "passthrough", bytes: { saved: 0 } })
}), 240000)
