import { existsSync } from "node:fs"
import { join } from "node:path"
import type { AtlasHealthResult } from "@orchestra/atlas-boundary/surface"
import type { Npm } from "@orchestra/core/npm"
import type { AppProcess } from "@orchestra/core/process"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { Unavailable } from "@/server/atlas-surface"

// D38: Orchestra runs the indexer the store's plan names, from the repository root, so Genesis has the code graph it
// ranks sites by. TypeScript first, else Python, else nothing: both tools write the one `.atlas/index.scip` the readers
// open. The package comes from Orchestra's package cache at the version Atlas pins (adapter-io/src/scip.ts) and runs with
// Orchestra's own Bun, so the machine needs no Node. A failed run reports the tail of its stderr.

export type Result =
  | { readonly state: "empty" }
  | {
      readonly state: "ok"
      readonly ran: boolean
      readonly tool: string | null
      readonly exitCode: number | null
      /** Documents in the index after the run, or null when there is none. */
      readonly documents: number | null
      readonly message: string | null
    }

export type Services = {
  readonly npm: Npm.Interface
  readonly processes: AppProcess.Interface
  readonly health: () => Effect.Effect<AtlasHealthResult, Unavailable>
}

const PACKAGES = [
  ["scip-typescript", "@sourcegraph/scip-typescript"],
  ["scip-python", "@sourcegraph/scip-python"],
] as const

export const index = Effect.fn("AtlasIndex.index")(function* (services: Services, root: string) {
  const health = yield* services.health()
  if (health.state === "empty") return { state: "empty" as const }
  const planned = PACKAGES.flatMap(([tool, pkg]) =>
    health.index.configured.filter((lang) => lang.plan.tool === tool).map((lang) => ({ ...lang.plan, pkg })),
  )[0]
  if (!planned) return done(false, null, null, null, "no indexer is configured for this repository's languages")
  const bin = yield* services.npm.which(`${planned.pkg}@${planned.version}`, planned.tool)
  if (!bin) return done(false, planned.tool, null, null, `could not install ${planned.pkg}@${planned.version}`)
  const args = [
    ...planned.args,
    ...(planned.tool === "scip-typescript" && !existsSync(join(root, "tsconfig.json")) ? ["--infer-tsconfig"] : []),
  ]
  const ran = yield* services.processes
    .run(
      ChildProcess.make(process.execPath, [bin, ...args], {
        cwd: root,
        env: { BUN_BE_BUN: "1" },
        extendEnv: true,
        stdin: "ignore",
      }),
      { timeout: "10 minutes", maxOutputBytes: 1_000_000, maxErrorBytes: 64_000 },
    )
    .pipe(
      Effect.map((result) => ({ exitCode: result.exitCode, stderr: result.stderr.toString("utf8") })),
      Effect.catch((error) => Effect.succeed({ exitCode: -1, stderr: error.message })),
    )
  const after = yield* services.health()
  const documents = after.state === "ok" && after.index.scip.kind === "present" ? after.index.scip.documents : null
  const failure = ran.stderr.trim().slice(-300) || `${planned.tool} exited with ${ran.exitCode}`
  return done(true, planned.tool, ran.exitCode, documents, ran.exitCode === 0 ? null : failure)
})

function done(ran: boolean, tool: string | null, exitCode: number | null, documents: number | null, message: string | null) {
  return { state: "ok" as const, ran, tool, exitCode, documents, message }
}

export * as AtlasIndex from "./atlas-index"
