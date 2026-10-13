export * as LeanSummary from "./lean-summary"

import { createHash } from "node:crypto"
import path from "node:path"
import { defaultSummarizeOptions, recoveryLine, summarize } from "hugr-lean/core"
import { RawStore, recallLines } from "hugr-lean/raw"
import { Global } from "../global"

export { defaultSummarizeOptions, recallLines, recoveryLine, summarize }

/** Native tools whose model-visible text Lean 2.0 summarizes or compacts. */
export const tools = ["bash", "read", "webfetch", "glob", "grep"] as const
export type Tool = (typeof tools)[number]
export const supported = (tool: string): tool is Tool => tools.some((item) => item === tool)

export const MAX_BYTES = 64 * 1024 * 1024
export const TTL_MS = 7 * 24 * 60 * 60 * 1000
const stores = new Map<string, RawStore>()

/** Same identity as the Lean profile preferences: one project at one directory. */
export function directory(owner: { readonly projectID: string; readonly directory: string }, root = Global.Path.data) {
  const id = createHash("sha256").update(JSON.stringify([owner.projectID, owner.directory])).digest("hex")
  return path.join(root, "lean", "raw", id)
}

/** Bounded, self-cleaning store of complete originals: expired records go on every write, the oldest when full. */
export function store(owner: { readonly projectID: string; readonly directory: string }, root?: string) {
  const location = directory(owner, root)
  const existing = stores.get(location)
  if (existing) return existing
  const created = new RawStore({ directory: location, maxBytes: MAX_BYTES, ttlMs: TTL_MS, evict: true })
  stores.set(location, created)
  return created
}
