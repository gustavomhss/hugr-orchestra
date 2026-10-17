import { expect, test } from "bun:test"
import { realpathSync } from "node:fs"
import path from "node:path"
import { Cause, Effect, Schema } from "effect"
import { AppProcess } from "../src/process"
import { LayerNode } from "../src/effect/layer-node"
import { testEffect } from "./lib/effect"
import { expectSpawn } from "./fixture/omni-expect"
import { boundaries, boundaryFixture, check, command, requireExit } from "./fixture/distribution-bundle"
import { nativeJobTest, requireNativeJobReceipts } from "./distribution-bundle-gates"

const it = testEffect(LayerNode.compile(AppProcess.node))
const cargoOutput = `ORCHESTRATION-ONLY: synthetic cargo; never native qualification
running 1 test
test ${nativeJobTest} ... native Job lifetime control: stop passed
native Job lifetime control: natural passed
native Job lifetime control: descendant passed
native Job lifetime control: unknown passed
native Job mutation control: original owned handle stayed valid; OS oracle rejected it
ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 3 filtered out; finished in 0.10s
`
const Trace = Schema.Array(Schema.Struct({ cmd: Schema.String, argv: Schema.Array(Schema.String), cwd: Schema.String,
  githubActions: Schema.optional(Schema.String), control: Schema.optional(Schema.String) }))
type Box = Effect.Success<ReturnType<typeof boundaryFixture>>

function expected(box: Box, name: string) {
  const directory = box.env.DISTRIBUTION_DENO_DIRECTORY
  const executable = box.env.ORCHESTRA_DISTRIBUTION_DENO
  if (name === "Install native Deno") return [["bun", "script/distribution-deno.ts", "--admit"], ["bun", "script/distribution-deno.ts"]]
  if (name === "Extract native Deno") return [["unzip", "-q", `${directory}/deno.zip`, "-d", directory],
    ...(process.platform === "win32" ? [] : [["chmod", "+x", executable]]), ["deno", "--version"],
    ["bun", "script/distribution-deno.ts", "--verify-version", "distribution-logs/deno-version.log"]]
  if (name === "Prove native Windows Job handle closure") return [["cargo", "test", "--release", "-p", "omni-supervisor", "windows::tests", "--", "--nocapture", "--test-threads=1"],
    ["bun", "../core/test/distribution-bundle-gates.ts", "../../distribution-logs/windows-native-job.log"]]
  if (name === "Prove Schema ELF ABI") return [["bun", "test", "--timeout", "120000", "./test/elf.test.ts"]]
  if (name === "Prove native POSIX ABI") return [["bun", "test", "--timeout", "120000", "./test/artifact-abi.test.ts", "-t", "POSIX"]]
  if (name === "Prove packaged parser ABI") return [["bun", "test", "--timeout", "120000", "./test/parser-bindings.test.ts", "./test/onboard.test.ts"]]
  if (name === "Prove localized proof oracles") return [["bun", "test", "--timeout", "30000",
    "./test/fixture/distribution-aur/sandbox-evidence.test.ts",
    "./test/fixture/distribution-aur/bootstrap-config.test.ts",
    ...["compiler-edge", "tool-result", "capture-bytes", "provenance"].map((file) => `./test/fixture/distribution-provider/${file}.test.ts`)]]
  return [["bun", "test", "--timeout", "120000", name === "Prove source ABI producers" ? "./src/tree-sitter-prebuilds.test.ts" : "./src/main/cli-artifacts.test.ts"]]
}

const observe = (box: Box, step: typeof boundaries[number], text = step.run, failed?: string) => Effect.gen(function* () {
  const result = yield* command(box, text, true, { ...box.env, BUNDLE_CARGO_OUTPUT: cargoOutput, BUNDLE_FAIL: failed }, path.join(box.dir, step.cwd))
  requireExit(result, failed ? 17 : 0, `BUNDLE_BOUNDARY_EXIT: ${step.name}`)
  const trace = Schema.decodeUnknownSync(Trace)((yield* Effect.promise(() => Bun.file(box.trace).text())).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)))
  const wanted = expected(box, step.name)
  const failIndex = wanted.findIndex(([cmd, , arg]) => (cmd === "bun" && step.name === "Install native Deno" ? arg ?? "download" : cmd) === failed)
  check(JSON.stringify(trace.map((entry) => [entry.cmd, ...entry.argv])) === JSON.stringify(failed ? wanted.slice(0, failIndex + 1) : wanted), `BUNDLE_BOUNDARY_ARGV_ORDER: ${step.name}`)
  check(trace.every((entry) => entry.cwd === realpathSync(path.join(box.dir, step.cwd))), `BUNDLE_BOUNDARY_CWD: ${step.name}`)
  if (step.name.includes("ABI") || step.name === "Prove localized proof oracles") check(trace.every((entry) => entry.githubActions === "false" && entry.control === "declared"), `BUNDLE_BOUNDARY_ENV: ${step.name}`)
  const log = step.name === "Install native Deno" ? "deno-download" : step.name === "Extract native Deno" ? failed === "unzip" || failed === "chmod" ? "deno-extract" : "deno-version"
    : step.name === "Prove localized proof oracles" ? "localized-oracles" : step.name === "Prove native POSIX ABI" ? "native-posix-abi" : step.name.includes("Windows") ? "windows-native-job" : step.name.includes("Desktop") ? "desktop-abi" : step.name.includes("Schema") ? "schema-elf-abi" : step.name.includes("parser") ? "parser-abi" : "source-abi"
  if (failed === "--admit") {
    check(!(yield* Effect.promise(() => Bun.file(path.join(box.dir, "distribution-logs/deno-download.log")).exists())), "BUNDLE_DENO_DOWNLOAD_BEFORE_ADMISSION")
    return
  }
  const retained = yield* Effect.promise(() => Bun.file(path.join(box.dir, "distribution-logs", `${log}.log`)).text())
  check(retained.includes(failed ? `ORCHESTRATION-ONLY failed ${failed}` : step.name === "Extract native Deno" ? "deno 2.9.7" : "ORCHESTRATION-ONLY"), `BUNDLE_BOUNDARY_LOG: ${step.name}`)
  if (failed || step.name.includes("ABI") || step.name !== "Extract native Deno") check(retained.includes("boundary stderr"), `BUNDLE_BOUNDARY_STDERR: ${step.name}`)
  if (step.name === "Extract native Deno" && !failed) {
    const extracted = yield* Effect.promise(() => Bun.file(path.join(box.dir, "distribution-logs/deno-extract.log")).text())
    check(extracted.includes("ORCHESTRATION-ONLY stdout unzip") && extracted.includes("boundary stderr unzip"), "BUNDLE_DENO_EXTRACTION_LOG")
  }
})

boundaries.forEach((step) => {
  const failure = step.name === "Install native Deno" ? "download" : step.name === "Extract native Deno" ? "unzip" : step.name.includes("Windows") ? "cargo" : "bun"
  for (const failed of [undefined, failure]) it.live(`ORCHESTRATION-ONLY emitted ${step.name}: argv/cwd/order/log/exit ${failed ?? "success"}`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    yield* observe(yield* boundaryFixture(), step, step.run, failed)
  }))
  for (const defect of ["comment-only", "omitted command", "swallowed failure"]) it.live(`ORCHESTRATION-ONLY ${step.name} rejects ${defect} by name`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const box = yield* boundaryFixture()
    const text = defect === "comment-only" ? step.run.split("\n").map((line) => `# ${line}`).join("\n")
      : defect === "omitted command" ? step.run.split("\n").filter((line) => !line.includes(step.name === "Extract native Deno" ? "unzip -q" : step.name.includes("Windows") ? "cargo test" : "bun ")).join("\n")
      : step.run + "\nexit 0"
    // The defect runs in Bash; observer's named assertion must fail, not a source substring check.
    const mutated = defect === "swallowed failure" ? text.replace("set -euo pipefail", "set +e\nset +o pipefail") : text
    const exit = yield* Effect.exit(observe(box, step, mutated, defect === "swallowed failure" ? failure : undefined))
    const diagnostic = defect === "swallowed failure" || (defect === "omitted command" && step.name.includes("Windows"))
      ? "BUNDLE_BOUNDARY_EXIT" : "BUNDLE_BOUNDARY_ARGV_ORDER"
    check(exit._tag === "Failure" && Cause.pretty(exit.cause).includes(`${diagnostic}: ${step.name}`), `BUNDLE_COUNTERCONTROL_BLIND: ${step.name}/${defect}`)
  }))
})

it.live("ORCHESTRATION-ONLY Deno admission failure stops before download", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  yield* observe(yield* boundaryFixture(), boundaries[0], boundaries[0].run, "--admit")
}))

it.live("ORCHESTRATION-ONLY Deno executable failure retains log and stops verifier", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  yield* observe(yield* boundaryFixture(), boundaries[1], boundaries[1].run, "deno")
}))

it.live("ORCHESTRATION-ONLY emitted extraction rejects wrong runtime version through real parser", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* boundaryFixture()
  const step = boundaries[1]
  const result = yield* command(box, step.run, true, { ...box.env, BUNDLE_VERSION: "deno 2.9.6" })
  check(result.exitCode !== 0 && result.stderr.toString().includes("DENO_RUNTIME_VERSION_MISMATCH"), "BUNDLE_DENO_VERSION_BLIND")
  expect(yield* Effect.promise(() => Bun.file(path.join(box.dir, "distribution-logs/deno-version.log")).text())).toBe("deno 2.9.6\n")
}))

it.live("ORCHESTRATION-ONLY cargo zero tests cannot qualify native Job", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const box = yield* boundaryFixture()
  const step = boundaries[2]
  const result = yield* command(box, step.run, true, { ...box.env,
    BUNDLE_CARGO_OUTPUT: "running 0 tests\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s" }, path.join(box.dir, step.cwd))
  check(result.exitCode !== 0 && result.stderr.toString().includes("BUNDLE_NATIVE_JOB_TEST_MISSING"), "BUNDLE_ZERO_RUST_TESTS_BLIND")
  expect(yield* Effect.promise(() => Bun.file(path.join(box.dir, "distribution-logs/windows-native-job.log")).text())).toContain("running 0 tests")
}))

test("cargo receipt parser positive and named mutations", () => {
  requireNativeJobReceipts(cargoOutput)
  const controls = [
    ["BUNDLE_NATIVE_JOB_TEST_MISSING", cargoOutput.replace(`test ${nativeJobTest}`, "test unrelated")],
    ...["stop", "natural", "descendant", "unknown"].map((name) => ["BUNDLE_NATIVE_JOB_RECEIPT_MISSING", cargoOutput.replace(`native Job lifetime control: ${name} passed`, "")]),
    ["BUNDLE_NATIVE_JOB_RECEIPT_MISSING", cargoOutput.replace("native Job mutation control:", "comment:")],
    ["BUNDLE_NATIVE_JOB_RESULT_INVALID", cargoOutput.replace("0 failed", "1 failed")],
    ["BUNDLE_NATIVE_JOB_RESULT_INVALID", cargoOutput.replace("1 passed", "0 passed")],
    ["BUNDLE_NATIVE_JOB_RESULT_INVALID", `test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 3 filtered out; finished in 0.10s\n${cargoOutput.replace("1 passed", "0 passed")}`],
    ["BUNDLE_NATIVE_JOB_RECEIPT_MISSING", cargoOutput.replace("native Job lifetime control: stop passed", "# native Job lifetime control: stop passed")],
    ["BUNDLE_NATIVE_JOB_RECEIPT_MISSING", cargoOutput.replace("native Job lifetime control: unknown passed", "native Job lifetime control: unknown passed\nnative Job lifetime control: unknown passed")],
    ["BUNDLE_NATIVE_JOB_RECEIPT_ORDER", cargoOutput.replace("native Job lifetime control: stop passed", "TEMP").replace("native Job lifetime control: natural passed", "native Job lifetime control: stop passed").replace("TEMP", "native Job lifetime control: natural passed")],
    ["BUNDLE_NATIVE_JOB_TEST_MISSING", ""],
  ]
  controls.forEach(([name, output]) => expect(() => requireNativeJobReceipts(output), name).toThrow(name))
})
