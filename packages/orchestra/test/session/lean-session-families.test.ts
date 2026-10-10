import { expect, test } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { LeanProcessor } from "@orchestra/core/tool/lean-processor"
import { ToolModelCapture } from "@orchestra/core/tool/model-capture"
import { fixture } from "./lean-session.fixture"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

// Original fixture invocation, admitted by the pinned package's closed Cargo argv grammar.
// Serial lib tests avoid doctest interleaving; other unsupported native variants still stay exact.
const cargo = "cargo test --lib -- --test-threads=1"

function followsDefault(result: Effect.Success<ReturnType<Effect.Success<ReturnType<typeof fixture>>["invoke"]>>, family: string, phase: string) {
  if (!result.capture || !result.raw) throw new Error(`${family} ${phase}: same-call native observation missing`)
  const decision = LeanProcessor.process(result.capture.candidate.observation)
  const status = decision.status === "reduced" ? "applied" : decision.status === "normalized" ? "normalized" : "passthrough"
  if (result.metric.status !== status || result.metric.reason !== decision.reason)
    throw new Error(`${family} ${phase}: selected/default mismatch: ${JSON.stringify({ selected: result.metric, decision })}\n${result.raw.output}`)
  expect(result.metric.status).toBe(status)
  expect(result.metric.reason).toBe(decision.reason)
  expect(result.metric.filterProfile).toBe("profile" in decision ? decision.profile : undefined)
  expect(result.output.output).toBe("replacement" in decision ? decision.replacement : result.raw.output)
  expect(result.metric.bytes).toMatchObject({ before: decision.inputBytes, after: decision.outputBytes })
  if (status === "passthrough") console.info(`${family} ${phase}: default preserved native capture (${decision.reason})`)
}

test("controlled Cargo positive reduces; unknown interleaved Cargo stays byte-exact", () => {
  const output = ["    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.01s",
    "     Running unittests native.rs (target/debug/deps/native_session_fixture-0123456789abcdef)", "",
    "running 2 tests", "test case_0 ... ok", "test case_1 ... ok", "",
    "test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s", ""].join("\n")
  const input: ToolModelCapture.Observation = { source: "shell", command: cargo, output,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" }
  expect(LeanProcessor.identify(cargo)).toBe("cargo")
  const positive = LeanProcessor.process(input)
  expect(positive.status).toBe("reduced")
  if (positive.status !== "reduced") throw new Error(`Controlled Cargo declined: ${JSON.stringify(positive)}`)
  expect(positive.replacement).toContain("test result: ok. 2 passed")
  expect(positive.replacement).not.toContain("test case_")
  const interleaved = { ...input, command: "cargo test", output: output.replace("test case_0 ... ok",
    "test case_0 ...    Doc-tests native_session_fixture\nok") }
  const before = structuredClone(interleaved)
  const declined = LeanProcessor.process(interleaved)
  expect(declined).toMatchObject({ status: "passthrough", reason: "unsupported_output",
    inputBytes: Buffer.byteLength(interleaved.output), outputBytes: Buffer.byteLength(interleaved.output) })
  expect("replacement" in declined).toBe(false)
  expect(interleaved).toEqual(before)
  for (const items of [{ cargo: false }, { cargo: true }]) {
    const result = LeanProcessor.process(interleaved, items)
    expect(Buffer.from("replacement" in result ? result.replacement : interleaved.output)).toEqual(Buffer.from(before.output))
  }
})

async function setup(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe", timeout: 120000 })
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ])
  if (code !== 0) throw new Error(`Public Session fixture setup failed (${code}): ${JSON.stringify(args)}\n${stdout}${stderr}`)
}

it.instance("SessionTools restores Cargo pytest Go and Vitest defaults through captured native FS and Global", () => Effect.gen(function* () {
  const f = yield* fixture(true, undefined, true)
  const directory = f.owner.directory
  const python = process.platform === "win32" ? "python" : "python3"
  const bin = path.join(directory, ".venv", process.platform === "win32" ? "Scripts" : "bin")
  yield* Effect.promise(async () => {
    for (const executable of ["cargo", "go", python, "npm"]) {
      if (!Bun.which(executable)) throw new Error(`Public Session fixture binary unavailable: ${executable}`)
    }
    await Bun.write(path.join(directory, "Cargo.toml"), '[package]\nname="native_session_fixture"\nversion="0.1.0"\nedition="2021"\n[lib]\npath="native.rs"\n')
    await Bun.write(path.join(directory, "native.rs"), Array.from({ length: 30 }, (_, i) => `#[test] fn case_${i}() { assert_eq!(1, 1); }`).join("\n"))
    await Bun.write(path.join(directory, "test_native.py"), Array.from({ length: 30 }, (_, i) => `def test_case_${i}():\n    assert 1 == 1\n`).join("\n"))
    await setup([python, "-m", "venv", ".venv"], directory)
    await setup([path.join(bin, process.platform === "win32" ? "python.exe" : "python"), "-m", "pip", "install", "pytest==9.0.3", "pluggy==1.6.0"], directory)
    await Bun.write(path.join(directory, "package.json"), JSON.stringify({ private: true, type: "module", devDependencies: { vitest: "3.2.4" } }))
    await setup([process.platform === "win32" ? "npm.cmd" : "npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], directory)
    await Bun.write(path.join(directory, "vitest.config.mjs"), 'export default { test: { pool: "forks", minWorkers: 1, maxWorkers: 1 } }\n')
    await Bun.write(path.join(directory, "native.test.js"), `import { test, expect } from "vitest";\n${Array.from({ length: 20 }, (_, i) =>
      `test("native ${i}", () => expect(1).toBe(1));`).join("\n")}\n`)
  })
  yield* Effect.acquireRelease(Effect.sync(() => {
    const previous = { path: process.env.PATH, color: process.env.FORCE_COLOR }
    process.env.PATH = [bin, path.join(directory, "node_modules/.bin"), previous.path].join(path.delimiter)
    process.env.FORCE_COLOR = "0"
    return previous
  }), (previous) => Effect.sync(() => {
    if (previous.path === undefined) delete process.env.PATH
    else process.env.PATH = previous.path
    if (previous.color === undefined) delete process.env.FORCE_COLOR
    else process.env.FORCE_COLOR = previous.color
  }))
  const families = [
    { itemID: "cargo", command: cargo, reduce: false },
    { itemID: "pytest", command: "pytest", reduce: false },
    { itemID: "go", command: "go test -v .", reduce: true },
    { itemID: "vitest", command: "vitest run", reduce: false },
  ] as const
  for (const family of families) {
    const baseline = yield* f.invoke(family.command)
    expect(baseline.metric.itemID).toBe(family.itemID)
    expect(baseline.metric.orchestraProfile).toBe(f.profileID)
    followsDefault(baseline, family.itemID, "baseline")
    if (family.reduce && baseline.metric.status !== "applied")
      throw new Error(`${family.itemID} compatible positive declined: ${JSON.stringify(baseline.metric)}\n${baseline.raw?.output}`)
    if (family.reduce) expect(baseline.metric.status).toBe("applied")
    yield* f.preferences.update(f.owner, { itemID: family.itemID, enabled: false })
    const disabled = yield* f.invoke(family.command)
    expect(disabled.metric).toMatchObject({ itemID: family.itemID, status: "passthrough", reason: "item_disabled", bytes: { saved: 0 } })
    expect(disabled.metric.filterProfile).toBeUndefined()
    if (!disabled.raw) throw new Error(`${family.itemID} OFF: same-call raw output missing`)
    expect(disabled.output.output).toBe(disabled.raw.output)
    yield* f.preferences.update(f.owner, { itemID: family.itemID, enabled: true })
    followsDefault(yield* f.invoke(family.command), family.itemID, "reenabled")
  }
  // No re-resolve: one captured native executor sees every write and each unrelated family stays enabled.
  yield* f.preferences.update(f.owner, { itemID: "cargo", enabled: false })
  yield* f.preferences.update(f.owner, { itemID: "vitest", enabled: false })
  expect((yield* f.invoke(cargo)).metric.reason).toBe("item_disabled")
  expect((yield* f.invoke("vitest run")).metric.reason).toBe("item_disabled")
  for (const command of ["pytest", "go test -v ."]) {
    const result = yield* f.invoke(command)
    followsDefault(result, command, "independent")
    if (command === "go test -v .") expect(result.metric.status).toBe("applied")
  }
}), 300000)
