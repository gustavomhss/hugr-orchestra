export * as ArsenalVerification from "./arsenal-verification"

import path from "node:path"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
import { ToolSafetySandbox } from "@opencode-ai/core/tool-safety-sandbox"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"

const Count = Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(4096))
const Case = Schema.Struct({
  "@name": Schema.NonEmptyString,
  "@file": Schema.NonEmptyString,
  "@assertions": Count,
  skipped: Schema.optional(Schema.Unknown),
  failure: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
})
const Suite = Schema.Struct({ "@tests": Count, "@failures": Count, "@skipped": Count, "@assertions": Count, testcase: Schema.optional(Schema.Array(Case)) })
const Document = Schema.Struct({ testsuites: Schema.Struct({ "@tests": Count, "@failures": Count, "@skipped": Count, "@assertions": Count, testsuite: Schema.Array(Suite) }) })
export type Report = {
  source: "bun-junit"
  snapshot: string
  tests: number
  executed: number
  skipped: number
  failed: number
  assertions: number
  cases: { name: string; file: string; status: "pass" | "fail" | "skip" }[]
}

/** Fixed native Bun verifier; zero exit alone is not execution evidence. */
export const run = Effect.fn("ArsenalVerification.run")(function* (
  directory: string,
  authorize: (command: string) => Effect.Effect<void>,
) {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const temporary = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".arsenal-verification-" })
  const file = path.join(temporary, "junit.xml")
  const args = ["test", "--timeout", "30000", "--reporter=junit", `--reporter-outfile=${file}`]
  yield* authorize([process.execPath, ...args].map((item) => JSON.stringify(item)).join(" "))
  const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(process.execPath, args, { cwd: directory, extendEnv: false }))
  const result = yield* processes.run(command, { timeout: "55 seconds", maxOutputBytes: 1024, maxErrorBytes: 1024 })
  if (result.stdoutTruncated || result.stderrTruncated) return { outcome: { status: "acquisition-error" as const }, reason: "RUNNER_OUTPUT_OVERFLOW" }
  const info = yield* fs.stat(file).pipe(Effect.orElseSucceed(() => undefined))
  if (!info) return { outcome: { status: "missing" as const }, reason: "RUNNER_REPORT_MISSING" }
  if (info.type !== "File" || info.size > 512 * 1024) return { outcome: { status: "acquisition-error" as const }, reason: "RUNNER_REPORT_OVERFLOW_OR_TYPE" }
  if ((yield* fs.realPath(file)) !== file) return { outcome: { status: "acquisition-error" as const }, reason: "RUNNER_REPORT_SYMLINK" }
  const bytes = yield* fs.readFileString(file)
  if (Buffer.byteLength(bytes, "utf8") !== Number(info.size)) return { outcome: { status: "acquisition-error" as const }, reason: "RUNNER_REPORT_CHANGED" }
   const acquired = yield* decodeReport(bytes).pipe(Effect.result)
  if (acquired._tag === "Failure") return { outcome: { status: "acquisition-error" as const }, reason: acquired.failure.message }
  const suites = acquired.success.testsuite
  const cases = suites.flatMap((suite) => (suite.testcase ?? []).map((item) => ({ name: item["@name"], file: item["@file"], assertions: item["@assertions"], status: "skipped" in item ? "skip" as const : "failure" in item || "error" in item ? "fail" as const : "pass" as const })))
  const skipped = cases.filter((item) => item.status === "skip").length
  const failed = cases.filter((item) => item.status === "fail").length
  const assertions = cases.reduce((total, item) => total + item.assertions, 0)
   if (!suites.length || !cases.length || cases.length > 4096 || acquired.success["@tests"] !== cases.length || acquired.success["@skipped"] !== skipped || acquired.success["@failures"] !== failed || acquired.success["@assertions"] !== assertions || suites.some((suite) => suite["@tests"] !== (suite.testcase ?? []).length || suite["@assertions"] !== (suite.testcase ?? []).reduce((total, item) => total + item["@assertions"], 0) || suite["@skipped"] !== (suite.testcase ?? []).filter((item) => "skipped" in item).length || suite["@failures"] !== (suite.testcase ?? []).filter((item) => "failure" in item || "error" in item).length)) return { outcome: { status: "acquisition-error" as const }, reason: "RUNNER_COUNTS_EMPTY_OR_CONTRADICTORY" }
  const report: Report = { source: "bun-junit", snapshot: createHash("sha256").update(bytes).digest("hex"), tests: cases.length, executed: cases.length - skipped, skipped, failed, assertions, cases: cases.map((item) => ({ name: item.name, file: item.file, status: item.status })) }
  const outcome: ArsenalCompletion.CheckOutcome = failed || result.exitCode !== 0
    ? { status: "fail", exitCode: result.exitCode === 0 ? 1 : Math.min(255, Math.max(1, result.exitCode)) }
    : skipped || report.executed === 0 ? { status: "skip" } : { status: "pass", exitCode: 0 }
  return { outcome, report, reason: skipped ? "RUNNER_SKIPPED_CASES" : undefined }
}, Effect.scoped)

/** Parse the installed Bun reporter's XML; absent counts remain acquisition failure. */
export const decodeReport = (bytes: string) => Effect.tryPromise({
  try: async () => {
    // Already installed through the Bedrock dependency tree. No provider module is loaded.
    // createRequire resolves under both Bun and the desktop's Node sidecar, where Bun.resolveSync does not exist.
    const { XMLParser, XMLValidator } = await import(createRequire(createRequire(import.meta.url).resolve("@ai-sdk/amazon-bedrock")).resolve("fast-xml-parser"))
    if (XMLValidator.validate(bytes, { allowBooleanAttributes: false }) !== true) throw new Error("RUNNER_XML_INVALID")
    const parsed: unknown = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: false, isArray: (name: string) => name === "testsuite" || name === "testcase" }).parse(bytes)
    return Schema.decodeUnknownSync(Document)(parsed).testsuites
  },
  catch: () => new Error("RUNNER_REPORT_INVALID_OR_PARSER_UNAVAILABLE"),
})
