import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import type { ToolContext } from "@opencode-ai/plugin"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { HugrComposerClient } from "@/plugin/hugr-composer/client"
import { createHuGRTools } from "@/plugin/hugr-composer/tools"
import { requireInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Config.node, Agent.node, Skill.node, Permission.node, Session.node]), [
    [RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })],
  ]),
)
const secret = "private backend detail /secret/path token=private"
const cases = [
  ...[
    "structured",
    "text",
    "structured-error",
    "text-error",
    "structured-error-object",
    "text-error-object",
    "structured-error-array",
    "text-error-array",
    "structured-error-zero",
    "text-error-zero",
    "flagged",
  ].map((mode) => ({ mode, expected: undefined })),
  { mode: "plain", expected: "ok" },
  ...["structured-success", "text-success"].map((mode) => ({
    mode,
    expected: { success: false, data: { error: secret, errors: [secret], ok: false, success: false } },
  })),
  ...[null, false, "", "  ", [], {}].map((error) => ({
    mode: `empty-${JSON.stringify(error)}`,
    expected: { error, data: "ok" },
  })),
]

// Each semantic case owns its native instance and one real peer. Failures cannot hide later controls.
cases.forEach(({ mode, expected }) => {
  it.instance(
    `Composer ${mode}: all five tools over real stdio`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* composerFixture(mode)
        const calls = [
          () => fixture.tools["hugr-search"].execute({ query: "cache" }, fixture.context),
          () => fixture.tools["hugr-describe"].execute({ name: "cache" }, fixture.context),
          () => fixture.tools["hugr-list"].execute({ bundle_name: "cache" }, fixture.context),
          () => fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context),
          () => fixture.tools["hugr-scaffold"].execute({ output_dir: "generated", profile: "api" }, fixture.context),
        ]
        yield* Effect.forEach(calls, (call) =>
          Effect.promise(async () => {
            if (expected === undefined) {
              await expect(call()).rejects.toMatchObject({ message: "HuGR Composer backend operation failed" })
              return
            }
            const result = await call()
            if (typeof result !== "object" || result === null) throw new Error("Expected Composer output")
            expect(mode === "plain" ? result.output : JSON.parse(result.output)).toEqual(expected)
          }),
        )
        yield* Effect.promise(async () => {
          expect(await Bun.file(fixture.marker).text()).toBe("initialize\n" + "tools/call\n".repeat(5))
          expect(fixture.metadata).toEqual([])
        })
      }),
    { config: { permission: { edit: "allow" } } },
    { timeout: 30_000 },
  )
})

it.instance(
  "Composer native denied compose/scaffold never start backend",
  () =>
    Effect.gen(function* () {
      const fixture = yield* composerFixture("plain")
      yield* Effect.promise(async () => {
        await expect(
          fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context),
        ).rejects.toThrow()
        await expect(
          fixture.tools["hugr-scaffold"].execute({ output_dir: "generated" }, fixture.context),
        ).rejects.toThrow()
        expect(await Bun.file(fixture.marker).exists()).toBe(false)
        // Same real peer is the positive control for absence and lazy startup.
        expect(await fixture.tools["hugr-search"].execute({ query: "control" }, fixture.context)).toMatchObject({
          output: "ok",
        })
        expect(await Bun.file(fixture.marker).text()).toBe("initialize\ntools/call\n")
        expect(fixture.metadata).toEqual([])
      })
    }),
  { config: { permission: { edit: "deny" } } },
  { timeout: 30_000 },
)

Array.of("compose", "scaffold").forEach((operation) => {
  it.instance(
    `Composer failed ${operation} write is not retried`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* composerFixture("disconnect")
        yield* Effect.promise(async () => {
          const call =
            operation === "compose"
              ? fixture.tools["hugr-compose"].execute({ output_dir: "generated" }, fixture.context)
              : fixture.tools["hugr-scaffold"].execute({ output_dir: "generated" }, fixture.context)
          await expect(call).rejects.toThrow()
          expect(await Bun.file(fixture.marker).text()).toBe("initialize\ntools/call\n")
          expect(fixture.metadata).toEqual([])
        })
      }),
    { config: { permission: { edit: "allow" } } },
    { timeout: 30_000 },
  )
})

function composerFixture(mode: string) {
  return Effect.gen(function* () {
    const instance = yield* requireInstance
    const sessions = yield* Session.Service
    const permission = yield* Permission.Service
    const agents = yield* Agent.Service
    const agent = yield* agents.get("build")
    const session = yield* sessions.create({ title: `composer ${mode}`, agent: "build" })
    const services = yield* Effect.context<never>()
    const metadata: unknown[] = []
    const context: ToolContext = {
      sessionID: session.id,
      messageID: "message",
      agent: "build",
      agentID: "build",
      directory: instance.directory,
      worktree: instance.directory,
      abort: new AbortController().signal,
      metadata: (input) => {
        metadata.push(input)
      },
      ask: (input) =>
        Effect.runPromiseWith(services)(permission.ask({ ...input, sessionID: session.id, ruleset: agent.permission })),
    }
    const marker = path.join(instance.directory, "backend-calls")
    const client = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new HugrComposerClient(instance.directory, instance.directory, {
            command: process.execPath,
            args: [path.join(import.meta.dir, "hugr-composer-envelope-server.ts"), mode, marker],
            timeout: 5_000,
            hardTimeout: 10_000,
          }),
      ),
      (client) => Effect.promise(() => client.dispose()),
    )
    const tools = createHuGRTools(client)
    expect(Object.keys(tools).sort()).toEqual([
      "hugr-compose",
      "hugr-describe",
      "hugr-list",
      "hugr-scaffold",
      "hugr-search",
    ])
    return { tools, context, marker, metadata }
  })
}
