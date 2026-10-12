export * as ToolSafetySrtReadAlias from "./tool-safety-srt-read-alias"

import path from "path"
import { createHash } from "crypto"
import { Effect } from "effect"
import { ToolSafety } from "./tool-safety"

export const REVISION = "read-alias-2"

// srt 0.0.78, dist/sandbox/linux-sandbox-utils.js, from the integrity-pinned npm archive.
const ORIGINAL = "tu3rZpurMCnY0tUKGGII+JhDEbObzOYWfepEQ14DsTM="

/** Adapt only the verified upstream bytes; no directory or writable cross-root restoration is introduced. */
export function transform(input: string) {
  if (createHash("sha256").update(input).digest("base64") !== ORIGINAL)
    throw new Error("sandbox-runtime-read-alias-integrity-mismatch")

  return [
    ["const restorePlacementOf = (p) => {", "const restorePlacementOf = (p, readOnly = false) => {"],
    [
      "if (!isAtOrUnder(source, landing)) {",
      `if (!isAtOrUnder(source, landing) && !(readOnly &&
            readAllowPaths.some(grant => unit.nameLocation(grant) === source &&
                unit.resolve(grant).resolved && unit.resolve(grant).canonical === source) &&
            !allowedWritePaths.some(root => isAtOrUnder(source, root)) &&
            !unit.sourceReadDenied(source) &&
            fs.statSync(source).isFile())) {`,
    ],
    ["const placement = restorePlacementOf(allowPath);", "const placement = restorePlacementOf(allowPath, true);"],
    [
      "readDenialAround: restoreTarget => readDenialAround(restoreTarget, landing),",
      `readDenialAround: restoreTarget => readDenialAround(restoreTarget, landing),
                sourceReadDenied: target => readDeniedLocations.some(denied =>
                    isAtOrUnder(target, denied) || isAtOrUnder(denied, target)),`,
    ],
  ].reduce((source, change) => {
    if (source.split(change[0]).length !== 2) throw new Error("sandbox-runtime-read-alias-patch-mismatch")
    return source.replace(change[0], change[1])
  }, input)
}

/** Called in acquisition staging, before publication; existing runtime installations are never modified. */
export const apply = Effect.fn("ToolSafetySrtReadAlias.apply")(function* (directory: string) {
  const file = path.join(directory, "node_modules", "@anthropic-ai", "sandbox-runtime", "dist", "sandbox", "linux-sandbox-utils.js")
  yield* Effect.tryPromise({
    try: async () => Bun.write(file, transform(await Bun.file(file).text())),
    catch: (error) => new ToolSafety.Denied({ reason: error instanceof Error && error.message.startsWith("sandbox-runtime-read-alias-")
      ? error.message : "sandbox-runtime-read-alias-acquisition" }),
  })
})
