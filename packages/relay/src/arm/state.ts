export * as ArmState from "./state"

import path from "node:path"
import { mkdirSync, rmdirSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { Context, Effect, Option, Redacted, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import type { RelaySprint } from "@orchestra/schema/relay-sprint"

// Arm state on disk (WP5): file names, the position rule, release normalization and the run lock.

// Where arms live and how their ledgers are sealed. Core binds it to `<Global.data>/relay/<projectID>` (WP10).
export interface StoreInterface {
  readonly armsDir: string
  // `ledger.key`; absent means plain SHA-256 chains. Never reaches agent or check environments.
  readonly ledgerKey: Option.Option<Redacted.Redacted<string>>
}

export class Store extends Context.Service<Store, StoreInterface>()("@orchestra/relay/ArmStore") {}

export class Busy extends Schema.TaggedErrorClass<Busy>()("ArmState.Busy", { lock: Schema.String }) {}

export class StateError extends Schema.TaggedErrorClass<StateError>()("ArmState.StateError", {
  path: Schema.String,
  reason: Schema.String,
}) {}

// Every UTF-8 byte outside `[A-Za-z0-9._-]` becomes `_` (`tr -c` works byte by byte).
export const safe = (value: string): string =>
  Buffer.from(value, "utf8")
    .toString("latin1")
    .replace(/[^A-Za-z0-9._-]/g, "_")

// `relay_position_index`: the whole raw position as a WP ID first, then the raw suffix after its first dot.
export const positionIndex = (sprint: RelaySprint.Sprint, position: string): Option.Option<number> => {
  const ids = sprint.work_packages.map((wp) => wp.id)
  const whole = ids.indexOf(position)
  if (whole >= 0) return Option.some(whole)
  // `${1#*.}`: without a dot the suffix is the whole position again.
  const suffix = ids.indexOf(position.slice(position.indexOf(".") + 1))
  return suffix >= 0 ? Option.some(suffix) : Option.none()
}

/**
 * The hook's two lookups: the raw position, then, only on a miss, the legacy form with its trailing LFs removed.
 * A literal CR stays identity data.
 */
export const resolve = (sprint: RelaySprint.Sprint, position: string): Option.Option<number> =>
  Option.orElse(positionIndex(sprint, position), () => positionIndex(sprint, position.replace(/\n+$/, "")))

// The canonical position: `<macro>.<id>`, unless the ID already starts with that exact prefix.
export const canonicalPosition = (wp: RelaySprint.WorkPackage): string =>
  wp.macro && !wp.id.startsWith(wp.macro + ".") ? `${wp.macro}.${wp.id}` : wp.id

// CR removed, LF to space, leading and trailing spaces trimmed; None unless a non-whitespace character remains.
export const normalizeRelease = (text: string): Option.Option<string> => {
  // The hook's `tr | tr | sed` pipeline, then `$(...)`, which drops NUL. Only spaces are trimmed, never tabs, and
  // `[^[:space:]]` is the C locale's class, so a non-ASCII character always counts.
  const reason = text
    .replaceAll("\r", "")
    .replaceAll("\n", " ")
    .replace(/^ +/, "")
    .replace(/ +$/, "")
    .replaceAll("\u0000", "")
  return /[^ \t\v\f]/.test(reason) ? Option.some(reason) : Option.none()
}

// `<armsDir>/<token>`, refusing a token that fails `RelayArm.Token`.
export const dir = (token: string): Effect.Effect<string, StateError, Store> =>
  Effect.gen(function* () {
    const store = yield* Store
    if (!Schema.is(RelayArm.Token)(token))
      return yield* new StateError({ path: store.armsDir, reason: `invalid arm token ${JSON.stringify(token)}` })
    return path.join(store.armsDir, token)
  })

// A state file's raw text, None when absent. LF-terminated files (`counter`, `retry_*`, `reg_retry`) keep their LF.
export const read = (arm: string, name: string): Effect.Effect<Option.Option<string>, StateError> =>
  Effect.gen(function* () {
    const file = yield* statePath(arm, name)
    return yield* Effect.tryPromise({
      try: () =>
        readFile(file).then(
          // A BOM is data here, as it is to `cat`.
          (bytes) => Option.some(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)),
          (error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? Option.none<string>() : Promise.reject(error)),
        ),
      catch: (error) => new StateError({ path: file, reason: describe(error) }),
    })
  })

// Writes a state file with the Python terminator rule: LF after `counter`, `retry_*` and `reg_retry`, none elsewhere.
export const write = (arm: string, name: string, value: string): Effect.Effect<void, StateError> =>
  Effect.gen(function* () {
    const file = yield* statePath(arm, name)
    const terminated =
      name === RelayArm.Files.counter ||
      name === RelayArm.Files.regRetry ||
      name.startsWith(RelayArm.WpFilePrefix.retry)
    yield* Effect.tryPromise({
      try: () => writeFile(file, terminated ? value + "\n" : value),
      catch: (error) => new StateError({ path: file, reason: describe(error) }),
    })
  })

// The arm's disposition, None when the file is absent. The text is read like `$(cat state)`, and anything but the four
// literals reads as `active`: the hook only ever tests for `complete`, `awaiting-human` and the legacy `escalated`.
export const state = (arm: string): Effect.Effect<Option.Option<RelayArm.State>, StateError> =>
  Effect.map(read(arm, RelayArm.Files.state), (text) =>
    Option.map(text, (value) => {
      const word = substitution(value)
      return Schema.is(RelayArm.State)(word) ? word : "active"
    }),
  )

/**
 * The current position. An arm that predates `position` (absent or empty file) is migrated from `counter`, default 0:
 * a counter inside the plan names that WP; at or past the end it names the last WP (`?` for an empty plan) and the
 * arm is written `complete`. The migrated position is written in canonical form. Read `state` after this.
 */
export const position = (arm: string, sprint: RelaySprint.Sprint): Effect.Effect<string, StateError> =>
  Effect.gen(function* () {
    const current = Option.getOrElse(yield* read(arm, RelayArm.Files.position), () => "")
    // The hook decodes the file through `relay_json_string`, which refuses NUL.
    if (current.includes("\u0000"))
      return yield* new StateError({ path: path.join(arm, RelayArm.Files.position), reason: "position contains NUL" })
    if (current) return current
    const counter = Option.match(yield* read(arm, RelayArm.Files.counter), {
      onNone: () => "0",
      onSome: substitution,
    })
    const index = /^[0-9]+$/.test(counter) ? Number(counter) : 0
    const count = sprint.work_packages.length
    const migrated =
      index < count ? yield* identity(arm, sprint, index) : count === 0 ? "?" : yield* identity(arm, sprint, count - 1)
    yield* write(arm, RelayArm.Files.position, migrated)
    if (index >= count) yield* write(arm, RelayArm.Files.state, "complete")
    return migrated
  })

// Arms in this process that hold their run lock: a stale `.run.lock` is recoverable only when this is false (R6).
const live = new Set<string>()

/**
 * Holds `<arm>/.run.lock` (mkdir) for the whole effect, plus an in-process semaphore per arm. A held lock fails with
 * Busy before anything is read or written; the lock is removed only by its owner.
 */
export const withRunLock = <A, E, R>(arm: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Busy, R> => {
  const key = path.resolve(arm)
  const lock = path.join(key, RelayArm.Files.runLock)
  // Acquire and release are synchronous on purpose: with effect 4.0.0-beta.83 an async step inside them is dropped when
  // the fiber is interrupted, which would leak the lock directory or the in-process entry.
  return Effect.acquireUseRelease(
    Effect.suspend(() => {
      if (live.has(key)) return Effect.fail(new Busy({ lock }))
      // Any mkdir failure is busy, as in the hook: an evaluation that cannot take the lock never starts.
      return Effect.try({ try: () => mkdirSync(lock), catch: () => new Busy({ lock }) }).pipe(
        Effect.andThen(Effect.sync(() => live.add(key))),
      )
    }),
    () => effect,
    () =>
      Effect.try({ try: () => rmdirSync(lock), catch: () => undefined }).pipe(
        Effect.ignore,
        Effect.andThen(Effect.sync(() => live.delete(key))),
      ),
  )
}

// Whether an evaluation in this process holds the arm's run lock.
export const held = (arm: string): boolean => live.has(path.resolve(arm))

// One path segment of the arm directory; per-WP names carry `safe(id)`, so they never need more.
function statePath(arm: string, name: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..")
    return Effect.fail(new StateError({ path: arm, reason: `invalid state file name ${JSON.stringify(name)}` }))
  return Effect.succeed(path.join(arm, name))
}

// `$(cat file)`: NUL bytes dropped and trailing LFs stripped.
function substitution(text: string) {
  return text.replaceAll("\u0000", "").replace(/\n+$/, "")
}

// `read_wp_identity` + `position_value`: the hook exits 1 on an invalid identity rather than guess a position.
function identity(arm: string, sprint: RelaySprint.Sprint, index: number) {
  const wp = sprint.work_packages[index]!
  if (!wp.id || wp.id.includes("\u0000") || wp.macro?.includes("\u0000"))
    return Effect.fail(new StateError({ path: arm, reason: `work_packages[${index}] has an invalid id or macro` }))
  return Effect.succeed(canonicalPosition(wp))
}

function describe(error: unknown) {
  if (error instanceof Error) return (error as NodeJS.ErrnoException).code ?? error.message
  return String(error)
}
