export * as Guardrail from "./guardrail"

import fs from "fs"
import path from "path"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Guardrail } from "@orchestra/schema/guardrail"
import { makeLocationNode } from "./effect/app-node"
import { Location } from "./location"
import { AppProcess } from "./process"
import { which } from "./util/which"

export const Rules = Guardrail.Rules
export type Rules = typeof Rules.Type
export const Report = Guardrail.Report
export type Report = typeof Report.Type
export const RunInput = Guardrail.RunInput
export type RunInput = typeof RunInput.Type

// The engine could not be started or its answer could not be read. Findings and setup problems of the
// repository itself (no rules, unknown base) are not this error: they come back inside the report.
export class EngineError extends Schema.TaggedErrorClass<EngineError>()("Guardrail.EngineError", {
  kind: Guardrail.EngineErrorKind,
  message: Schema.String,
}) {}

export interface Interface {
  readonly rules: () => Effect.Effect<Rules, EngineError>
  readonly run: (input: RunInput) => Effect.Effect<Report, EngineError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Guardrail") {}

const ENGINE = path.join("script", "guards", "run.ts")
const SECONDS = 60
const decodeRules = Schema.decodeUnknownOption(Schema.fromJsonString(Rules))
const decodeReport = Schema.decodeUnknownOption(Schema.fromJsonString(Report))

// The engine is the repository's own script/guards, run with the checkout as `--cwd`. Arguments are an
// array without a shell; a base ref reaches it behind `--base`, so it can never read as an option.
export const make = Effect.fn("Guardrail.make")(function* (input: { directory: string; env?: NodeJS.ProcessEnv }) {
  const proc = yield* AppProcess.Service

  const engine = Effect.fn("Guardrail.engine")(function* (args: string[]) {
    const script = path.join(input.directory, ENGINE)
    if (!fs.existsSync(script))
      return yield* new EngineError({ kind: "no-engine", message: "This repository has no script/guards engine" })
    const bun = which("bun", input.env ?? process.env)
    if (!bun) return yield* new EngineError({ kind: "no-bun", message: "bun is not installed on this server" })
    const result = yield* proc
      .run(
        ChildProcess.make(bun, [script, "--cwd", input.directory, ...args], {
          cwd: input.directory,
          env: engineEnv(input.env ?? process.env),
          extendEnv: false,
          stdin: "ignore",
        }),
        { maxOutputBytes: 8 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: `${SECONDS} seconds` },
      )
      .pipe(
        Effect.mapError(
          (error) => new EngineError({ kind: "failed", message: `The guards engine did not finish: ${error}`.slice(0, 300) }),
        ),
      )
    // Exit 1 is a normal answer (a gate finding or a setup error); the JSON on stdout is what counts.
    if (result.stdoutTruncated) return yield* unreadable()
    return result.stdout.toString("utf8")
  })

  const rules = Effect.fn("Guardrail.rules")(function* () {
    const decoded = decodeRules(yield* engine(["--rules"]))
    return Option.isSome(decoded) ? decoded.value : yield* unreadable()
  })

  const run = Effect.fn("Guardrail.run")(function* (request: RunInput) {
    const decoded = decodeReport(yield* engine(["--json", ...(request.base ? ["--base", request.base] : [])]))
    return Option.isSome(decoded) ? decoded.value : yield* unreadable()
  })

  return Service.of({ rules, run })
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    return yield* make({ directory: location.directory })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Location.node, AppProcess.node] })

// The engine is the checked repository's own code, so it never sees the server's secrets (API keys, tokens):
// only what a process needs to start, plus the engine's own GUARDRAIL_* settings.
const ENGINE_ENV = ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SystemRoot", "LANG", "LC_ALL"]

function engineEnv(source: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && (ENGINE_ENV.includes(entry[0]) || entry[0].startsWith("GUARDRAIL_")),
    ),
  )
}

function unreadable() {
  return new EngineError({ kind: "unreadable", message: "The guards engine did not return a readable report" })
}
