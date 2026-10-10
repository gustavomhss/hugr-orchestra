export * as LeanProfilePreferences from "./lean-profile-preferences"

import { Effect, Schema } from "effect"
import type { FSUtil } from "@orchestra/core/fs-util"
import type { Global } from "@orchestra/core/global"
import type { LeanCoverage } from "@orchestra/schema/lean-coverage"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"

export interface Owner { readonly projectID: string; readonly directory: string }
export interface State {
  readonly scope: LeanDashboard.Scope
  readonly enabled?: boolean
  readonly items: LeanCoverage.Settings
}
export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("LeanPreferences.Unavailable", {
  message: Schema.String,
}) {}

// Frozen dependency signature. Explicit unavailable until the persistence owner fills implementation.
export const read: (owner: Owner) => Effect.Effect<State, Unavailable, FSUtil.Service | Global.Service> = () =>
  Effect.fail(new Unavailable({ message: "Lean profile preferences implementation unavailable" }))
export const update: (owner: Owner, value: LeanDashboard.Update) => Effect.Effect<State, Unavailable, FSUtil.Service | Global.Service> = () =>
  Effect.fail(new Unavailable({ message: "Lean profile preferences implementation unavailable" }))
