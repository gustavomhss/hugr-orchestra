export * as ArmState from "./state"

import { Context, Effect, Option, Redacted, Schema } from "effect"
import type { RelayArm } from "@opencode-ai/schema/relay-arm"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"

// Arm state on disk (WP5): file names, the position rule, release normalization and the run lock.

// Where arms live and how their ledgers are sealed. Core binds it to `<Global.data>/relay/<projectID>` (WP10).
export interface StoreInterface {
  readonly armsDir: string
  // `ledger.key`; absent means plain SHA-256 chains. Never reaches agent or check environments.
  readonly ledgerKey: Option.Option<Redacted.Redacted<string>>
}

export class Store extends Context.Service<Store, StoreInterface>()("@opencode/relay/ArmStore") {}

export class Busy extends Schema.TaggedErrorClass<Busy>()("ArmState.Busy", { lock: Schema.String }) {}

export class StateError extends Schema.TaggedErrorClass<StateError>()("ArmState.StateError", {
  path: Schema.String,
  reason: Schema.String,
}) {}

// Every UTF-8 byte outside `[A-Za-z0-9._-]` becomes `_` (`tr -c` works byte by byte).
export const safe = (value: string): string => {
  throw new Error("not implemented")
}

// `relay_position_index`: the whole raw position as a WP ID first, then the raw suffix after its first dot.
export const positionIndex = (sprint: RelaySprint.Sprint, position: string): Option.Option<number> => {
  throw new Error("not implemented")
}

// The canonical position: `<macro>.<id>`, unless the ID already starts with that exact prefix.
export const canonicalPosition = (wp: RelaySprint.WorkPackage): string => {
  throw new Error("not implemented")
}

// CR removed, LF to space, leading and trailing spaces trimmed; None unless a non-whitespace character remains.
export const normalizeRelease = (text: string): Option.Option<string> => {
  throw new Error("not implemented")
}

// `<armsDir>/<token>`, refusing a token that fails `RelayArm.Token`.
export const dir = (token: string): Effect.Effect<string, StateError, Store> => Effect.die("not implemented")

// A state file's raw text, None when absent. LF-terminated files (`counter`, `retry_*`, `reg_retry`) keep their LF.
export const read = (arm: string, name: string): Effect.Effect<Option.Option<string>, StateError> =>
  Effect.die("not implemented")

// Writes a state file with the Python terminator rule: LF after `counter`, `retry_*` and `reg_retry`, none elsewhere.
export const write = (arm: string, name: string, value: string): Effect.Effect<void, StateError> =>
  Effect.die("not implemented")

export const state = (arm: string): Effect.Effect<Option.Option<RelayArm.State>, StateError> =>
  Effect.die("not implemented")

/**
 * Holds `<arm>/.run.lock` (mkdir) for the whole effect, plus an in-process semaphore per arm. A held lock fails with
 * Busy before anything is read or written; the lock is removed only by its owner.
 */
export const withRunLock = <A, E, R>(arm: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Busy, R> =>
  Effect.die("not implemented")
