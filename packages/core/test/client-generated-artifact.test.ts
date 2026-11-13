import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Cause, Effect, Exit } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { AppProcess } from "@orchestra/core/process"
import { isClientGeneratedRequest } from "./fixture/client-generated-request"
import { expectSpawn } from "./fixture/omni-expect"

const root = path.resolve(import.meta.dir, "../../..")
const artifact = path.join(root, "test-ci-evidence/client-generated")
const directories = ["packages/client/src/generated", "packages/client/src/generated-effect"]
const request = readRequest()
type FileHash = { path: string; sha256: string; bytes: number }
type CommandOutcome = {
  stage: string; program: string; args: readonly string[]; cwd: string; env: Record<string, string>; budgetMs: number
  started: string; finished?: string; status: "running" | "completed" | "failed"; exitCode: number | null
  stdoutTruncated?: boolean; stderrTruncated?: boolean; outputTruncated?: boolean
  stdoutBytes?: number; stderrBytes?: number; stdoutSHA256?: string; stderrSHA256?: string; failureReasons?: readonly string[]
}
type Provenance = {
  version: 1; qualified: boolean; stage: string; snapshot: string | undefined; runID: string | undefined
  runAttempt: string | undefined; platform: string; arch: string; request: unknown; testBudgetMs: number
  runtimes: { bunRuntime: string; bunNodeCompatibility: string; bunCLI?: string }; commands: CommandOutcome[]
  sources?: FileHash[]; sourcesAfter?: FileHash[]; before?: FileHash[]; first?: FileHash[]; second?: FileHash[]
  trackedGenerated?: string[]; installed?: FileHash[]; artifactFiles?: FileHash[]; artifactInventory?: string[]
  realIndexBefore?: string; realIndexAfter?: string; temporaryIndexBefore?: string; temporaryIndexAfter?: string
  cleanupJoined?: boolean; elapsedMsBeforeQualification?: number
  checkGeneratedBasis: string; failure?: { stage: string; reasons: readonly string[]; details: string; detailsTruncated: boolean }
}

// Only this exact normalized request may run the producer; ordinary Core lanes stay inert.
test.skipIf(!isClientGeneratedRequest(request))("official Client generation qualifies deterministic installed artifacts", async () => {
  expectSpawn(import.meta.path)
  const started = performance.now()
  const proof: Provenance = {
    version: 1, qualified: false, stage: "hosted-setup", snapshot: process.env.GITHUB_SHA,
    runID: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    platform: process.platform, arch: process.arch, request, testBudgetMs: 900_000, commands: [],
    runtimes: { bunRuntime: Bun.version, bunNodeCompatibility: process.versions.node },
    checkGeneratedBasis: "Official check:generated compares installed deterministic outputs against an owned temporary index, not the original snapshot; real Git index must remain unchanged.",
  }
  await mkdir(artifact)
  const persist = () => writeFile(path.join(artifact, "provenance.json"), JSON.stringify(proof, null, 2) + "\n")
  await persist()
  const owned: { temporary?: string; realIndex?: string } = {}
  const program = Effect.gen(function* () {
    owned.temporary = yield* Effect.promise(() => mkdtemp(path.join(root, "test-ci-evidence/client-generated-index-")))
    expect(process.platform).toBe("linux")
    expect(process.env.RUNNER_OS).toBe("Linux")
    expect(process.env.CI).toBe("true")
    expect(proof.snapshot).toMatch(/^[a-f0-9]{40}$/)
    expect(proof.runID).toMatch(/^[1-9][0-9]*$/)
    expect(proof.runAttempt).toMatch(/^[1-9][0-9]*$/)
    const proc = yield* AppProcess.Service
    const command = (stage: string, program: string, args: readonly string[], cwd: string, requestedBudgetMs = 240_000, env: Record<string, string> = {}) => Effect.gen(function* () {
      const budgetMs = Math.min(requestedBudgetMs, 870_000 - (performance.now() - started))
      if (budgetMs <= 0) return yield* Effect.die(new Error("Qualification budget exhausted"))
      proof.stage = stage
      const index = proof.commands.length
      const pending: CommandOutcome = { stage, program, args, cwd: path.relative(root, cwd) || ".", budgetMs,
        env: Object.fromEntries(Object.entries(env).map(([key, value]) => [key, key === "GIT_INDEX_FILE" ? path.relative(root, value) : value])),
        started: new Date().toISOString(), exitCode: null, status: "running" }
      proof.commands.push(pending)
      yield* Effect.promise(persist)
      const outcome = yield* proc.run(ChildProcess.make(program, args, { cwd, env, extendEnv: true }), {
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
    expect(proof.runtimes.bunCLI).toBe(Bun.version)
    const index = yield* command("real-index-path", "git", ["rev-parse", "--git-path", "index"], root, 15_000)
    const realIndex = path.resolve(root, index.stdout.toString("utf8").trim())
    owned.realIndex = realIndex
    proof.realIndexBefore = digest(yield* Effect.promise(() => readFile(realIndex)))
    const tracked = yield* command("source-manifest", "git", ["ls-files", "-z", "--",
      "packages/schema", "packages/protocol", "packages/client", "tooling/httpapi-codegen",
      "package.json", "bun.lock", "bunfig.toml"], root, 15_000)
    const paths = tracked.stdout.toString("utf8").split("\0").filter(Boolean).sort()
    const sourcePaths = paths.filter((file) => !directories.some((directory) => file.startsWith(directory + "/")))
    proof.trackedGenerated = paths.filter((file) => directories.some((directory) => file.startsWith(directory + "/")))
    expect(sourcePaths.length).toBeGreaterThan(0)
    expect(proof.trackedGenerated.length).toBeGreaterThan(0)
    proof.sources = yield* Effect.promise(() => hashes(root, sourcePaths))
    proof.before = yield* Effect.promise(() => outputHashes(root))
    expect(proof.before.map((file) => file.path)).toEqual(proof.trackedGenerated)
    yield* Effect.promise(persist)
    yield* command("generate-first", process.execPath, ["run", "generate"], path.join(root, "packages/client"))
    proof.first = yield* Effect.promise(() => outputHashes(root))
    yield* Effect.promise(persist)
    yield* command("generate-second", process.execPath, ["run", "generate"], path.join(root, "packages/client"))
    proof.second = yield* Effect.promise(() => outputHashes(root))
    expect(proof.first).toEqual(proof.second)
    yield* Effect.promise(persist)
    yield* command("client-promise-effect", process.execPath, ["test", "./test/promise.test.ts", "./test/effect.test.ts"], path.join(root, "packages/client"))
    yield* command("codegen-tests", process.execPath, ["test"], path.join(root, "tooling/httpapi-codegen"))
    const temporary = owned.temporary
    if (!temporary) return yield* Effect.die(new Error("Owned temporary index directory missing"))
    const env = { GIT_INDEX_FILE: path.join(temporary, "index") }
    yield* command("temporary-index-seed", "git", ["read-tree", "HEAD"], root, 15_000, env)
    yield* command("temporary-index-produced-outputs", "git", ["add", "--", ...directories], root, 15_000, env)
    proof.temporaryIndexBefore = digest(yield* Effect.promise(() => readFile(env.GIT_INDEX_FILE)))
    yield* Effect.promise(persist)
    yield* command("check-generated", process.execPath, ["run", "check:generated"], path.join(root, "packages/client"), 240_000, env)
    proof.temporaryIndexAfter = digest(yield* Effect.promise(() => readFile(env.GIT_INDEX_FILE)))
    proof.installed = yield* Effect.promise(() => outputHashes(root))
    expect(proof.installed).toEqual(proof.second)
    proof.sourcesAfter = yield* Effect.promise(() => hashes(root, sourcePaths))
    expect(proof.sourcesAfter).toEqual(proof.sources)
    proof.realIndexAfter = digest(yield* Effect.promise(() => readFile(realIndex)))
    expect(proof.realIndexAfter).toBe(proof.realIndexBefore)
    proof.stage = "artifact-copy"
    yield* Effect.promise(persist)
    const produced = proof.second.map((file) => file.path)
    yield* Effect.promise(() => allJoined(produced.map(async (file) => {
      await safeFile(root, file)
      await mkdir(path.dirname(path.join(artifact, file)), { recursive: true })
      await copyFile(path.join(root, file), path.join(artifact, file))
    })))
    proof.artifactFiles = yield* Effect.promise(() => outputHashes(artifact))
    expect(proof.artifactFiles).toEqual(proof.second)
    proof.artifactInventory = yield* Effect.promise(() => inventory(artifact))
    expect(proof.artifactInventory).toEqual([...produced, "provenance.json"].sort())
    expect(yield* Effect.promise(() => outputHashes(root))).toEqual(proof.second)
    proof.stage = "application-cleanup"
    yield* Effect.promise(persist)
  }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(AppProcess.node)))
  const exit = await Effect.runPromiseExit(program)
  // All child/layer scopes settled before filesystem cleanup. Join cleanup even when the producer failed.
  const cleanup = await Promise.allSettled([
    ...(owned.temporary ? [rm(owned.temporary, { recursive: true, force: true })] : []),
    ...(owned.realIndex ? [readFile(owned.realIndex).then((bytes) => {
      proof.realIndexAfter = digest(bytes)
      if (proof.realIndexAfter !== proof.realIndexBefore) throw new Error("Real Git index changed")
    })] : []),
  ])
  proof.cleanupJoined = true
  proof.elapsedMsBeforeQualification = performance.now() - started
  const failures = [
    ...(Exit.isFailure(exit) ? [exit.cause] : []),
    ...cleanup.flatMap((outcome) => outcome.status === "rejected" ? [outcome.reason] : []),
    ...(proof.elapsedMsBeforeQualification >= 900_000 ? [new Error("Overall qualification budget exceeded")] : []),
  ]
  if (failures.length) {
    const details = [
      ...(Exit.isFailure(exit) ? [Cause.pretty(exit.cause)] : []),
      ...cleanup.flatMap((outcome) => outcome.status === "rejected"
        ? [outcome.reason instanceof Error ? outcome.reason.stack ?? outcome.reason.message : String(outcome.reason)] : []),
      ...(proof.elapsedMsBeforeQualification >= 900_000 ? ["Overall qualification budget exceeded"] : []),
    ].join("\n")
    proof.failure = { stage: proof.stage, reasons: [
      ...(Exit.isFailure(exit) ? exit.cause.reasons.map((reason) => reason._tag) : []),
      ...cleanup.flatMap((outcome) => outcome.status === "rejected" ? ["CleanupFailure"] : []),
      ...(proof.elapsedMsBeforeQualification >= 900_000 ? ["BudgetExceeded"] : []),
    ], details: details.slice(0, 16_384), detailsTruncated: details.length > 16_384 }
    const persistence = await Promise.allSettled([persist()])
    throw new AggregateError([
      ...failures,
      ...persistence.flatMap((outcome) => outcome.status === "rejected" ? [outcome.reason] : []),
    ], "Client generation qualification failed", { cause: Exit.isFailure(exit) ? exit.cause : undefined })
  }
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

async function safeFile(base: string, file: string) {
  if (path.isAbsolute(file) || file.split(/[\\/]/).some((part) => part === ".." || part === "")) throw new Error("Unsafe manifest path")
  await file.split("/").reduce(async (prior, part) => {
    const parent = await prior
    const current = path.join(parent, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Manifest symlink refused")
    return current
  }, Promise.resolve(base))
  const actual = await realpath(path.join(base, file))
  const relative = path.relative(await realpath(base), actual)
  if (relative.startsWith("..") || path.isAbsolute(relative) || !(await lstat(actual)).isFile()) throw new Error("Manifest file escapes owner or is not regular")
  return actual
}

async function hashes(base: string, files: readonly string[]): Promise<FileHash[]> {
  return allJoined([...files].sort().map(async (file) => {
    const bytes = await readFile(await safeFile(base, file))
    return { path: file, sha256: digest(bytes), bytes: bytes.byteLength }
  }))
}

async function inventory(base: string, directory = ""): Promise<string[]> {
  if (directory) {
    await directory.split("/").reduce(async (prior, part) => {
      const current = path.join(await prior, part)
      const stat = await lstat(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Output directory symlink or non-directory refused")
      return current
    }, Promise.resolve(base))
  }
  const entries = await readdir(path.join(base, directory), { withFileTypes: true })
  return (await allJoined(entries.map(async (entry) => {
    const file = path.posix.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error("Output symlink refused")
    if (entry.isDirectory()) return inventory(base, file)
    if (!entry.isFile()) throw new Error("Output special file refused")
    return [file]
  }))).flat().sort()
}

async function outputHashes(base: string) {
  return hashes(base, (await allJoined(directories.map((directory) => inventory(base, directory)))).flat().sort())
}

async function allJoined<A>(work: readonly Promise<A>[]): Promise<A[]> {
  const outcomes = await Promise.allSettled(work)
  const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")
  if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), "Qualification filesystem work failed")
  return outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : [])
}
function digest(bytes: string | Uint8Array) { return createHash("sha256").update(bytes).digest("hex") }
