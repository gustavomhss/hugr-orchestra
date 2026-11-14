import { YAML } from "bun"
import { describe, expect } from "bun:test"
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const root = path.resolve(import.meta.dir, "../../..")
const unit = ["test", "--conditions=solid"]
const browser = [
  "test", "--isolate", "--conditions=browser",
  "--preload", "../../script/test-omni-control.ts", "--preload", "./happydom.ts",
]
const timeout = ["--timeout", "120000"]
const filter = ["-t", "name with spaces"]
const pathFilter = ["-t", "./test-browser/not-a-selector"]

// Exact vectors pin selectors before common options (the uploader's generated order), not a second router.
const cases: {
  name: string
  args: string[]
  expected: string[][]
  directory?: string
  codes?: number[]
  code?: number
}[] = [
  {
    name: "browser selector plus uploader default timeout invokes only browser and retains timeout",
    args: ["./test-browser/only.test.ts", ...timeout],
    expected: [[...browser, "./test-browser/only.test.ts", ...timeout]],
  },
  {
    name: "unit selector invokes only solid without browser preloads",
    args: ["./test/only.test.ts", ...timeout],
    expected: [[...unit, "./test/only.test.ts", ...timeout]],
  },
  {
    name: "mixed selectors retain each lane's order and common timeout and spaced filter",
    args: ["test-browser/first.test.ts", "./test/first.test.ts", "./test-browser/second.test.ts", "./test/second.test.ts", ...timeout, ...filter],
    expected: [
      [...unit, "./test/first.test.ts", "./test/second.test.ts", ...timeout, ...filter],
      [...browser, "test-browser/first.test.ts", "./test-browser/second.test.ts", ...timeout, ...filter],
    ],
  },
  {
    name: "browser filter value resembling a browser selector remains a filter value",
    args: ["test-browser", ...timeout, ...pathFilter],
    expected: [[...browser, "./test-browser", ...timeout, ...pathFilter]],
  },
  {
    name: "unit filter value resembling a browser selector does not request browser",
    args: ["./test/only.test.ts", ...timeout, ...pathFilter],
    expected: [[...unit, "./test/only.test.ts", ...timeout, ...pathFilter]],
  },
  {
    name: "filter-only request retains unit default even with a browser-like value",
    args: [...timeout, ...pathFilter],
    expected: [[...unit, ...timeout, ...pathFilter]],
  },
  {
    name: "empty args retain existing unit default, not a whole browser suite",
    args: [],
    expected: [unit],
  },
  {
    name: "timeout-only args retain existing unit default",
    args: timeout,
    expected: [[...unit, ...timeout]],
  },
  {
    name: "both requested lanes execute solid then browser even when solid exits seven",
    args: ["test-browser/only.test.ts", "./test/only.test.ts", ...timeout],
    expected: [
      [...unit, "./test/only.test.ts", ...timeout],
      [...browser, "test-browser/only.test.ts", ...timeout],
    ],
    codes: [7, 0],
    code: 7,
  },
  {
    name: "browser failure remains the actual Bash child exit status",
    args: ["test-browser/only.test.ts", "./test/only.test.ts", ...timeout],
    expected: [
      [...unit, "./test/only.test.ts", ...timeout],
      [...browser, "test-browser/only.test.ts", ...timeout],
    ],
    codes: [0, 9],
    code: 9,
  },
  {
    name: "browser-only failure is nonzero without an accidental unit call",
    args: ["test-browser/only.test.ts", ...timeout],
    expected: [[...browser, "test-browser/only.test.ts", ...timeout]],
    codes: [9],
    code: 9,
  },
  {
    name: "non-app Bun request forwards all args unchanged",
    directory: "packages/core",
    args: ["./test/only.test.ts", "test-browser/unchanged.test.ts", ...timeout, ...filter],
    expected: [["test", "./test/only.test.ts", "test-browser/unchanged.test.ts", ...timeout, ...filter]],
  },
  {
    name: "long test-name-pattern value resembling a browser selector does not request browser",
    args: ["./test/only.test.ts", "--test-name-pattern", "./test-browser/not-a-selector"],
    expected: [[...unit, "./test/only.test.ts", "--test-name-pattern", "./test-browser/not-a-selector"]],
  },
  {
    name: "shared --bail follows both mixed lanes and is not a selector",
    args: ["test-browser/only.test.ts", "./test/only.test.ts", "--bail"],
    expected: [
      [...unit, "./test/only.test.ts", "--bail"],
      [...browser, "test-browser/only.test.ts", "--bail"],
    ],
  },
  {
    name: "options before and between mixed selectors keep selector order and common order",
    args: [
      "--timeout", "120000", "test-browser/first.test.ts", "-t", "name with spaces",
      "./test/first.test.ts", "--only", "./test-browser/second.test.ts", "./test/second.test.ts",
    ],
    expected: [
      [...unit, "./test/first.test.ts", "./test/second.test.ts", ...timeout, ...filter, "--only"],
      [...browser, "test-browser/first.test.ts", "./test-browser/second.test.ts", ...timeout, ...filter, "--only"],
    ],
  },
]

describe("actual test-ci Run tests Bash (GitHub Linux lane; Windows explicitly skipped)", () => {
  cases.forEach((item) => {
    it.live.skipIf(process.platform !== "linux")(
      item.name,
      Effect.gen(function* () {
        expectSpawn(import.meta.path)
        const result = yield* runStep(item.args, item.directory ?? "packages/app-shell", item.codes ?? [0, 0])
        expect(result.calls.length).toBeGreaterThan(0)
        expect(result.calls.map((call) => call.argv)).toEqual(item.expected)
        result.calls.forEach((call) => {
          expect(call.cwd).toBe(result.directory)
          // Assert the child's observed environment, not the workflow's spelling.
          expect(call.env.GITHUB_ACTIONS).toBe("false")
          expect(call.env.RUNNER).toBe("bun")
        })
        expect(Number(result.code)).toBe(item.code ?? 0)
        expect(result.stderr).toBe("")
      }),
      30_000,
    )
  })
})

function runStep(args: string[], directory: string, codes: number[]) {
  return Effect.acquireUseRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "test-ci-app-lanes-")))),
    (fixture) => Effect.gen(function* () {
      const body = yield* Effect.promise(async () => {
        const workflow = YAML.parse(await Bun.file(path.join(root, ".github/workflows/test-ci.yml")).text()) as {
          jobs?: { test?: { steps?: { name?: string; run?: unknown }[] } }
        }
        if (!Array.isArray(workflow.jobs?.test?.steps)) throw new Error("test-ci.yml: missing jobs.test.steps")
        const steps = workflow.jobs.test.steps.filter((step) => step.name === "Run tests")
        if (steps.length !== 1) throw new Error("test-ci.yml: expected exactly one Run tests step")
        const run = steps[0]!.run
        if (typeof run !== "string" || !run.trim()) throw new Error("test-ci.yml: Run tests has no Bash body")
        return run
      })
      const log = path.join(fixture, "calls.jsonl")
      const script = path.join(fixture, "run-tests.sh")
      const bin = path.join(fixture, "bin")
      yield* Effect.promise(async () => {
        await mkdir(bin)
        await mkdir(path.join(fixture, "packages/app-shell/test"), { recursive: true })
        await mkdir(path.join(fixture, "packages/app-shell/test-browser"), { recursive: true })
        await mkdir(path.join(fixture, "packages/core"), { recursive: true })
        await Bun.write(path.join(fixture, ".ci-run.json"), JSON.stringify({
          package: path.basename(directory), directory, runner: "bun", args, env: {},
        }))
        await Bun.write(log, "")
        // Observation endpoint only: record raw arguments/environment/cwd; choose status by call ordinal.
        await Bun.write(path.join(bin, "bun"), `#!/usr/bin/env node
const fs = require("node:fs")
const log = process.env.FAKE_BUN_LOG
const index = fs.readFileSync(log, "utf8").split("\\n").length - 1
fs.appendFileSync(log, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env }) + "\\n")
const codes = JSON.parse(process.env.FAKE_BUN_CODES)
process.exit(codes[index] === undefined ? 99 : codes[index])
`)
        await chmod(path.join(bin, "bun"), 0o755)
        // Keep every byte, including the unreachable Playwright branch; never extract/rewrite the router.
        await Bun.write(script, body)
      })
      const svc = yield* AppProcess.Service
      const handle = yield* svc.spawn(ChildProcess.make("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", script], {
        cwd: fixture,
        extendEnv: true,
        env: {
          PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
          PACKAGE: path.basename(directory), DIRECTORY: directory, RUNNER: "bun",
          GITHUB_ACTIONS: "true", FAKE_BUN_LOG: log, FAKE_BUN_CODES: JSON.stringify(codes),
        },
        stdin: "ignore",
      }))
      const [stdout, stderr, code] = yield* Effect.all([
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ], { concurrency: "unbounded" })
      const calls = yield* Effect.promise(async () => {
        const text = await Bun.file(log).text()
        if (!text.trim()) throw new Error(`Run tests produced no fake bun calls (exit ${code}): ${stderr}\n${stdout}`)
        if (!text.endsWith("\n")) throw new Error("fake bun log is not complete JSONL")
        return text.slice(0, -1).split("\n").map((line) => {
          const call: unknown = JSON.parse(line)
          if (!call || typeof call !== "object" || !("argv" in call) || !Array.isArray(call.argv) ||
            !call.argv.every((arg) => typeof arg === "string") || !("cwd" in call) || typeof call.cwd !== "string" ||
            !("env" in call) || !call.env || typeof call.env !== "object")
            throw new Error("fake bun log contains a malformed call")
          return call as { argv: string[]; cwd: string; env: Record<string, string> }
        })
      })
      return { calls, code, stdout, stderr, directory: path.join(fixture, directory) }
    }).pipe(Effect.scoped),
    (fixture) => Effect.promise(() => rm(fixture, { recursive: true, force: true })),
  )
}
