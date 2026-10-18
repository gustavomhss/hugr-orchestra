export * as ArmCreate from "./create"

import path from "node:path"
import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { lstat, mkdir, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises"
import { Effect, Option, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { ArmLoad } from "./load"
import { ArmState } from "./state"

// Arm creation as an idempotent PUT (WP5).

export class Conflict extends Schema.TaggedErrorClass<Conflict>()("ArmCreate.Conflict", { token: Schema.String }) {}

export interface Input {
  readonly token: RelayArm.Token
  readonly sprint: RelaySprint.Sprint
  readonly meta: RelayArm.Meta
  // Bound as `agent_id` at creation, so the first stop cannot claim the arm for another agent.
  readonly agentID?: string
}

/**
 * Writes sprint.json and meta.json (compact JSON, no trailing LF). The same body again is `unchanged` (HTTP 200);
 * a different body under the same token is a Conflict (HTTP 409) and writes nothing.
 *
 * The body is the sprint and meta bytes plus `agentID` when given. Without one, `agent_id` is not part of the body: the
 * first evaluation may bind it later, and a retried PUT must still be `unchanged`. The arm is assembled in a staging
 * directory and renamed into place, so it appears whole or not at all and concurrent PUTs settle on one winner.
 */
export const create = (
  input: Input,
): Effect.Effect<"created" | "unchanged", Conflict | ArmState.StateError, ArmState.Store> =>
  Effect.gen(function* () {
    const target = yield* ArmState.dir(input.token)
    const sprint = Buffer.from(JSON.stringify(input.sprint))
    const meta = Buffer.from(JSON.stringify(input.meta))
    // Never write an arm the loader would refuse.
    yield* Effect.all([
      loadable(path.join(target, RelayArm.Files.sprint), sprint, RelaySprint.Sprint),
      loadable(path.join(target, RelayArm.Files.meta), meta, RelayArm.Meta),
    ])
    if (input.agentID !== undefined && (!input.agentID || input.agentID.includes("\u0000")))
      return yield* new ArmState.StateError({ path: target, reason: "invalid agent id" })
    // Windows may rename over a symlink where POSIX refuses, so a symlinked token is refused before anything is staged.
    if (yield* io(target, () => lstat(target).then((info) => info.isSymbolicLink(), () => false)))
      return yield* new ArmState.StateError({ path: target, reason: "symlink" })

    // `~` is outside the token alphabet, so a staging directory can never be mistaken for an arm.
    const staging = path.join(path.dirname(target), `.${input.token}~${randomUUID()}`)
    const files = [
      ...(input.agentID === undefined ? [] : [[RelayArm.Files.agentID, input.agentID] as const]),
      [RelayArm.Files.meta, meta] as const,
      [RelayArm.Files.sprint, sprint] as const,
    ]
    // POSIX rename replaces an empty directory and refuses a populated one. Staging is removed on every path; after a
    // successful rename it no longer exists.
    const placed = yield* io(staging, async () => {
      await mkdir(path.dirname(target), { recursive: true })
      await mkdir(staging)
      await Promise.all(files.map(([name, data]) => writeFile(path.join(staging, name), data)))
      return rename(staging, target).then(
        () => true,
        () => replaceEmpty(staging, target),
      )
    }).pipe(
      // Synchronous: with effect 4.0.0-beta.83 an async finalizer is dropped when the fiber is interrupted.
      Effect.ensuring(
        Effect.try({ try: () => rmSync(staging, { recursive: true, force: true }), catch: () => undefined }).pipe(
          Effect.ignore,
        ),
      ),
    )
    if (placed) return "created" as const
    const found = yield* io(target, () => lstat(target).catch(() => undefined))
    if (!found) return yield* new ArmState.StateError({ path: target, reason: "could not place the arm" })
    if (found.isSymbolicLink()) return yield* new ArmState.StateError({ path: target, reason: "symlink" })

    const same =
      equal(yield* existing(path.join(target, RelayArm.Files.sprint)), sprint) &&
      equal(yield* existing(path.join(target, RelayArm.Files.meta)), meta) &&
      (input.agentID === undefined ||
        Option.contains(yield* ArmState.read(target, RelayArm.Files.agentID), input.agentID))
    if (!same) return yield* new Conflict({ token: input.token })
    return "unchanged" as const
  })

// The files `create` writes. An arm holding anything else has been graded, positioned, released or is running.
const CREATED = new Set<string>([RelayArm.Files.agentID, RelayArm.Files.meta, RelayArm.Files.sprint])
// The staging files `replace` writes before its rename.
const STAGING = /^\.(?:meta\.json|agent_id)~[0-9a-f-]{36}$/

/**
 * Moves a workflow arm that has graded nothing from the execution Session `from` to the one in `input` (TS-only; a
 * workflow arm has no Python counterpart). The host calls it only after it has established that `from` never ran a
 * provider turn. Under the run lock it refuses with a Conflict unless:
 * - the arm holds exactly the files `create` writes: no ledger, position, state, counter, release or other entry, so
 *   no ledger chain exists to keep valid and nothing was graded;
 * - the sprint bytes equal the input's, and the stored meta equals the input's meta except for the execution Session
 *   (`session_id`, `workflow.executionSessionID`, `workflow.logicalTaskID`);
 * - the arm is held by `from` or already by the input's agent (a rebind that stopped between its two writes resumes).
 * The same body again is `unchanged`. The meta is replaced first and `agent_id` second, each by an atomic rename.
 */
export const rebind = (
  input: Input & { readonly agentID: string; readonly from: string },
): Effect.Effect<"rebound" | "unchanged", Conflict | ArmState.StateError | ArmState.Busy, ArmState.Store> =>
  Effect.gen(function* () {
    const target = yield* ArmState.dir(input.token)
    const sprint = Buffer.from(JSON.stringify(input.sprint))
    const meta = Buffer.from(JSON.stringify(input.meta))
    yield* loadable(path.join(target, RelayArm.Files.meta), meta, RelayArm.Meta)
    if (!input.agentID || input.agentID.includes("\u0000") || !input.from)
      return yield* new ArmState.StateError({ path: target, reason: "invalid agent id" })
    const conflict = new Conflict({ token: input.token })
    return yield* ArmState.withRunLock(target, Effect.gen(function* () {
      const loaded = yield* ArmLoad.arm(target).pipe(
        Effect.mapError((error) => new ArmState.StateError({ path: error.path, reason: error.reason })))
      const holder = Option.getOrUndefined(yield* ArmState.read(target, RelayArm.Files.agentID))
      if (holder === input.agentID && equal(Option.some(yield* existingBytes(target)), meta)) return "unchanged" as const
      const entries = yield* io(target, () => readdir(target))
      // A rebind that died between its write and its rename leaves its staging file; under the lock it is only debris.
      const staged = entries.filter((name) => STAGING.test(name))
      yield* Effect.forEach(staged, (name) => io(target, () => rm(path.join(target, name), { force: true })), { discard: true })
      if (entries.some((name) => !CREATED.has(name) && name !== RelayArm.Files.runLock && !STAGING.test(name)) ||
        !Buffer.from(loaded.sprintBytes).equals(sprint) || (holder !== input.from && holder !== input.agentID) ||
        !loaded.meta.workflow || !input.meta.workflow ||
        ![input.from, input.agentID].includes(loaded.meta.session_id ?? "") ||
        !isDeepStrictEqual(movable(loaded.meta), movable(input.meta)))
        return yield* conflict
      yield* replace(target, RelayArm.Files.meta, meta)
      yield* replace(target, RelayArm.Files.agentID, Buffer.from(input.agentID))
      return "rebound" as const
    }))
  })

// The Session holding an arm (`agent_id` as create and rebind write it), None when the arm records none.
export const holder = (token: RelayArm.Token): Effect.Effect<Option.Option<string>, ArmState.StateError, ArmState.Store> =>
  ArmState.dir(token).pipe(Effect.flatMap((arm) => ArmState.read(arm, RelayArm.Files.agentID)))

// The meta without the execution Session a rebind may move.
function movable(meta: RelayArm.Meta) {
  return { ...meta, session_id: undefined,
    workflow: meta.workflow && { ...meta.workflow, executionSessionID: undefined, logicalTaskID: undefined } }
}

function existingBytes(arm: string) {
  return ArmLoad.bytes(path.join(arm, RelayArm.Files.meta)).pipe(
    Effect.mapError((error) => new ArmState.StateError({ path: error.path, reason: error.reason })))
}

function replace(arm: string, name: string, data: Uint8Array) {
  const staging = path.join(arm, `.${name}~${randomUUID()}`)
  return io(staging, () => writeFile(staging, data).then(() => rename(staging, path.join(arm, name)))).pipe(
    Effect.ensuring(Effect.try({ try: () => rmSync(staging, { force: true }), catch: () => undefined }).pipe(Effect.ignore)),
  )
}

function loadable<A>(file: string, data: Uint8Array, schema: Schema.Decoder<A>) {
  if (data.length > ArmLoad.MAX_BYTES) return Effect.fail(new ArmState.StateError({ path: file, reason: "overflow" }))
  return ArmLoad.decode(file, data, schema).pipe(
    Effect.mapError((error) => new ArmState.StateError({ path: error.path, reason: error.reason })),
  )
}

// A file of an existing arm, read by the strict loader; absent is None, so it compares as a different body.
function existing(file: string) {
  return ArmLoad.bytes(file).pipe(
    Effect.map(Option.some),
    Effect.catchIf(
      (error) => error.reason === "missing",
      () => Effect.succeed(Option.none<Uint8Array>()),
    ),
    Effect.mapError((error) => new ArmState.StateError({ path: error.path, reason: error.reason })),
  )
}

// Windows renames a directory only onto a missing path, where POSIX also replaces an empty one. An empty real directory
// at the target is removed and the rename tried once more; rmdir refuses a populated directory and lstat sees a symlink
// as one, so an arm is never removed and a symlinked token still reaches the symlink refusal.
async function replaceEmpty(staging: string, target: string) {
  const found = await lstat(target).catch(() => undefined)
  if (!found?.isDirectory()) return false
  return rmdir(target)
    .then(() => rename(staging, target))
    .then(
      () => true,
      () => false,
    )
}

function equal(found: Option.Option<Uint8Array>, expected: Buffer) {
  return Option.isSome(found) && expected.equals(found.value)
}

function io<A>(file: string, run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (error) =>
      new ArmState.StateError({ path: file, reason: (error as NodeJS.ErrnoException).code ?? String(error) }),
  })
}
