export * as ArmCreate from "./create"

import path from "node:path"
import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import { lstat, mkdir, rename, rmdir, writeFile } from "node:fs/promises"
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
