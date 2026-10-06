export * as BackendToolkit from "./index"

import path from "path"
import { Context, Schema } from "effect"
import { Global } from "../global"
import { ENGINES, type Engine, type EngineId } from "./manifest"
import type { TargetId } from "./target"

// The backend specialist's engines are fetched by the host on first use (the backend seat's shell has no network),
// verified against the pinned manifest and cached per user. This module holds the frozen types; the per-engine state
// machine (`absent → fetching → ready | failed`), prefetch and shell preparation arrive with the host wiring.

export type EngineState =
  | { readonly status: "absent" }
  | { readonly status: "fetching" }
  | { readonly status: "ready"; readonly directory: string; readonly executable: string }
  | { readonly status: "failed"; readonly cause: string; readonly at: number }

export type State =
  | { readonly target: TargetId; readonly engines: Readonly<Record<EngineId, EngineState>> }
  | { readonly unsupported: string }

/** `reason` is `toolkit-not-ready:failed:<engine>:<cause>` or `unsupported-target:<reason>`. */
export class NotReady extends Schema.TaggedErrorClass<NotReady>()("BackendToolkit.NotReady", {
  reason: Schema.String,
}) {
  override get message() {
    return `Backend toolkit not ready: ${this.reason}`
  }
}

/** Cache root holding one install directory per engine version and target. */
export const Root = Context.Reference<string>("@opencode/BackendToolkit/Root", {
  defaultValue: () => process.env.BACKEND_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "backend-toolkit"),
})

export const Manifest = Context.Reference<Readonly<Record<EngineId, Engine>>>("@opencode/BackendToolkit/Manifest", {
  defaultValue: () => ENGINES,
})
