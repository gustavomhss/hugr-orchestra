import { expect } from "bun:test"
import path from "node:path"
import { access, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { ReviewCatalog } from "../../src/review/catalog"
import pinned from "../../src/backend-toolkit/packs/jscpd"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import type { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewJscpdAnalyze } from "../../src/review-toolkit/jscpd-analyze"
import { ReviewNoise } from "../../src/review-toolkit/noise"
import { ReviewPackJscpd } from "../../src/review-toolkit/packs/jscpd"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { Probe } from "../../src/research-toolkit/probe/types"
import { ToolSafetySandbox } from "../../src/tool-safety-sandbox"
import { jscpd } from "../../src/review/catalog/jscpd"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const BLOCK = `function duplicated() {\n${Array.from({ length: 80 }, (_, index) => `  const value${index} = ${index} + ${index * 3};`).join("\n")}\n  return value0;\n}\n`
const CONFIG = JSON.stringify({
  exitCode: 7,
  semantic: true,
  blame: true,
  threshold: 0,
  sarifErrorTokens: 1,
  reporters: ["json"],
  followSymlinks: true,
})

it.live.skipIf(process.platform !== "linux" || process.arch !== "x64")("Linux x64 pinned jscpd scans host cwd, ignores project config, and fails closed on a missing side", () => Effect.gen(function* () {
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const install = path.join(temp.path, "toolkit")
  const provision = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { jscpd: pinned }),
  )
  yield* provision(BackendToolkit.ensure<string>("jscpd"))
  const homes: string[] = []
  const confine: ReviewAnalyze.Confine = (input) => Effect.scoped(Effect.gen(function* () {
    homes.push(input.cwd)
    expect(input.cwd).toBe(yield* Effect.promise(() => realpath(input.cwd)))
    expect(path.relative(input.argv[1], input.cwd).startsWith(`..${path.sep}`)).toBe(true)
    expect(input.argv).toEqual(ReviewPackJscpd.argv(input.argv[0], input.argv[1], input.argv[5]))
    expect(input.argv.join(" ")).not.toMatch(/exit-code|threshold|semantic|blame|--config/)
    expect(input.write).toEqual([input.argv[5]])
    expect(input.env.HOME).toBe(input.cwd)
    expect(input.env.XDG_CONFIG_HOME).toBe(input.cwd)
    expect(input.argv[5].startsWith(input.cwd)).toBe(true)
    const launch = yield* ToolSafetySandbox.confine({
      command: input.argv[0], args: input.argv.slice(1), cwd: input.cwd, env: input.env, write: input.write,
    }).pipe(
      Effect.map((value) => ({ value })),
      Effect.catch((error) => Effect.succeed({ denied: `sandbox: ${error.reason}` })),
    )
    if ("denied" in launch) return launch
    const outcome = yield* ResearchProcess.run({
      command: launch.value.command,
      args: launch.value.args,
      cwd: input.cwd,
      env: Object.fromEntries(Object.entries(launch.value.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: input.timeoutMs,
      maxBytes: input.maxBytes,
      maxRssBytes: Probe.Limits.rssBytes,
    })
    return { outcome }
  }))

  const duplicate = path.join(temp.path, "jscpd review root")
  yield* Effect.promise(() => seed(duplicate, { "a.js": BLOCK, "b.js": BLOCK }))
  const before = yield* Effect.promise(() => image(duplicate))
  const duplicated = yield* provision(run(confine, duplicate, duplicate))
  expect(duplicated.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false, version: "5.4.3" })
  const head = duplicated.kept.get("raw/jscpd-head.sarif")
  const base = duplicated.kept.get("raw/jscpd-base.sarif")
  if (!head || !base) throw new Error("sarif was not retained")
  const parsed = ReviewPackJscpd.parse(head, yield* Effect.promise(() => realpath(duplicate)))
  if (parsed.status !== "ok") throw new Error(parsed.reason)
  expect(parsed.results.map((row) => row.path).sort()).toEqual(["a.js", "b.js"])
  expect(new Set(parsed.results.map((row) => row.toolFingerprint)).size).toBe(1)
  expect(parsed.results.every((row) => row.rule === ReviewPackJscpd.RULE && row.nativeSeverity === "warning" && row.snippet === undefined)).toBe(true)
  expect(head).not.toContain("semantic-code")
  expect(head).not.toContain("blame")
  expect(duplicated.head.map((entry) => entry.item.path).sort()).toEqual(["a.js", "b.js"])
  expect(duplicated.base.map((entry) => entry.item.path).sort()).toEqual(["a.js", "b.js"])
  expect(yield* Effect.promise(() => image(duplicate))).toEqual(before)

  const empty = path.join(temp.path, "empty")
  yield* Effect.promise(() => seed(empty, { "only.js": "export const uniqueName = 1\n" }))
  const clean = yield* provision(run(confine, empty, empty))
  expect(clean.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: false })
  const cleanReport = clean.kept.get("raw/jscpd-head.sarif")
  if (!cleanReport) throw new Error("empty sarif was not retained")
  expect(ReviewPackJscpd.parse(cleanReport, yield* Effect.promise(() => realpath(empty)))).toEqual({ status: "ok", results: [], excluded: [] })
  expect(clean.head).toEqual([])

  const fresh = yield* provision(run(confine, duplicate, empty))
  const selected = ReviewNoise.pipeline({ head: fresh.head, base: fresh.base, changed: { "b.js": [{ start: 1, end: 80 }] }, tier: "standard", catalog: ReviewCatalog.current })
  expect(selected.items.change?.map((item) => item.path)).toEqual(["b.js"])
  const shifted = path.join(temp.path, "shifted")
  yield* Effect.promise(() => seed(shifted, { "a.js": `\n\n${BLOCK}`, "b.js": `\n\n${BLOCK}` }))
  const previous = yield* provision(run(confine, shifted, duplicate))
  const debt = ReviewNoise.pipeline({ head: previous.head, base: previous.base, changed: { "b.js": [{ start: 1, end: 90 }] }, tier: "standard", catalog: ReviewCatalog.current })
  expect(debt.retained.total).toBe(0)
  expect(debt.debt.map((item) => item.path).sort()).toEqual(["a.js", "b.js"])

  const configured = path.join(temp.path, "configured")
  yield* Effect.promise(() => seed(configured, { "a.js": BLOCK, "b.js": BLOCK, ".jscpd.json": CONFIG }))
  const configuredShot = yield* Effect.promise(() => image(configured))
  const ignored = yield* provision(run(confine, configured, configured))
  expect(ignored.checks[0].status).toBe("fail")
  const ignoredReport = ignored.kept.get("raw/jscpd-head.sarif")
  if (!ignoredReport) throw new Error("configured sarif was not retained")
  expect(ignoredReport).not.toContain("semantic-code")
  expect(ignoredReport).not.toContain("\"level\": \"error\"")
  expect(ignoredReport).toContain(ReviewPackJscpd.RULE)
  expect(yield* Effect.promise(() => readFile(path.join(configured, ".jscpd.json"), "utf8"))).toBe(CONFIG)
  expect(yield* Effect.promise(() => image(configured))).toEqual(configuredShot)

  const missing = yield* provision(run(confine, duplicate, undefined))
  expect(missing.checks[0]).toMatchObject({ status: "not-run", reason: "base: scratch: base-missing" })
  expect(missing.head).toEqual([])
  expect(missing.checks[0].status).not.toBe("pass")
  expect(new Set(homes).size).toBe(homes.length)
  for (const home of homes) expect(yield* Effect.promise(() => access(home).then(() => true, () => false))).toBe(false)
}), 300_000)

function run(confine: ReviewAnalyze.Confine, head: string, base: string | undefined) {
  const kept = new Map<string, string>()
  return ReviewJscpdAnalyze.run(jscpd.pack, {
    catalog: { ...ReviewCatalog.current, rules: jscpd.rules },
    input: { worktree: head, base: "base", tier: "standard", store: path.join(path.dirname(head), "artifacts"), trusted: false, lane: "no-build", packs: ["jscpd"], scope: "diff", changed: { "a.js": [{ start: 1, end: 80 }] } },
    write: (name, text) => Effect.sync(() => {
      kept.set(name, typeof text === "string" ? text : Buffer.from(text).toString("utf8"))
      return `review:${name}`
    }),
    head: Effect.succeed(copy(head)),
    base: Effect.succeed(base === undefined ? { failed: "scratch: base-missing" } : copy(base)),
  }, confine, (pack, rule) => pack === "jscpd" && rule === ReviewPackJscpd.RULE ? {
    class: "change.duplication", lens: "change", severity: "P3", status: "probation", triage: jscpd.rules[0].triage,
  } : undefined).pipe(Effect.map((outcome) => ({ ...outcome, kept })))
}

function copy(root: string): ReviewAnalyze.Copy {
  return { snapshot: { root, origin: root, kind: "worktree", revision: "fixture", files: 2, dependencyRoots: [], scratch: path.dirname(root), digest: root } }
}

async function seed(root: string, files: Record<string, string>) {
  await mkdir(root, { recursive: true })
  await Promise.all(Object.entries(files).map(async ([name, text]) => writeFile(path.join(root, name), text)))
}

async function image(root: string) {
  const names = (await readdir(root)).sort()
  return Promise.all(names.map(async (name) => ({ name, bytes: (await readFile(path.join(root, name))).toString("base64") })))
}
