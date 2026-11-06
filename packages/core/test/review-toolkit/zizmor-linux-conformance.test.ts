import { expect } from "bun:test"
import path from "node:path"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import pinned from "../../src/backend-toolkit/packs/zizmor"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewZizmorResult } from "../../src/review-toolkit/packs/zizmor-result"
import { expectSpawn } from "../fixture/omni-expect"
import { ReviewNativeFixture } from "../fixture/review-native"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const CLEAN = "name: CI\non: push\npermissions: {}\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n"
const BROKEN = CLEAN.replace("      - run: echo ok", "      - uses: actions/checkout@main")
const WORKFLOW = ".github/workflows/ci.yml"
const POISON = "jobs: [deliberately invalid YAML\n"

it.live.skipIf(process.platform !== "linux")("zizmor Linux-only native report conformance", () => Effect.gen(function* () {
  expect(process.platform).toBe("linux")
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const temp = yield* Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (value) => Effect.promise(() => value[Symbol.asyncDispose]()),
  )
  const root = path.join(temp.path, "project")
  const install = path.join(temp.path, "toolkit")
  yield* Effect.promise(async () => {
    await mkdir(path.join(root, ".git"), { recursive: true })
    await mkdir(path.join(root, ".github/workflows"), { recursive: true })
    await mkdir(path.join(root, "nested"), { recursive: true })
    await writeFile(path.join(root, WORKFLOW), CLEAN)
    await writeFile(path.join(root, ".github/zizmor.yml"), POISON)
    await writeFile(path.join(root, "nested/zizmor.yaml"), POISON)
  })
  const inputs = [WORKFLOW, ".github/zizmor.yml", "nested/zizmor.yaml"]
  const image = () => Promise.all(inputs.map(async (file) => ({
    file,
    mode: (await lstat(path.join(root, file))).mode,
    bytes: await readFile(path.join(root, file)),
  })))
  const original = yield* Effect.promise(image)
  const ready = yield* BackendToolkit.ensure<string>("zizmor").pipe(
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { zizmor: pinned }),
  )
  const executable = ready.executable
  const run = (phase: string, args: string[]) => Effect.gen(function* () {
    const outcome = yield* ReviewNativeFixture.run({
      executable,
      args,
      root,
    })
    // Preserve exact bounded bytes in logs; UTF-8 decoding is separately validated for stderr.
    console.info(`[zizmor ${phase}] stdout-base64=${outcome.stdout.data.toString("base64")} stderr-base64=${outcome.stderr.data.toString("base64")} exit=${outcome.exitCode} failure=${outcome.failure ?? "none"} timedOut=${outcome.timedOut} overflow=${outcome.overflow} memoryExceeded=${outcome.memoryExceeded} stdoutTruncated=${outcome.stdout.truncated} stderrTruncated=${outcome.stderr.truncated}`)
    new TextDecoder("utf-8", { fatal: true }).decode(outcome.stderr.data)
    expect(outcome.failure).toBeUndefined()
    expect(outcome.timedOut).toBe(false)
    expect(outcome.overflow).toBe(false)
    expect(outcome.memoryExceeded).toBe(false)
    expect(outcome.stdout.truncated).toBe(false)
    expect(outcome.stderr.truncated).toBe(false)
    return outcome
  })
  const version = yield* run("version", ["--version"])
  expect(version.exitCode).toBe(0)
  expect(version.stdout.data.toString("utf8").trim()).toBe("zizmor 1.32.0")
  const args = ["--offline", "--no-config", "--no-ignores", "--format", "sarif", "--", WORKFLOW]
  const clean = yield* run("clean", args)
  expect(clean.exitCode).toBe(0)
  const options = {
    root,
    paths: [{ file: WORKFLOW, path: WORKFLOW }],
    rules: ["zizmor/artipacked", "zizmor/unpinned-uses"],
  }
  const cleanParsed = ReviewZizmorResult.settle(clean, options)
  expect(cleanParsed).toEqual({ status: "ok", results: [], excluded: [] })
  expect(yield* Effect.promise(image)).toEqual(original)
  yield* Effect.promise(() => writeFile(path.join(root, WORKFLOW), BROKEN))
  const brokenBaseline = yield* Effect.promise(image)
  const broken = yield* run("broken", args)
  // SARIF deliberately reports findings with exit 0; a plain run does not have that contract.
  expect(broken.exitCode).toBe(0)
  const parsed = ReviewZizmorResult.settle(broken, options)
  if (parsed.status !== "ok") throw new Error(`native SARIF refused: ${parsed.reason}`)
  expect(parsed.results.some((entry) => entry.rule === "zizmor/unpinned-uses" && entry.path === WORKFLOW && entry.line === 8)).toBe(true)
  expect(parsed.excluded).toEqual([])
  expect(yield* Effect.promise(image)).toEqual(brokenBaseline)
}))
