import path from "path"
import { pathToFileURL } from "url"
import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, Model, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { Config } from "@orchestra/core/config"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Effect, Layer, Stream } from "effect"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { Harness, sessionID } from "./session-runner-harness"

// A promoted prompt's file, directory and MCP resource mentions reach the provider as the text they pointed at when
// the prompt was promoted, recorded once as a synthetic message; mentioned images and PDFs ride on it as media. The
// prompt keeps its URIs.

const fixture = path.join(import.meta.dir, "fixture", "mcp-omni-stdio.ts")
const requests: LLMRequest[] = []

const it = Harness.make({
  client: Layer.succeed(
    LLMClient.Service,
    LLMClient.Service.of({
      prepare: () => Effect.die("unused"),
      stream: ((request: LLMRequest) => {
        requests.push(request)
        return Stream.make(
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        )
      }) as unknown as LLMClientShape["stream"],
      generate: () => Effect.die("unused"),
    }),
  ),
  models: SessionRunnerModel.layerWith(() =>
    Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })),
  ),
  echo: Layer.empty,
  permissions: Layer.mock(PermissionV2.Service, { authorize: () => Effect.void }),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  config: Layer.succeed(
    Config.Service,
    Config.Service.of({
      entries: () =>
        Effect.succeed([
          new Config.Document({
            type: "document",
            info: new Config.Info({
              compaction: Harness.compaction,
              mcp: new ConfigMCP.Info({
                servers: {
                  fixture: new ConfigMCP.Local({
                    type: "local",
                    command: [process.execPath, fixture],
                    cwd: import.meta.dir,
                    environment: { MCP_OMNI_RESOURCE: "fixture://note" },
                  }),
                },
              }),
            }),
          }),
        ]),
    }),
  ),
})

describe("SessionRunner mentions", () => {
  it.live(
    "reads file, directory and MCP resource mentions into the promoted turn",
    () =>
      Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      ).pipe(
        Effect.flatMap((dir) =>
          Effect.gen(function* () {
            expectSpawn(import.meta.path)
            const notes = path.join(dir.path, "notes.txt")
            yield* Effect.promise(() => Bun.write(notes, "line one\nline two\nline three\nline four\n"))
            yield* Effect.promise(() => Bun.write(path.join(dir.path, "nested", "inner.txt"), "inner"))
            const image = path.join(dir.path, "pixel.png")
            yield* Effect.promise(() =>
              Bun.write(image, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
            )
            const pdf = path.join(dir.path, "paper.pdf")
            yield* Effect.promise(() => Bun.write(pdf, "%PDF-1.4\n%%EOF\n"))
            yield* Harness.setup
            const session = yield* SessionV2.Service
            const files = [
              { uri: `${pathToFileURL(notes).href}?start=2&end=3`, name: "notes.txt" },
              { uri: pathToFileURL(path.join(dir.path, "nested")).href + "/", name: "nested" },
              { uri: "fixture://note", name: "fixture note" },
              { uri: pathToFileURL(path.join(dir.path, "missing.txt")).href, name: "missing.txt" },
              { uri: pathToFileURL(image).href, name: "pixel.png" },
              { uri: pathToFileURL(pdf).href, name: "paper.pdf" },
            ]
            yield* session.prompt({ sessionID, prompt: { text: "Look at these", files }, resume: false })
            yield* session.resume(sessionID)

            expect(requests).toHaveLength(1)
            const user = requests[0]!.messages.filter((message) => message.role === "user")
            const content = user.flatMap((message) => message.content)
            expect(content.flatMap((part) => (part.type === "media" ? [part.mediaType] : []))).toEqual([
              "image/png",
              "application/pdf",
            ])
            const text = content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
            expect(text).toContain("Look at these")
            expect(text).toContain(`Attached ${notes}. Its content as of when it was sent:\nline two\nline three`)
            expect(text).not.toContain("line four")
            expect(text).toContain("inner.txt")
            expect(text).toContain("MCP resource fixture note (fixture://note):\ntext of fixture://note")
            expect(text).toContain(`Attached ${path.join(dir.path, "missing.txt")}, but it could not be read`)

            // The prompt keeps its URIs; the read text is one synthetic message after it.
            const context = yield* session.context(sessionID)
            expect(context.map((message) => message.type)).toEqual(["user", "synthetic", "assistant"])
            expect(context[0]).toMatchObject({ type: "user", files: files.map((file) => ({ uri: file.uri })) })
            expect(context[1]).toMatchObject({
              type: "synthetic",
              files: [{ mime: "image/png", name: "pixel.png" }, { mime: "application/pdf", name: "paper.pdf" }],
            })
          }),
        ),
      ),
    30_000,
  )
})
