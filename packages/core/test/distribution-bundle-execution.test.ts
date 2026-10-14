import { expect } from "bun:test"
import { mkdir } from "node:fs/promises"
import { rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Schema } from "effect"
import { AppProcess } from "../src/process"
import { LayerNode } from "../src/effect/layer-node"
import { testEffect } from "./lib/effect"
import { expectSpawn } from "./fixture/omni-expect"
import { admission, Capture, check, command, control, fixture, requireExit, run } from "./fixture/distribution-bundle"
import type { Fixture } from "./fixture/distribution-bundle"

// ORCHESTRATION-ONLY: fake Bun at the shell command boundary, never native omni qualification.
// The host AppProcess/omni spawn is real; the existing preload judges that separately.
const it = testEffect(LayerNode.compile(AppProcess.node))
const nonce = "0123456789abcdef0123456789abcdef"
const log = (verdict: string) => `omni positive control [${nonce}]: ${verdict}\nomni control nonce: ${nonce}\n`
const declaration = 'printf \'omni control nonce: %s\\n\' "$nonce" >> ../../distribution-logs/run.log'

for (const pkg of ["core", "cli"] as const) {
  for (const exitCode of [0, 17]) {
    it.live(`ORCHESTRATION-ONLY ${pkg}: actual producer, shell argv, child exit ${exitCode}, log and control`, () => Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const box = yield* fixture(pkg)
      yield* admit(box)
      yield* observe(box, run, exitCode)
    }))
  }
  it.live(`ORCHESTRATION-ONLY ${pkg}: quoted argv survives real producer and Bash without evaluation`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const box = yield* fixture(pkg, ["./test/space 'quote' $(touch BUNDLE_INJECTED).test.ts", "./test/second file.test.ts"])
    yield* admit(box)
    yield* observe(box, run, 0)
    expect(yield* Effect.promise(() => Bun.file(path.join(box.cwd, "BUNDLE_INJECTED")).exists())).toBe(false)
  }))
}

// Core Linux qualification observes dedicated native-host rows' emitted shell without running native builds/models.
if (process.platform === "linux") {
  for (const lane of ["aur", "musl", "provider"] as const) it.live(`ORCHESTRATION-ONLY ${lane}: dedicated row argv, timeout, log and control`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const box = yield* fixture("cli", undefined, lane)
    expect(box.row.files).toEqual([`./test/distribution-${lane}.test.ts`])
    yield* admit(box)
    yield* observe(box, run, 0)
  }))
}

const admissionCases = [
  { name: "missing lane", diagnostic: "BUNDLE_LANE_INVALID", row: { lane: undefined } },
  { name: "unknown lane", diagnostic: "BUNDLE_LANE_INVALID", row: { lane: "heavy" } },
  { name: "CPU", diagnostic: "BUNDLE_NATIVE_HOST_MISMATCH", row: { cpu: process.arch === "x64" ? "ARM64" : "X64" },
    env: { RUNNER_ARCH: process.arch === "x64" ? "ARM64" : "X64" } },
  { name: "platform", diagnostic: "BUNDLE_NATIVE_HOST_MISMATCH", row: { platform: process.platform === "win32" ? "linux" : "win32" },
    env: { RUNNER_OS: process.platform === "win32" ? "Linux" : "Windows" } },
  { name: "unsupported platform", diagnostic: "BUNDLE_NATIVE_HOST_MISMATCH", row: { platform: "unsupported" } },
  { name: "runner CPU", diagnostic: "BUNDLE_NATIVE_HOST_MISMATCH", row: {}, env: { RUNNER_ARCH: "unsupported" } },
  { name: "runner OS", diagnostic: "BUNDLE_NATIVE_HOST_MISMATCH", row: {}, env: { RUNNER_OS: "unsupported" } },
  { name: "empty files", diagnostic: "BUNDLE_FILES_EMPTY", row: { files: [] } },
  { name: "missing files", diagnostic: "args must be a string array", row: { files: undefined } },
  { name: "repeated files", diagnostic: "BUNDLE_FILES_REPEATED", row: { files: ["./test/input.test.ts", "./test/input.test.ts"] } },
  { name: "missing file", diagnostic: "BUNDLE_FILE_INVALID_OR_MISSING", row: { files: ["./test/missing.test.ts"] } },
  { name: "parent traversal", diagnostic: "BUNDLE_FILE_INVALID_OR_MISSING", row: { files: ["./test/../../package.json.test.ts"] } },
]
admissionCases.forEach((invalid) => it.live(`actual admission rejects ${invalid.name} before metadata publication`, () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core", ["./test/input.test.ts"])
  const result = yield* command(box, admission, false, { ...box.env, ...invalid.env, ROW: JSON.stringify({ ...box.row, ...invalid.row }) })
  check(result.exitCode !== 0 && result.stderr.toString().includes(invalid.diagnostic), `BUNDLE_ADMISSION_BLIND: ${invalid.name}`)
  expect(yield* Effect.promise(() => Bun.file(path.join(box.dir, ".distribution-files")).exists())).toBe(false)
})))

for (const exitCode of [0, 17]) {
  it.live(`actual tee failure preserves child exit ${exitCode} after destination repair for nonce append`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const box = yield* fixture("core")
    yield* admit(box)
    yield* Effect.promise(() => mkdir(box.log))
    const chunks: Buffer[] = []
    const result = yield* command(box, run, true, { ...box.env, BUNDLE_WAIT_LOG: "1", BUNDLE_CHILD_EXIT: String(exitCode) }, box.cwd, (chunk) => {
      chunks.push(Buffer.from(chunk))
      if (!Buffer.concat(chunks).toString().includes("tee:")) return
      // Real tee reports its directory-open error before the fake child can finish.
      if (!statSync(box.log, { throwIfNoEntry: false })?.isDirectory()) return
      rmSync(box.log, { recursive: true, force: true })
      writeFileSync(box.log, "")
    })
    requireExit(result, exitCode || 1, "BUNDLE_TEE_FAILURE_LOST")
    check(result.stderr.toString().includes("tee:") && result.stderr.toString().includes("run.log"), "BUNDLE_TEE_FAILURE_UNOBSERVED")
    check(yield* Effect.promise(() => Bun.file(box.capture).exists()), "BUNDLE_TEE_CHILD_NOT_COMPLETED")
    expect(yield* Effect.promise(() => Bun.file(box.log).text())).toMatch(/^omni control nonce: [0-9a-f]{32}\n$/)
  }))
}

const controls = [
  { name: "empty log", text: "", diagnostic: "expected one omni control nonce" },
  { name: "no control", text: `omni control nonce: ${nonce}\n`, diagnostic: "expected one omni positive control verdict" },
  { name: "no nonce", text: `omni positive control [${nonce}]: pass (suite)\n`, diagnostic: "expected one omni control nonce" },
  { name: "off", text: log("off (legacy rollback)"), diagnostic: "BUNDLE_CONTROL_FAILED" },
  { name: "not applicable", text: log("not applicable (focused)"), diagnostic: "BUNDLE_CONTROL_FAILED" },
  { name: "FAIL", text: log("FAIL (suite)"), diagnostic: "BUNDLE_CONTROL_FAILED" },
  { name: "repeated nonce", text: log("pass (suite)") + `omni control nonce: ${nonce}\n`, diagnostic: "expected one omni control nonce" },
  { name: "repeated verdict", text: log("pass (suite)") + `omni positive control [${nonce}]: pass (suite)\n`, diagnostic: "expected one omni positive control verdict" },
  { name: "wrong nonce", text: log("pass (suite)").replace(`[${nonce}]`, "[wrong]"), diagnostic: "expected one omni positive control verdict" },
]
controls.forEach((invalid) => it.live(`actual delimited control reads real run.log and rejects ${invalid.name}`, () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  yield* Effect.promise(() => Bun.write(box.log, invalid.text))
  const result = yield* command(box, control)
  check(result.exitCode !== 0 && result.stderr.toString().includes(invalid.diagnostic), `BUNDLE_CONTROL_BLIND: ${invalid.name}`)
})))

it.live("actual control rejects missing run.log", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  const result = yield* command(box, control)
  check(result.exitCode !== 0 && result.stderr.toString().includes("ENOENT"), "BUNDLE_CONTROL_MISSING_LOG_BLIND")
}))

it.live("mutation: status reset after failed pipeline is observed as lost child exit", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  yield* admit(box)
  const result = yield* command(box, run.replace(declaration, `status=0\n${declaration}`), true,
    { ...box.env, BUNDLE_CHILD_EXIT: "17" }, box.cwd)
  expect(() => requireExit(result, 17, "BUNDLE_CHILD_EXIT_LOST")).toThrow("BUNDLE_CHILD_EXIT_LOST")
  expect(result.exitCode).toBe(0)
  // A positive control cannot rescue a failed child's reset status.
  requireExit(yield* command(box, control), 0, "BUNDLE_CONTROL_POSITIVE")
}))

it.live("mutation: wrong metadata destination prevents actual shell from reaching Bun", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  requireExit(yield* command(box, admission.replace("'.distribution-files'", "'.distribution-files-wrong'")), 0, "BUNDLE_ADMISSION_POSITIVE")
  expect(yield* Effect.promise(() => Bun.file(path.join(box.dir, ".distribution-files-wrong")).text())).toBe(box.row.files.join("\n") + "\n")
  const result = yield* command(box, run, true, box.env, box.cwd)
  expect(() => requireExit(result, 0, "BUNDLE_METADATA_NOT_CONSUMED")).toThrow("BUNDLE_METADATA_NOT_CONSUMED")
  check(result.stderr.toString().includes(".distribution-files"), "BUNDLE_METADATA_FAILURE_UNOBSERVED")
  expect(yield* Effect.promise(() => Bun.file(box.capture).exists())).toBe(false)
}))

it.live("mutation: wrong tee destination leaves nonce-only run.log and actual control rejects it", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  yield* admit(box)
  requireExit(yield* command(box, run.replace("tee ../../distribution-logs/run.log", "tee ../../distribution-logs/wrong.log"), true, box.env, box.cwd), 0, "BUNDLE_RUN_POSITIVE")
  check((yield* Effect.promise(() => Bun.file(path.join(box.dir, "distribution-logs/wrong.log")).text())).includes("child stdout"), "BUNDLE_LOG_MUTATION_UNREACHED")
  const result = yield* command(box, control)
  expect(() => requireExit(result, 0, "BUNDLE_LOG_DESTINATION_BLIND")).toThrow("BUNDLE_LOG_DESTINATION_BLIND")
  check(result.stderr.toString().includes("expected one omni positive control verdict"), "BUNDLE_LOG_FAILURE_UNOBSERVED")
}))

it.live("mutation: control reading wrong log is observed despite valid actual run.log", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  yield* admit(box)
  yield* observe(box, run, 0)
  yield* Effect.promise(() => Bun.write(path.join(box.dir, "distribution-logs/wrong.log"), log("off (legacy rollback)")))
  const result = yield* command(box, control.replace("readFileSync('distribution-logs/run.log'", "readFileSync('distribution-logs/wrong.log'"))
  expect(() => requireExit(result, 0, "BUNDLE_CONTROL_LOG_DESTINATION_BLIND")).toThrow("BUNDLE_CONTROL_LOG_DESTINATION_BLIND")
  check(result.stderr.toString().includes("BUNDLE_CONTROL_FAILED"), "BUNDLE_CONTROL_LOG_FAILURE_UNOBSERVED")
}))

it.live("mutation: early nonce with append-mode tee is visible to actual child", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  yield* admit(box)
  // Append mode keeps the early declaration observable; truncating tee would erase this planted defect.
  requireExit(yield* command(box, run.replace("status=0", `${declaration}\nstatus=0`).replace("tee ../../", "tee -a ../../"), true, box.env, box.cwd), 0, "BUNDLE_RUN_POSITIVE")
  const captured = yield* capture(box)
  expect(() => requirePrivateNonce(captured)).toThrow("BUNDLE_NONCE_BEFORE_CHILD_EXIT")
}))

it.live("mutation: empty delimited control no longer rejects off verdict", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  yield* Effect.promise(() => Bun.write(box.log, log("off (legacy rollback)")))
  const parts = control.split("// bundle-program:begin\n")
  check(parts[0] && parts[1], "BUNDLE_CONTROL_MUTATION_DELIMITERS")
  const tail = parts[1].split("// bundle-program:end")[1]
  check(tail, "BUNDLE_CONTROL_MUTATION_DELIMITERS")
  const result = yield* command(box, `${parts[0]}// bundle-program:begin\n// bundle-program:end${tail}`)
  expect(() => requireExit(result, 1, "BUNDLE_CONTROL_BLIND")).toThrow("BUNDLE_CONTROL_BLIND")
  expect(result.exitCode).toBe(0)
}))

it.live("mutation: CPU comparison removal admits mismatched real process architecture", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* fixture("core")
  const cpu = process.arch === "x64" ? "ARM64" : "X64"
  const result = yield* command(box, admission.replace("process.arch !== arch", "false"), false,
    { ...box.env, ROW: JSON.stringify({ ...box.row, cpu }), RUNNER_ARCH: cpu })
  expect(() => requireExit(result, 1, "BUNDLE_CPU_BLIND")).toThrow("BUNDLE_CPU_BLIND")
  expect(result.exitCode).toBe(0)
  expect(yield* Effect.promise(() => Bun.file(path.join(box.dir, ".distribution-files")).text())).toBe(box.row.files.join("\n") + "\n")
}))

const admit = (box: Fixture) => Effect.gen(function* () {
  requireExit(yield* command(box, admission), 0, "BUNDLE_ADMISSION_POSITIVE")
  expect(yield* Effect.promise(() => Bun.file(path.join(box.dir, ".distribution-files")).text())).toBe(box.row.files.join("\n") + "\n")
})

const capture = (box: Fixture) => Effect.promise(async () => {
  check(await Bun.file(box.capture).exists(), "BUNDLE_CHILD_CAPTURE_MISSING")
  return Schema.decodeUnknownSync(Capture)(await Bun.file(box.capture).json())
})

function requirePrivateNonce(captured: typeof Capture.Type) {
  check(!String(captured.before).includes("omni control nonce:") && !String(captured.after).includes("omni control nonce:"),
    "BUNDLE_NONCE_BEFORE_CHILD_EXIT")
}

const observe = (box: Fixture, text: string, code: number) => Effect.gen(function* () {
  requireExit(yield* command(box, text, true, { ...box.env, BUNDLE_CHILD_EXIT: String(code) }, box.cwd), code, "BUNDLE_CHILD_EXIT_LOST")
  const captured = yield* capture(box)
  expect(captured.argv).toEqual(["test", ...(box.row.package === "cli" ? ["--preload", "../../script/test-omni-control.ts"] : []), "--timeout", box.row.package === "cli" && box.row.platform === "linux" && box.row.files.some((file) => ["./test/distribution-provider.test.ts", "./test/distribution-musl.test.ts"].includes(file)) ? "4800000" : "30000", ...box.row.files])
  expect(captured.githubActions).toBe("false")
  expect(captured.nonce).toMatch(/^[0-9a-f]{32}$/)
  requirePrivateNonce(captured)
  const output = yield* Effect.promise(() => Bun.file(box.log).text())
  check(output.includes("ORCHESTRATION-ONLY:") && output.includes("child stdout\n") && output.includes("child stderr\n"), "BUNDLE_TEE_LOG_CONTENT")
  const lines = output.trimEnd().split("\n")
  expect(lines.filter((line) => line.startsWith("omni control nonce:"))).toEqual([`omni control nonce: ${captured.nonce}`])
  expect(lines.at(-1)).toBe(`omni control nonce: ${captured.nonce}`)
  const verdict = lines.indexOf(`omni positive control [${captured.nonce}]: pass (suite)`)
  check(verdict >= 0 && verdict < lines.length - 1, "BUNDLE_NONCE_LOG_ORDER")
  requireExit(yield* command(box, control), 0, "BUNDLE_CONTROL_POSITIVE")
})
