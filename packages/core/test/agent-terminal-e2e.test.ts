import { realpathSync } from "node:fs"
import { afterAll, describe, expect } from "bun:test"
import { LLMClient, LLMEvent, Model, type LLMClientShape } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { Effect, Layer, Stream } from "effect"
import { PermissionV2 } from "@orchestra/core/permission"
import { Pty } from "@orchestra/core/pty"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionV2 } from "@orchestra/core/session"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { BashTool } from "@orchestra/core/tool/bash"
import { tmpdir } from "./fixture/tmpdir"
import { Harness, sessionID } from "./session-runner-harness"

// The tool reads the flag when its layer is built, as it does at process start, so the flag is set before the graph.
const previous = process.env.ORCHESTRA_AGENT_TERMINAL
process.env.ORCHESTRA_AGENT_TERMINAL = "1"
afterAll(() => {
  if (previous === undefined) delete process.env.ORCHESTRA_AGENT_TERMINAL
  else process.env.ORCHESTRA_AGENT_TERMINAL = previous
})

// Session, scripted model, the real bash tool, a real PTY: what the owner's session would do with the flag on.
const directory = await tmpdir()
const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })
const requests: Array<Parameters<LLMClientShape["stream"]>[0]> = []
const script = [
  [
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.toolCall({
      id: "call-bash",
      name: "bash",
      input: { command: "printf '\\033[31mhello\\033[0m\\n'; exit 5" },
    }),
    LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
    LLMEvent.finish({ reason: "tool-calls" }),
  ],
  [],
]
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: Parameters<LLMClientShape["stream"]>[0]) => {
      requests.push(request)
      return Stream.fromIterable(script.shift() ?? [])
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)
const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(model)),
  echo: Layer.empty,
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  permissions: Layer.mock(PermissionV2.Service, { assert: () => Effect.void }),
  nodes: [LocationMutation.node, BashTool.node, Pty.node],
  directory: directory.path,
})
const e2e = process.platform === "win32" ? it.effect.skip : it.effect

describe("agent terminal, end to end on the V2 session core", () => {
  e2e("a bash tool call from the model runs in a retained agent tab and returns clean text", () =>
    Effect.gen(function* () {
      yield* Harness.setupAt(directory.path)
      const session = yield* SessionV2.Service
      const pty = yield* Pty.Service

      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Run the command" }), resume: false })
      yield* session.resume(sessionID)

      expect(requests[0]?.tools.map((tool) => tool.name)).toContain("bash")
      // The model was told the truth about stdin for this mode.
      expect(JSON.stringify(requests[0]?.tools.find((tool) => tool.name === "bash"))).toContain("terminal tab the owner can watch")

      const history = JSON.stringify(yield* session.context(sessionID))
      expect(history).toContain("hello")
      expect(history).not.toContain("\\u001b")
      expect(history).toContain("code 5")

      const tab = (yield* pty.list()).find((info) => info.title.startsWith("agent: printf"))
      expect(tab).toMatchObject({ status: "exited", exitCode: 5, cwd: realpathSync(directory.path) })
    }),
  )
})
