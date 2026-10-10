import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"
import { assertIntelRunner, runCandidateCommand } from "./scripts/lean-candidate"

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

test("real command deadline kills owned child group including TERM-resistant descendant", async () => {
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
