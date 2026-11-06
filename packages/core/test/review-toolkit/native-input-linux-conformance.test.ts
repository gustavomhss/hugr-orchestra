import { expect } from "bun:test"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import oxlint from "../../src/backend-toolkit/packs/oxlint"
import zizmor from "../../src/backend-toolkit/packs/zizmor"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewOxlintInput } from "../../src/review-toolkit/packs/oxlint-input"
import { ReviewOxlintResult } from "../../src/review-toolkit/packs/oxlint-result"
import { ReviewZizmorInput } from "../../src/review-toolkit/packs/zizmor-input"
import { ReviewZizmorResult } from "../../src/review-toolkit/packs/zizmor-result"
import { ReviewZizmorRules } from "../../src/review-toolkit/packs/zizmor-rules"
import { expectSpawn } from "../fixture/omni-expect"
import { ReviewNativeFixture } from "../fixture/review-native"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const WORKFLOW = ".github/workflows/original.yml"
const TYPESCRIPT = "nested/original.ts"
const CLEAN = "name: CI\non: push\npermissions: {}\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\njobs:\n  build:\n    name: Build\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n"
const BROKEN = CLEAN.replace("      - run: echo ok", "      - uses: actions/checkout@main # zizmor: ignore[unpinned-uses,artipacked]")

const fixture = (manifest: typeof zizmor | typeof oxlint) => Effect.gen(function* () {
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const root = path.join(temp.path, "source")
  const scratch = path.join(temp.path, "staging")
  yield* Effect.promise(async () => {
    await mkdir(path.join(root, ".github/workflows"), { recursive: true })
    await mkdir(path.join(root, "nested"))
    await mkdir(scratch)
    await writeFile(path.join(root, WORKFLOW), CLEAN)
    await writeFile(path.join(root, TYPESCRIPT), "const answer = 42;\nconsole.log(answer);\n")
    await writeFile(path.join(root, ".github/zizmor.yml"), "jobs: [deliberately invalid YAML\n")
    await writeFile(path.join(root, ".oxlintrc.json"), "{")
    await writeFile(path.join(root, "nested/.oxlintrc.json"), "{")
    await writeFile(path.join(root, "oxlint.config.ts"), "throw new Error('target config must not execute')\n")
    await writeFile(path.join(root, ".gitignore"), "*\n")
    await writeFile(path.join(root, ".eslintignore"), "*\n")
  })
  const installed = yield* BackendToolkit.ensure<string>(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Root, path.join(temp.path, "toolkit")),
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  return { root, scratch, executable: installed.executable }
})

const image = (root: string) => Promise.all([
  WORKFLOW, TYPESCRIPT, ".github/zizmor.yml", ".oxlintrc.json", "nested/.oxlintrc.json", "oxlint.config.ts", ".gitignore", ".eslintignore",
].map(async (file) => ({ file, mode: (await lstat(path.join(root, file))).mode, bytes: (await readFile(path.join(root, file))).toString("base64") })))

function run(engine: string, phase: string, argv: string[], root: string, env: Record<string, string>) {
  return Effect.gen(function* () {
    const outcome = yield* ReviewNativeFixture.run({ executable: argv[0], args: argv.slice(1), root, env })
    console.info(`native input ${engine} ${phase}: ${JSON.stringify({ ...outcome, stdout: { ...outcome.stdout, data: outcome.stdout.data.toString("base64") }, stderr: { ...outcome.stderr, data: outcome.stderr.data.toString("base64") } })}`)
    expect(outcome.failure).toBeUndefined()
    expect(outcome.timedOut).toBe(false)
    expect(outcome.memoryExceeded).toBe(false)
    expect(outcome.overflow).toBe(false)
    expect(outcome.stdout.truncated).toBe(false)
    expect(outcome.stderr.truncated).toBe(false)
    return outcome
  })
}

it.live.skipIf(process.platform !== "linux")("Linux zizmor owned projection ignores no selected finding or source mapping", () => Effect.gen(function* () {
  expect(process.platform).toBe("linux")
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const f = yield* fixture(zizmor)
  for (const phase of ["clean", "broken", "informational"]) {
    yield* Effect.promise(() => writeFile(path.join(f.root, WORKFLOW), phase === "clean" ? CLEAN : phase === "broken" ? BROKEN : CLEAN.replace("    name: Build\n", "")))
    const before = yield* Effect.promise(() => image(f.root))
    yield* Effect.scoped(Effect.gen(function* () {
      const prepared = yield* ReviewZizmorInput.prepare({ ...f, files: [WORKFLOW] })
      expect(prepared.status).toBe("ok")
      if (prepared.status !== "ok") throw new Error(prepared.reason)
      expect(yield* Effect.promise(() => readFile(prepared.files[0]))).toEqual(yield* Effect.promise(() => readFile(path.join(f.root, WORKFLOW))))
      expect((yield* Effect.promise(() => lstat(prepared.files[0]))).mode & 0o777).toBe((yield* Effect.promise(() => lstat(path.join(f.root, WORKFLOW)))).mode & 0o777)
      const built = ReviewZizmorInput.argv(f.executable, prepared)
      expect(built.status).toBe("ok")
      if (built.status !== "ok") throw new Error(built.reason)
      const outcome = yield* run("zizmor", phase, built.argv, prepared.root, ReviewZizmorInput.environment(prepared.root))
      expect(outcome.exitCode).toBe(0)
      if (phase === "informational") {
        expect(JSON.parse(outcome.stdout.data.toString("utf8"))).toMatchObject({ runs: [{ results: [{ kind: "review", level: "note", ruleId: "zizmor/anonymous-definition" }] }] })
      }
      const settled = ReviewZizmorResult.settle(outcome, { ...prepared, rules: ReviewZizmorRules.RULES })
      expect(settled.status).toBe("ok")
      if (settled.status !== "ok") throw new Error(settled.reason)
      expect(settled.excluded).toEqual([])
      if (phase === "clean") expect(settled.results).toEqual([])
      if (phase === "broken") {
        expect(settled.results.some((result) => result.rule === "zizmor/unpinned-uses")).toBe(true)
        expect(settled.results.some((result) => result.rule === "zizmor/artipacked")).toBe(true)
        expect(settled.results.every((result) => result.path === WORKFLOW)).toBe(true)
      }
      if (phase === "informational") expect(settled.results).toMatchObject([{ rule: "zizmor/anonymous-definition", path: WORKFLOW }])
    }))
    expect(yield* Effect.promise(() => image(f.root))).toEqual(before)
  }
}))

it.live.skipIf(process.platform !== "linux")("Linux oxlint owned projection enforces exact rules without project configuration", () => Effect.gen(function* () {
  expect(process.platform).toBe("linux")
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const f = yield* fixture(oxlint)
  for (const phase of ["clean", "broken", "excluded"]) {
    yield* Effect.promise(() => writeFile(path.join(f.root, TYPESCRIPT), phase === "clean" ? "const answer = 42;\nconsole.log(answer);\n" : "const value: any = 1;\ndebugger;\nconsole.log(value);\n"))
    const before = yield* Effect.promise(() => image(f.root))
    yield* Effect.scoped(Effect.gen(function* () {
      const prepared = yield* ReviewOxlintInput.prepare({ ...f, files: [TYPESCRIPT], excluded: phase === "excluded" ? ["typescript(no-explicit-any)"] : [] })
      expect(prepared.status).toBe("ok")
      if (prepared.status !== "ok") throw new Error(prepared.reason)
      expect(yield* Effect.promise(() => readFile(prepared.files[0]))).toEqual(yield* Effect.promise(() => readFile(path.join(f.root, TYPESCRIPT))))
      expect((yield* Effect.promise(() => lstat(prepared.files[0]))).mode & 0o777).toBe((yield* Effect.promise(() => lstat(path.join(f.root, TYPESCRIPT)))).mode & 0o777)
      const built = ReviewOxlintInput.argv(f.executable, prepared)
      expect(built.status).toBe("ok")
      if (built.status !== "ok") throw new Error(built.reason)
      const outcome = yield* run("oxlint", phase, built.argv, prepared.root, ReviewOxlintInput.environment(prepared.root))
      expect(outcome.exitCode).toBe(phase === "clean" ? 0 : 1)
      const settled = ReviewOxlintResult.settle(outcome, prepared)
      expect(settled.status).toBe("ok")
      if (settled.status !== "ok") throw new Error(settled.reason)
      expect(settled.excluded).toEqual([])
      expect(settled.results.map((result) => result.rule).sort()).toEqual(phase === "clean" ? [] : phase === "excluded" ? ["eslint(no-debugger)"] : ["eslint(no-debugger)", "typescript(no-explicit-any)"])
      expect(settled.results.every((result) => result.path === TYPESCRIPT)).toBe(true)
    }))
    expect(yield* Effect.promise(() => image(f.root))).toEqual(before)
  }
  yield* Effect.promise(() => writeFile(path.join(f.root, TYPESCRIPT), "// oxlint-disable\ndebugger;\n"))
  expect(yield* Effect.scoped(ReviewOxlintInput.prepare({ ...f, files: [TYPESCRIPT] }))).toEqual({ status: "not-run", reason: "inline-directive-marker-unsupported" })
}))
