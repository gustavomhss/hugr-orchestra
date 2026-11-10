import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { access, lstat, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewPackActionlint } from "../../src/review-toolkit/packs/actionlint"
import { ToolSafetySandbox } from "../../src/tool-safety-sandbox"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const CLEAN = "name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n"
const BROKEN = CLEAN.replace("    runs-on:", "    needs: missing\n    runs-on:")
const POISON = "self-hosted: [this is deliberately invalid YAML\n"
const BAD = ".github/workflows/odd [name].yml"
const GOOD = ".github/workflows/clean.yaml"
const exists = (file: string) => access(file).then(() => true, () => false)
const fixture = Effect.acquireRelease(Effect.promise(async () => {
  const temp = await tmpdir()
  const source = path.join(temp.path, "source")
  const scratch = path.join(temp.path, "scratch")
  await mkdir(path.join(source, ".github/workflows"), { recursive: true })
  await mkdir(scratch)
  return { temp, source, scratch, install: path.join(temp.path, "toolkit") }
}), (value) => Effect.promise(() => value.temp[Symbol.asyncDispose]()))

const ready = (install: string) => BackendToolkit.ensure<string>("actionlint").pipe(
  Effect.provideService(BackendToolkit.Root, install),
  Effect.provideService(BackendToolkit.Manifest, { actionlint: ReviewPackActionlint.manifest }),
)

// Native execution only through the production confinement/spawner. Provisioning above is outside a review.
const run = (argv: readonly string[], root: string) => Effect.scoped(Effect.gen(function* () {
  const launch = yield* ToolSafetySandbox.confine({
    command: argv[0], args: argv.slice(1), cwd: root,
    env: ReviewPackActionlint.environment(root), write: [],
  })
  return yield* ResearchProcess.run({
    command: launch.command, args: launch.args, cwd: root,
    env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    timeoutMs: 60_000, maxBytes: 4 * 1024 * 1024,
  })
}))

it.live("actionlint conformance requires the Linux jail", () => Effect.sync(() => {
  if (process.platform === "linux") expect(jail, "conformance-missing: sandbox").toBeTruthy()
}))

it.live("actionlint staging acquisition names filesystem failure and cleans successful acquisition", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    expect(yield* Effect.scoped(ReviewAnalyze.workflowStaging(path.join(f.scratch, "missing", "parent"))))
      .toEqual({ status: "not-run", reason: "workflow-input-unavailable: ENOENT" })
    const directory = yield* Effect.scoped(ReviewAnalyze.workflowStaging(f.scratch))
    if (typeof directory !== "string") throw new Error(directory.reason)
    expect(yield* Effect.promise(() => exists(directory))).toBe(false)
  }),
)

it.live(process.platform === "win32" ? "Windows names unqualified actionlint before lookup" : "pinned actionlint ignores poisoned source and ancestor configs without changing source inputs", () =>
  Effect.gen(function* () {
    if (process.platform === "win32") {
      expect(yield* ReviewPackActionlint.locate()).toEqual({ absent: "actionlint unsupported: windows-api-unqualified" })
      return
    }
    expectSpawn(import.meta.path)
    const f = yield* fixture
    yield* Effect.promise(async () => {
      await mkdir(path.join(f.temp.path, ".git"))
      await mkdir(path.join(f.temp.path, ".github/workflows"), { recursive: true })
      await writeFile(path.join(f.temp.path, ".github/actionlint.yaml"), POISON)
      await mkdir(path.join(f.source, ".git"))
      await writeFile(path.join(f.source, ".github/actionlint.yaml"), POISON)
      await writeFile(path.join(f.source, BAD), BROKEN)
      await writeFile(path.join(f.source, GOOD), CLEAN)
      await writeFile(path.join(f.source, ".github/workflows/unselected.yml"), "jobs: [invalid\n")
    })
    const before = yield* Effect.promise(() => image(f.source))
    const executable = yield* ready(f.install)
    const version = yield* run([executable.executable, "-version"], f.scratch)
    expect(version.exitCode).toBe(0)
    expect(version.stdout.data.toString("utf8").split(/\r?\n/)[0]).toBe("1.7.12")
    const notice = yield* Effect.promise(() => readFile(path.join(path.dirname(executable.executable), "notices/actionlint-1.7.12-license.txt")))
    expect(createHash("sha256").update(notice).digest("hex")).toBe("03a26b06d224380a02bf100e05fff3b2dfc71b14d4e2fa685ec9963a87563c22")
    const projectedRoot = yield* Effect.scoped(Effect.gen(function* () {
      const projected = yield* ReviewPackActionlint.prepare({ root: f.source, files: [BAD, GOOD], scratch: f.scratch })
      if (projected.status !== "ok") throw new Error(`conformance-missing: ${projected.reason}`)
      expect(yield* Effect.promise(() => exists(path.join(projected.root, ".git")))).toBe(true)
      const built = ReviewPackActionlint.argv(executable.executable, projected)
      if (built.status !== "ok") throw new Error(`conformance-missing: ${built.reason}`)
      const outcome = yield* run(built.argv, projected.root)
      expect(outcome.exitCode).toBe(1)
      expect(outcome.stderr.data.toString("utf8")).toBe("")
      const parsed = ReviewPackActionlint.settle(outcome, projected)
      if (parsed.status !== "ok") throw new Error(`native report refused: ${parsed.reason}`)
      // actionlint 1.7.12 anchors an undefined dependency at the job ID, not the needs value.
      expect(parsed.results.some((entry) => entry.rule === "job-needs" && entry.path === BAD && entry.line === 4)).toBe(true)
      expect(parsed.results.every((entry) => entry.path === BAD)).toBe(true)
      expect(parsed.results.every((entry) => entry.endLine === undefined)).toBe(true)
      return projected.root
    }))
    expect(yield* Effect.promise(() => exists(projectedRoot))).toBe(false)
    yield* Effect.scoped(Effect.gen(function* () {
      const projected = yield* ReviewPackActionlint.prepare({ root: f.source, files: [GOOD], scratch: f.scratch })
      if (projected.status !== "ok") throw new Error(`conformance-missing: ${projected.reason}`)
      const built = ReviewPackActionlint.argv(executable.executable, projected)
      if (built.status !== "ok") throw new Error(`conformance-missing: ${built.reason}`)
      const outcome = yield* run(built.argv, projected.root)
      expect(outcome.exitCode).toBe(0)
      expect(ReviewPackActionlint.settle(outcome, projected)).toEqual({ status: "ok", results: [], excluded: [] })
    }))
    expect(yield* Effect.promise(() => image(f.source))).toEqual(before)
    expect(yield* Effect.promise(() => readdir(f.scratch))).toEqual([])
  }),
)

if (process.platform !== "win32") it.live("ReviewAnalyze retains mapped actionlint diagnostics and names an empty base", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* fixture
    yield* ResearchProcess.git(f.source, ["init", "-q"])
    yield* ResearchProcess.git(f.source, ["config", "user.email", "test@orchestra.invalid"])
    yield* ResearchProcess.git(f.source, ["config", "user.name", "Orchestra test"])
    yield* Effect.promise(() => writeFile(path.join(f.source, "README.md"), "fixture\n"))
    yield* ResearchProcess.git(f.source, ["add", "."])
    yield* ResearchProcess.git(f.source, ["commit", "-qm", "base"])
    const base = (yield* ResearchProcess.git(f.source, ["rev-parse", "HEAD"])).toString("utf8").trim()
    yield* Effect.promise(async () => {
      await writeFile(path.join(f.source, BAD), BROKEN)
      await writeFile(path.join(f.source, ".github/actionlint.yaml"), POISON)
    })
    yield* ResearchProcess.git(f.source, ["add", "."])
    yield* ResearchProcess.git(f.source, ["commit", "-qm", "head"])
    yield* ready(f.install)
    const result = yield* ReviewAnalyze.run({
      worktree: f.source, base, tier: "standard", store: path.join(f.temp.path, "artifacts"),
      changed: { [BAD]: [{ start: 1, end: 8 }] }, trusted: false,
      lane: "no-build", packs: ["actionlint"], scope: "files", files: [BAD],
    }).pipe(
      Effect.provideService(BackendToolkit.Root, f.install),
      Effect.provideService(BackendToolkit.Manifest, { actionlint: ReviewPackActionlint.manifest }),
    )
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({ pack: "actionlint", version: "1.7.12", status: "fail", workspaceExecuted: false })
    expect(result.checks[0].reason).toContain("no base scanner invocation")
    const stderr = /head stderr: review:([0-9a-f-]+)\/raw\/actionlint-head-stderr\.txt/.exec(result.checks[0].reason ?? "")
    if (!stderr) throw new Error("native evidence lost its stderr")
    expect(yield* Effect.promise(() => Bun.file(path.join(f.temp.path, "artifacts", stderr[1], "raw/actionlint-head-stderr.txt")).text())).toBe("")
    expect(result.checks[0].uri).toMatch(/^review:/)
    expect(Object.values(result.items).flat().some((entry) => entry.rule === "job-needs" && entry.path === BAD)).toBe(true)
    const mapping = /head path map: review:([0-9a-f-]+)\/raw\/actionlint-head-paths\.json/.exec(result.checks[0].reason ?? "")
    if (!mapping) throw new Error("native evidence lost its host path map")
    const retainedMap: unknown = yield* Effect.promise(() => Bun.file(path.join(f.temp.path, "artifacts", mapping[1], "raw/actionlint-head-paths.json")).json())
    expect(retainedMap).toEqual({ version: "actionlint-projection-v1", paths: [{ file: ".github/workflows/input-0.yaml", path: BAD }] })
    const dropped = {
      ...ReviewCatalog.current,
      rules: ReviewCatalog.current.rules.map((rule) => rule.pack === "actionlint" && rule.rule === "job-needs" ? { ...rule, status: "dropped" as const } : rule),
    }
    const refused = yield* ReviewAnalyze.run({
      worktree: f.source, base, tier: "standard", store: path.join(f.temp.path, "refused"), changed: {},
      trusted: false, lane: "no-build", packs: ["actionlint"], scope: "diff", catalog: dropped,
    })
    expect(refused.checks[0]).toMatchObject({ status: "not-run", reason: "native-rule-selection-unsupported" })
    expect(refused.checks[0].uri).toBeUndefined()
    expect(Object.values(refused.items).flat()).toEqual([])
  }),
)

// Git administrative bytes are not product inputs; preserve every other source file and directory image.
async function image(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  return (await Promise.all(entries.filter((entry) => prefix !== "" || entry.name !== ".git").map(async (entry) => {
    const name = path.join(prefix, entry.name)
    const file = path.join(root, name)
    const info = await lstat(file)
    if (entry.isSymbolicLink()) return [`${name}:${info.mode}:${info.ino}:${info.mtimeMs}->${await readlink(file)}`]
    if (entry.isDirectory()) return [`${name}:${info.mode}:${info.ino}:${info.mtimeMs}`, ...await image(root, name)]
    return [`${name}:${info.mode}:${info.ino}:${info.mtimeMs}:${(await readFile(file)).toString("base64")}`]
  }))).flat().sort()
}
