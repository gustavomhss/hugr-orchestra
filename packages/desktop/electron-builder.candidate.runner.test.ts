import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"
import {
  assertBuildResources, assertIntelRunner, candidateEnv, electronViteEnv, omniSource, runCandidateCommand,
} from "./scripts/lean-candidate"

const result = (stdout: string, stderr = "", exitCode: number | null = 0) =>
  ({ stdout, stderr, exitCode, signal: null, timedOut: false })
const intel = { vendor: result("GenuineIntel\n"), machine: result("x86_64\n"), translated: result("0\n") }
const unknown = result("", "sysctl: unknown oid 'sysctl.proc_translated'\n", 1)

test("Intel runner accepts measured zero or exact missing translation OID with positive Intel identity", () => {
  expect(assertIntelRunner(intel, "darwin", "x64")).toEqual(intel)
  const absent = { ...intel, translated: unknown }
  expect(assertIntelRunner(absent, "darwin", "x64")).toEqual(absent)
  expect(absent.translated.exitCode).toBe(1)
  expect(absent.translated.stderr).toBe("sysctl: unknown oid 'sysctl.proc_translated'\n")
})

test("Intel runner rejects ARM, Rosetta, empty, unexpected and failed probes with raw evidence", () => {
  for (const probes of [
    { ...intel, vendor: result("Apple\n"), translated: unknown },
    { ...intel, vendor: result("") },
    { ...intel, vendor: result("GenuineIntel\n", "permission denied\n", 1) },
    { ...intel, machine: result("arm64\n") },
    { ...intel, machine: result("x86_64\n", "unexpected warning\n") },
    { ...intel, translated: result("1\n") },
    { ...intel, translated: result("") },
    { ...intel, translated: result("", "", 1) },
    { ...intel, translated: result("0\n", "", 1) },
    { ...intel, translated: result("", "sysctl: unknown oid 'hw.optional.arm64'\n", 1) },
    { ...intel, translated: result("", unknown.stderr, 2) },
    { ...intel, translated: result("surprise\n", unknown.stderr, 1) },
    { ...intel, translated: result("", `${unknown.stderr}extra error\n`, 1) },
    { ...intel, translated: { ...unknown, timedOut: true } },
    { ...intel, translated: { ...unknown, signal: "SIGKILL" } },
    { ...intel, translated: { ...unknown, error: "spawn ENOENT" } },
  ]) {
    expect(() => assertIntelRunner(probes, "darwin", "x64")).toThrow(JSON.stringify(probes))
  }
  expect(() => assertIntelRunner(intel, "linux", "x64")).toThrow('"platform":"linux"')
  expect(() => assertIntelRunner(intel, "darwin", "arm64")).toThrow('"arch":"arm64"')
})

test("real child capture retains complete stdout/stderr and nonzero failure", async () => {
  const captured = await runCandidateCommand(["node", "-e", `
    process.stdout.write(Buffer.from([0xe2]));
    process.stderr.write("original stderr\\n");
    setTimeout(() => {
      process.stdout.write(Buffer.from([0x82, 0xac]));
      process.stdout.write("\\nlast stdout\\n");
      process.stderr.write("last stderr\\n");
      process.exitCode = 7;
    }, 20);
  `], process.env, import.meta.dirname, 10_000, false)
  expect(captured.exitCode).toBe(7)
  expect(captured.stdout).toBe("€\nlast stdout\n")
  expect(captured.stderr).toBe("original stderr\nlast stderr\n")
  expect(captured.timedOut).toBe(false)
  expect(captured.error).toBeUndefined()
})

// POSIX process groups only: Windows has no group TERM/KILL escalation, and the candidate host is darwin/x64
// (assertCandidateHost), so a Windows result would answer nothing about the code that runs.
test.skipIf(process.platform === "win32")("real command deadline kills owned child group including TERM-resistant descendant", async () => {
  const descendant = 'process.on("SIGTERM", () => {}); process.stderr.write("descendant stderr\\n"); setInterval(() => {}, 1000)'
  const captured = await runCandidateCommand(["node", "-e", `
    const { spawn } = require("node:child_process");
    process.on("SIGTERM", () => {});
    const child = spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "inherit" });
    process.stdout.write("owned:" + process.pid + "," + child.pid + "\\n");
    setInterval(() => {}, 1000);
  `], process.env, import.meta.dirname, 1000, false)
  expect(captured.timedOut).toBe(true)
  expect(captured.signal).toBe("SIGKILL")
  expect(captured.stderr).toBe("descendant stderr\n")
  const match = /^owned:(\d+),(\d+)\n$/.exec(captured.stdout)
  expect(match).not.toBeNull()
  const alive = (pid: number) => {
    try { process.kill(pid, 0); return true }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return false
      throw error
    }
  }
  for (const pid of match!.slice(1).map(Number)) {
    for (let attempt = 0; attempt < 30 && alive(pid); attempt++) await Bun.sleep(100)
    expect(alive(pid)).toBe(false)
  }
}, 10_000)

test("spawn errors retain failure identity; empty commands and invalid deadlines fail", async () => {
  const captured = await runCandidateCommand(["/does-not-exist/lean-candidate-command"], process.env, import.meta.dirname, 1000, false)
  expect(captured.exitCode).not.toBe(0)
  expect(captured.error).toContain("ENOENT")
  expect(() => runCandidateCommand([])).toThrow("Invalid candidate command/deadline")
  expect(() => runCandidateCommand(["node"], process.env, import.meta.dirname, 0)).toThrow("Invalid candidate command/deadline")
})

test("actual Node build define is boolean source text gated only by explicit CLI argument", async () => {
  const file = path.resolve(import.meta.dirname, "../orchestra/script/build-node.ts")
  const source = ts.createSourceFile(file, await Bun.file(file).text(), ts.ScriptTarget.Latest, true)
  const builds: ts.CallExpression[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "Bun.build") builds.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  expect(builds).toHaveLength(1)
  const options = builds[0]!.arguments[0]!
  if (!ts.isObjectLiteralExpression(options)) throw new Error("Node build options are not literal")
  const defines = options.properties.filter(ts.isPropertyAssignment).filter((node) => node.name.getText(source) === "define")
  expect(defines).toHaveLength(1)
  if (!ts.isObjectLiteralExpression(defines[0]!.initializer)) throw new Error("Node build define is not literal")
  const flags = defines[0]!.initializer.properties.filter(ts.isPropertyAssignment)
    .filter((node) => node.name.getText(source) === "ORCHESTRA_CANDIDATE_BUILD")
  expect(flags).toHaveLength(1)
  const evaluate = new Function("process", `return (${flags[0]!.initializer.getText(source)})`)
  expect(evaluate({ argv: ["bun", file], env: { ORCHESTRA_CANDIDATE_BUILD: "true", ORCHESTRA_LEAN_CANDIDATE: "1" } })).toBe("false")
  expect(evaluate({ argv: ["bun", file, "--lean-candidate=false"], env: {} })).toBe("false")
  expect(evaluate({ argv: ["bun", file, "--lean-candidate"], env: {} })).toBe("true")
})

const withCallerNodeOptions = async <T>(run: () => T | Promise<T>) => {
  const previous = process.env.NODE_OPTIONS
  process.env.NODE_OPTIONS = "--require /nonexistent/evil.js"
  try { return await run() }
  finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = previous
  }
}

test("caller NODE_OPTIONS never reaches children; only electron-vite receives the fixed heap budget", async () => {
  await withCallerNodeOptions(() => {
    const shared = candidateEnv("0.0.0-test")
    const vite = electronViteEnv(shared)
    expect("NODE_OPTIONS" in shared).toBe(false)
    expect(vite.NODE_OPTIONS).toBe("--max-old-space-size=8192")
    expect(JSON.stringify([shared, vite])).not.toContain("evil.js")
    expect(vite).toEqual({ ...shared, NODE_OPTIONS: "--max-old-space-size=8192" })
  })
})

test("build resources reject low memory, failed probes and heap below budget with raw evidence", () => {
  const memory = result("15032385536\n"), heap = result(`${8192 * 1024 * 1024}\n`)
  expect(assertBuildResources(memory, heap)).toEqual({ memoryBytes: 15032385536, heapLimitBytes: 8192 * 1024 * 1024, heapBudgetMiB: 8192 })
  for (const [memoryProbe, heapLimit] of [
    [result(`${10 * 1024 ** 3 - 1}\n`), heap],
    [result("15032385536\n", "sysctl: denied\n", 1), heap],
    [{ ...memory, signal: "SIGKILL" }, heap],
    [{ ...memory, timedOut: true }, heap],
    [{ ...memory, error: "spawn ENOENT" }, heap],
    [result(""), heap],
    [result("15032385536.5\n"), heap],
    [result("-15032385536\n"), heap],
    [result("14 GiB\n"), heap],
    [memory, result(`${2028 * 1024 * 1024}\n`)],
    [memory, result(`${8192 * 1024 * 1024 - 1}\n`)],
    [memory, result("", "FATAL ERROR: JavaScript heap out of memory\n", null)],
    [memory, { ...heap, signal: "SIGABRT" }],
    [memory, result("unknown\n")],
  ] as const) {
    expect(() => assertBuildResources(memoryProbe, heapLimit)).toThrow(
      `Candidate build heap budget rejected: ${JSON.stringify({ memory: memoryProbe, heap: heapLimit })}`,
    )
  }
})

test("real node child with the electron-vite env reports heap_size_limit at or above 8192 MiB", async () => {
  const probe = await withCallerNodeOptions(() =>
    runCandidateCommand(["node", "-p", "require('v8').getHeapStatistics().heap_size_limit"], electronViteEnv(candidateEnv("0.0.0-test")), import.meta.dirname, 15_000, false))
  expect(probe.stderr).toBe("")
  expect(assertBuildResources(result("15032385536\n"), probe).heapLimitBytes).toBeGreaterThanOrEqual(8192 * 1024 * 1024)
}, 20_000)

test("omni source requires the action's paired absolute release binaries and never a disabled or foreign build", () => {
  const dir = "/runner/work/repo/native/omni/target/release"
  const exact = { HUGR_OMNI_ADDON: `${dir}/libhugr_omni_node.dylib`, HUGR_OMNI_SUPERVISOR: `${dir}/hugr-omni-supervisor` }
  expect(omniSource(exact)).toEqual({ directory: dir, addon: exact.HUGR_OMNI_ADDON, supervisor: exact.HUGR_OMNI_SUPERVISOR })
  expect(omniSource({ ...exact, OMNI_ARTIFACTS: dir }).directory).toBe(dir)
  for (const env of [
    {}, { HUGR_OMNI_ADDON: exact.HUGR_OMNI_ADDON }, { HUGR_OMNI_SUPERVISOR: exact.HUGR_OMNI_SUPERVISOR },
    { ...exact, HUGR_OMNI_ADDON: "target/release/libhugr_omni_node.dylib" },
    { ...exact, HUGR_OMNI_SUPERVISOR: "/elsewhere/hugr-omni-supervisor" },
    { ...exact, HUGR_OMNI_SUPERVISOR: `${dir}/planted-supervisor` },
    { ...exact, OMNI_ENABLED: "false" }, { ...exact, OMNI_ARTIFACTS: "/tmp/foreign-omni" },
  ]) expect(() => omniSource(env)).toThrow("Candidate omni binaries rejected:")
})

test("the workflow's omni rollback for bun test never reaches candidate build children", () => {
  const previous = process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
  process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = "0"
  try {
    const env = candidateEnv("1.0.0")
    expect(Object.hasOwn(env, "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER")).toBe(false)
    expect(Object.hasOwn(electronViteEnv(env), "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER")).toBe(false)
  } finally {
    if (previous === undefined) delete process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
    else process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = previous
  }
})
