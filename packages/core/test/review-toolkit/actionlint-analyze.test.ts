import { expect } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewPackActionlint } from "../../src/review-toolkit/packs/actionlint"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const WORKFLOW = ".github/workflows/ci.yml"
const CLEAN = "name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n"
const BROKEN = CLEAN.replace("echo ok", "echo '${{ github.nonexistent_field }}'")

it.live.skipIf(process.platform !== "linux")("actionlint controller retains confined head/base findings and immutable source across extraction", () => Effect.gen(function* () {
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const root = path.join(temp.path, "repo")
  const store = path.join(temp.path, "store")
  const toolkit = path.join(temp.path, "toolkit")
  yield* Effect.promise(async () => {
    await mkdir(path.join(root, ".github/workflows"), { recursive: true })
    await mkdir(store)
    await writeFile(path.join(root, WORKFLOW), CLEAN)
    await writeFile(path.join(root, ".github/actionlint.yaml"), "[invalid target configuration\n")
  })
  for (const args of [
    ["init", "-q"], ["config", "user.name", "Controller Fixture"], ["config", "user.email", "fixture@example.invalid"],
    ["config", "commit.gpgsign", "false"], ["add", "--", ".github"], ["commit", "-q", "-m", "base"], ["tag", "base"],
  ]) yield* ResearchProcess.git(root, args)
  yield* BackendToolkit.ensure<string>(ReviewPackActionlint.manifest.id).pipe(
    Effect.provideService(BackendToolkit.Root, toolkit),
    Effect.provideService(BackendToolkit.Manifest, { actionlint: ReviewPackActionlint.manifest }),
  )
  yield* Effect.promise(() => writeFile(path.join(root, WORKFLOW), BROKEN))
  const result = yield* ReviewAnalyze.run({
    worktree: root, base: "base", tier: "standard", store, trusted: true, lane: "no-build", packs: ["actionlint"],
    scope: "files", files: [WORKFLOW], changed: { [WORKFLOW]: [{ start: 7, end: 7 }] },
  }).pipe(Effect.provideService(BackendToolkit.Root, toolkit))
  expect(result.checks).toMatchObject([{ pack: "actionlint", status: "fail", workspaceExecuted: false }])
  const findings = Object.values(result.items).flat()
  expect(findings.some((item) => item.rule === "expression" && item.path === WORKFLOW && item.line === 7)).toBe(true)
  expect(findings.find((item) => item.rule === "expression")?.sources).toContainEqual({ pack: "actionlint", rule: "expression" })
  expect(findings.every((item) => item.pack === "actionlint" && item.path === WORKFLOW)).toBe(true)
  expect(result.checks[0].reason).toContain("head path map:")
  expect(result.checks[0].reason).toContain("base path map:")
  expect(result.checks[0].uri).toMatch(/\/raw\/actionlint-head\.json$/)
  const artifact = result.checks[0].uri?.match(/^review:([^/]+)\/raw\/actionlint-head\.json$/)
  expect(artifact).not.toBeNull()
  if (!artifact) throw new Error("missing owned actionlint artifact")
  for (const side of ["head", "base"]) {
    const map = `raw/actionlint-${side}-paths.json`
    const stderr = `raw/actionlint-${side}-stderr.txt`
    expect(result.checks[0].reason).toContain(`${side} path map: review:${artifact[1]}/${map}`)
    expect(result.checks[0].reason).toContain(`${side} stderr: review:${artifact[1]}/${stderr}`)
    expect(JSON.parse(yield* Effect.promise(() => readFile(path.join(store, artifact[1], map), "utf8"))))
      .toMatchObject({ version: "actionlint-projection-v1", paths: [{ path: WORKFLOW }] })
    expect(yield* Effect.promise(() => Bun.file(path.join(store, artifact[1], stderr)).exists())).toBe(true)
  }
  expect(JSON.parse(yield* Effect.promise(() => readFile(path.join(store, artifact[1], "raw/actionlint-base.json"), "utf8")))).toEqual([])
  expect(JSON.parse(yield* Effect.promise(() => readFile(path.join(store, artifact[1], "raw/actionlint-head.json"), "utf8"))))
    .toMatchObject([{ kind: "expression", line: 7 }])
  expect(yield* Effect.promise(() => readFile(path.join(root, WORKFLOW), "utf8"))).toBe(BROKEN)
  expect(yield* Effect.promise(() => readFile(path.join(root, ".github/actionlint.yaml"), "utf8"))).toBe("[invalid target configuration\n")
}))
