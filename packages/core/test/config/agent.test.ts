import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { ConfigAgentPlugin } from "@orchestra/core/config/plugin/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { PermissionV2 } from "@orchestra/core/permission"
import { AbsolutePath } from "@orchestra/core/schema"
import { ConfigMigrateV1 } from "@orchestra/core/v1/config/migrate"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { agentHost, host } from "../plugin/host"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([AgentV2.node, FSUtil.node, Global.node])))
const decode = Schema.decodeUnknownSync(Config.Info)

describe("ConfigAgentPlugin.Plugin", () => {
  it.effect("matches POSIX paths against home-relative permissions", () =>
    Effect.gen(function* () {
      const permissions = yield* loadHomePermissions("/home/test")
      expect(PermissionV2.evaluate("external_directory", "/home/test/p/orchestra/src/*", permissions).effect).toBe(
        "allow",
      )
      expect(PermissionV2.evaluate("external_directory", "/home/test/cache/files/*", permissions).effect).toBe("deny")
      expect(PermissionV2.evaluate("external_directory", "/some/~/path", permissions).effect).toBe("deny")
      expect(PermissionV2.evaluate("external_directory", "$HOMELESS/private/*", permissions).effect).toBe("deny")
      expect(PermissionV2.evaluate("bash", "$HOME/private/key", permissions).effect).toBe("deny")
    }),
  )

  it.effect("matches Windows paths against home-relative permissions", () =>
    Effect.gen(function* () {
      const permissions = yield* loadHomePermissions("C:\\Users\\test")
      expect(
        PermissionV2.evaluate("external_directory", "C:\\Users\\test\\p\\orchestra\\src\\*", permissions).effect,
      ).toBe("allow")
      expect(PermissionV2.evaluate("external_directory", "C:\\Users\\test\\cache\\files\\*", permissions).effect).toBe(
        "deny",
      )
    }),
  )

  it.effect("applies all global permissions before agent-specific permissions", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      const maestro = AgentV2.ID.make("maestro")
      yield* agents.transform((editor) =>
        editor.update(maestro, (agent) => {
          agent.mode = "primary"
          agent.permissions.push({ action: "bash", resource: "*", effect: "allow" })
        }),
      )

      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({
                permissions: [{ action: "bash", resource: "*", effect: "ask" }],
                agents: {
                  maestro: {
                    permissions: [{ action: "bash", resource: "git *", effect: "allow" }],
                  },
                  reviewer: {
                    model: "openrouter/openai/gpt-5",
                    description: "Review changes",
                    mode: "subagent",
                    permissions: [
                      { action: "edit", resource: "*", effect: "deny" },
                      { action: "read", resource: "*", effect: "deny" },
                    ],
                  },
                  removed: { description: "Removed later" },
                },
              }),
            }),
            new Config.Document({
              type: "document",
              info: decode({
                permissions: [{ action: "read", resource: "*", effect: "allow" }],
                agents: {
                  reviewer: { variant: "high", hidden: true },
                  removed: { disabled: true },
                  late: {
                    permissions: [{ action: "edit", resource: "*", effect: "allow" }],
                  },
                },
              }),
            }),
          ]),
      })

      yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
        Effect.provideService(Config.Service, config),
      )

      const maestroAgent = yield* agents.get(maestro)
      if (!maestroAgent) throw new Error("expected configured maestro agent")
      expect(maestroAgent.permissions).toEqual([
        { action: "bash", resource: "*", effect: "allow" },
        { action: "bash", resource: "*", effect: "ask" },
        { action: "read", resource: "*", effect: "allow" },
        { action: "bash", resource: "git *", effect: "allow" },
      ])
      expect(PermissionV2.evaluate("bash", "git status", maestroAgent.permissions).effect).toBe("allow")
      expect(PermissionV2.evaluate("bash", "bun test", maestroAgent.permissions).effect).toBe("ask")

      const reviewer = yield* agents.get(AgentV2.ID.make("reviewer"))
      if (!reviewer) throw new Error("expected configured reviewer agent")
      expect(reviewer).toMatchObject({
        description: "Review changes",
        mode: "subagent",
        hidden: true,
        model: { providerID: "openrouter", id: "openai/gpt-5", variant: "high" },
      })
      expect(reviewer.permissions).toEqual([
        { action: "bash", resource: "*", effect: "ask" },
        { action: "read", resource: "*", effect: "allow" },
        { action: "edit", resource: "*", effect: "deny" },
        { action: "read", resource: "*", effect: "deny" },
      ])
      expect(PermissionV2.evaluate("read", "README.md", reviewer.permissions).effect).toBe("deny")
      expect((yield* agents.get(AgentV2.ID.make("late")))?.permissions).toEqual([
        { action: "bash", resource: "*", effect: "ask" },
        { action: "read", resource: "*", effect: "allow" },
        { action: "edit", resource: "*", effect: "allow" },
      ])
      expect(yield* agents.get(AgentV2.ID.make("removed"))).toBeUndefined()
    }),
  )

  it.effect("maps configured agent fields and preserves an unspecified model variant", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({
                agents: {
                  reviewer: {
                    model: "anthropic/claude-sonnet",
                    system: "Review carefully.",
                    description: "Reviews changes",
                    mode: "subagent",
                    hidden: true,
                    color: "warning",
                    steps: 12,
                    request: {
                      headers: { first: "one", shared: "first" },
                      body: { enabled: true, profile: "review", effort: "medium" },
                    },
                  },
                },
              }),
            }),
            new Config.Document({
              type: "document",
              info: decode({
                agents: {
                  reviewer: {
                    request: {
                      headers: { shared: "last", second: "two" },
                      body: { retries: 2, effort: "high" },
                    },
                  },
                },
              }),
            }),
          ]),
      })

      yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
        Effect.provideService(Config.Service, config),
      )

      const reviewer = yield* agents.get(AgentV2.ID.make("reviewer"))
      if (!reviewer) throw new Error("expected configured reviewer agent")
      expect(reviewer).toMatchObject({
        system: "Review carefully.",
        description: "Reviews changes",
        mode: "subagent",
        hidden: true,
        color: "warning",
        steps: 12,
        model: { providerID: "anthropic", id: "claude-sonnet", variant: undefined },
      })
      expect(reviewer.request).toEqual({
        headers: { first: "one", shared: "last", second: "two" },
        body: { enabled: true, profile: "review", retries: 2, effort: "high" },
      })
    }),
  )

  it.effect("removes a built-in agent disabled by configuration", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      const general = AgentV2.ID.make("general")
      yield* agents.transform((editor) => editor.update(general, () => {}))

      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({ agents: { general: { disabled: true } } }),
            }),
          ]),
      })

      yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
        Effect.provideService(Config.Service, config),
      )

      expect(yield* agents.get(general)).toBeUndefined()
    }),
  )

  it.effect("configuration can neither disable Maestro nor take it out of primary mode", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      yield* agents.transform((editor) =>
        editor.update(AgentV2.defaultID, (agent) => {
          agent.mode = "primary"
        }),
      )

      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({
                agents: { maestro: { disabled: true, mode: "subagent", description: "Conducts the team" } },
              }),
            }),
          ]),
      })

      yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
        Effect.provideService(Config.Service, config),
      )

      expect(yield* agents.get(AgentV2.defaultID)).toMatchObject({
        id: "maestro",
        mode: "primary",
        description: "Conducts the team",
      })
    }),
  )

  it.live("loads legacy file-based agents from config directories", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(tmp.path, "agents", "team"), { recursive: true })
            await fs.mkdir(path.join(tmp.path, "modes"), { recursive: true })
            await fs.writeFile(
              path.join(tmp.path, "agents", "reviewer.md"),
              `---
model: openrouter/openai/gpt-5
description: Markdown description
temperature: 0.5
tools:
  write: false
---
Review carefully.`,
            )
            await fs.writeFile(path.join(tmp.path, "agents", "team", "helper.md"), "Help the team.")
            await fs.writeFile(
              path.join(tmp.path, "agents", "native.md"),
              `---
request:
  headers:
    x-agent: native
  body:
    effort: high
permissions:
  - action: edit
    resource: "*"
    effect: deny
---
Use native v2 fields.`,
            )
            await fs.writeFile(path.join(tmp.path, "agents", "disabled.md"), "---\ndisabled: true\n---\nDisabled")
            await fs.writeFile(path.join(tmp.path, "modes", "plan.md"), "Make a plan.")
          })
          const agents = yield* AgentV2.Service
          const config = Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({
                  type: "document",
                  info: decode({ agents: { reviewer: { description: "JSON description" } } }),
                }),
                new Config.Directory({ type: "directory", path: AbsolutePath.make(tmp.path) }),
              ]),
          })

          yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
            Effect.provideService(Config.Service, config),
          )

          expect(yield* agents.get(AgentV2.ID.make("reviewer"))).toMatchObject({
            model: { providerID: "openrouter", id: "openai/gpt-5" },
            system: "Review carefully.",
            description: "Markdown description",
            request: { body: { temperature: 0.5 } },
            permissions: [{ action: "edit", resource: "*", effect: "deny" }],
          })
          expect(yield* agents.get(AgentV2.ID.make("team/helper"))).toMatchObject({ system: "Help the team." })
          expect(yield* agents.get(AgentV2.ID.make("native"))).toMatchObject({
            system: "Use native v2 fields.",
            request: { headers: { "x-agent": "native" }, body: { effort: "high" } },
            permissions: [{ action: "edit", resource: "*", effect: "deny" }],
          })
          expect(yield* agents.get(AgentV2.ID.make("disabled"))).toBeUndefined()
          expect(yield* agents.get(AgentV2.ID.make("plan"))).toMatchObject({ system: "Make a plan.", mode: "primary" })
        }),
      ),
    ),
  )

  it.live("an agent file can neither disable Maestro nor take it out of primary mode", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            for (const folder of ["agent", "agents", "mode"])
              await fs.mkdir(path.join(tmp.path, folder), { recursive: true })
            // The editor's legacy keys, the native keys and a legacy mode file all name Maestro.
            await fs.writeFile(
              path.join(tmp.path, "agent", "maestro.md"),
              "---\ndescription: Hand edited\nmode: all\ndisable: true\n---\n",
            )
            await fs.writeFile(
              path.join(tmp.path, "agents", "maestro.md"),
              "---\nmode: subagent\ndisabled: true\n---\n",
            )
            await fs.writeFile(path.join(tmp.path, "mode", "maestro.md"), "---\ndisable: true\n---\n")
            // Other agents keep both keys.
            await fs.writeFile(path.join(tmp.path, "agents", "helper.md"), "---\nmode: primary\n---\nHelp.")
            await fs.writeFile(path.join(tmp.path, "agents", "gone.md"), "---\ndisabled: true\n---\nGone.")
          })
          const agents = yield* AgentV2.Service
          yield* agents.transform((editor) =>
            editor.update(AgentV2.defaultID, (agent) => {
              agent.mode = "primary"
            }),
          )
          const config = Config.Service.of({
            entries: () =>
              Effect.succeed([new Config.Directory({ type: "directory", path: AbsolutePath.make(tmp.path) })]),
          })

          yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
            Effect.provideService(Config.Service, config),
          )

          expect(yield* agents.get(AgentV2.defaultID)).toMatchObject({ description: "Hand edited", mode: "primary" })
          expect(yield* agents.get(AgentV2.ID.make("helper"))).toMatchObject({ mode: "primary" })
          expect(yield* agents.get(AgentV2.ID.make("gone"))).toBeUndefined()
        }),
      ),
    ),
  )
})

function loadHomePermissions(home: string) {
  return Effect.gen(function* () {
    const agents = yield* AgentV2.Service
    const maestro = AgentV2.ID.make("maestro")
    yield* agents.transform((editor) => editor.update(maestro, () => {}))
    const config = Config.Service.of({
      entries: () =>
        Effect.succeed([
          new Config.Document({
            type: "document",
            info: decode(
              ConfigMigrateV1.migrate({
                permission: {
                  external_directory: {
                    "~/p/**": "allow",
                    "/some/~/path": "deny",
                    "$HOMELESS/**": "deny",
                  },
                  bash: {
                    "$HOME/private/**": "deny",
                  },
                },
                agent: {
                  maestro: {
                    permission: {
                      external_directory: {
                        "$HOME/cache/**": "deny",
                      },
                    },
                  },
                },
              }),
            ),
          }),
        ]),
    })

    yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
      Effect.provideService(Config.Service, config),
      Effect.provideService(Global.Service, Global.Service.of({ ...Global.make(), home })),
    )

    const agent = yield* agents.get(maestro)
    if (!agent) throw new Error("expected configured maestro agent")
    return agent.permissions
  })
}
