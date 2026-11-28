export * as ActivityArmObjects from "./activity-arm-objects"

import { createHash } from "node:crypto"
import { lstat, realpath } from "node:fs/promises"
import path from "node:path"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Option, Semaphore } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ActivityActionLedger } from "./activity-action-ledger"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"
import { ActivityArmLedger } from "./activity-arm"
import { ActivityArmProof } from "./activity-arm-proof"
import { Database } from "./database/database"
import type { AppProcess } from "./process"
import { ProjectDirectoryTable, ProjectTable } from "./project/sql"

const names = [".turbo", "node_modules"] as const
const prefix = "arm-worktree:"
const maxWorktrees = 8
type Name = (typeof names)[number]
type Registration = { registrationID: string; directory: string; root: string; projectID: string }
type Candidate = Registration & { name: Name }

export function make(database: Database.Interface, processService: AppProcess.Interface) {
  const lock = Semaphore.makeUnsafe(1)
  const verified = new Map<string, { candidate: Candidate; generation: string }>()
  const actions = ActivityActionLedger.make.pipe(Effect.provideService(Database.Service, database))
  const registrations = () => database.db.select({
    registrationID: ProjectDirectoryTable.registration_id,
    directory: ProjectDirectoryTable.directory,
    root: ProjectTable.worktree,
    projectID: ProjectDirectoryTable.project_id,
  }).from(ProjectDirectoryTable).innerJoin(ProjectTable, eq(ProjectTable.id, ProjectDirectoryTable.project_id))
  const gitWorktree = and(eq(ProjectTable.vcs, "git"), eq(ProjectDirectoryTable.strategy, "git_worktree"))
  const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)))
  const git = (cwd: string, args: readonly string[]) => processService.run(ChildProcess.make("git", [
    "--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
    ...args,
  ], { cwd, env: gitEnvironment, extendEnv: false, stdin: "ignore" }), {
    timeout: "2 seconds", maxOutputBytes: 128 * 1024, maxErrorBytes: 4 * 1024,
  }).pipe(Effect.map((result) => result.stdoutTruncated ? undefined : result), Effect.orElseSucceed(() => undefined))

  const sample = Effect.fnUntraced(function* (candidate: Candidate) {
    const label = path.join(candidate.directory, candidate.name)
    const observation: ActivityActionLedger.Observation = {
      targetID: prefix + digest([candidate.registrationID, candidate.name]),
      kind: "object", label, owner: candidate.projectID, members: [candidate.registrationID],
      identity: null, dirty: null, eligible: [],
    }
    const status = yield* Effect.tryPromise(() => lstat(label)).pipe(
      Effect.catch((error) => Effect.succeed((error.cause as NodeJS.ErrnoException)?.code === "ENOENT" ? "missing" as const : undefined)),
    )
    if (status === "missing") return { observation, partial: false }
    if (!status?.isDirectory() || label.length > 384 || candidate.projectID.length > 384 || candidate.root === candidate.directory)
      return { observation, partial: true }
    const canonical = yield* Effect.tryPromise(() => Promise.all([realpath(candidate.root), realpath(candidate.directory)]))
      .pipe(Effect.orElseSucceed(() => undefined))
    if (canonical?.[0] !== candidate.root || canonical[1] !== candidate.directory) return { observation, partial: true }

    const registered = yield* git(candidate.root, ["worktree", "list", "--porcelain", "-z"])
    const entry = registered?.exitCode === 0 ? worktreeEntry(registered.stdout, candidate.directory) : undefined
    if (!entry) return { observation, partial: true }
    const common = yield* git(candidate.root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    const placement = () => git(candidate.directory, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir", "HEAD"])
    const head = entry.split("\0").find((field) => field.startsWith("HEAD "))?.slice(5)
    if (common?.exitCode !== 0 || !head) return { observation, partial: true }
    const expected = candidate.directory + "\n" + common.stdout.toString("utf8") + head + "\n"
    const placed = yield* placement()
    if (placed?.exitCode !== 0 || placed.stdout.toString("utf8") !== expected) return { observation, partial: true }
    const tracked = yield* git(candidate.directory, ["ls-files", "-v", "-z"])
    if (tracked?.exitCode !== 0) return { observation, partial: true }
    // A tracked file or a suppressed index entry cannot establish a clean, disposable copy.
    if (tracked.stdout.toString("utf8").split("\0").some((line) => /^[a-zS] /.test(line) ||
      line.slice(2) === candidate.name || line.slice(2).startsWith(candidate.name + "/"))) return { observation, partial: false }
    const ignored = yield* git(candidate.directory, ["check-ignore", "--no-index", "--", candidate.name + "/"])
    if (ignored?.exitCode !== 0) return { observation, partial: ignored?.exitCode !== 1 }
    const dirt = () => git(candidate.directory, ["status", "--porcelain=v1", "-z", "--untracked-files=no", "--ignore-submodules=none"])
    const before = yield* dirt()
    if (before?.exitCode !== 0) return { observation, partial: true }
    if (before.stdout.length) return { observation: { ...observation, dirty: true }, partial: false }

    const proof = yield* Effect.promise((signal) => ActivityArmProof.inspect({
      worktree: candidate.directory, name: candidate.name,
    }, signal))
      .pipe(Effect.timeoutOption("4 seconds"))
    const after = yield* dirt()
    const final = yield* placement()
    const current = yield* registrations().where(and(gitWorktree, eq(ProjectDirectoryTable.registration_id, candidate.registrationID))).get()
    if (after?.exitCode !== 0 || final?.exitCode !== 0 || final.stdout.toString("utf8") !== expected ||
      !current || current.directory !== candidate.directory || current.root !== candidate.root || current.projectID !== candidate.projectID ||
      proof._tag === "None" || !proof.value) return { observation, partial: true }
    return {
      observation: {
        ...observation,
        identity: digest([entry, proof.value.fingerprint]),
        dirty: after.stdout.length > 0,
        eligible: proof.value.idle && after.stdout.length === 0 ? ["arm"] as const : [],
      },
      partial: false,
    }
  })

  return {
    inspect: () => lock.withPermit(Effect.gen(function* () {
      const deadline = performance.now() + 18_000
      const rows = yield* registrations().where(gitWorktree).orderBy(ProjectDirectoryTable.registration_id).limit(maxWorktrees + 1).all()
      const previous = yield* database.db.select().from(ActivityActionLedgerTable).where(sql`
        ${ActivityActionLedgerTable.target_id} LIKE 'arm-worktree:%'
        AND json_extract(${ActivityActionLedgerTable.observation}, '$.identity') IS NOT NULL
      `).all()
      const recorded = new Set<string>()
      let partial = rows.length > maxWorktrees
      const ledger = yield* actions
      scan: for (const row of rows.slice(0, maxWorktrees)) {
        for (const name of names) {
          const candidate = { ...row, name }
          const remaining = deadline - performance.now()
          if (remaining <= 0) {
            partial = true
            break scan
          }
          const observed = yield* sample(candidate).pipe(Effect.timeoutOption(remaining))
          if (Option.isNone(observed)) {
            partial = true
            break scan
          }
          const result = observed.value
          if (result.partial) partial = true
          const target = result.observation
          if (!target.identity && !previous.some((item) => item.target_id === target.targetID)) continue
          const stored = yield* ledger.record(target)
          recorded.add(target.targetID)
          verified.delete(target.targetID)
          if (stored.eligible.includes("arm"))
            verified.set(stored.targetID, { candidate, generation: stored.generation })
        }
      }
      for (const item of previous) {
        if (recorded.has(item.target_id)) continue
        yield* ledger.record({ ...item.observation, identity: null, dirty: null, eligible: [] })
        verified.delete(item.target_id)
      }
      const plan = yield* ActivityArmLedger.plan(database)
      const ready = plan.ready.filter((target) => verified.get(target.targetID)?.generation === target.generation)
      return { ...plan, ready, partial: partial || plan.partial || ready.length !== plan.ready.length }
    })),
    verify: (target: ActivityActionLedger.Target) => lock.withPermit(Effect.gen(function* () {
      const captured = verified.get(target.targetID)
      if (!captured || captured.generation !== target.generation) return false
      const { observation } = yield* sample(captured.candidate)
      if (observation.eligible.includes("arm") && observation.identity === target.identity &&
        observation.label === target.label && observation.owner === target.owner &&
        observation.dirty === target.dirty && observation.members[0] === target.members[0] &&
        observation.members.length === target.members.length) return true
      verified.delete(target.targetID)
      const ledger = yield* actions
      yield* ledger.record({ ...observation, eligible: [] })
      return false
    })),
  }
}

function worktreeEntry(output: Buffer, directory: string) {
  const entry = output.toString("utf8").split("\0\0").find((record) => record.startsWith(`worktree ${directory}\0`))
  return entry?.split("\0").some((field) => /^HEAD [0-9a-f]{40,64}$/.test(field)) &&
    !entry.split("\0").some((field) => /^prunable( |$)/.test(field)) ? entry : undefined
}

function digest(fields: readonly string[]) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex")
}
