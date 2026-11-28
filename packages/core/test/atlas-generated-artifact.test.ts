import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Exit } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { AppProcess } from "@orchestra/core/process"
import type { AtlasBinding } from "@orchestra/atlas-boundary/native-memory"
import { isAtlasGeneratedRequest } from "./fixture/atlas-generated-request"
import { expectSpawn } from "./fixture/omni-expect"

const root = path.resolve(import.meta.dir, "../../..")
const boundary = path.join(root, "modules/atlas/boundary")
const artifact = path.join(root, "test-ci-evidence/atlas-generated")
const generated = ["boundary", "materialize", "native-header", "native-memory", "surface", "mine", "context", "record", "record-log"]
  .flatMap((name) => [`src/generated/${name}.js`, `src/generated/${name}.d.ts`]).sort()
const request = readRequest()

type FileHash = { path: string; sha256: string; bytes: number }
type CommandOutcome = {
  stage: string
  program: string
  args: readonly string[]
  cwd: string
  budgetMs: number
  started: string
  finished?: string
  status: "running" | "completed" | "failed"
  exitCode: number | null
  stdoutTruncated?: boolean
  stderrTruncated?: boolean
  outputTruncated?: boolean
  stdoutBytes?: number
  stderrBytes?: number
  stdoutSHA256?: string
  stderrSHA256?: string
  failureReasons?: readonly string[]
}
type Provenance = {
  version: 1
  qualified: boolean
  stage: string
  snapshot: string | undefined
  runID: string | undefined
  runAttempt: string | undefined
  platform: string
  arch: string
  request: unknown
  testBudgetMs: number
  commands: CommandOutcome[]
  runtimes: { bunRuntime: string; bunNodeCompatibility: string; bunCLI?: string; nodeCLI?: string }
  generatorSHA256?: string
  locks?: FileHash[]
  sources?: FileHash[]
  before?: FileHash[]
  first?: FileHash[]
  second?: FileHash[]
  generatedDiffIdentity?: string
  artifactFiles?: FileHash[]
  installed?: { module: string; decisionId: string; ref: { contentHash: string; eventId: string };
    receiptSHA256: string; scansBeforeRetry: number; scansAfterRetry: number; refusal: string }
  cleanupJoined?: boolean
  elapsedMsBeforeQualification?: number
  failure?: { stage: string; reasons: readonly string[] }
}

// Full Core and ordinary filters must never regenerate installed files. The selected request must fail,
// rather than skip, if its hosted identity or platform is missing.
test.skipIf(!isAtlasGeneratedRequest(request))("official Atlas producer and installed Memory qualify one generated artifact", async () => {
  expectSpawn(import.meta.path)
  const started = performance.now()
  const proof: Provenance = {
    version: 1, qualified: false, stage: "hosted-setup", snapshot: process.env.GITHUB_SHA,
    runID: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    platform: process.platform, arch: process.arch, request, testBudgetMs: 900_000, commands: [],
    runtimes: { bunRuntime: Bun.version, bunNodeCompatibility: process.versions.node },
  }
  // Exclusive creation refuses stale evidence rather than including unrelated pre-existing files.
  await mkdir(artifact)
  const persist = () => writeFile(path.join(artifact, "provenance.json"), JSON.stringify(proof, null, 2) + "\n")
  await persist()
  const program = Effect.gen(function* () {
    expect(process.platform).toBe("linux")
    expect(process.env.RUNNER_OS).toBe("Linux")
    expect(process.env.CI).toBe("true")
    expect(proof.snapshot).toMatch(/^[a-f0-9]{40}$/)
    if (typeof proof.snapshot !== "string") return yield* Effect.die(new Error("Missing hosted snapshot identity"))
    expect(proof.runID).toMatch(/^[1-9][0-9]*$/)
    expect(proof.runAttempt).toMatch(/^[1-9][0-9]*$/)
    const proc = yield* AppProcess.Service
    const command = (stage: string, program: string, args: readonly string[], cwd: string, budgetMs = 240_000) => Effect.gen(function* () {
      proof.stage = stage
      const index = proof.commands.length
      const pending: CommandOutcome = { stage, program, args, cwd: path.relative(root, cwd) || ".", budgetMs,
        started: new Date().toISOString(), exitCode: null, status: "running" }
      proof.commands.push(pending)
      yield* Effect.promise(persist)
      const outcome = yield* proc.run(ChildProcess.make(program, args, { cwd }), {
        timeout: budgetMs, maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 4 * 1024 * 1024,
      }).pipe(Effect.exit)
      if (Exit.isFailure(outcome)) {
        proof.commands[index] = { ...pending, status: "failed", finished: new Date().toISOString(),
          failureReasons: outcome.cause.reasons.map((reason) => reason._tag) }
        yield* Effect.promise(persist)
        return yield* Effect.failCause(outcome.cause)
      }
      proof.commands[index] = { ...pending, status: "completed",
        finished: new Date().toISOString(), exitCode: outcome.value.exitCode,
        stdoutTruncated: outcome.value.stdoutTruncated, stderrTruncated: outcome.value.stderrTruncated,
        outputTruncated: outcome.value.outputTruncated ?? false,
        stdoutBytes: outcome.value.stdout.byteLength, stderrBytes: outcome.value.stderr.byteLength,
        stdoutSHA256: digest(outcome.value.stdout), stderrSHA256: digest(outcome.value.stderr) }
      yield* Effect.promise(persist)
      expect(outcome.value.stdoutTruncated).toBe(false)
      expect(outcome.value.stderrTruncated).toBe(false)
      expect(outcome.value.outputTruncated ?? false).toBe(false)
      expect(outcome.value.exitCode, `${stage}: ${outcome.value.stderr.toString("utf8").slice(0, 16_384)}`).toBe(0)
      return outcome.value
    })
    const head = yield* command("snapshot", "git", ["rev-parse", "HEAD"], root, 15_000)
    expect(head.stdout.toString("utf8").trim()).toBe(proof.snapshot)
    const bun = yield* command("bun-runtime", process.execPath, ["--version"], root, 15_000)
    proof.runtimes.bunCLI = bun.stdout.toString("utf8").trim()
    const node = yield* command("node-runtime", "node", ["--version"], root, 15_000)
    proof.runtimes.nodeCLI = node.stdout.toString("utf8").trim()
    expect(proof.runtimes.bunCLI).toBe(Bun.version)
    expect(proof.runtimes.nodeCLI).toMatch(/^v[0-9]+\.[0-9]+\.[0-9]+$/)
    const tracked = yield* command("source-manifest", "git", ["ls-files", "-z", "--", "modules/atlas/packages"], root, 15_000)
    const sourceFiles = [...tracked.stdout.toString("utf8").split("\0").filter((file) => file.includes("/src/")),
      "modules/atlas/boundary/script/build.ts", "modules/atlas/boundary/script/tsconfig.json", "modules/atlas/boundary/package.json"].sort()
    expect(sourceFiles.length).toBeGreaterThan(100)
    proof.sources = yield* Effect.promise(() => hashes(root, sourceFiles))
    proof.generatorSHA256 = proof.sources.find((file) => file.path === "modules/atlas/boundary/script/build.ts")!.sha256
    const lockFiles = ["bun.lock", "modules/atlas/package-lock.json"]
    proof.locks = yield* Effect.promise(() => hashes(root, lockFiles))
    proof.before = yield* Effect.promise(() => hashes(boundary, generated))
    yield* command("generate-first", process.execPath, ["run", "generate"], boundary)
    proof.first = yield* Effect.promise(() => hashes(boundary, generated))
    yield* Effect.promise(persist)
    yield* command("generate-second", process.execPath, ["run", "generate"], boundary)
    proof.second = yield* Effect.promise(() => hashes(boundary, generated))
    proof.generatedDiffIdentity = digest(JSON.stringify({ before: vector(proof.before), after: vector(proof.second) }))
    yield* Effect.promise(persist)
    expect(proof.first).toEqual(proof.second)
    yield* command("check-generated", process.execPath, ["run", "check:generated"], boundary)
    expect(yield* Effect.promise(() => hashes(boundary, generated))).toEqual(proof.second)
    proof.stage = "installed-import"
    yield* Effect.promise(persist)
    const resolved = yield* Effect.promise(() => realpath(fileURLToPath(import.meta.resolve("@orchestra/atlas-boundary/native-memory"))))
    expect(resolved).toBe(yield* Effect.promise(() => realpath(path.join(boundary, "src/generated/native-memory.js"))))
    const installed = yield* Effect.promise(() => import("@orchestra/atlas-boundary/native-memory"))
    expect(typeof installed.createNativeMemory).toBe("function")
    expect(typeof installed.proposeProjectRule).toBe("function")
    expect(typeof installed.decideProjectRule).toBe("function")
    yield* Effect.scoped(Effect.gen(function* () {
      const repo = yield* Effect.acquireRelease(Effect.promise(() => mkdtemp(path.join(tmpdir(), "atlas-installed-artifact-"))),
        (owned) => Effect.promise(() => rm(owned, { recursive: true, force: true })))
      const blocked = path.join(repo, "scanner-blocked")
      const scans = path.join(repo, "scans")
      const scanner = path.join(repo, "controlled-gitleaks")
      yield* Effect.promise(() => writeFile(scanner, `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
/bin/cat >/dev/null || exit 1
printf 'scan\\n' >> ${quote(scans)} || exit 1
if [ -f ${quote(blocked)} ]; then exit 1; fi
exit 0
`))
      yield* Effect.promise(() => chmod(scanner, 0o755))
      const binding: AtlasBinding = {
        storage: { projectID: "artifact-project", root: repo }, source: { worktree: repo, revision: proof.snapshot! },
        memoryOwner: "backend", execution: {
          actor: { memberId: "backend", projectId: "artifact-project", sessionId: "artifact-session" }, executionSessionID: "artifact-session",
        }, scanner: { name: "gitleaks", command: scanner },
      }
      const entry = { rule: "keep indexed decisions jointly durable", scope: "src" }
      const at = new Date().toISOString()
      proof.stage = "installed-propose-decide"
      yield* Effect.promise(persist)
      expect(installed.createNativeMemory(binding).reconcile(entry)).toEqual({ present: false, store: "complete" })
      const proposed = installed.proposeProjectRule(binding, entry, at)
      expect(proposed.ok).toBe(true)
      if (!proposed.ok) return yield* Effect.die(new Error(`Installed proposal refused: ${proposed.refusal}`))
      const decision = { proposalId: proposed.proposalId, verdict: "indexed" as const, by: "owner" }
      const indexed = installed.decideProjectRule(binding, decision, at)
      expect(indexed.ok).toBe(true)
      if (!indexed.ok) return yield* Effect.die(new Error(`Installed index refused: ${indexed.refusal}`))
      expect(indexed.ref).toBeDefined()
      if (indexed.ref === undefined) return yield* Effect.die(new Error("Installed decision omitted its native reference"))
      const directory = path.join(repo, ".atlas/project/memory-decisions")
      const receipt = path.join(directory, `${proposed.proposalId}.jsonl`)
      const original = yield* Effect.promise(() => readFile(receipt))
      expect((yield* Effect.promise(() => readdir(directory))).filter((file) => file.endsWith(".jsonl"))).toEqual([`${proposed.proposalId}.jsonl`])
      expect(installed.createNativeMemory(binding).reconcile(entry)).toEqual({ present: true, ref: indexed.ref })
      const beforeRetry = (yield* Effect.promise(() => readFile(scans, "utf8"))).trim().split("\n").length
      expect(beforeRetry).toBe(2)
      proof.stage = "installed-retry"
      yield* Effect.promise(persist)
      const retry = installed.decideProjectRule(binding, decision, new Date(Date.parse(at) + 1000).toISOString())
      expect(retry).toEqual(indexed)
      expect(yield* Effect.promise(() => readFile(receipt))).toEqual(original)
      const afterRetry = (yield* Effect.promise(() => readFile(scans, "utf8"))).trim().split("\n").length
      expect(afterRetry).toBe(beforeRetry)
      proof.stage = "installed-scanner-refusal"
      yield* Effect.promise(persist)
      const refusedEntry = { rule: "refused candidates never become active", scope: "src" }
      const next = installed.proposeProjectRule(binding, refusedEntry, at)
      expect(next.ok).toBe(true)
      if (!next.ok) return yield* Effect.die(new Error(`Installed refusal setup could not propose: ${next.refusal}`))
      yield* Effect.promise(() => writeFile(blocked, "real scanner now rejects"))
      const refused = installed.decideProjectRule(binding, { proposalId: next.proposalId, verdict: "indexed", by: "owner" }, at)
      expect(refused).toMatchObject({ ok: false, refusal: "scanner-blocked" })
      if (refused.ok) return yield* Effect.die(new Error("Installed scanner refusal unexpectedly succeeded"))
      expect(installed.createNativeMemory(binding).reconcile(refusedEntry)).toEqual({ present: false, store: "complete" })
      expect(installed.createNativeMemory(binding).reconcile(entry)).toEqual({ present: true, ref: indexed.ref })
      expect(existsSync(path.join(directory, `${next.proposalId}.jsonl`))).toBe(false)
      expect((yield* Effect.promise(() => readdir(directory))).filter((file) => file.endsWith(".jsonl"))).toEqual([`${proposed.proposalId}.jsonl`])
      expect(yield* Effect.promise(() => readFile(receipt))).toEqual(original)
      expect((yield* Effect.promise(() => readFile(scans, "utf8"))).trim().split("\n")).toHaveLength(4)
      proof.installed = { module: path.relative(root, resolved), decisionId: indexed.decisionId, ref: indexed.ref,
        receiptSHA256: digest(original), scansBeforeRetry: beforeRetry, scansAfterRetry: afterRetry, refusal: refused.refusal }
      proof.stage = "installed-cleanup"
      yield* Effect.promise(persist)
    }))
    proof.stage = "artifact-copy"
    yield* Effect.promise(persist)
    yield* Effect.promise(() => mkdir(path.join(artifact, "src/generated"), { recursive: true }))
    yield* Effect.promise(() => allJoined(generated.map((file) => copyFile(path.join(boundary, file), path.join(artifact, file)))))
    proof.artifactFiles = yield* Effect.promise(() => hashes(artifact, generated))
    expect(proof.artifactFiles).toEqual(proof.second)
    expect(yield* Effect.promise(() => hashes(boundary, generated))).toEqual(proof.second)
    expect(yield* Effect.promise(() => hashes(root, sourceFiles))).toEqual(proof.sources)
    expect(yield* Effect.promise(() => hashes(root, lockFiles))).toEqual(proof.locks)
    proof.stage = "application-cleanup"
    yield* Effect.promise(persist)
  }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(AppProcess.node)))
  const exit = await Effect.runPromiseExit(program)
  if (Exit.isFailure(exit)) {
    proof.failure = { stage: proof.stage, reasons: exit.cause.reasons.map((reason) => reason._tag) }
    await persist()
    return Effect.runPromise(Effect.failCause(exit.cause))
  }
  // runPromiseExit returns after the application layer and every owned child/output/fixture scope closed.
  proof.cleanupJoined = true
  proof.elapsedMsBeforeQualification = performance.now() - started
  proof.stage = "test-budget-check"
  await persist()
  expect(proof.elapsedMsBeforeQualification).toBeLessThan(900_000)
  proof.stage = "qualified"
  proof.qualified = true
  await persist()
}, 900_000)

function readRequest(): unknown {
  try { return JSON.parse(readFileSync(path.join(root, ".ci-run.json"), "utf8")) } catch { return undefined }
}

async function hashes(base: string, files: readonly string[]): Promise<FileHash[]> {
  const owner = await realpath(base)
  return allJoined([...files].sort().map(async (file) => {
    const actual = await realpath(path.join(base, file))
    const relative = path.relative(owner, actual)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Manifest file escapes its owned source")
    const bytes = await readFile(actual)
    return { path: file, sha256: digest(bytes), bytes: bytes.byteLength }
  }))
}

async function allJoined<A>(work: readonly Promise<A>[]): Promise<A[]> {
  const outcomes = await Promise.allSettled(work)
  const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")
  if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), "Qualification filesystem work failed")
  return outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : [])
}

function vector(files: readonly FileHash[]) { return files.map((file) => [file.path, file.sha256]) }
function digest(bytes: string | Uint8Array) { return createHash("sha256").update(bytes).digest("hex") }
function quote(value: string) { return `'${value.replaceAll("'", "'\\''")}'` }
