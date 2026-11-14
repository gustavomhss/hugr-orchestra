import { describe, expect, test } from "bun:test"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import path from "path"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { AbsolutePath } from "@orchestra/core/schema"
import { AgentV2 } from "@orchestra/core/agent"
import { CommandV2 } from "@orchestra/core/command"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

describe("ConfigMarkdown", () => {
  test("an unquoted colon reaches the fallback on every parse, not only the first", () => {
    // Unique text: gray-matter's cache is process-wide, so a shared fixture could be poisoned by another test.
    const content = `---\nname: colon-${crypto.randomUUID()}\ndescription: Run work: then check it.\n---\nBody\n`
    const first = ConfigMarkdown.parse(content)
    expect(first.data.description).toBe("Run work: then check it.")
    expect(ConfigMarkdown.parse(content).data).toEqual(first.data)
  })
})

for (const language of ["javascript", "js", "JavaScript", "JS", "\rjavascript", "\tJS"]) {
  test(`rejects ${language} frontmatter before evaluation`, () => {
    const key = `ORCHESTRA_MARKDOWN_SENTINEL_${crypto.randomUUID()}`
    const content = `---${language}\n(process.env[${JSON.stringify(key)}] = "executed", {name: "unsafe"})\n---\nBody`
    const parsed = ConfigMarkdown.parseOption(content)
    const sentinel = process.env[key]
    delete process.env[key]
    expect(sentinel).toBeUndefined()
    expect(parsed).toBeUndefined()
  })
}

test.each(["", "yaml", "yml", "YAML"])("preserves data frontmatter %j", (language) => {
  expect(ConfigMarkdown.parse(`---${language}\nname: example\ninternal: true\n---\nBody`).data).toEqual({
    name: "example",
    internal: true,
  })
})

test("preserves JSON data frontmatter and content", () => {
  const parsed = ConfigMarkdown.parse('---json\n{"name":"example","internal":false}\n---\nBody')
  expect(parsed.data).toEqual({ name: "example", internal: false })
  expect(parsed.content).toBe("Body")
})

testEffect(Layer.empty).live(
  "untrusted Location acquisition never evaluates agent or command frontmatter",
  () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const key = `ORCHESTRA_MARKDOWN_BOOT_${crypto.randomUUID()}`
      yield* Effect.promise(async () => {
        await Bun.write(
          path.join(tmp.path, ".orchestra/agents/unsafe.md"),
          `---javascript\n(process.env[${JSON.stringify(key)}] = "agent", {description: "unsafe"})\n---\nBody`,
        )
        await Bun.write(
          path.join(tmp.path, ".orchestra/commands/unsafe.md"),
          `---JS\n(process.env[${JSON.stringify(key)}] = "command", {description: "unsafe"})\n---\nBody`,
        )
        await Bun.write(
          path.join(tmp.path, ".orchestra/commands/safe.md"),
          "---\ndescription: safe command\n---\nSafe body",
        )
      })
      const commands = yield* Effect.gen(function* () {
        const command = yield* CommandV2.Service
        yield* AgentV2.Service
        return yield* command.list()
      }).pipe(
        Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))),
        Effect.provide(
          AppNodeBuilder.build(
            LayerNode.group([Database.node, LocationServiceMap.node, SessionV2.node, SessionExecution.node]),
            [
              [SessionExecution.node, SessionExecution.noopLayer],
              [
                Global.node,
                Global.layerWith({
                  home: tmp.path,
                  config: path.join(tmp.path, ".global"),
                  data: path.join(tmp.path, ".data"),
                }),
              ],
            ],
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            const sentinel = process.env[key]
            delete process.env[key]
            expect(sentinel).toBeUndefined()
          }),
        ),
      )
      expect(commands.find((command) => command.name === "safe")?.template).toBe("Safe body")
      expect(commands.some((command) => command.name === "unsafe")).toBe(false)
    }),
  30_000,
)
