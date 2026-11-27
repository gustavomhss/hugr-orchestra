import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, realpath } from "node:fs/promises"
import { query, type HookInput } from "@anthropic-ai/claude-agent-sdk"
import { Effect, Layer } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { InstructionContext } from "@orchestra/core/instruction-context"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SystemContext } from "@orchestra/core/system-context"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { ClaudeHostOptions } from "../src/host/options"
import { ClaudeCodeExecutable } from "../src/executable"
import { tmpdir } from "./fixture/tmpdir"

const agents = "orchestra_probe_agents_83"
const claude = "orchestra_probe_claude_67"

const message = {
  id: "msg_instruction_probe",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-4-6",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 1 },
  content: [{ type: "text", text: "OK" }],
}

test("the pinned Claude Code binary loads CLAUDE.md and relays context and the real Read response", async () => {
  await using project = await tmpdir()
  await using config = await tmpdir()
  const root = await realpath(project.path)
  const directory = path.join(root, "probe[literal]")
  await mkdir(directory)
  const instructions = () => Effect.runPromise(
    SystemContextRegistry.Service.use((registry) => registry.load({ sessionID: "test", agent: "maestro", hosted: true })).pipe(
      Effect.flatMap(SystemContext.initialize),
      Effect.provide(AppNodeBuilder.build(LayerNode.group([InstructionContext.node, SystemContextRegistry.node]), [
        [Global.node, Global.layerWith({ config: config.path, home: config.path })],
        [Location.node, Layer.succeed(Location.Service, {
          directory: AbsolutePath.make(directory),
          project: { id: Project.ID.make("native-instructions"), directory: AbsolutePath.make(root) },
        })],
        [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
      ])),
    ),
  )
  const inputs: string[] = []
  const file = path.join(directory, "probe.txt")
  const resultMarker = "orchestra_probe_read_result_39"
  const postMarker = "orchestra_probe_post_context_25"
  const toolID = "toolu_orchestra_probe_read"
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== "/v1/messages") return Response.json({})
      const input = await request.json()
      const body = JSON.stringify(input)
      inputs.push(body)
      const requestRead = body.includes("Run the read probe.") && !body.includes(toolID)
      if (!input.stream) return Response.json(message)
      const block = requestRead ? [
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: toolID, name: "Read", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ file_path: file }) } },
      ] : [
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
      ]
      const events = [
        { type: "message_start", message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 0 } } },
        ...block,
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: requestRead ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
        { type: "message_stop" },
      ]
      return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "content-type": "text/event-stream" },
      })
    },
  })
  try {
    await Bun.write(path.join(directory, "AGENTS.md"), agents)
    await Bun.write(file, resultMarker)
    const callbacks: HookInput[] = []
    const send = async (hosted: boolean, read = false) => {
      const context = hosted ? await instructions() : undefined
      inputs.length = 0
      const failures: string[] = []
      const run = query({
        prompt: read ? "Run the read probe." : "Say OK.",
        options: {
          cwd: directory,
          model: message.model,
          maxTurns: 3,
          settingSources: [...ClaudeHostOptions.SETTING_SOURCES],
          settings: context ? ClaudeHostOptions.instructionSettings(InstructionContext.agentsPaths(context.snapshot)) : undefined,
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            CLAUDE_CONFIG_DIR: config.path,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
            ANTHROPIC_BASE_URL: server.url.origin,
            ANTHROPIC_API_KEY: "synthetic-local-only",
            ANTHROPIC_DEFAULT_SONNET_MODEL: message.model,
          },
          abortController: new AbortController(),
          stderr: (line) => failures.push(line),
          systemPrompt: { type: "preset", preset: "claude_code" },
          hooks: hosted ? {
            UserPromptSubmit: [{ hooks: [async () => ({
              hookSpecificOutput: { hookEventName: "UserPromptSubmit" as const, additionalContext: context?.baseline },
            })] }],
            ...(read ? {
              PreToolUse: [{ matcher: "Read", hooks: [async (input) => {
                callbacks.push(input)
                return { hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "allow" as const } }
              }] }],
              PostToolUse: [{ matcher: "Read", hooks: [async (input) => {
                callbacks.push(input)
                return { hookSpecificOutput: { hookEventName: "PostToolUse" as const, additionalContext: postMarker } }
              }] }],
            } : {}),
          } : undefined,
        },
      })
      try {
        const versions: string[] = []
        const results: boolean[] = []
        for await (const frame of run) {
          if (frame.type === "system" && frame.subtype === "init") versions.push(frame.claude_code_version)
          if (frame.type === "result") results.push(frame.is_error)
        }
        expect(versions).toEqual([ClaudeCodeExecutable.CODE_VERSION])
        expect(results, failures.join("\n")).toEqual([false])
        expect(inputs.length, failures.join("\n")).toBeGreaterThan(0)
        return inputs.at(-1) ?? ""
      } finally {
        run.close()
      }
    }
    expect((await send(false)).split(agents)).toHaveLength(2)
    expect((await send(true)).split(agents)).toHaveLength(2)
    await Bun.write(path.join(directory, "CLAUDE.md"), claude)
    const both = await send(true)
    expect(both.split(agents)).toHaveLength(2)
    expect(both.split(claude)).toHaveLength(2)

    const afterRead = await send(true, true)
    expect(callbacks).toMatchObject([
      { hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: toolID },
      { hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: toolID },
    ])
    const settled = callbacks[1]
    expect(settled?.hook_event_name).toBe("PostToolUse")
    if (settled?.hook_event_name === "PostToolUse") expect(JSON.stringify(settled.tool_response)).toContain(resultMarker)
    expect(afterRead).toContain(resultMarker)
    expect(afterRead).toContain(postMarker)

    const nativeOnly = "orchestra_probe_native_only_11"
    const imported = "orchestra_probe_imported_71"
    const child = "orchestra_probe_child_42"
    const ignored = "orchestra_probe_code_example_95"
    await mkdir(path.join(directory, ".claude"))
    await mkdir(path.join(directory, "nested"))
    await Bun.write(path.join(directory, ".claude", "AGENTS.md"), nativeOnly)
    await Bun.write(path.join(directory, "nested", "AGENTS.md"), `${imported}\n\n@../AGENTS.md\n\n@child\\ rules.md#usage\n`)
    await Bun.write(path.join(directory, "nested", "child rules.md"), child)
    await Bun.write(path.join(directory, "nested", "example.md"), ignored)
    await Bun.write(path.join(directory, "AGENTS.md"), `${agents}\n\n@nested/AGENTS.md\n\n\`@nested/example.md\`\n`)
    const markers = [agents, nativeOnly, imported, child]
    await Bun.file(path.join(directory, "CLAUDE.md")).delete()
    const standalone = await send(true)
    for (const marker of markers) expect(standalone.split(marker)).toHaveLength(2)
    expect(standalone).not.toContain(ignored)

    await Bun.write(path.join(directory, "CLAUDE.md"), `${claude}\n\n@AGENTS.md\n\n@nested/AGENTS.md\n`)
    const explicit = await send(true)
    for (const marker of [...markers, claude]) expect(explicit.split(marker)).toHaveLength(2)
    expect(explicit).not.toContain(ignored)
  } finally {
    await server.stop(true)
  }
}, 60_000)
