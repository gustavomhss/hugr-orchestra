import { afterAll, beforeAll, expect } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { Probe } from "../../src/research-toolkit/probe/types"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import type { ReviewImpactCache } from "../../src/review-toolkit/impact-cache"
import { ReviewPackOxlint } from "../../src/review-toolkit/packs/oxlint"
import { ReviewOxlintInput } from "../../src/review-toolkit/packs/oxlint-input"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

// Frozen against docs/specs/lucy/engagement-evidence-contract.md. These local structural types keep the
// baseline importable: the old RunInput ignores evidence, so the new observation/authority assertions are RED.
// No process, runner, binary, confinement or artifact writer is substituted. The two reader witnesses below
// exercise the existing Deep/LSP seams; they do not stand in for the separate real native qualification.
type File = { readonly path: string; readonly oid: string; readonly mode: "100644" | "100755"; readonly size: number }
type Runtime = {
  readonly id: "oxlint"
  readonly pinnedVersion: "1.91.0"
  readonly target: "linux-x64"
  readonly executableSha256: string
}
type Recipe = {
  readonly schema: "review-engagement-analyzer-recipe-v1"
  readonly analysisOperationID: string
  readonly invocationID: string
  readonly pack: "oxlint"
  readonly template: "oxlint-host-sarif"
  readonly sourceSha256: string
  readonly side: "head" | "base"
  readonly runtime: Runtime
  readonly files: readonly { readonly path: string; readonly oid: string; readonly sha256: string; readonly bytes: number }[]
  readonly rules: readonly string[]
  readonly config: { readonly sha256: string; readonly bytes: number }
  readonly invocation: {
    readonly argv: readonly (
      | { readonly kind: "runtime" }
      | { readonly kind: "literal"; readonly value: string }
      | { readonly kind: "source"; readonly path: string }
      | { readonly kind: "config"; readonly path: ".host/oxlint.json" }
    )[]
    readonly cwd: "projection"
    readonly environment: "oxlint-host-sanitized-v1"
    readonly network: false
    readonly repositoryExecution: false
    readonly write: readonly []
  }
  readonly limits: { readonly timeoutMs: number; readonly maxBytes: number; readonly maxRssBytes: number }
}
type Result = Effect.Success<ReturnType<typeof ReviewAnalyze.run>>
type Observation =
  | {
      readonly phase: "prepared"
      readonly analysisID: string
      readonly invocationID: string
      readonly side: "head" | "base"
      readonly sourceSha256: string
      readonly runtime: Runtime
      readonly inputs: readonly { readonly path: string; readonly oid: string; readonly sha256: string; readonly data: Uint8Array }[]
      readonly config: Uint8Array
      readonly pathMap: Uint8Array
      readonly recipe: Recipe
    }
  | {
      readonly phase: "outcome"
      readonly analysisID: string
      readonly invocationID: string
      readonly side: "head" | "base"
      readonly outcome: ResearchProcess.Outcome
      readonly stdoutURI: string
      readonly pathMapURI: string
    }
  | {
      readonly phase: "analysis"
      readonly analysisID: string
      readonly sourceSha256: string
      readonly result: Result
      readonly retained: { readonly uri: string; readonly data: Uint8Array }
      readonly debt: { readonly uri: string; readonly data: Uint8Array }
    }
type Evidence = {
  readonly analysisID: string
  readonly source: { readonly sha256: string; readonly files: readonly File[] }
  readonly observe: (event: Observation) => Effect.Effect<void, ReviewAnalyze.Failed>
}

const layer = LayerNode.compile(LayerNode.group([AppProcess.node]))
const it = testEffect(layer)
const native = process.platform === "linux" && process.arch === "x64"
const unsupported = "oxlint unsupported: native-runtime-unqualified"
const unqualified = "engagement-evidence-scope-unqualified"
const mismatch = "engagement-evidence-source-mismatch"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const excluded = "EXCLUDED_ENGAGEMENT_ANALYZER_SENTINEL"
const hostile = "HOSTILE_PROJECT_CONFIG_SENTINEL"
const suite: { directory?: Awaited<ReturnType<typeof tmpdir>>; toolkit?: string; executable?: string } = {}
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
const text = (value: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(value)

// One owner preparation for this whole file. It happens before any analyzed request and is never replaced by
// a ready-status shim. A missing Linux x64 sandbox or pinned backend is a broken qualification prerequisite.
beforeAll(async () => {
  suite.directory = await tmpdir()
  suite.toolkit = path.join(suite.directory.path, "toolkit")
  if (!native) return
  expect(jail, "conformance-missing: real Linux x64 sandbox").toBeTruthy()
  const installed = await Effect.runPromise(BackendToolkit.ensure<string>("oxlint").pipe(
    Effect.provideService(BackendToolkit.Root, suite.toolkit),
    Effect.provideService(BackendToolkit.Manifest, { oxlint: ReviewPackOxlint.manifest }),
    Effect.scoped,
    Effect.provide(layer),
  ))
  suite.executable = installed.executable
  expect(installed.executable).toContain("1.91.0")
}, 600_000)

afterAll(async () => {
  if (suite.directory) await suite.directory[Symbol.asyncDispose]()
})

it.live(native
  ? "engagement observes actual oxlint preparation, both native outcomes and exact filtered analysis bodies"
  : "engagement observes analysis while the unqualified oxlint host refuses without a native proof", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repository()
  const control = yield* analyze(made)
  yield* positive(made, control)
  const events: Observation[] = []
  const roots = new Set<string>()
  const evidence = policy(made, "positive", (event) => Effect.gen(function* () {
    events.push(event)
    if (event.phase !== "prepared") return
    // Copied is the real preparation seam. At observation time the host config and all selected files exist.
    const root = [...roots].at(-1)
    expect(root, "actual projection must precede observation").toBeDefined()
    if (!root) throw new Error("projection witness missing")
    expect(yield* Effect.promise(() => fs.readFile(path.join(root, ".host", "oxlint.json")))).toEqual(Buffer.from(event.config))
    for (const input of event.inputs)
      expect(yield* Effect.promise(() => fs.readFile(path.join(root, input.path)))).toEqual(Buffer.from(input.data))
    for (const file of ["outside/secret.js", ".oxlintrc.json", "src/.oxlintrc.json"])
      expect(yield* Effect.promise(() => exists(path.join(root, file)))).toBe(false)
  }))
  const observed = yield* analyze(made, { evidence }).pipe(
    Effect.provideService(ReviewOxlintInput.Copied, (input) => Effect.sync(() => { roots.add(input.root) })),
  )
  yield* positive(made, observed)
  const summaries = events.filter((event) => event.phase === "analysis")
  expect(summaries, "actual filtered analysis must reach the host observer").toHaveLength(1)
  const summary = summaries[0]
  if (!summary) throw new Error("analysis observation missing")
  expect(summary.analysisID).toBe(evidence.analysisID)
  expect(summary.sourceSha256).toBe(made.source.sha256)
  expect(summary.result).toEqual(observed)
  expect(summary.retained.uri).toBe(observed.retained.uri)
  expect(summary.debt.uri).toBe(observed.debt.uri)
  expect(Buffer.from(summary.retained.data)).toEqual(yield* raw(made, observed.retained.uri))
  expect(Buffer.from(summary.debt.data)).toEqual(yield* raw(made, observed.debt.uri))
  expect(text(summary.retained.data)).not.toContain(excluded)
  expect(text(summary.debt.data)).not.toContain(excluded)
  if (!native) {
    expect(events.map((event) => event.phase)).toEqual(["analysis"])
    expect(roots.size).toBe(0)
    return
  }
  expect(events.map((event) => event.phase)).toEqual(["prepared", "outcome", "prepared", "outcome", "analysis"])
  const prepared = events.filter((event) => event.phase === "prepared")
  const outcomes = events.filter((event) => event.phase === "outcome")
  expect(prepared.map((event) => event.side)).toEqual(["head", "base"])
  expect(new Set(prepared.map((event) => event.invocationID)).size).toBe(2)
  const executable = suite.executable
  if (!executable) throw new Error("conformance-missing: prepared oxlint executable")
  const runtimeHash = hash(yield* Effect.promise(() => fs.readFile(executable)))
  for (const event of prepared) {
    expect(event.analysisID).toBe(evidence.analysisID)
    expect(event.invocationID).toMatch(uuid)
    expect(event.sourceSha256).toBe(made.source.sha256)
    expect(event.runtime).toEqual({ id: "oxlint", pinnedVersion: "1.91.0", target: "linux-x64", executableSha256: runtimeHash })
    expect(event.inputs.map((input) => input.path)).toEqual(["src/clean.ts", "src/selected.js"])
    for (const input of event.inputs) {
      const original = made.contents[input.path]
      const captured = made.source.files.find((file) => file.path === input.path)
      if (original === undefined || captured === undefined) throw new Error("source fixture missing")
      expect(Buffer.from(input.data)).toEqual(Buffer.from(original))
      expect(input.oid).toBe(captured.oid)
      expect(blobOID(input.data, input.oid)).toBe(captured.oid)
      expect(input.sha256).toBe(hash(input.data))
      expect(input.data.byteLength).toBe(captured.size)
    }
    const config = Buffer.from(JSON.stringify({ plugins: ["eslint", "typescript"], rules: {
      "eslint/no-debugger": "error", "typescript/no-explicit-any": "error",
    } }))
    expect(Buffer.from(event.config)).toEqual(config)
    expect(Buffer.from(event.pathMap)).toEqual(Buffer.from(JSON.stringify({
      version: "oxlint-projection-v1", paths: event.inputs.map((input) => ({ file: input.path, path: input.path })),
    })))
    expect(event.recipe).toEqual({
      schema: "review-engagement-analyzer-recipe-v1", analysisOperationID: evidence.analysisID,
      invocationID: event.invocationID, pack: "oxlint", template: "oxlint-host-sarif", sourceSha256: made.source.sha256,
      side: event.side, runtime: event.runtime,
      files: event.inputs.map((input) => ({ path: input.path, oid: input.oid, sha256: input.sha256, bytes: input.data.byteLength })),
      rules: ["eslint(no-debugger)", "typescript(no-explicit-any)"], config: { sha256: hash(config), bytes: config.byteLength },
      invocation: {
        argv: [
          { kind: "runtime" }, { kind: "literal", value: "--config" }, { kind: "config", path: ".host/oxlint.json" },
          ...["--disable-nested-config", "--no-ignore", "--allow", "all", "--deny", "eslint/no-debugger",
            "--deny", "typescript/no-explicit-any", "--format", "sarif", "--"].map((value) => ({ kind: "literal" as const, value })),
          ...event.inputs.map((input) => ({ kind: "source" as const, path: input.path })),
        ],
        cwd: "projection", environment: "oxlint-host-sanitized-v1", network: false, repositoryExecution: false, write: [],
      },
      limits: { timeoutMs: 5 * 60_000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: Probe.Limits.rssBytes },
    })
    expect(JSON.stringify(event.recipe)).not.toContain(excluded)
    expect(JSON.stringify(event.recipe)).not.toContain(hostile)
    const outcome = outcomes.find((item) => item.invocationID === event.invocationID)
    if (!outcome) throw new Error("actual native outcome missing")
    expect(outcome.analysisID).toBe(evidence.analysisID)
    expect(outcome.side).toBe(event.side)
    expect(outcome.outcome).toMatchObject({ exitCode: 1, timedOut: false, overflow: false, memoryExceeded: false, failure: undefined })
    expect(outcome.outcome.durationMs).toBeGreaterThanOrEqual(0)
    expect(outcome.outcome.stdout.truncated).toBe(false)
    expect(outcome.outcome.stdout.bytes).toBe(outcome.outcome.stdout.data.byteLength)
    expect(outcome.outcome.stderr).toEqual({ data: Buffer.alloc(0), bytes: 0, truncated: false })
    expect(Buffer.from(outcome.outcome.stdout.data)).toEqual(yield* raw(made, outcome.stdoutURI))
    expect(Buffer.from(event.pathMap)).toEqual(yield* raw(made, outcome.pathMapURI))
    expect(nativeRules(outcome.outcome.stdout.data)).toContain("eslint(no-debugger)")
    expect(text(outcome.outcome.stdout.data)).not.toContain(excluded)
    expect(text(outcome.outcome.stdout.data)).not.toContain("outside/secret.js")
  }
  for (const root of roots) expect(yield* Effect.promise(() => exists(root))).toBe(false)
}), 180_000)

it.live(native
  ? "engagement rejects a real Copied-stage source mutation before observation or native launch"
  : "source-mutation qualification remains an active native-runtime refusal on this host", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repository()
  yield* positive(made, yield* analyze(made))
  const events: Observation[] = []
  const changed: string[] = []
  const result = yield* analyze(made, { evidence: policy(made, "copied-mutation", record(events)) }).pipe(
    Effect.provideService(ReviewOxlintInput.Copied, (input) => Effect.promise(async () => {
      if (path.relative(input.root, input.file).split(path.sep).join("/") !== "src/selected.js") return
      changed.push(input.file)
      await fs.writeFile(input.file, "debugger; // changed after selected bytes were copied\n")
    })),
  )
  if (!native) {
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: unsupported, workspaceExecuted: false })
    expect(changed).toEqual([])
    expect(events.filter((event) => event.phase !== "analysis")).toEqual([])
    return
  }
  expect(changed.length, "real producer seam must mutate its actual projection").toBeGreaterThan(0)
  expect(result.checks).toEqual([{
    id: "oxlint", pack: "oxlint", version: "1.91.0", lane: "no-build", status: "not-run", reason: mismatch, workspaceExecuted: false,
  }])
  expect(events.map((event) => event.phase)).toEqual(["analysis"])
  expect(yield* rawNames(made, result)).toEqual([])
}), 180_000)

it.live(native
  ? "engagement rechecks staged source after an asynchronous prepared observer before native launch"
  : "post-observation mutation qualification remains an active native-runtime refusal on this host", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repository()
  yield* positive(made, yield* analyze(made))
  const events: Observation[] = []
  const selected: string[] = []
  const mutated: string[] = []
  const evidence = policy(made, "observer-mutation", (event) => Effect.gen(function* () {
    events.push(event)
    if (event.phase !== "prepared") return
    const file = selected.at(-1)
    if (!file) throw new Error("real staged input witness missing")
    yield* Effect.promise(async () => {
      expect(await fs.readFile(file)).toEqual(Buffer.from(made.contents["src/selected.js"]))
      await fs.writeFile(file, "debugger; // asynchronously replaced after preparation observation\n")
      mutated.push(file)
    })
  }))
  const result = yield* analyze(made, { evidence }).pipe(
    Effect.provideService(ReviewOxlintInput.Copied, (input) => Effect.sync(() => {
      if (path.relative(input.root, input.file).split(path.sep).join("/") === "src/selected.js") selected.push(input.file)
    })),
  )
  if (!native) {
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: unsupported, workspaceExecuted: false })
    expect(selected).toEqual([])
    expect(mutated).toEqual([])
    expect(events.filter((event) => event.phase !== "analysis")).toEqual([])
    return
  }
  expect(mutated, "the actual preparation callback must complete its asynchronous source mutation").toHaveLength(1)
  expect(result.checks).toEqual([{
    id: "oxlint", pack: "oxlint", version: "1.91.0", lane: "no-build", status: "not-run", reason: mismatch, workspaceExecuted: false,
  }])
  expect(events.map((event) => event.phase)).toEqual(["prepared", "analysis"])
  expect(yield* rawNames(made, result)).toEqual([])
}), 180_000)

it.live("engagement blocks local, build and generic producer branches before raw output", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repository({ "src/check.sh": "#!/bin/sh\nprintf 'selected'\n" })
  const packs = ["shfmt", "tsc", "gitleaks"]
  expect(packs.every((id) => ReviewCatalog.current.packs.some((pack) => pack.id === id))).toBe(true)
  // Existing local-check refusals really write raw evidence even with no tool installed. This witnesses that
  // the old early branch would do work; the engagement barrier must precede it, not just relabel its output.
  const control = yield* analyze(made, { packs: ["shfmt"] })
  expect(control.checks).toHaveLength(1)
  expect(control.checks[0]?.uri).toMatch(/^review:[0-9a-f-]{36}\/raw\/shfmt-check\.json$/)
  expect((yield* rawNames(made, control)).length).toBeGreaterThan(0)
  const events: Observation[] = []
  const result = yield* analyze(made, { packs, lane: "build", changed: {}, evidence: policy(made, "barrier", record(events)) })
  expect(result.checks.map((check) => check.id).sort()).toEqual([...packs].sort())
  for (const check of result.checks) {
    expect(check).toMatchObject({ status: "not-run", reason: unqualified, workspaceExecuted: false })
    expect(check.uri).toBeUndefined()
  }
  expect(yield* rawNames(made, result)).toEqual([])
  expect(events.map((event) => event.phase)).toEqual(["analysis"])
}), 180_000)

it.live("engagement blocks eligible Deep and LSP readers while omission preserves both and ineligible LSP stays absent", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repository()
  const calls = { impact: 0, diagnostics: 0 }
  const impact: typeof ReviewImpactCache.read = (context) => Effect.gen(function* () {
    calls.impact++
    const uri = yield* context.write("impact-control.json", JSON.stringify({ ranges: {}, queries: 0 }))
    return { ranges: {}, check: { id: "repo:blast-radius", pack: "repo", version: "review-v2", lane: "no-build",
      status: "pass" as const, workspaceExecuted: false as const, uri } }
  })
  const diagnostics = () => Effect.sync(() => {
    calls.diagnostics++
    return { status: "pass" as const, workspaceExecuted: true, diagnostics: [], opened: 1, skipped: 0 }
  })
  const request = { packs: [], lane: "build" as const, tier: "deep", changed: { "src/clean.ts": [] } }
  const control = yield* analyze(made, request).pipe(
    Effect.provideService(ReviewAnalyze.ReadImpact, impact), Effect.provideService(ReviewAnalyze.ReadDiagnostics, diagnostics),
  )
  expect(calls).toEqual({ impact: 1, diagnostics: 1 })
  expect(control.checks.map((check) => check.id).sort()).toEqual(["lsp", "repo:blast-radius"])
  expect(control.checks.every((check) => check.status === "pass")).toBe(true)
  const events: Observation[] = []
  const result = yield* analyze(made, { ...request, evidence: policy(made, "side-runners", record(events)) }).pipe(
    Effect.provideService(ReviewAnalyze.ReadImpact, impact), Effect.provideService(ReviewAnalyze.ReadDiagnostics, diagnostics),
  )
  expect(calls, "authority must reject before either reader callback").toEqual({ impact: 1, diagnostics: 1 })
  expect(result.checks.map((check) => check.id).sort()).toEqual(["lsp", "repo:blast-radius"])
  for (const check of result.checks) {
    expect(check).toMatchObject({ status: "not-run", reason: unqualified, workspaceExecuted: false })
    expect(check.uri).toBeUndefined()
  }
  expect(yield* rawNames(made, result)).toEqual([])
  const ineligible = yield* analyze(made, {
    packs: [], tier: "standard", lane: "build", changed: {}, evidence: policy(made, "ineligible", record(events)),
  }).pipe(
    Effect.provideService(ReviewAnalyze.ReadImpact, impact), Effect.provideService(ReviewAnalyze.ReadDiagnostics, diagnostics),
  )
  expect(ineligible.checks).toEqual([])
  expect(calls).toEqual({ impact: 1, diagnostics: 1 })
}), 180_000)

it.live(native
  ? "engagement refuses a missing sandbox without starting real acquisition while the ordinary path remains unchanged"
  : "missing-sandbox qualification is refused before acquisition on an unqualified native host", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repository()
  yield* positive(made, yield* analyze(made))
  const normal = path.join(made.directory, "normal-runtime")
  const missing = path.join(made.directory, "engagement-runtime")
  // Empty artifacts exercise the real resolver/acquire/rename path without downloading or running a fake
  // supervisor. The resulting marker lacks seccomp and therefore can never launch the native analyzer.
  const source = (directory: string): ToolSafetySandboxRuntime.Source => ({ directory, artifacts: [], dependencies: [] })
  if (native) {
    const control = yield* analyze(made).pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, source(normal)))
    expect(control.checks[0]).toMatchObject({ status: "not-run", reason: "sandbox: sandbox-seccomp-unavailable" })
    expect(yield* Effect.promise(() => exists(path.join(normal, ".complete")))).toBe(true)
  }
  const events: Observation[] = []
  const result = yield* analyze(made, { evidence: policy(made, "missing-sandbox", record(events)) }).pipe(
    Effect.provideService(ToolSafetySandboxRuntime.Source, source(missing)),
  )
  expect(result.checks[0]).toMatchObject({
    status: "not-run", reason: native ? "sandbox: sandbox-runtime-not-acquired" : unsupported, workspaceExecuted: false,
  })
  expect(result.checks[0]?.uri).toBeUndefined()
  expect(yield* Effect.promise(() => exists(missing))).toBe(false)
  expect(events.filter((event) => event.phase === "outcome")).toEqual([])
  expect(events.filter((event) => event.phase === "analysis")).toHaveLength(1)
}), 180_000)

it.live(native
  ? "engagement retains the real bounded oxlint overflow outcome without converting truncation into success"
  : "overflow qualification remains an active native-runtime refusal on this host", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* repository()
  yield* positive(made, yield* analyze(made))
  // 250 KiB of valid source stays far below the existing 4 MiB input bound; its 25,000 native diagnostics exceed
  // the actual 1 MiB ResearchProcess capture bound. The real ordinary run must establish overflow first.
  const flood = yield* repository({ "src/flood.js": "debugger;\n".repeat(25_000) })
  const control = yield* analyze(flood)
  const events: Observation[] = []
  if (native) {
    expect(control.checks[0]).toMatchObject({ status: "acquisition-error" })
    expect(control.checks[0]?.reason).toMatch(/^truncated;/)
    expect((yield* raw(flood, control.checks[0]?.uri)).byteLength).toBeLessThanOrEqual(Probe.Limits.outputBytes)
  } else expect(control.checks[0]).toMatchObject({ status: "not-run", reason: unsupported })
  const evidence = policy(flood, "overflow", record(events))
  const result = yield* analyze(flood, { evidence })
  if (!native) {
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: unsupported, workspaceExecuted: false })
    expect(events.map((event) => event.phase)).toEqual(["analysis"])
    return
  }
  expect(result.checks[0]).toMatchObject({ status: "acquisition-error", workspaceExecuted: false })
  expect(result.checks[0]?.reason).toMatch(/^truncated;/)
  expect(events.map((event) => event.phase)).toEqual(["prepared", "outcome", "analysis"])
  const outcome = events.find((event) => event.phase === "outcome")
  const prepared = events.find((event) => event.phase === "prepared")
  if (!outcome || !prepared) throw new Error("bounded native outcome missing")
  expect(outcome.analysisID).toBe(evidence.analysisID)
  expect(outcome.invocationID).toBe(prepared.invocationID)
  expect(outcome.side).toBe("head")
  expect(outcome.outcome.overflow).toBe(true)
  expect(outcome.outcome.stdout.truncated).toBe(true)
  expect(outcome.outcome.stdout.bytes).toBeGreaterThan(Probe.Limits.outputBytes)
  expect(outcome.outcome.stdout.data.byteLength).toBeLessThanOrEqual(Probe.Limits.outputBytes)
  expect(outcome.outcome.stdout.data).toEqual(yield* raw(flood, outcome.stdoutURI))
  expect(result.checks.every((check) => check.status !== "pass")).toBe(true)
  expect(Object.values(result.items).flat()).toEqual([])
  // Timeout, memory termination and malformed native bytes are not claimed by this overflow qualification.
}), 180_000)

it.live("ResearchProcess counts the actual overflowing chunk while retaining only its bounded suffix", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const directory = yield* Effect.acquireRelease(Effect.promise(tmpdir), (made) => Effect.promise(() => made[Symbol.asyncDispose]()))
  const script = path.join(directory.path, "output.ts")
  const config = path.join(directory.path, "empty.toml")
  yield* Effect.promise(() => Promise.all([
    fs.writeFile(config, ""),
    fs.writeFile(script, "process.stdout.write('x'.repeat(Number(process.argv[2])))\n"),
  ]))
  const run = (bytes: number) => ResearchProcess.run({
    command: process.execPath, args: ["--no-env-file", `--config=${config}`, script, String(bytes)], cwd: directory.path,
    env: ResearchProcess.environment(), timeoutMs: 15_000, maxBytes: 1024,
  })
  const positive = yield* run(13)
  expect(positive).toMatchObject({ exitCode: 0, overflow: false, timedOut: false, memoryExceeded: false, failure: undefined })
  expect(positive.stdout).toEqual({ bytes: 13, data: Buffer.from("x".repeat(13)), truncated: false })
  const overflow = yield* run(16 * 1024)
  expect(overflow).toMatchObject({ overflow: true, timedOut: false, memoryExceeded: false, failure: undefined })
  expect(overflow.stdout.bytes, "bytes actually received must include the chunk that crossed the bound").toBeGreaterThan(1024)
  expect(overflow.stdout.bytes).toBeLessThanOrEqual(16 * 1024)
  expect(overflow.stdout.truncated).toBe(true)
  expect(overflow.stdout.data).toEqual(Buffer.from("x".repeat(1024)))
  // The observed count does not claim bytes the process might have produced after it was stopped.
}), 60_000)

function repository(extra: Record<string, string> = {}) {
  return Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(Effect.promise(tmpdir), (made) => Effect.promise(() => made[Symbol.asyncDispose]()))
    const root = path.join(directory.path, "repo")
    const store = path.join(directory.path, "store")
    const contents: Record<string, string> = {
      "src/selected.js": "debugger;\n",
      "src/clean.ts": "export const clean = 'café'\n",
      "src/.oxlintrc.json": JSON.stringify({ rules: { "no-debugger": "off" }, marker: hostile }),
      ".oxlintrc.json": JSON.stringify({ rules: { "no-debugger": "off" }, marker: hostile }),
      "outside/secret.js": `debugger;\nexport const secret = '${excluded}'\n`,
      ...extra,
    }
    yield* Effect.promise(async () => {
      await fs.mkdir(root, { recursive: true })
      await fs.mkdir(store, { recursive: true })
      await Promise.all(Object.entries(contents).map(async ([file, body]) => {
        await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
        await fs.writeFile(path.join(root, file), body)
      }))
    })
    for (const args of [["init", "-q"], ["config", "user.email", "evidence@example.com"], ["config", "user.name", "Evidence"],
      ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"], ["add", "--", "."], ["commit", "-q", "-m", "capture"]])
      yield* ResearchProcess.git(root, args)
    const commit = (yield* ResearchProcess.git(root, ["rev-parse", "HEAD"])).toString("utf8").trim()
    const entries = (yield* ResearchProcess.git(root, ["ls-tree", "-r", "-l", "-z", commit])).toString("utf8").split("\0").filter(Boolean)
    const files = entries.flatMap((entry): File[] => {
      const match = /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64}) +(\d+)\t(.+)$/.exec(entry)
      if (!match) throw new Error(`unexpected captured fixture entry: ${entry}`)
      const mode = match[1]
      if (mode !== "100644" && mode !== "100755") throw new Error("unexpected fixture file mode")
      return match[4].startsWith("src/") ? [{ path: match[4], oid: match[2], mode, size: Number(match[3]) }] : []
    }).sort((a, b) => a.path.localeCompare(b.path))
    return { directory: directory.path, root, store, commit, contents, source: { sha256: hash(JSON.stringify({ commit, files })), files } }
  })
}

type Repository = Effect.Success<ReturnType<typeof repository>>

function analyze(made: Repository, extra: Partial<ReviewAnalyze.RunInput> & { readonly evidence?: Evidence } = {}) {
  const toolkit = suite.toolkit
  if (!toolkit) throw new Error("owner preparation did not run")
  const request = {
    worktree: made.root, base: made.commit, head: made.commit, tier: "standard", profile: "audit", store: made.store,
    changed: {}, trusted: true, lane: "no-build" as const, packs: ["oxlint"], scope: "files" as const,
    repositoryFiles: made.source.files.map((file) => file.path), files: made.source.files.map((file) => file.path),
    ...extra,
  }
  return ReviewAnalyze.run(request).pipe(Effect.provideService(BackendToolkit.Root, toolkit))
}

function policy(made: Repository, id: string, observe: Evidence["observe"]): Evidence {
  return { analysisID: hash(`${made.source.sha256}:${id}`), source: made.source, observe }
}

const record = (events: Observation[]): Evidence["observe"] => (event) => Effect.sync(() => { events.push(event) })

function positive(made: Repository, result: Result) {
  return Effect.gen(function* () {
    if (!native) {
      expect(result.checks).toEqual([{
        id: "oxlint", pack: "oxlint", version: "1.91.0", lane: "no-build", status: "not-run", reason: unsupported, workspaceExecuted: false,
      }])
      expect(yield* rawNames(made, result)).toEqual([])
      return
    }
    expect(result.checks[0], "conformance-missing: actual pinned oxlint diagnostic").toMatchObject({
      pack: "oxlint", version: "1.91.0", status: "fail", workspaceExecuted: false,
    })
    expect(nativeRules(yield* raw(made, result.checks[0]?.uri))).toContain("eslint(no-debugger)")
    expect(Object.values(result.items).flat().some((item) => item.path === "src/selected.js" && item.rule === "eslint(no-debugger)")).toBe(true)
  })
}

const nativeReport = Schema.Struct({ runs: Schema.Array(Schema.Struct({ results: Schema.optional(Schema.Array(Schema.Struct({ ruleId: Schema.String }))) })) })
function nativeRules(bytes: Uint8Array) {
  const decoded = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(text(bytes))
  return Schema.decodeUnknownSync(nativeReport)(decoded).runs.flatMap((run) => (run.results ?? []).map((result) => result.ruleId))
}

function raw(made: Repository, uri: string | undefined) {
  const match = /^review:([0-9a-f-]{36})\/(retained\.json|debt\.json|raw\/[a-z0-9-]+\.(?:json|sarif))$/.exec(uri ?? "")
  if (!match) throw new Error(`fixture raw reference missing: ${uri}`)
  return Effect.promise(() => fs.readFile(path.join(made.store, match[1], match[2])))
}

function rawNames(made: Repository, result: Result) {
  const match = /^review:([0-9a-f-]{36})\/retained\.json$/.exec(result.retained.uri)
  if (!match) throw new Error("fixture retained reference missing")
  return Effect.promise(() => fs.readdir(path.join(made.store, match[1], "raw")).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []
    throw error
  }))
}

const exists = (file: string) => fs.lstat(file).then(() => true, (error: unknown) => {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
  throw error
})

const blobOID = (bytes: Uint8Array, oid: string) => createHash(oid.length === 64 ? "sha256" : "sha1")
  .update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex")
