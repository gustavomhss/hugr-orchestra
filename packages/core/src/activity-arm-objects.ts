export * as ActivityArmObjects from "./activity-arm-objects"

import { createHash } from "node:crypto"
import { lstat } from "node:fs/promises"
import path from "node:path"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Option, Semaphore } from "effect"
import { ActivityActionLedger } from "./activity-action-ledger"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"
import { ActivityArmLedger } from "./activity-arm"
import { ActivityArmGit } from "./activity-arm-git"
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

export function make(database: Database.Interface, processService: AppProcess.Interface, options?: {
  readonly inspectProtectedSource?: (source: string) => Promise<string | undefined>
}) {
  const lock = Semaphore.makeUnsafe(1)
  const inspectProtectedSource = options?.inspectProtectedSource
  const verified = new Map<string, {
    candidate: Candidate
    generation: string
    identity: string | null
    protectedIdentity?: string
  }>()
  const actions = ActivityActionLedger.make.pipe(Effect.provideService(Database.Service, database))
  const registrations = (source: Pick<ActivityArmLedger.Transaction, "select"> = database.db) => source.select({
    registrationID: ProjectDirectoryTable.registration_id,
    directory: ProjectDirectoryTable.directory,
    root: ProjectTable.worktree,
    projectID: ProjectDirectoryTable.project_id,
  }).from(ProjectDirectoryTable).innerJoin(ProjectTable, eq(ProjectTable.id, ProjectDirectoryTable.project_id))
  const gitWorktree = and(eq(ProjectTable.vcs, "git"), eq(ProjectDirectoryTable.strategy, "git_worktree"))
  const registered = (id: string, source?: Pick<ActivityArmLedger.Transaction, "select">) => registrations(source)
    .where(and(gitWorktree, eq(ProjectDirectoryTable.registration_id, id))).get()
  const git = ActivityArmGit.make(processService)

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
    const protectedIdentity = inspectProtectedSource
      ? yield* Effect.promise(() => inspectProtectedSource(label))
      : undefined
    const checkout = yield* git(candidate)
    if (!checkout) return { observation, partial: true }
    if (checkout.state === "refused") return { observation, partial: false }
    if (checkout.state === "dirty") return { observation: { ...observation, dirty: true }, partial: false }

    const proof = yield* Effect.promise((signal) => ActivityArmProof.inspect({
      worktree: candidate.directory, name: candidate.name,
    }, signal))
      .pipe(Effect.timeoutOption("4 seconds"))
    if (Option.isNone(proof) || !proof.value || !(yield* checkout.isCurrent())) return { observation, partial: true }
    const evidence = proof.value
    if (!matchesRegistration(yield* registered(candidate.registrationID), candidate) ||
      !(yield* Effect.promise((signal) => evidence.isCurrent(signal)))) return { observation, partial: true }
    if (inspectProtectedSource && protectedIdentity &&
      (yield* Effect.promise(() => inspectProtectedSource(label))) !== protectedIdentity)
      return { observation, partial: true }
    const observed: ActivityActionLedger.Observation = {
      ...observation,
      identity: digest(protectedIdentity
        ? [checkout.fingerprint, evidence.fingerprint, protectedIdentity]
        : [checkout.fingerprint, evidence.fingerprint]),
      dirty: false,
      eligible: evidence.idle ? ["arm"] : [],
    }
    return { observation: observed, protectedIdentity, partial: false }
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
            verified.set(stored.targetID, {
              candidate, generation: stored.generation, identity: stored.identity, protectedIdentity: result.protectedIdentity,
            })
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
    protectedIdentity(target: ActivityActionLedger.Target) {
      const captured = verified.get(target.targetID)
      return captured?.generation === target.generation && captured.identity === target.identity ? captured.protectedIdentity : undefined
    },
    authorize: (tx: ActivityArmLedger.Transaction, targets: readonly ActivityActionLedger.Target[]) => Effect.gen(function* () {
      for (const target of targets) {
        const captured = verified.get(target.targetID)
        if (!captured || captured.generation !== target.generation ||
          !matchesRegistration(yield* registered(captured.candidate.registrationID, tx), captured.candidate)) return false
      }
      return true
    }),
  }
}

function matchesRegistration(current: Registration | undefined, candidate: Candidate) {
  return current?.registrationID === candidate.registrationID && current.directory === candidate.directory &&
    current.root === candidate.root && current.projectID === candidate.projectID
}

function digest(fields: readonly string[]) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex")
}
