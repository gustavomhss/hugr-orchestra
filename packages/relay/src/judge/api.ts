export * as JudgeApi from "./api"

import { Effect, Redacted } from "effect"
import { JudgeBallot } from "./ballot"
import type { JudgeConfig } from "./config"

const SYSTEM =
  "You are an INDEPENDENT compliance auditor. You did NOT write the artifact under review. " +
  "Judge ONLY whether the stated criterion is satisfied by the provided artifact — nothing else. " +
  "Be strict and literal. If the evidence is missing, ambiguous, or you are uncertain, return FAIL: " +
  "an unproven control is a failed control. End your reply with a final line that is exactly " +
  "'VERDICT: PASS' or 'VERDICT: FAIL'."

const TOOL = {
  name: "submit_verdict",
  description: "Return the compliance verdict for the stated criterion.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["pass", "fail"] },
      reason: { type: "string", description: "One or two sentences of justification." },
    },
    required: ["verdict", "reason"],
  },
}

// Python's `str.isspace` and `str.splitlines` sets, which differ from JavaScript's `trim` and `\s`.
const SPACE = String.raw`[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]`
const EDGE = new RegExp(`^${SPACE}+|${SPACE}+$`, "g")
const BREAK = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/

/**
 * The Messages API backend (WP4): a forced `submit_verdict` tool call, falling back to an exact `VERDICT: PASS|FAIL`
 * last declaration. Context is cut at `maxContext` characters per file and the cut is announced; a missing file reads
 * `(file not found)`. Transport errors and missing verdicts are unavailable samples, never votes.
 */
export const judge = (config: JudgeConfig.Config, input: JudgeConfig.Input): Effect.Effect<JudgeBallot.Response> => {
  const context = read(input.files, config.maxContext)
  const prompt =
    `CRITERION:\n${input.criterion}\n\nARTIFACT UNDER REVIEW:\n${context.text}\n\n` +
    "Does the artifact satisfy the criterion? Reason briefly, then give the VERDICT line."
  return JudgeBallot.collect(config.votes, once(config, prompt, context.cuts))
}

function once(config: JudgeConfig.Config, prompt: string, cuts: ReadonlyArray<string>) {
  const base = (config.baseURL ?? "").replace(/\/+$/, "")
  const key = config.apiKey === undefined ? "" : Redacted.value(config.apiKey)
  const failed = (reason: string, cut: ReadonlyArray<string>) => sample(config.model, cut, "fail", reason, "error")
  // A custom endpoint may not authenticate at all (a loopback gateway), but sending nothing to api.anthropic.com is a
  // guaranteed 401 dressed up as a judgment. The key comes only from the judge config, never a provider's environment.
  if (!key && !base) return Effect.succeed(failed("api: judge API key not set", []))
  return Effect.tryPromise({
    try: (signal) =>
      fetch(`${base || "https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        signal,
        // Never forward the key to wherever a redirect points; a 3xx is an HTTP error like any other non-2xx.
        redirect: "manual",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          system: SYSTEM,
          tools: [TOOL],
          tool_choice: { type: "tool", name: "submit_verdict" },
          // A compatible gateway may stream by default, and a streamed body parses as no verdict.
          stream: false,
          messages: [{ role: "user", content: prompt }],
        }),
      }).then((response) => {
        if (!response.ok) throw new Error(`HTTP Error ${response.status}: ${response.statusText}`)
        return response.json() as Promise<unknown>
      }),
    catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
  }).pipe(
    Effect.timeoutOrElse({ duration: "60 seconds", orElse: () => Effect.fail("timed out") }),
    Effect.map((reply) => decide(reply, config.model, cuts)),
    Effect.catch((message) => Effect.succeed(failed(`api error: ${message}`, cuts))),
  )
}

// The reply as `_judge_api_once` reads it: the first `submit_verdict` call decides, otherwise the last prose
// declaration. A malformed reply is an error sample with Python's message.
function decide(reply: unknown, model: string, cuts: ReadonlyArray<string>): JudgeBallot.Sample {
  const malformed = (message: string) => sample(model, cuts, "fail", `api error: ${message}`, "error")
  if (!record(reply)) return malformed("response must be an object")
  const blocks = Object.hasOwn(reply, "content") ? reply.content : []
  if (!Array.isArray(blocks) || !blocks.every(record)) return malformed("response content must be a list of objects")
  const call = blocks.find((block) => block.type === "tool_use" && block.name === "submit_verdict")
  if (call) {
    const input = call.input
    if (!record(input)) return malformed("submit_verdict input must be an object")
    if (input.verdict !== "pass" && input.verdict !== "fail")
      return malformed("submit_verdict verdict must be pass or fail")
    if (typeof input.reason !== "string") return malformed("submit_verdict reason must be a string")
    return sample(model, cuts, input.verdict, head(input.reason, 300) || "(no reason given)", "answered")
  }
  const bad = blocks.findIndex((block) => Object.hasOwn(block, "text") && typeof block.text !== "string")
  // `"".join(...)` over a non-string text.
  if (bad !== -1) return malformed(`sequence item ${bad}: expected str instance, ${pythonType(blocks[bad]!.text)} found`)
  const text = blocks.map((block) => (typeof block.text === "string" ? block.text : "")).join("")
  const lines = strip(text) ? strip(text).split(BREAK) : []
  const verdict = declared(lines)
  const last = lines.at(-1) ?? "no response"
  // A judge that never reached a verdict still fails the control, but it is not recorded as a judgment.
  const reason = verdict
    ? last
    : `no VERDICT line in ${Array.from(text).length} chars of reply (truncated at max_tokens?): ${last}`
  return sample(model, cuts, verdict ?? "fail", head(reason, 300), verdict ? "answered" : "no-verdict")
}

// Only an exact verdict line is a judgment; a malformed last declaration is unavailable.
function declared(lines: ReadonlyArray<string>) {
  const line = lines.findLast((line) => strip(line).toUpperCase().startsWith("VERDICT:"))
  if (line === undefined) return undefined
  const normalized = strip(line).toUpperCase()
  if (normalized === "VERDICT: PASS") return "pass"
  if (normalized === "VERDICT: FAIL") return "fail"
  return undefined
}

// `read_ctx`: never cut a file silently. The cut is announced to the model and returned for the backend tag.
function read(files: ReadonlyArray<JudgeConfig.File>, max: number) {
  const parts = files.map((file) => {
    // `os.path.basename`: whatever follows the last slash.
    const name = file.name.slice(file.name.lastIndexOf("/") + 1)
    const body = file.text ?? "(file not found)"
    const shown = head(body, max)
    if (shown === body) return { name, cut: false, text: `--- ${name} ---\n${body}` }
    const note =
      `\n\n[TRUNCATED at ${max} characters — the rest of ${name} was NOT shown to you. ` +
      "If the criterion cannot be decided from what is here, return FAIL and say so.]"
    return { name, cut: true, text: `--- ${name} ---\n${shown}${note}` }
  })
  return {
    text: parts.length > 0 ? parts.map((part) => part.text).join("\n\n") : "(no artifact provided)",
    cuts: parts.filter((part) => part.cut).map((part) => part.name),
  }
}

// The first `count` code points, as Python slices a str.
function head(text: string, count: number) {
  if (text.length <= count) return text
  const end = Array.from(text.slice(0, count * 2)).slice(0, count).join("").length
  return text.slice(0, end)
}

function strip(text: string) {
  return text.replace(EDGE, "")
}

function sample(
  model: string,
  cuts: ReadonlyArray<string>,
  verdict: "pass" | "fail",
  reason: string,
  state: JudgeBallot.Sample["state"],
): JudgeBallot.Sample {
  return { verdict, reason, state, backend: "llm", model, cuts }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Python's name for the type of a decoded JSON value.
function pythonType(value: unknown) {
  if (value === null) return "NoneType"
  if (typeof value === "boolean") return "bool"
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float"
  if (Array.isArray(value)) return "list"
  return "dict"
}
