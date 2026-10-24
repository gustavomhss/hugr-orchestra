export * as LeanSummary from "./lean-summary"

import { Effect, Layer, Context } from "effect"
import { RawStore } from "hugr-lean/raw"
import { Global } from "../global"

export { defaultSummarizeOptions, recoveryLine, summarize } from "hugr-lean/core"
export { recallLines, RawStore } from "hugr-lean/raw"

/** Native tools whose model-visible text Lean 2.0 summarizes or compacts. */
export const tools = ["bash", "read", "webfetch", "glob", "grep"] as const
export type Tool = (typeof tools)[number]
export const supported = (tool: string): tool is Tool => tools.some((item) => item === tool)

export const MAX_BYTES = 64 * 1024 * 1024
export const TTL_MS = 7 * 24 * 60 * 60 * 1000
const stores = new Map<string, import("hugr-lean/raw").RawStore>()

/** Same identity as the Lean profile preferences: one project at one directory. */
export function directory(owner: { readonly projectID: string; readonly directory: string }, root = Global.Path.data) {
  const crypto = require("node:crypto")
  const id = crypto.createHash("sha256").update(JSON.stringify([owner.projectID, owner.directory])).digest("hex")
  return require("node:path").join(Global.Path.data, "lean", "raw", id)
}

/** Bounded, self-cleaning store of complete originals: expired records go on every write, the oldest when full. */
export function store(owner: { readonly projectID: string; readonly directory: string }, root?: string) {
  const location = directory(owner, root)
  const existing = stores.get(location)
  if (existing) return existing
  const { RawStore } = require("hugr-lean/raw")
  const created = new RawStore({ directory: location, maxBytes: MAX_BYTES, ttlMs: TTL_MS, evict: true })
  stores.set(location, created)
  return created
}

export class Service extends Context.Service<Service, {
  readonly store: (owner: { readonly projectID: string; readonly directory: string }) => import("hugr-lean/raw").RawStore
}>()("LeanSummary.Store") {}

export const Store = {
  Service,
  node: Layer.effectDiscard(
    Effect.gen(function* () {
      const service = Service.of({ store })
      yield* Effect.logInfo("Lean Summary Store service registered")
    }),
  ),
}