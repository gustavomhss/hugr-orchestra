import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { query } from "@anthropic-ai/claude-agent-sdk"
import type { HookInput, HookJSONOutput, Options } from "@anthropic-ai/claude-agent-sdk"

// The executor and SDK are real. Only the HTTP model is scripted. No Lean parser is under test yet.
const keep = "SDK_PROBE_KEEP_😀"
const noise = "SDK_PROBE_NOISE"
const warning = "SDK_PROBE_STDERR_WARNING"
const reduced = `${keep}\n`
type Mode = "baseline" | "replace" | "invalid" | "competing"
type Block = { type: string; tool_use_id?: string; content?: string | Block[]; text?: string; is_error?: boolean }
type Request = { stream?: boolean; messages: { role: string; content: string | Block[] }[] }

test("pinned native Bash replacement reaches the next provider request and survives SDK resume", async () => {
  await using run = await probe("replace", 0)
  verify(run, "reduced")
  const original = success(run.hooks)
  expect(original.tool_use_id).toBe(run.id)
  expect(original.tool_response).toMatchObject({ interrupted: false })
  expect(JSON.stringify(original.tool_response)).toContain(noise)
  expect(JSON.stringify(original.tool_response)).toContain(warning)
  expect(JSON.stringify(run.replacement)).toContain(warning)
  const { stdout: before, ...metadata } = record(original.tool_response)
  const { stdout: after, ...updated } = record(run.replacement)
  expect(updated).toEqual(metadata)
  expect(after).toContain(keep)
  expect(after).not.toContain(noise)
  expect(Buffer.byteLength(String(after))).toBeLessThan(Buffer.byteLength(String(before)))
  const count = run.requests.length
  const resumed = query({ prompt: "Continue without executing another tool.", options: { ...run.options, resume: run.session } })
  let finished = false
  try {
    for await (const message of resumed) if (message.type === "result") {
      expect(message.subtype).toBe("success")
      finished = true
    }
  } finally {
    resumed.close()
  }
  expect(finished).toBe(true)
  expect(run.requests.length).toBeGreaterThan(count)
  expect(results(run.requests[count], run.id)).toHaveLength(1)
  expect(text(results(run.requests[count], run.id)[0])).toBe(run.modelText)
  // Both callbacks saw the ORIGINAL; only the accepted proposal is eligible for savings accounting.
  console.log("SDK_NATIVE_SUCCESS", JSON.stringify({ hooks: run.hooks, modelText: run.modelText, resumed: true }))
}, 120_000)

test("baseline engages the real callback and HTTP oracle without claiming a reduction", async () => {
  await using run = await probe("baseline", 0)
  verify(run, "original")
  success(run.hooks)
  console.log("SDK_NATIVE_BASELINE", JSON.stringify({ hooks: run.hooks, modelText: run.modelText }))
}, 90_000)

test("nonzero process output is preserved and its actual SDK hook lifecycle is recorded", async () => {
  await using baseline = await probe("baseline", 7)
  await using candidate = await probe("baseline", 7, { dir: baseline.dir })
  verify(baseline, "original")
  verify(candidate, "original")
  expect(candidate.modelText).toBe(baseline.modelText)
  expect(results(candidate.requests[1], candidate.id)[0].is_error).toBe(true)
  expect(candidate.hooks).toHaveLength(1)
  expect(candidate.hooks[0].hook_event_name).toBe("PostToolUseFailure")
  console.log("SDK_NATIVE_FAILURE", JSON.stringify({ hooks: candidate.hooks, modelText: candidate.modelText }))
}, 120_000)

test("invalid native replacement is rejected without losing the original", async () => {
  await using baseline = await probe("baseline", 0)
  await using invalid = await probe("invalid", 0, { dir: baseline.dir })
  verify(invalid, "original")
  expect(invalid.modelText).toBe(baseline.modelText)
  expect(invalid.replacement).toBe("SDK_INVALID_BARE_STRING")
}, 120_000)

test("a competing rewrite can supersede the proposed reduction", async () => {
  await using baseline = await probe("baseline", 0)
  await using competing = await probe("competing", 0, { dir: baseline.dir })
  verify(competing, "original")
  expect(competing.modelText).toBe(baseline.modelText)
  expect(competing.hooks).toHaveLength(2)
  expect(competing.hooks[0]).toEqual(competing.hooks[1])
  expect(competing.replacement).not.toEqual(success(competing.hooks).tool_response)
}, 120_000)

test("PostToolUse alone does not certify numeric exit zero", async () => {
  await using run = await probe("baseline", 1, { command: "grep SDK_NATIVE_NOT_PRESENT probe.cjs" })
  expect(run.referenceExit).toBe(1)
  expect(run.completed).toBe(true)
  expect(run.requests).toHaveLength(2)
  const hook = success(run.hooks)
  expect(hook.tool_use_id).toBe(run.id)
  expect(hook.tool_response).toMatchObject({ interrupted: false })
  expect(record(hook.tool_response).returnCodeInterpretation).toBeString()
  expect(results(run.requests[1], run.id)[0].is_error).not.toBe(true)
  console.log("SDK_NATIVE_SEMANTIC_EXIT_ONE", JSON.stringify({ referenceExit: run.referenceExit, hooks: run.hooks }))
}, 90_000)

test("oversized native output exposes persisted capture metadata and remains unmodified", async () => {
  await using run = await probe("baseline", 0, { rows: 10_000 })
  expect(run.completed).toBe(true)
  expect(run.referenceExit).toBe(0)
  expect(run.requests).toHaveLength(2)
  const output = record(success(run.hooks).tool_response)
  expect(output.persistedOutputPath).toBeString()
  expect(output.persistedOutputSize).toBeGreaterThan(100_000)
  expect(run.replacement).toBeUndefined()
  expect(run.modelText).toContain(noise)
  expect(run.modelText).toContain(String(output.persistedOutputPath))
  console.log("SDK_NATIVE_OVERSIZED", JSON.stringify({ keys: Object.keys(output), persistedOutputSize: output.persistedOutputSize,
    stdoutBytes: Buffer.byteLength(String(output.stdout)), modelBytes: Buffer.byteLength(run.modelText) }))
}, 90_000)

function verify(run: Awaited<ReturnType<typeof probe>>, view: "original" | "reduced") {
  expect(run.requests).toHaveLength(2)
  expect(run.executed).toEqual({ code: run.code })
  expect(run.referenceExit).toBe(run.code)
  expect(run.completed).toBe(true)
  expect(run.session).toBeString()
  expect(run.session.length).toBeGreaterThan(0)
  expect(run.hooks.length).toBeGreaterThan(0)
  expect(run.hooks.every((hook) => "tool_use_id" in hook && hook.tool_use_id === run.id)).toBe(true)
  expect(results(run.requests[0], run.id)).toHaveLength(0)
  expect(results(run.requests[1], run.id)).toHaveLength(1)
  expect(run.modelText).toContain(keep)
  expect(run.modelText).toContain(warning)
  if (view === "original") expect(run.modelText).toContain(noise)
  if (view === "reduced") expect(run.modelText).not.toContain(noise)
}

function success(hooks: HookInput[]) {
  const hook = hooks.find((item) => item.hook_event_name === "PostToolUse")
  if (!hook || hook.hook_event_name !== "PostToolUse") throw new Error("SDK_NATIVE_POST_TOOL_USE_MISSING")
  return hook
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SDK_NATIVE_OUTPUT_NOT_OBJECT")
  return value as Record<string, unknown>
}

function results(request: Request, id: string) {
  return request.messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
    .filter((block) => block.type === "tool_result" && block.tool_use_id === id)
}

function text(block: Block) {
  if (typeof block.content === "string") return block.content
  if (!Array.isArray(block.content)) throw new Error("SDK_NATIVE_TOOL_RESULT_CONTENT_MISSING")
  if (block.content.some((part) => part.type !== "text" || typeof part.text !== "string"))
    throw new Error("SDK_NATIVE_TOOL_RESULT_NOT_TEXT")
  return block.content.map((part) => part.text).join("\n")
}

async function probe(mode: Mode, code: number, fixture: { rows?: number; command?: string; dir?: string } = {}) {
  const dir = fixture.dir ?? await mkdtemp(path.join(os.tmpdir(), "orchestra-sdk-native-"))
  const requests: Request[] = []
  const hooks: HookInput[] = []
  const errors: string[] = []
  const id = `toolu_${crypto.randomUUID().replaceAll("-", "")}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("SDK_NATIVE_QUERY_DEADLINE")), 75_000)
  const command = fixture.command ?? "node probe.cjs"
  const state = { session: "", replacement: undefined as unknown, completed: false }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const route = new URL(req.url).pathname
      if (route === "/v1/messages/count_tokens") return Response.json({ input_tokens: 20 })
      if (route !== "/v1/messages") {
        errors.push(`Unexpected provider route: ${route}`)
        return Response.json({ error: { type: "invalid_request_error", message: "Unexpected probe route" } }, { status: 400 })
      }
      const body = await req.json() as Request
      requests.push(body)
      const done = results(body, id).length > 0
      const input = { command, description: "Execute isolated native SDK fixture" }
      const content = done
        ? [{ type: "text", text: "SDK_PROBE_DONE" }]
        : [{ type: "tool_use", id, name: "Bash", input }]
      const message = {
        id: `msg_${requests.length}`, type: "message", role: "assistant", model: "claude-haiku-4-5-20251001",
        content, stop_reason: done ? "end_turn" : "tool_use", stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }
      if (!body.stream) return Response.json(message)
      const events = [
        { type: "message_start", message: { ...message, content: [], stop_reason: null } },
        { type: "content_block_start", index: 0, content_block: done ? { type: "text", text: "" } : { ...content[0], input: {} } },
        { type: "content_block_delta", index: 0, delta: done
          ? { type: "text_delta", text: "SDK_PROBE_DONE" }
          : { type: "input_json_delta", partial_json: JSON.stringify(input) } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 10 } },
        { type: "message_stop" },
      ]
      return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "content-type": "text/event-stream" },
      })
    },
  })
  const callback = async (input: HookInput): Promise<HookJSONOutput> => {
    hooks.push(structuredClone(input))
    if (input.hook_event_name !== "PostToolUse" || mode === "baseline") return {}
    const original = record(input.tool_response)
    if (typeof original.stdout !== "string") throw new Error("SDK_NATIVE_STDOUT_MISSING")
    // Delete only this fixture's known noise; retain warnings even if Bash merged stderr into stdout.
    state.replacement = mode === "invalid" ? "SDK_INVALID_BARE_STRING"
      : { ...original, stdout: original.stdout.replaceAll(`${noise}\n`, "") }
    return { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: state.replacement } }
  }
  const options: Options = {
    cwd: dir, executable: "node", model: "claude-haiku-4-5-20251001", maxTurns: 3,
    settingSources: [], tools: ["Bash"], allowedTools: ["Bash"],
    abortController: controller,
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC,
      HOME: dir, USERPROFILE: dir, TMPDIR: dir, TMP: dir, TEMP: dir,
      CLAUDE_CONFIG_DIR: path.join(dir, "config"),
      ANTHROPIC_API_KEY: "sdk-native-synthetic-key", ANTHROPIC_BASE_URL: server.url.origin,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1",
    },
    stderr: (value) => { if (errors.join("").length < 8192) errors.push(value) },
    hooks: {
      PostToolUse: [{ matcher: "Bash", hooks: mode === "competing" ? [callback, async (input) => {
        hooks.push(structuredClone(input))
        if (input.hook_event_name !== "PostToolUse") throw new Error("SDK_NATIVE_WRONG_COMPETING_HOOK")
        return { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: input.tool_response } }
      }] : [callback] }],
      PostToolUseFailure: [{ matcher: "Bash", hooks: [callback] }],
    },
  }
  const cleanup = async () => {
    clearTimeout(timer)
    controller.abort()
    await server.stop(true)
    if (!fixture.dir) await rm(dir, { recursive: true, force: true })
  }
  try {
    const manifest = await Bun.file(new URL("./package.json", import.meta.resolve("@anthropic-ai/claude-agent-sdk"))).json()
    expect(manifest.version).toBe("0.3.289")
    await mkdir(path.join(dir, "config"), { recursive: true })
    await Bun.write(path.join(dir, "probe.cjs"), `
const fs = require("node:fs");
fs.writeSync(1, ${JSON.stringify(`${noise}\n`.repeat(fixture.rows ?? 64))});
fs.writeSync(2, ${JSON.stringify(`${warning}\n`)});
fs.writeSync(1, ${JSON.stringify(reduced)});
fs.writeFileSync("executed.json", JSON.stringify({ code: ${code} }));
process.exit(${code});
`)
    const reference = Bun.spawn(["bash", "-c", command], { cwd: dir, env: options.env, stdout: "pipe", stderr: "pipe" })
    const [referenceExit] = await Promise.all([reference.exited, new Response(reference.stdout).text(), new Response(reference.stderr).text()])
    expect(referenceExit).toBe(code)
    if (!fixture.command) await rm(path.join(dir, "executed.json"))
    const session = query({ prompt: "Run the isolated fixture once, then finish.", options })
    try {
      for await (const message of session) {
        if (message.type === "system" && message.subtype === "init") state.session = message.session_id
        if (message.type === "result" && message.subtype === "success") state.completed = true
        if (message.type === "result" && message.subtype !== "success")
          throw new Error(`SDK_NATIVE_RESULT_${message.subtype}: ${JSON.stringify(message)}\n${errors.join("")}`)
      }
    } finally {
      session.close()
    }
    clearTimeout(timer)
    const executed = fixture.command ? undefined : JSON.parse(await readFile(path.join(dir, "executed.json"), "utf8")) as unknown
    const blocks = requests[1] && results(requests[1], id)
    if (!blocks || blocks.length !== 1) throw new Error(`SDK_NATIVE_NEXT_REQUEST_MISSING: ${JSON.stringify(requests)}\n${errors.join("")}`)
    return { dir, id, code, hooks, requests, options, executed, referenceExit, completed: state.completed,
      session: state.session, replacement: state.replacement,
      modelText: text(blocks[0]), [Symbol.asyncDispose]: cleanup }
  } catch (error) {
    console.error("SDK_NATIVE_PROBE_FAILURE", JSON.stringify({ mode, code, hooks, requests, stderr: errors }))
    await cleanup().catch((failure) => { throw new AggregateError([error, failure], "SDK native probe and cleanup failed") })
    throw error
  }
}
