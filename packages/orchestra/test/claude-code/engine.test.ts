import { expect } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Effect, Fiber, Layer } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { PromptGuard } from "@/session/prompt-guard"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { makeHttp } from "../session/prompt.fixture"

// A scripted Claude Code: each query records its options and plays the next script.
type Script = (signal: AbortSignal) => AsyncGenerator<unknown>
const queries: { prompt: unknown; options: Record<string, any> }[] = []
const scripts: Script[] = []
const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
  query: ((params: { prompt: unknown; options: Record<string, any> }) => {
    queries.push(params)
    return scripts.shift()!(params.options.abortController.signal)
  }) as never,
}))

const it = testEffect(makeHttp({ replacements: [[ClaudeCodeSDK.node, sdk]] }))

const frame = { parent_tool_use_id: null, uuid: "u", session_id: "sdk-1" }
const reply = (text: string, id: string): Script => async function* () {
  yield { type: "system", subtype: "init", ...frame }
  yield { type: "assistant", message: { id, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }, ...frame }
  yield { type: "result", subtype: "success", total_cost_usd: 0.01, ...frame }
}

const setup = Effect.gen(function* () {
  const { directory } = yield* TestInstance
  writeFileSync(path.join(directory, "orchestra.json"), JSON.stringify({
    agent: { claude: { mode: "primary", engine: "claude-code", model: "anthropic/claude-haiku-4-5-20251001" } },
  }))
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Claude Code", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  return { sessions, prompt: yield* SessionPrompt.Service, chat }
})
const say = (text: string) => ({ agent: "claude", parts: [{ type: "text" as const, text }] })

it.instance("a Claude Code agent's turn is mirrored and the loop ends on it; the next turn resumes the same session", () =>
  Effect.gen(function* () {
    queries.length = 0
    const { sessions, prompt, chat } = yield* setup
    scripts.push(reply("first answer", "msg_a"), reply("second answer", "msg_b"))
    const first = yield* prompt.prompt({ sessionID: chat.id, ...say("hello") })
    expect(first.info.role).toBe("assistant")
    expect((first.info as SessionV1.Assistant).finish).toBe("stop")
    expect(first.parts.some((part) => part.type === "text" && part.text === "first answer")).toBe(true)
    expect(queries[0].prompt).toBe("hello")
    expect(queries[0].options.resume).toBeUndefined()
    expect(queries[0].options.settingSources).toEqual([])
    expect(queries[0].options.disallowedTools).toEqual(["Read", "Edit", "Write", "NotebookEdit", "Task"])
    expect(queries[0].options.model).toBe("claude-haiku-4-5-20251001")
    // Outside a native research dispatch Claude Code keeps its own tools, turn count and compaction.
    expect(queries[0].options.tools).toBeUndefined()
    expect(queries[0].options.maxTurns).toBeUndefined()
    expect(queries[0].options.settings).toBeUndefined()
    const client = new Client({ name: "claude-code", version: "1.0.0" })
    const [local, remote] = InMemoryTransport.createLinkedPair()
    yield* Effect.promise(() => Promise.all([client.connect(local), queries[0].options.mcpServers.orchestra.instance.connect(remote)]))
    expect((yield* Effect.promise(() => client.listTools())).tools.map((tool) => tool.name).toSorted()).toEqual(["edit", "read", "write"])
    yield* Effect.promise(() => client.close())
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ sessionId: "sdk-1", cost: 0.01 })

    const second = yield* prompt.prompt({ sessionID: chat.id, ...say("again") })
    expect(second.parts.some((part) => part.type === "text" && part.text === "second answer")).toBe(true)
    expect(queries).toHaveLength(2)
    expect(queries[1].prompt).toBe("again")
    expect(queries[1].options.resume).toBe("sdk-1")
  }), 30_000)

it.instance("a failed turn answers with an error and does not fall back to Orchestra's loop", () =>
  Effect.gen(function* () {
    queries.length = 0
    const { prompt, chat } = yield* setup
    scripts.push(async function* () { throw new Error("Claude Code is not logged in") })
    const result = yield* prompt.prompt({ sessionID: chat.id, ...say("hello") })
    const info = result.info as SessionV1.Assistant
    expect(info.finish).toBe("error")
    expect(info.error?.data).toMatchObject({ message: "Claude Code is not logged in" })
    expect(queries).toHaveLength(1)
  }), 30_000)

it.instance("cancel stops Claude Code and marks the turn aborted", () =>
  Effect.gen(function* () {
    queries.length = 0
    const { sessions, prompt, chat } = yield* setup
    let aborted = false
    scripts.push(async function* (signal) {
      yield { type: "system", subtype: "init", ...frame }
      yield { type: "assistant", message: { id: "msg_c", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "sleep 60" } }], stop_reason: null, usage: {} }, ...frame }
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve() }))
    })
    const run = yield* prompt.prompt({ sessionID: chat.id, ...say("long job") }).pipe(Effect.forkChild)
    yield* pollWithTimeout(sessions.messages({ sessionID: chat.id }).pipe(Effect.map((list) =>
      list.some((message) => message.parts.some((part) => part.type === "tool")) ? true : undefined)), "no tool part", "10 seconds")
    yield* prompt.cancel(chat.id)
    yield* Fiber.await(run)
    expect(aborted).toBe(true)
    const last = (yield* sessions.messages({ sessionID: chat.id })).findLast((message) => message.info.role === "assistant")!
    expect((last.info as SessionV1.Assistant).error?.name).toBe("MessageAbortedError")
    const tool = last.parts.find((part) => part.type === "tool")
    expect(tool?.type === "tool" && tool.state.status).toBe("error")
  }), 30_000)

it.instance("a failing pre-model guard ends the Claude Code turn before any SDK query", () =>
  Effect.gen(function* () {
    queries.length = 0
    scripts.length = 0
    const { prompt, chat } = yield* setup
    scripts.push(reply("unguarded answer", "msg_unguarded"))
    const check = Effect.fail(new Error("write root changed before model"))
    const result = yield* prompt.prompt({ sessionID: chat.id, ...say("guarded work") })
      .pipe(Effect.provideService(PromptGuard.Current, { sessionID: chat.id, check, checked: false }))
    expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: "write root changed before model" })
    expect(queries).toHaveLength(0)
    expect(scripts).toHaveLength(1)
    scripts.length = 0
  }), 30_000)
