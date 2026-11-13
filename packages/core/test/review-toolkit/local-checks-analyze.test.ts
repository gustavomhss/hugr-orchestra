import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewLocalCheckCards } from "../../src/review/catalog/local-checks"
import { ReviewLocalCheckScope } from "../../src/review-toolkit/local-check-scope"
import { ReviewLocalCheckEvidence } from "../../src/review-toolkit/local-check-evidence"
import { ReviewLocalChecksAnalyze } from "../../src/review-toolkit/local-checks-analyze"
import { ReviewLocalTools } from "../../src/review-toolkit/local-tools"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
import { FileDigests } from "../fixture/file-digests"
import { git } from "../fixture/git"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const POLICY_PATH = ReviewLocalCheckScope.POLICY_PATH
const BASE_POLICY = JSON.stringify({ version: 1, shfmt: { indent: 2, language: "bash" }, cargoMachete: { enabled: true } })
const HEAD_POLICY = JSON.stringify({ version: 1, shfmt: { indent: 8, language: "bash" }, cargoMachete: { enabled: false } })
const CARGO = '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nanyhow="1"\n'
const OUTSIDE_CARGO = '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n[lib]\npath="../outside.rs"\n'
const SHADOW_CARGO = '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n[lib]\npath="target/lib.rs"\n[dependencies]\nanyhow="1"\n'
const held = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
const files = (script: string, rust: string, policy: string, manifest = CARGO, shadow = false) => ({ [POLICY_PATH]: policy, ".editorconfig": "root=true\n[*]\nindent_style=space\nindent_size=8\n", "selected.sh": script, ...(shadow ? { "package.json": "{}\n", ".gitignore": "/target/\n" } : {}), "Cargo.toml": manifest, "src/lib.rs": rust })
const writeFiles = async (root: string, values: Record<string, string>) => {
  for (const [file, text] of Object.entries(values)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), text)
  }
}
const makeRepo = (parent: string, name: string, headScript: string, headRust: string, manifest = CARGO, shadow = false) => Effect.promise(async () => {
  const root = path.join(parent, name)
  await mkdir(root, { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "review@example.com")
  await git(root, "config", "user.name", "Review")
  await writeFiles(root, files("if true; then\n  echo base\nfi\n", "pub fn ok(){}\n", BASE_POLICY, manifest, shadow))
  await git(root, "add", "-A"); await git(root, "commit", "-q", "-m", "base"); await git(root, "tag", "base")
  await writeFiles(root, files(headScript, headRust, HEAD_POLICY, manifest, shadow))
  await git(root, "add", "-A"); await git(root, "commit", "-q", "-m", "head"); await git(root, "tag", "head")
  if (shadow) await writeFiles(root, { "target/lib.rs": "pub fn target(){}\n" })
  return root
})
const cards = [ReviewLocalCheckCards.shfmt.pack, ReviewLocalCheckCards.cargoMachete.pack]
const catalog: ReviewCatalog.Catalog = { ...ReviewCatalog.current, packs: [...ReviewCatalog.current.packs.filter((pack) => !cards.some((card) => card.id === pack.id)), ...cards] }
const input = (worktree: string, store: string, packs: readonly string[], files: readonly string[], scope: "diff" | "files" = "diff"): ReviewAnalyze.RunInput => ({
  worktree, base: "base", head: "head", tier: "standard", store, changed: scope === "diff" ? Object.fromEntries(files.map((file) => [file, [{ start: 0, end: 1 }]])) : {}, trusted: true, lane: "no-build", packs, scope, files, catalog,
})
const checkFor = (result: { checks: ReviewAnalyze.Check[] }, id: string) => {
  const check = result.checks.find((entry) => entry.id === id)
  if (!check) throw new Error(`missing check ${id}`)
  return check
}
const evidenceFor = (store: string, check: ReviewAnalyze.Check) => Effect.promise(async () => {
  if (!check.uri) throw new Error(`missing raw evidence for ${check.id}`)
  return JSON.parse(await readFile(path.join(store, check.uri.slice("review:".length)), "utf8")) as ReviewLocalCheckEvidence.Evidence
})
const checkEvidence = (evidence: ReviewLocalCheckEvidence.Evidence, tool: "shfmt" | "cargo-machete", files: readonly string[], policySha: string, status: ReviewAnalyze.Status, nativeOutcomePresent = true, excluded: readonly string[] = [], omitted: readonly string[] = [], trusted = true) => {
  expect(evidence).toMatchObject({ version: 1, tool, status, request: { scope: "diff", lane: "no-build", trusted, tier: "standard", files, count: files.length, omitted: 0, budgetExceeded: false } })
  expect(Object.keys(evidence.request).sort()).toEqual(["budgetExceeded", "count", "files", "lane", "omitted", "scope", "tier", "trusted"])
  expect(evidence.base?.root).not.toBe(evidence.head?.root)
  expect(evidence.base?.source.kind).toBe("commit"); expect(evidence.head?.source.kind).toBe("commit")
  expect(evidence.base?.source.revision).not.toBe(evidence.head?.source.revision)
  expect(evidence.base?.source.digest).not.toBe(evidence.head?.source.digest)
  expect(evidence.base?.digest).not.toBe(evidence.head?.digest)
  expect(evidence.base?.files).toBeGreaterThan(0); expect(evidence.head?.files).toBeGreaterThan(0)
  expect(evidence.base?.excluded).toEqual(excluded); expect(evidence.head?.excluded).toEqual(excluded)
  if (!evidence.base || !evidence.head) throw new Error("native check evidence omitted captured projections")
  expect(evidence.policy).toEqual({ path: POLICY_PATH, sha256: policySha, baseProjectionDigest: evidence.base.digest })
  expect(evidence.coverage).toMatchObject({ kind: evidence.selection?.coverage, planned: evidence.selection?.files, omitted, perFileCompletion: "not-established", newOnly: false })
  expect(evidence.coverage.caveats).toContain("Native coverage is reported at the tool level.")
  expect(evidence.coverage.caveats).toContain(tool === "shfmt" ? "Formatting checks cover whole selected files." : "Workspace analysis respects native manifest ignore metadata.")
  expect(evidence.execution).toEqual({ adapterInvoked: true, nativeOutcomePresent, checkCompleted: status === "pass" || status === "fail" })
  expect(evidence.native !== undefined).toBe(nativeOutcomePresent)
  if (evidence.native) {
    expect(evidence.native.failure?.length ?? 0).toBeLessThanOrEqual(8192)
    expect(evidence.native.failureTruncated).toBe(false)
    expect(evidence.native.durationMs).toBeGreaterThanOrEqual(0)
    expect(evidence.native.timedOut).toBe(false); expect(evidence.native.overflow).toBe(false); expect(evidence.native.memoryExceeded).toBe(false)
    expect(evidence.native.exitCode).not.toBeNull()
    for (const stream of [evidence.native.stdout, evidence.native.stderr]) {
      expect(stream.encoding).toBe("base64")
      expect(stream.utf8Valid).toBe(true)
      expect(stream.retainedBytes).toBeLessThanOrEqual(256 * 1024)
      expect(stream.observedBytes).toBeGreaterThanOrEqual(stream.retainedBytes)
      expect(Buffer.from(stream.data, "base64").length).toBe(stream.retainedBytes)
    }
  }
}

it.live.skipIf(process.platform !== "linux" || process.arch !== "x64")("routes pinned local checks through raw evidence without creating findings", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  yield* ToolSafetySandboxRuntime.ready()
  const temp = yield* held()
  const toolRoot = path.join(temp.path, "tools")
  const prepared = yield* Effect.forEach(["shfmt", "cargo-machete"] as const, (tool) => ReviewLocalTools.prepare(tool).pipe(Effect.provideService(ReviewLocalTools.Root, toolRoot)), { concurrency: 1 })
  for (const result of prepared) if (!result.ok) throw new Error(result.reason)
  expect(prepared.map((result) => result.ok && [result.identity.id, result.identity.version, result.identity.target])).toEqual([["shfmt", "3.14.1", "linux-x64"], ["cargo-machete", "0.9.2", "linux-x64"]])
  const policySha = createHash("sha256").update(BASE_POLICY).digest("hex")
  const cases = [
    { name: "mixed", script: "if true; then\n  echo ok\nfi\n", rust: "use anyhow::Result;\npub fn ok()->Result<()>{Ok(())}\n", manifest: CARGO, shadow: false, excluded: [], native: true, packs: ["shfmt", "shfmt", "cargo-machete", "cargo-machete", "repo", "repo"], files: ["selected.sh", "Cargo.toml", "src/lib.rs"], expected: [["shfmt", "pass", "native-clean"], ["cargo-machete", "pass", "native-clean"]] },
    { name: "format-diff", script: "if true;then\necho ok\nfi\n", rust: "pub fn ok(){}\n", manifest: CARGO, shadow: false, excluded: [], native: true, packs: ["shfmt"], files: ["selected.sh"], expected: [["shfmt", "fail", "native-format-difference"]] },
    { name: "syntax", script: "if ; then\n", rust: "pub fn ok(){}\n", manifest: CARGO, shadow: false, excluded: [], native: true, packs: ["shfmt"], files: ["selected.sh"], expected: [["shfmt", "acquisition-error", "local-check-native-error"]] },
    { name: "unused", script: "if true; then\n  echo ok\nfi\n", rust: "pub fn ok(){}\n", manifest: CARGO, shadow: false, excluded: [], native: true, packs: ["cargo-machete"], files: ["Cargo.toml", "src/lib.rs"], expected: [["cargo-machete", "fail", "native-unused-dependencies"]] },
    { name: "outside", script: "if true; then\n  echo ok\nfi\n", rust: "pub fn ok(){}\n", manifest: OUTSIDE_CARGO, shadow: false, excluded: [], native: false, packs: ["cargo-machete"], files: ["Cargo.toml", "src/lib.rs"], expected: [["cargo-machete", "not-run", "cargo-path-outside"]] },
    { name: "shadow", script: "if true; then\n  echo ok\nfi\n", rust: "pub fn ok(){}\n", manifest: SHADOW_CARGO, shadow: true, excluded: ["target"], native: false, packs: ["cargo-machete"], files: ["Cargo.toml", "src/lib.rs"], expected: [["cargo-machete", "not-run", "cargo-path-missing"]] },
  ] as const
  for (const scenario of cases) {
    if (scenario.name === "outside") yield* Effect.promise(() => writeFiles(temp.path, { "outside.rs": "pub fn outside(){}\n" }))
    const root = yield* makeRepo(temp.path, scenario.name, scenario.script, scenario.rust, scenario.manifest, scenario.shadow)
    const store = path.join(temp.path, `${scenario.name}-store`)
    yield* Effect.promise(() => mkdir(store, { recursive: true }))
    const before = yield* Effect.promise(() => FileDigests.capture(root))
    const selected = input(root, store, scenario.packs, scenario.files)
    const analyzed = ReviewAnalyze.run(scenario.name === "mixed" ? { ...selected, files: ["decoy.sh"], trusted: false } : selected).pipe(Effect.provideService(ReviewLocalTools.Root, toolRoot))
    const result = yield* (scenario.name === "format-diff" ? analyzed.pipe(Effect.provide(LayerNode.compile(FSUtil.node))) : analyzed)
    expect(Object.values(result.items).flat()).toEqual([])
    for (const [id, status, reason] of scenario.expected) {
      const check = checkFor(result, id)
      expect([check.status, check.reason, check.workspaceExecuted]).toEqual([status, reason, false])
      const evidence = yield* evidenceFor(store, check)
      checkEvidence(evidence, id as "shfmt" | "cargo-machete", scenario.files, policySha, status as ReviewAnalyze.Status, scenario.native, scenario.excluded, id === "shfmt" ? scenario.files.filter((file) => !file.endsWith(".sh")) : [], scenario.name !== "mixed")
      expect(check.uri).toMatch(new RegExp(`^review:[0-9a-f-]{36}/raw/${id}-check\\.json$`))
      expect(evidence.selection?.policySha256).toBe(policySha)
      const actual = prepared.find((entry) => entry.ok && entry.identity.id === id)
      if (!actual?.ok) throw new Error(`missing prepared identity ${id}`)
      expect(evidence.identity).toEqual(actual.identity)
      if (id === "shfmt") expect(evidence.selection?.flags).toEqual(["-d", "-i", "2", "-ln", "bash", "--"])
      if (id === "cargo-machete") expect(evidence.selection?.flags).toEqual(["--no-ignore", "."])
    }
    if (scenario.name === "mixed") {
      expect(catalog.packs.some((pack) => pack.id === "repo")).toBe(true)
      expect(result.checks.filter((entry) => entry.id === "shfmt")).toHaveLength(1)
      expect(result.checks.filter((entry) => entry.id === "cargo-machete")).toHaveLength(1)
      expect(result.checks.filter((entry) => ["shfmt", "cargo-machete", "repo"].includes(entry.id)).map((entry) => entry.id)).toEqual(["shfmt", "cargo-machete", "repo", "repo"])
      expect(result.checks.filter((entry) => entry.id === "repo")).toHaveLength(2)
      expect(result.checks.filter((entry) => entry.id === "repo").every((entry) => entry.status === "not-run" && entry.reason === "lane: repo is above no-build")).toBe(true)
    }
    expect(yield* Effect.promise(() => FileDigests.capture(root))).toEqual(before)
  }
}), 900_000)

it.live.skipIf(process.platform !== "linux" || process.arch !== "x64")("preparation stays explicit and files scope never widens Cargo", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const temp = yield* held()
  const root = yield* makeRepo(temp.path, "refusals", "if true; then\n  echo ok\nfi\n", "pub fn ok(){}\n")
  const store = path.join(temp.path, "store")
  const emptyRoot = path.join(temp.path, "private-tools")
  yield* Effect.promise(() => mkdir(store, { recursive: true })); yield* Effect.promise(() => mkdir(emptyRoot, { recursive: true }))
  const beforeTools = yield* Effect.promise(() => FileDigests.capture(emptyRoot))
  const unprepared = yield* ReviewAnalyze.run(input(root, store, ["shfmt"], ["selected.sh"])).pipe(Effect.provideService(ReviewLocalTools.Root, emptyRoot))
  const unavailable = checkFor(unprepared, "shfmt")
  expect(unavailable).toMatchObject({ status: "not-run", reason: "host-tool-unavailable", workspaceExecuted: false })
  expect((yield* evidenceFor(store, unavailable)).reason).toBe("host-tool-unavailable")
  expect(yield* Effect.promise(() => FileDigests.capture(emptyRoot))).toEqual(beforeTools)
  const filesOnly = yield* ReviewAnalyze.run(input(root, store, ["cargo-machete"], ["Cargo.toml"], "files"))
  const refused = checkFor(filesOnly, "cargo-machete")
  expect(refused).toMatchObject({ status: "not-run", reason: "scope-workspace-required", workspaceExecuted: false })
  expect((yield* evidenceFor(store, refused)).reason).toBe("scope-workspace-required")
}), 300_000)

it.live.skipIf(process.platform !== "linux" || process.arch !== "x64")("pre-copy guards refuse with citable evidence and never yield poisoned copies", () => Effect.gen(function* () {
  const temp = yield* held()
  const root = path.join(temp.path, "guards")
  yield* Effect.promise(() => mkdir(root, { recursive: true }))
  const store = path.join(temp.path, "guard-store")
  const poison = Effect.die(new Error("pre-copy guard yielded a copy"))
  const runGuard = (name: string, pack: ReviewAnalyze.Pack, overrides: Partial<ReviewAnalyze.RunInput>, reason: string, withRule = false, restricted = false) => Effect.gen(function* () {
    const id = `guard-${name}`
    yield* Effect.promise(() => mkdir(path.join(store, id, "raw"), { recursive: true }))
    const rawRule: ReviewCatalog.Catalog["rules"][number] = { pack: "shfmt", rule: "raw-id", class: "logic.invariant", lens: "correctness-logic", severity: { "*": "P2" }, triage: "raw native checks have no per-rule filter", status: "active" }
    const selectedCatalog = withRule ? { ...catalog, rules: [...catalog.rules, rawRule] } : catalog
    const request = { ...input(root, store, [pack.id], ["Cargo.toml"]), ...overrides, catalog: selectedCatalog }
    const context: ReviewAnalyze.RunContext = { input: request, catalog: selectedCatalog, write: (file, text) => Effect.promise(() => Bun.write(path.join(store, id, file), text)).pipe(Effect.as(`review:${id}/${file}`)), head: poison, base: poison }
    const effect = Effect.scoped(ReviewLocalChecksAnalyze.run(pack, context))
    const result = yield* (restricted ? effect.pipe(Effect.provideService(ReviewLocalChecksAnalyze.Supervision, false)) : effect)
    const check = result.checks[0]
    expect([check.status, check.reason, check.workspaceExecuted]).toEqual(["not-run", reason, false])
    expect(check.uri).toBe(`review:${id}/raw/shfmt-check.json`)
    expect(result.head).toEqual([]); expect(result.base).toEqual([])
    const evidence = yield* evidenceFor(store, check)
    expect([evidence.status, evidence.reason]).toEqual(["not-run", reason])
    if (name === "budget") expect(evidence.request).toMatchObject({ files: [], count: ReviewScanProjection.DEFAULTS.maxEntries + 1, omitted: ReviewScanProjection.DEFAULTS.maxEntries + 1, budgetExceeded: true })
  })
  const shfmt = ReviewLocalCheckCards.shfmt.pack as ReviewAnalyze.Pack
  const oversized = Object.fromEntries(Array.from({ length: ReviewScanProjection.DEFAULTS.maxEntries + 1 }, (_, i) => [`file${i}.sh`, [{ start: 1, end: 1 }]]))
  yield* runGuard("budget", shfmt, { files: ["decoy.sh"], changed: oversized }, "local-check-input-budget")
  yield* runGuard("dropped", { ...shfmt, status: "dropped" } as ReviewAnalyze.Pack, {}, "dropped")
  yield* runGuard("rules", shfmt, {}, "local-check-rules-unsupported", true)
  yield* runGuard("metadata", { ...shfmt, version: "changed" }, {}, "local-check-pack-mismatch")
  const altered: ReadonlyArray<ReviewAnalyze.Pack> = [{ ...shfmt, id: "misnamed" }, { ...shfmt, backend: "path" }, { ...shfmt, output: { format: "json", parser: "wrong" } }, { ...shfmt, pin: { source: ReviewLocalCheckCards.shfmt.pack.pin.source, integrity: { "linux-x64": "sha256-wrong" } } }, { ...shfmt, network: { kind: "offline-db", database: "wrong" } }, { ...shfmt, scratchWrites: true }]
  yield* Effect.forEach(altered, (pack, i) => runGuard(`metadata-${i}`, pack, {}, "local-check-pack-mismatch"), { discard: true })
  yield* runGuard("metadata-lane", { ...shfmt, lane: "repo" }, { lane: "build" }, "local-check-pack-mismatch")
  yield* runGuard("lane", { ...shfmt, lane: "repo" } as ReviewAnalyze.Pack, { lane: "no-build" }, "lane: repo is above no-build")
  yield* runGuard("scope-path", shfmt, { scope: "files", files: ["../outside.sh"] }, "path-outside")
  yield* runGuard("scope-nul", shfmt, { scope: "files", files: ["nul\0.sh"] }, "nul")
  yield* runGuard("supervision", shfmt, {}, "read-supervisor-unavailable", false, true)
  const unknown = { ...shfmt, template: "unknown-template" }
  const unknownContext: ReviewAnalyze.RunContext = { input: input(root, store, [unknown.id], []), catalog, head: poison, base: poison, write: () => Effect.die(new Error("unknown template wrote an artifact")) }
  const absent = yield* Effect.scoped(ReviewLocalChecksAnalyze.run(unknown, unknownContext))
  expect(absent.checks[0]).toMatchObject({ status: "not-run", reason: "local-check-template-unknown", workspaceExecuted: false })
  expect(absent.checks[0].uri).toBeUndefined()
}), 300_000)

it.live.skipIf(process.platform !== "win32")("Windows refuses local analysis before projections or acquisition", () => Effect.gen(function* () {
  const temp = yield* held()
  const store = path.join(temp.path, "store")
  yield* Effect.promise(() => mkdir(path.join(store, "win", "raw"), { recursive: true }))
  const pack = ReviewLocalCheckCards.shfmt.pack as ReviewAnalyze.Pack
  const input: ReviewAnalyze.RunInput = { worktree: temp.path, base: "base", head: "head", tier: "standard", store, changed: {}, trusted: true, lane: "no-build", packs: [pack.id], scope: "diff", files: ["selected.sh"], catalog }
  const poison = Effect.die(new Error("unsupported host yielded a copy"))
  const context: ReviewAnalyze.RunContext = { input, catalog, write: (file, text) => Effect.promise(() => Bun.write(path.join(store, "win", file), text)).pipe(Effect.as(`review:win/${file}`)), head: poison, base: poison }
  const outcome = yield* Effect.scoped(ReviewLocalChecksAnalyze.run(pack, context))
  const check = outcome.checks[0]
  expect(check).toMatchObject({ status: "not-run", reason: "read-sandbox-unsupported-host", workspaceExecuted: false, uri: "review:win/raw/shfmt-check.json" })
  const evidence = yield* evidenceFor(store, check)
  expect(evidence).toMatchObject({ status: "not-run", reason: "read-sandbox-unsupported-host", execution: { adapterInvoked: false, nativeOutcomePresent: false, checkCompleted: false } })
  expect(outcome.head).toEqual([]); expect(outcome.base).toEqual([])
}), 300_000)
