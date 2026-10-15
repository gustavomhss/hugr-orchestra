import { expect } from "bun:test"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Fiber } from "effect"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { BackgroundJob } from "@/background/job"
import { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { ToolRegistry } from "@/tool/registry"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { ClaudeEngineFixture } from "./engine-fixture"

// Maestro on Claude Code (owner opt-in): delegation, permissions and teammate returns run through Orchestra's own tools.

const MODEL = "anthropic/claude-haiku-4-5-20251001"
const frame = { parent_tool_use_id: null, uuid: "m", session_id: "sdk-maestro" }
const brief = { description: "Check the flag", prompt: "Check whether the release flag is on and report it.", subagent_type: "helper" }

type Seen = { tools?: { name: string; description?: string }[]; result?: { content?: unknown; isError?: boolean } }

const setup = (rules: { permission: string; pattern: string; action: "ask" | "deny" }[] = []) => Effect.gen(function* () {
  const { directory } = yield* TestInstance
  writeFileSync(path.join(directory, "orchestra.json"), JSON.stringify({ agent: {
    maestro: { engine: "claude-code", model: MODEL },
    helper: { mode: "subagent", engine: "claude-code", model: MODEL, description: "Checks one fact and reports it.",
      prompt: "Check the fact you are given and report it." },
  } }))
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Maestro on Claude Code",
    permission: [{ permission: "*", pattern: "*", action: "allow" }, ...rules] })
  return { sessions, prompt: yield* SessionPrompt.Service, chat }
})

const ask = (text: string) => ({ agent: "maestro", parts: [{ type: "text" as const, text }] })

/** Maestro's scripted Claude Code turn: one call of Orchestra's `task` through the in-process server, then a reply. */
function delegating(seen: Seen): ClaudeEngineFixture.Script {
  return async function* (_signal, params) {
    yield { type: "system", subtype: "init", ...frame }
    const key = { projectKey: params.options?.cwd ?? "fixture", sessionId: frame.session_id }
    await params.options?.sessionStore?.append(key, [{ type: "user", uuid: "maestro-user", sessionId: key.sessionId,
      parentUuid: null, message: { role: "user", content: params.prompt } }])
    yield { type: "assistant", ...frame, uuid: "maestro-call", message: { id: "maestro-call-api", stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "toolu_task", name: "mcp__orchestra__task", input: brief }], usage: { input_tokens: 5, output_tokens: 2 } } }
    const server = params.options?.mcpServers?.orchestra
    if (server?.type !== "sdk") throw new Error("Orchestra SDK server missing")
    const client = new Client({ name: "scripted-cli", version: "1" })
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    seen.tools = (await client.listTools()).tools
    const result = await client.callTool({ name: "task", arguments: brief }, undefined, { timeout: 60_000 })
    await client.close()
    seen.result = { content: result.content, isError: result.isError === true }
    yield { type: "user", ...frame, uuid: "maestro-receipt", message: { role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_task", content: result.content, is_error: result.isError === true }] } }
    yield { type: "assistant", ...frame, uuid: "maestro-final", message: { id: "maestro-final-api", stop_reason: "end_turn",
      content: [{ type: "text", text: "Delegated and reviewed." }], usage: { input_tokens: 5, output_tokens: 2 } } }
    yield { type: "result", subtype: "success", total_cost_usd: 0.02, ...frame }
  }
}

ClaudeEngineFixture.it.instance("Maestro on Claude Code delegates through Orchestra's task: the owner's ask, then a teammate that runs and settles", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, prompt, chat } = yield* setup([{ permission: "task", pattern: "*", action: "ask" }])
    const permission = yield* Permission.Service
    // A runner that wraps the registry's own task object must see Maestro's call: it is the object the engine runs.
    const registry = yield* ToolRegistry.Service
    const named = yield* registry.named()
    const original = named.task.execute
    const routed: string[] = []
    named.task.execute = (args, ctx) => {
      routed.push(ctx.callID ?? "")
      return original.call(named.task, args, ctx)
    }
    yield* Effect.addFinalizer(() => Effect.sync(() => { named.task.execute = original }))
    const seen: Seen = {}
    ClaudeEngineFixture.state.scripts.push(delegating(seen), ClaudeEngineFixture.reply("Checked: the release flag is on.", "helper-api"))
    const run = yield* prompt.prompt({ sessionID: chat.id, ...ask("Is the release flag on?") }).pipe(Effect.forkChild)

    const request = yield* Effect.gen(function* () {
      for (let round = 0; round < 500; round++) {
        const found = (yield* permission.list()).find((item) => item.sessionID === chat.id)
        if (found) return found
        yield* Effect.sleep("20 millis")
      }
      return yield* Effect.die(new Error("no permission ask reached the owner"))
    })
    expect(request).toMatchObject({ permission: "task", patterns: ["helper"], metadata: { subagent_type: "helper" } })
    yield* permission.reply({ requestID: request.id, reply: "once" })
    const answer = yield* Fiber.join(run)

    expect(answer.info.role === "assistant" && answer.info.finish).toBe("stop")
    expect(answer.parts.some((part) => part.type === "text" && part.text === "Delegated and reviewed.")).toBe(true)
    expect(seen.result?.isError).toBe(false)
    expect(JSON.stringify(seen.result?.content)).toContain("Checked: the release flag is on.")
    expect(routed).toEqual(["toolu_task"])

    // The teammate's nested Claude Code turn is its own query: no resume, its own in-process server and transcript store.
    const [parentQuery, childQuery] = ClaudeEngineFixture.state.queries
    expect(childQuery.options?.resume).toBeUndefined()
    expect(childQuery.options?.mcpServers?.orchestra).not.toBe(parentQuery.options?.mcpServers?.orchestra)
    expect(childQuery.options?.sessionStore).not.toBe(parentQuery.options?.sessionStore)
    expect(childQuery.options?.abortController).not.toBe(parentQuery.options?.abortController)

    // The teammate ran in its own child session, on its own engine turn, and its job settled.
    const [child] = yield* sessions.children(chat.id)
    expect(child).toMatchObject({ parentID: chat.id, agent: "helper" })
    const report = (yield* sessions.messages({ sessionID: child.id })).findLast((message) => message.info.role === "assistant")
    expect(report?.info.role === "assistant" && report.info.finish).toBe("stop")
    expect(report?.parts.some((part) => part.type === "text" && part.text === "Checked: the release flag is on.")).toBe(true)
    const jobs = yield* BackgroundJob.Service
    expect((yield* jobs.get(child.id))?.status).toBe("completed")
    expect(ClaudeEngineFixture.state.queries.map((query) => query.prompt)).toEqual(["Is the release flag on?", brief.prompt])

    // Maestro's call is Orchestra's: not provider-executed, linked to the child, carrying the report.
    const call = (yield* sessions.messages({ sessionID: chat.id })).flatMap((message) => message.parts)
      .find((part) => part.type === "tool" && part.callID === "toolu_task")
    if (call?.type !== "tool" || call.state.status !== "completed") throw new Error("expected a completed task call")
    expect(call.tool).toBe("task")
    expect(call.metadata?.providerExecuted).toBeUndefined()
    expect(call.state.metadata).toMatchObject({ sessionId: child.id, parentSessionId: chat.id })
    expect(call.state.output).toContain("Checked: the release flag is on.")

    // Maestro's prompt rides on Claude Code's preset (a replaced prompt is billed as a third-party app) and claims
    // precedence; its toolset has no SDK subagents or built-in replacements for its tools.
    const options = ClaudeEngineFixture.state.queries[0].options
    const system = options?.systemPrompt
    if (typeof system !== "object" || Array.isArray(system) || system.type !== "preset") throw new Error("expected the preset")
    expect(system.preset).toBe("claude_code")
    const agents = yield* Agent.Service
    const maestro = yield* agents.get("maestro")
    const [precedence] = (system.append ?? "").split("\n\n")
    expect(precedence).toContain("follow them")
    expect(maestro.prompt?.length).toBeGreaterThan(0)
    expect(system.append?.startsWith(`${precedence}\n\n${maestro.prompt}`)).toBe(true)
    expect(system.append).toContain("delegate with `mcp__orchestra__task`")
    expect(system.append).toContain("`mcp__orchestra__todowrite`")
    expect(options?.disallowedTools).toContain("Task")
    expect(options?.tools).toContain("Bash")
    for (const name of ["Task", "Agent", "TodoWrite", "Skill", "AskUserQuestion", "Read", "Edit", "Write"])
      expect(options?.tools).not.toContain(name)
    const defs = yield* registry.tools({ ...Provider.parseModel(MODEL), agent: maestro, permission: chat.permission })
    const names = seen.tools?.map((tool) => tool.name) ?? []
    for (const id of ["task", "todowrite", "skill", "context_recall", "maestro_record_admission"]) expect(names).toContain(id)
    for (const id of ["bash", "grep", "glob", "webfetch", "invalid"]) expect(names).not.toContain(id)
    expect(seen.tools?.find((tool) => tool.name === "task")?.description).toBe(defs.find((def) => def.id === "task")?.description)
  }), 60_000)

ClaudeEngineFixture.it.instance("a rule that denies a delegation shows the rule and Maestro's turn continues", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, prompt, chat } = yield* setup([{ permission: "task", pattern: "helper", action: "deny" }])
    const seen: Seen = {}
    ClaudeEngineFixture.state.scripts.push(delegating(seen))
    const answer = yield* prompt.prompt({ sessionID: chat.id, ...ask("Is the release flag on?") })
    expect(seen.result?.isError).toBe(true)
    expect(JSON.stringify(seen.result?.content)).toContain("rule which prevents")
    expect(JSON.stringify(seen.result?.content)).not.toContain("Stop and wait")
    expect(answer.info.role === "assistant" && answer.info.finish).toBe("stop")
    expect(answer.parts.some((part) => part.type === "text" && part.text === "Delegated and reviewed.")).toBe(true)
    expect(yield* sessions.children(chat.id)).toEqual([])
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  }), 60_000)

ClaudeEngineFixture.it.instance("a background teammate's task return reaches Maestro on Claude Code as its next turn", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { prompt, chat } = yield* setup()
    const text = '<task_result id="tsk_1" state="completed">Checked: the release flag is on.</task_result>'
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.reply("A teammate is checking.", "start-api"),
      ClaudeEngineFixture.reply("The teammate confirmed the flag.", "return-api"))
    yield* prompt.prompt({ sessionID: chat.id, ...ask("Is the release flag on?") })
    // What TaskBackground delivers when the teammate settles: a synthetic task return, after Maestro's turn ended.
    const answer = yield* prompt.prompt({ sessionID: chat.id, agent: "maestro", parts: [{ type: "text", text, synthetic: true,
      metadata: { source: { type: "task-return", task_id: "ses_teammate", state: "completed" } } }] })
    expect(ClaudeEngineFixture.state.queries.map((query) => query.prompt)).toEqual(["Is the release flag on?", text])
    expect(ClaudeEngineFixture.state.queries[1].options?.resume).toBe("sdk-1")
    expect(answer.info.role === "assistant" && answer.info.finish).toBe("stop")
    expect(answer.parts.some((part) => part.type === "text" && part.text === "The teammate confirmed the flag.")).toBe(true)
  }), 60_000)

ClaudeEngineFixture.it.instance("a third-party billing refusal fails Maestro's turn with that cause and is not retried", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { prompt, chat } = yield* setup()
    ClaudeEngineFixture.state.scripts.push(async function* () {
      yield { type: "system", subtype: "init", ...frame }
      yield { type: "result", subtype: "success", is_error: true, ...frame,
        result: "API Error: 400 Third-party apps now draw from your extra usage, not your plan limits." }
    })
    const answer = yield* prompt.prompt({ sessionID: chat.id, ...ask("Is the release flag on?") })
    const error = answer.info.role === "assistant" ? answer.info.error : undefined
    expect(error?.data).toMatchObject({ message: expect.stringContaining("billed it as a third-party app") })
    expect(JSON.stringify(error)).not.toContain("native overflow")
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  }), 60_000)
