import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../src/process"
import { LayerNode } from "../src/effect/layer-node"
import { Omni } from "../src/omni"

/** Validates actual child receipts; the parent's spawn is deliberately absent from these counts. */
export function validateBrowserSuite(input: {
  output: string; exitCode: number; truncated: boolean; nonce: string; scope: string; mode: string
}) {
  if (input.scope !== "suite" && input.scope !== "declared") throw new Error("Invalid browser control scope")
  if (input.mode !== "on" && input.mode !== "strict") throw new Error("Browser control requires Omni on or strict")
  if (!/^[0-9a-f]{32}$/.test(input.nonce)) throw new Error("Invalid private browser control nonce")
  if (input.exitCode !== 0) throw new Error(`Browser child exited ${input.exitCode}`)
  if (input.truncated) throw new Error("Browser child output was truncated")
  const output = input.output.replace(/\x1b\[[0-9;]*m/g, "").replaceAll("\r", "")
  const summaryLine = output.split("\n").filter((line) => line.startsWith("Ran ")).at(-1)
  const summary = summaryLine === undefined ? undefined : /^Ran (\d+) tests? across (\d+) files?\.(?: \[[^\n]+\])?$/.exec(summaryLine)
  if (!summary) throw new Error("Missing or malformed final Bun browser summary")
  const tests = count(summary[1])
  const files = count(summary[2])
  if (files === 0) throw new Error("Bun browser summary reported zero files")
  const lines = output.split("\n").filter((line) => line.startsWith("omni positive control"))
  if (lines.length !== files) throw new Error(`Browser receipt count ${lines.length} does not match ${files} files`)
  const tag = `omni positive control [${input.nonce}]: `
  const named = new Set<string>()
  const receipts = lines.map((line) => {
    if (!line.startsWith(tag)) throw new Error("Unknown browser control nonce or verdict")
    const body = line.slice(tag.length)
    if (body === "not applicable (focused: no declaring test ran); this run made no omni spawn and delegated none, so it proved nothing about omni.")
      return { declared: 0, spawns: 0, delegations: 0 }
    const match = /^(?:pass) \((focused: no declaring test ran|declared: (\d+) test\(s\) in (.+))\); (\d+) omni spawn\(s\), (\d+) delegated\.$/.exec(body)
    if (!match) throw new Error("Malformed browser control verdict")
    const declared = match[2] === undefined ? 0 : count(match[2])
    if (match[2] !== undefined && declared === 0) throw new Error("Empty declaring browser receipt")
    if (match[3] !== undefined) {
      const paths = match[3].split(", ")
      for (const path of paths) {
        if (!path || named.has(path)) throw new Error("Duplicate declaring browser file receipt")
        named.add(path)
      }
    }
    const spawns = count(match[4])
    const delegations = count(match[5])
    if (spawns === 0) throw new Error("A passing browser receipt must report an Omni spawn")
    return { declared, spawns, delegations }
  })
  const total = receipts.reduce((sum, row) => ({
    declared: count(String(sum.declared + row.declared)),
    spawns: count(String(sum.spawns + row.spawns)),
    delegations: count(String(sum.delegations + row.delegations)),
  }), { declared: 0, spawns: 0, delegations: 0 })
  const problem = Omni.verdict(input.mode, total, input.scope === "suite" || total.declared > 0)
  if (problem) throw new Error(problem)
  // Existing N/A receipts have no file identity. The final Bun file count checks cardinality, not tamper-proof attribution.
  return { ...total, files, tests, verdict: total.spawns === 0 ? "not applicable" as const : "pass" as const }
}

function count(value: string | undefined) {
  if (value === undefined || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error("Invalid browser control count")
  return Number(value)
}

export async function runBrowserSuite() {
  const external = process.env.ORCHESTRA_OMNI_CONTROL_NONCE
  delete process.env.ORCHESTRA_OMNI_CONTROL_NONCE
  const tag = external === undefined || !/^[0-9a-f]{32}$/.test(external)
    ? "omni positive control" : `omni positive control [${external}]`
  const failure = (cause: unknown, code = 1) => {
    console.error(`${tag}: FAIL (${String(cause instanceof Error ? cause.message : cause).slice(0, 8192)}).`)
    process.exitCode = code > 0 ? code : 1
  }
  try {
    if (external !== undefined && !/^[0-9a-f]{32}$/.test(external)) throw new Error("Invalid external browser control nonce")
    const raw = process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
    if (raw !== undefined && !["", "1", "strict"].includes(raw)) throw new Error("Browser suite requires Omni 1 or strict")
    const mode = raw === "strict" ? "strict" : "on"
    const scope = process.env.ORCHESTRA_OMNI_CONTROL ?? "suite"
    if (scope !== "suite" && scope !== "declared") throw new Error("Invalid browser control scope")
    const nonce = randomBytes(16).toString("hex")
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] =>
      entry[1] !== undefined && !["ORCHESTRA_OMNI_CONTROL_NONCE", "ORCHESTRA_OMNI_CONTROL_RUN", "ORCHESTRA_OMNI_CONTROL"].includes(entry[0].toUpperCase())))
    const result = await Effect.runPromise(Effect.gen(function* () {
      const processes = yield* AppProcess.Service
      return yield* processes.run(ChildProcess.make(process.execPath, [
        "test", "--isolate", "--conditions=browser", "--preload",
        fileURLToPath(new URL("../../../script/test-omni-control.ts", import.meta.url)), "--preload",
        fileURLToPath(new URL("../../app-shell/happydom.ts", import.meta.url)),
        ...(process.argv.length > 2 ? process.argv.slice(2) : ["./test-browser"]),
      ], {
        cwd: process.cwd(), shell: false, extendEnv: false,
        env: { ...env, ORCHESTRA_OMNI_CONTROL: "declared", ORCHESTRA_OMNI_CONTROL_NONCE: nonce },
        stdout: "pipe", stderr: "pipe",
      }), { combineOutput: true, maxOutputBytes: 16 * 1024 * 1024 })
    }).pipe(Effect.scoped, Effect.provide(LayerNode.compile(AppProcess.node))))
    const output = result.output?.toString("utf8") ?? ""
    process.stdout.write(output)
    if (output && !output.endsWith("\n")) process.stdout.write("\n")
    try {
      const total = validateBrowserSuite({ output, exitCode: result.exitCode,
        truncated: result.outputTruncated === true || result.stdoutTruncated || result.stderrTruncated, nonce, scope, mode })
      const reason = scope === "suite" ? `suite: ${total.files} isolated files` : total.declared > 0
        ? `declared: ${total.declared} test(s) across ${total.files} isolated files` : "focused: no declaring test ran"
      console.log(total.verdict === "pass"
        ? `${tag}: pass (${reason}); ${total.spawns} omni spawn(s), ${total.delegations} delegated.`
        : `${tag}: not applicable (${reason}); this run made no omni spawn and delegated none, so it proved nothing about omni.`)
    } catch (cause) { failure(cause, result.exitCode) }
  } catch (cause) { failure(cause) }
}
