export * as ReviewRustsecRefresh from "./rustsec-refresh"

import { randomUUID } from "node:crypto"
import { chmod, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Context, Effect } from "effect"
import { ReviewCargoAuditFacts } from "./cargo-audit-facts"
import { ReviewRustsecDb } from "./rustsec-db"

export type Spawn<R> = (input: { readonly argv: readonly string[]; readonly cwd: string; readonly env: Record<string, string> }) => Effect.Effect<{ exitCode: number | null; stdout?: string; failure?: string }, never, R>
export const Locate = Context.Reference<typeof ReviewCargoAuditFacts.locate>("@orchestra/ReviewRustsecRefresh/Locate", { defaultValue: () => ReviewCargoAuditFacts.locate })
export const AfterPointerRename = Context.Reference<(state: ReviewRustsecDb.State) => Effect.Effect<void>>("@orchestra/ReviewRustsecRefresh/AfterPointerRename", { defaultValue: () => () => Effect.void })

const HASH = /^[0-9a-f]{40}$/
const MODE = 0o700

type Outcome = { ok: true; state: ReviewRustsecDb.State } | { ok: false; reason: string }
type Ran = { exitCode: number | null; stdout?: string; failure?: string }

// Retention is latched at rename, before the observer, so a published pointer is never cleaned up.
type Stage = {
  root: string
  generation: string
  genDir: string
  db: string
  home: string
  pointerTemp: string | undefined
  renamed: boolean
  published: boolean
}

export function refresh<R>(spawn: Spawn<R>): Effect.Effect<Outcome, never, R> {
  return Effect.gen(function* () {
    const locate = yield* Locate
    const located = yield* locate()
    if ("absent" in located) return { ok: false as const, reason: located.absent }
    const root = yield* ReviewRustsecDb.Root
    return yield* staged(root, located.executable, spawn)
  }).pipe(Effect.scoped, Effect.catch((error) => Effect.succeed(failed(error))))
}

function staged<R>(root: string, bin: string, spawn: Spawn<R>) {
  return Effect.gen(function* () {
    const cleanup = { reason: undefined as string | undefined }
    const result = yield* Effect.scoped(Effect.acquireRelease(
      createStage(root),
      (stage) => releaseStage(stage).pipe(Effect.catch((error) => Effect.sync(() => { cleanup.reason = error.reason }))),
    ).pipe(Effect.flatMap((stage) => masked(stage, bin, spawn))))
    return cleanup.reason ? { ok: false as const, reason: cleanup.reason } : result
  })
}

function masked<R>(stage: Stage, bin: string, spawn: Spawn<R>) {
  return Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
    const fetched = yield* restore(fetch(stage, bin, spawn))
    if (!fetched.ok) return fetched
    return yield* publish(stage, fetched.state)
  }))
}

function fetch<R>(stage: Stage, bin: string, spawn: Spawn<R>) {
  const env = ReviewCargoAuditFacts.environment(stage.home)
  const input = { cwd: stage.home, env }
  return Effect.gen(function* () {
    const updated = yield* spawn({ ...input, argv: ReviewCargoAuditFacts.refreshArgv(bin, stage.db) })
    const updateFailed = commandReason(updated)
    if (updateFailed) return { ok: false as const, reason: updateFailed }
    if (!(yield* physicalDirectories(stage.db))) return { ok: false as const, reason: "rustsec metadata invalid" }
    const logged = yield* spawn({ ...input, argv: ["git", "-C", stage.db, "log", "-1", "--format=%H%n%cI"] })
    const logFailed = commandReason(logged)
    if (logFailed) return { ok: false as const, reason: logFailed }
    const meta = parseGit(logged.stdout)
    if (!meta) return { ok: false as const, reason: "rustsec metadata invalid" }
    return { ok: true as const, state: { dir: stage.db, revision: meta.revision, committedAt: meta.committedAt, refreshedAt: new Date().toISOString() } }
  })
}

function publish(stage: Stage, state: ReviewRustsecDb.State) {
  const body = JSON.stringify({
    generation: stage.generation,
    revision: state.revision,
    committedAt: state.committedAt,
    refreshedAt: state.refreshedAt,
  })
  const temp = path.join(stage.root, `current.${randomUUID()}.json`)
  stage.pointerTemp = temp
  return Effect.gen(function* () {
    yield* writeText(path.join(stage.genDir, "manifest.json"), body)
    yield* writeText(temp, body)
    yield* renameFile(temp, path.join(stage.root, "current.json"))
    stage.renamed = true
    stage.pointerTemp = undefined
    const after = yield* AfterPointerRename
    yield* after(state)
    stage.published = true
    return { ok: true as const, state }
  })
}

function stagePaths(root: string): Stage {
  const id = randomUUID()
  const generation = `gen-${id}`
  const genDir = path.join(root, generation)
  return {
    root,
    generation,
    genDir,
    db: path.join(genDir, "db"),
    home: path.join(root, `.home-${id}`),
    pointerTemp: undefined,
    renamed: false,
    published: false,
  }
}

function createStage(root: string) {
  return Effect.tryPromise({
    try: async () => {
      const stage = stagePaths(root)
      try {
        await mkdir(stage.genDir, { recursive: true, mode: MODE })
        await mkdir(stage.db, { mode: MODE })
        await mkdir(stage.home, { mode: MODE })
        await chmod(stage.genDir, MODE)
        await chmod(stage.db, MODE)
        await chmod(stage.home, MODE)
        return stage
      } catch (cause) {
        await rm(stage.home, { recursive: true, force: true }).catch(() => undefined)
        await rm(stage.genDir, { recursive: true, force: true }).catch(() => undefined)
        throw cause
      }
    },
    catch: (cause) => new RefreshFsError(fsReason(cause)),
  })
}

function releaseStage(stage: Stage) {
  return Effect.tryPromise({
    try: async () => {
      const cleaned = await Promise.allSettled([
        rm(stage.home, { recursive: true, force: true }),
        ...(stage.pointerTemp && !stage.renamed ? [rm(stage.pointerTemp, { force: true })] : []),
        ...(!stage.renamed ? [rm(stage.genDir, { recursive: true, force: true })] : []),
      ])
      const rejected = cleaned.find((item) => item.status === "rejected")
      if (rejected?.status === "rejected") throw rejected.reason
    },
    catch: (cause) => new RefreshFsError(fsReason(cause)),
  })
}

function physicalDirectories(db: string) {
  return Effect.tryPromise({
    try: async () => {
      const git = await lstat(path.join(db, ".git"))
      const crates = await lstat(path.join(db, "crates"))
      return git.isDirectory() && !git.isSymbolicLink() && crates.isDirectory() && !crates.isSymbolicLink()
    },
    catch: (cause) => errno(cause) === "ENOENT" || errno(cause) === "ENOTDIR" ? new MissingComponents() : new RefreshFsError(fsReason(cause)),
  }).pipe(Effect.catch((error) => error instanceof MissingComponents ? Effect.succeed(false) : Effect.fail(error)))
}

function writeText(file: string, body: string) {
  return Effect.tryPromise({
    try: () => writeFile(file, body, { encoding: "utf8", mode: 0o600 }),
    catch: (cause) => new RefreshFsError(fsReason(cause)),
  })
}

function renameFile(from: string, to: string) {
  return Effect.tryPromise({
    try: () => rename(from, to),
    catch: (cause) => new RefreshFsError(fsReason(cause)),
  })
}

function commandReason(ran: Ran) {
  if (ran.failure !== undefined) return ran.failure
  if (ran.exitCode === null) return "signal"
  if (ran.exitCode !== 0) return `exit ${ran.exitCode}`
  return undefined
}

function parseGit(stdout: string | undefined) {
  const text = stdout ?? ""
  const body = text.endsWith("\n") ? text.slice(0, -1) : text
  const lines = body.split("\n")
  if (lines.length !== 2 || !HASH.test(lines[0]) || !ReviewRustsecDb.validDate(lines[1])) return undefined
  return { revision: lines[0], committedAt: lines[1] }
}

function failed(error: unknown): Outcome {
  if (error instanceof RefreshFsError) return { ok: false, reason: error.reason }
  return { ok: false, reason: "rustsec refresh unavailable: unreadable" }
}

function fsReason(cause: unknown) {
  const code = errno(cause)
  if (code === "ELOOP") return "rustsec refresh unavailable: symlink"
  if (code) return `rustsec refresh unavailable: ${code}`
  return "rustsec refresh unavailable: unreadable"
}

function errno(cause: unknown) {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return undefined
  return typeof cause.code === "string" ? cause.code : undefined
}

class MissingComponents {
  readonly _tag = "MissingComponents"
}

class RefreshFsError extends Error {
  readonly _tag = "ReviewRustsecRefreshFsError"
  constructor(readonly reason: string) {
    super(reason)
    this.name = "ReviewRustsecRefreshFsError"
  }
}
