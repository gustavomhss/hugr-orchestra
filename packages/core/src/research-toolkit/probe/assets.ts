export * as ProbeAssets from "./assets"

import path from "path"
import { lstat, realpath } from "fs/promises"
import { Effect, Schema } from "effect"
import { FSUtil } from "../../fs-util"
import { ResearchToolkit } from "../index"

// T-P4, from A/engine/trusted-assets.ts:9: a project's own tool is code the probe runs, so it is accepted only as the
// named package with its declared bin entry inside the package. The selector is closed; no model-supplied path reaches it.

export class ProbeError extends Schema.TaggedErrorClass<ProbeError>()("Probe.Error", {
  code: Schema.Literals(["probe_denied", "probe_unsupported_platform"]),
  reason: Schema.String,
  /** The runners an ambiguous project offers. */
  options: Schema.optional(Schema.Array(Schema.String)),
}) {}

export const denied = (reason: string, options?: ReadonlyArray<string>) => new ProbeError({ code: "probe_denied", reason, options })

export type Kind = "typescript" | "vitest" | "jest"

const BIN: Record<Kind, string> = { typescript: "tsc", vitest: "vitest", jest: "jest" }

export type Asset = { readonly kind: Kind; readonly root: string; readonly entry: string; readonly version: string }

/** The nearest `node_modules/<kind>` from `from` up to `top`, verified; undefined when the project has none. */
export const project = Effect.fn("ProbeAssets.project")(function* (kind: Kind, from: string, top: string) {
  const found = yield* Effect.promise(() => nearest(kind, from, top))
  if (!found) return undefined
  return yield* verify(kind, found)
})

/** The project's typescript, else the research pack's (J6). */
export const typescript = Effect.fn("ProbeAssets.typescript")(function* (from: string, top: string) {
  const own = yield* project("typescript", from, top)
  if (own) return own
  // The pack may not be installed or ready yet; the probe then names the gap.
  const pack = yield* ResearchToolkit.ensure("typescript").pipe(Effect.catchCause(() => Effect.succeed(undefined)))
  if (!pack) return yield* denied("typescript-unavailable: the project has no node_modules/typescript and the research pack is not ready")
  return { kind: "typescript" as const, root: path.dirname(pack.executable), entry: pack.executable, version: "pack" }
})

export const verify = Effect.fn("ProbeAssets.verify")(function* (kind: Kind, metadata: string) {
  const root = path.dirname(yield* Effect.promise(() => realpath(metadata)))
  const info: unknown = yield* Effect.promise(() => Bun.file(metadata).json().catch(() => undefined))
  if (!info || typeof info !== "object" || !("name" in info) || info.name !== kind)
    return yield* denied(`trusted-asset-package-invalid: ${kind}`)
  const bin = "bin" in info ? info.bin : undefined
  const declared = typeof bin === "string" ? bin : bin && typeof bin === "object" && BIN[kind] in bin ? (bin as Record<string, unknown>)[BIN[kind]] : undefined
  if (typeof declared !== "string") return yield* denied(`trusted-asset-entry-invalid: ${kind}`)
  const entry = yield* Effect.promise(() => realpath(path.resolve(root, declared)).catch(() => undefined))
  const file = entry ? yield* Effect.promise(() => lstat(entry).then((stat) => stat.isFile(), () => false)) : false
  if (!entry || !file || !FSUtil.contains(root, entry)) return yield* denied(`trusted-asset-escape: ${kind}`)
  const version = "version" in info && typeof info.version === "string" ? info.version : "unknown"
  return { kind, root, entry, version } satisfies Asset
})

async function nearest(kind: Kind, from: string, top: string): Promise<string | undefined> {
  const metadata = path.join(from, "node_modules", kind, "package.json")
  if (await Bun.file(metadata).exists()) return metadata
  if (from === top || !FSUtil.contains(top, from)) return undefined
  return nearest(kind, path.dirname(from), top)
}
