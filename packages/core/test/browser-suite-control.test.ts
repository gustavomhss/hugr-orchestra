import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../src/process"
import { LayerNode } from "../src/effect/layer-node"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"
import { validateBrowserSuite } from "../script/test-browser"

const it = testEffect(LayerNode.compile(AppProcess.node))
const nonce = "0123456789abcdef0123456789abcdef"
const tag = `omni positive control [${nonce}]: `
const na = `${tag}not applicable (focused: no declaring test ran); this run made no omni spawn and delegated none, so it proved nothing about omni.`
const positive = `${tag}pass (declared: 1 test(s) in 02-spawn.test.ts); 1 omni spawn(s), 0 delegated.`
const summary = "Ran 2 tests across 2 files. [50.00ms]"
const valid = { output: `${na}\n${positive}\n${summary}\n`, exitCode: 0, truncated: false, nonce, scope: "suite", mode: "strict" }

test("browser boundary sums only validated child receipts and uses the final Bun summary", () => {
  const result = validateBrowserSuite({ ...valid, output: `Ran 99 tests across 99 files. [1s]\n${valid.output}` })
  expect(result).toEqual({ files: 2, tests: 2, declared: 1, spawns: 1, delegations: 0, verdict: "pass" })
  expect(validateBrowserSuite({ ...valid, output: `${na}\n${na}\n${summary}`, scope: "declared" })).toEqual({
    files: 2, tests: 2, declared: 0, spawns: 0, delegations: 0, verdict: "not applicable",
  })
})

for (const entry of [
  { name: "child failure", patch: { exitCode: 1 } },
  { name: "truncation", patch: { truncated: true } },
  { name: "missing receipt", patch: { output: `${na}\n${summary}` } },
  { name: "extra duplicate receipt", patch: { output: `${na}\n${positive}\n${positive}\n${summary}` } },
  { name: "duplicate named file", patch: { output: `${positive}\n${positive}\n${summary}` } },
  { name: "wrong nonce", patch: { output: valid.output.replace(nonce, "f".repeat(32)) } },
  { name: "missing nonce", patch: { output: valid.output.replace(` [${nonce}]`, "") } },
  { name: "malformed count", patch: { output: valid.output.replace("1 omni", "NaN omni") } },
  { name: "unsafe count", patch: { output: valid.output.replace("1 omni", "9007199254740992 omni") } },
  { name: "negative count", patch: { output: valid.output.replace("0 delegated", "-1 delegated") } },
  { name: "unknown verdict", patch: { output: valid.output.replace(": pass", ": off") } },
  { name: "missing summary", patch: { output: `${na}\n${positive}` } },
  { name: "malformed last summary", patch: { output: `${valid.output}Ran NaN tests across 2 files.` } },
  { name: "zero file summary", patch: { output: valid.output.replace("across 2", "across 0") } },
  { name: "all N/A suite", patch: { output: `${na}\n${na}\n${summary}` } },
  { name: "strict delegation", patch: { output: valid.output.replace("0 delegated", "1 delegated") } },
  { name: "invalid scope", patch: { scope: "focused" } },
  { name: "legacy off", patch: { mode: "off" } },
  { name: "invalid mode", patch: { mode: "strick" } },
]) test(`browser boundary refuses ${entry.name}`, () => {
  expect(() => validateBrowserSuite({ ...valid, ...entry.patch })).toThrow()
})

for (const kind of ["spawn", "plain", "silent", "delegation", "failure"] as const) {
  it.live(`actual browser suite wrapper: ${kind}`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const run = yield* browserRun(kind)
    expect(run.result.stdoutTruncated || run.result.stderrTruncated).toBe(false)
    expect(run.output).toContain("BROWSER_FIRST")
    expect(run.output).toContain("BROWSER_SECOND")
    expect(run.output.match(new RegExp(`omni positive control \\[${run.external}\\]:`, "g"))).toHaveLength(1)
    if (kind === "spawn") {
      expect(run.result.exitCode, run.output).toBe(0)
      expect(run.output).toContain(`omni positive control [${run.external}]: pass (suite: 2 isolated files); 1 omni spawn(s), 0 delegated.`)
      expect(run.output).toContain("BROWSER_ACTUAL_CHILD")
      if (typeof run.junit !== "string") throw new Error("Actual browser JUnit artifact unavailable")
      expect(run.junit.trim().length).toBeGreaterThan(0)
      expect(run.junit).toContain("<testsuite")
      return
    }
    expect(run.result.exitCode).not.toBe(0)
    expect(run.output).toContain(`omni positive control [${run.external}]: FAIL`)
    if (kind === "plain") expect(run.output).toContain("this run made no omni spawn")
    if (kind === "silent") expect(run.output).toContain("02-second.test.ts: 1 of 1 declaring test(s) made no omni spawn of their own")
    if (kind === "delegation") expect(run.output).toContain("this run delegated 1 spawn(s) to legacy")
    if (kind === "failure") expect(run.output).toContain("BROWSER_CHILD_TEST_FAILURE")
  }).pipe(Effect.timeout(25000)), 30000)
}

function browserRun(kind: "spawn" | "plain" | "silent" | "delegation" | "failure") {
  return Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    return yield* Effect.acquireUseRelease(
      Effect.tryPromise({ try: () => mkdtemp(path.join(tmpdir(), "browser-suite-control-")), catch: (cause) => cause }),
      (root) => Effect.gen(function* () {
        const external = randomBytes(16).toString("hex")
        const env: Record<string, string> = {
          BUN_BE_BUN: "1", ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict", ORCHESTRA_OMNI_CONTROL: "suite",
          ORCHESTRA_OMNI_CONTROL_NONCE: external, ORCHESTRA_OMNI_CONTROL_RUN: "must-not-reach-child",
          HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: path.join(root, "config"),
          XDG_DATA_HOME: path.join(root, "data"), XDG_STATE_HOME: path.join(root, "state"), XDG_CACHE_HOME: path.join(root, "cache"),
        }
        for (const [name, value] of Object.entries(process.env)) {
          if (value !== undefined && (["HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR"].includes(name) ||
            (process.platform === "win32" && ["SYSTEMROOT", "WINDIR"].includes(name.toUpperCase())))) env[name] = value
        }
        const config = path.join(root, "bunfig.toml")
        const local = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)))
        const resolved = (specifier: string) => JSON.stringify(fileURLToPath(import.meta.resolve(specifier)))
        const imports = `import { expect, test } from "bun:test";
import { Effect, Layer } from ${resolved("effect")};
import { ChildProcess } from ${resolved("effect/unstable/process")};
import { ChildProcessSpawner } from ${resolved("effect/unstable/process/ChildProcessSpawner")};
import { AppProcess } from ${local("../src/process.ts")};
import { CrossSpawnSpawner } from ${local("../src/cross-spawn-spawner.ts")};
import { LayerNode } from ${local("../src/effect/layer-node.ts")};
import { expectSpawn } from ${local("./fixture/omni-expect.ts")};
`
        const spawn = `await Effect.runPromise(Effect.gen(function* () {
  const processes = yield* AppProcess.Service;
  const child = yield* processes.run(ChildProcess.make(process.execPath, ["--no-env-file", ${JSON.stringify(`--config=${config}`)}, "-e", "process.stdout.write('BROWSER_ACTUAL_CHILD')"], { stdout: "pipe", stderr: "pipe" }));
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString()).toBe("BROWSER_ACTUAL_CHILD");
  console.log(child.stdout.toString());
  ${kind === "delegation" ? `// Intentional negative: actual on-provider delegates stdout inheritance; strict control must reject it.
  const delegated = yield* processes.run(ChildProcess.make(process.execPath, ["--no-env-file", ${JSON.stringify(`--config=${config}`)}, "-e", "process.stdout.write('BROWSER_ACTUAL_DELEGATION')"], { stdout: "inherit", stderr: "pipe" }));
  expect(delegated.exitCode).toBe(0);` : ""}
}).pipe(Effect.scoped, Effect.provide(LayerNode.compile(AppProcess.node${kind === "delegation" ? `, undefined, {
  transformLayer: (layer, node) => node.service === ChildProcessSpawner
    ? Layer.effect(ChildProcessSpawner, CrossSpawnSpawner.makeWith("on"))
    : node.service === AppProcess.Service ? AppProcess.layerWith("on") : layer,
}` : ""}))));`
        const body = (first: boolean) => {
          const ownsSpawn = first ? kind === "silent" : kind === "spawn" || kind === "delegation"
          const silent = !first && kind === "silent"
          return `${imports}test(${JSON.stringify(first ? "first browser file" : "second browser file")}, async () => {
  console.log(${JSON.stringify(first ? "BROWSER_FIRST" : "BROWSER_SECOND")});
  expect(process.env.ORCHESTRA_OMNI_CONTROL_NONCE).toBeUndefined();
  expect(process.env.ORCHESTRA_OMNI_CONTROL_RUN).not.toBe("must-not-reach-child");
  ${ownsSpawn || silent ? "expectSpawn(import.meta.path);" : ""}
  ${ownsSpawn ? spawn : ""}
  ${!first && kind === "failure" ? 'throw new Error("BROWSER_CHILD_TEST_FAILURE");' : ""}
}, 5000);
`
        }
        const files = [path.join(root, "01-first.test.ts"), path.join(root, "02-second.test.ts")]
        yield* Effect.tryPromise({ try: async () => {
          await Promise.all(["config", "data", "state", "cache"].map((name) => mkdir(path.join(root, name))))
          await Bun.write(config, "")
          await Bun.write(files[0]!, body(true))
          await Bun.write(files[1]!, body(false))
        }, catch: (cause) => cause })
        const result = yield* processes.run(ChildProcess.make(process.execPath, [
          "--no-env-file", `--config=${config}`, fileURLToPath(new URL("../../../script/test-browser.ts", import.meta.url)),
          ...files, "--timeout", "5000",
          ...(kind === "spawn" ? ["--reporter=junit", "--reporter-outfile", path.join(root, "junit.xml")] : []),
        ], { cwd: root, shell: false, extendEnv: false, env, stdout: "pipe", stderr: "pipe" }), {
          maxOutputBytes: 2 * 1024 * 1024, maxErrorBytes: 2 * 1024 * 1024,
        })
        const junit = yield* Effect.tryPromise({
          try: () => kind === "spawn" ? Bun.file(path.join(root, "junit.xml")).text() : Promise.resolve(undefined),
          catch: (cause) => cause,
        })
        return { result, output: result.stdout.toString() + result.stderr.toString(), external, junit }
      }),
      (root) => Effect.tryPromise({ try: () => rm(root, { recursive: true, force: true }), catch: (cause) => cause }).pipe(Effect.orDie),
    )
  }).pipe(Effect.scoped)
}
