import { describe, expect } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Location } from "@opencode-ai/core/location"
import { AgentPlugin } from "@opencode-ai/core/plugin/agent"
import { AgentPrompt } from "@opencode-ai/core/agent/prompt"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { agentHost, host } from "./plugin/host"

const it = testEffect(AppNodeBuilder.build(AgentV2.node))

describe("AgentV2", () => {
  it.effect("starts without agents", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service

      expect(yield* agent.all()).toEqual([])
      expect(yield* agent.get(AgentV2.ID.make("maestro"))).toBeUndefined()
    }),
  )

  it.effect("materializes replayable agent transforms", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("reviewer")
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = "Reviews code"
          info.mode = "subagent"
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, description: "Reviews code", mode: "subagent" })
      expect((yield* agent.all()).map((info) => info.id)).toEqual([id])
    }),
  )

  it.effect("rebuilds state when a transform is replaced", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("reviewer")
      let description = "Old description"
      let hidden = true
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = description
          info.hidden = hidden
        }),
      )
      description = "New description"
      hidden = false
      yield* agent.reload()

      expect(yield* agent.get(id)).toMatchObject({ description: "New description", hidden: false })
    }),
  )

  it.effect("removes a transform when its scope closes", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("scoped")
      const scope = yield* Scope.make()
      yield* agent.transform((editor) => editor.update(id, () => {})).pipe(Scope.provide(scope))
      expect(yield* agent.get(id)).toBeDefined()

      yield* Scope.close(scope, Exit.void)
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("applies direct agent updates", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("maestro")

      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.mode = "primary"
          info.hidden = true
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, mode: "primary", hidden: true })
    }),
  )

  it.effect("creates agents with runtime defaults and supports direct removal", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("custom")

      yield* agent.transform((editor) => editor.update(id, () => {}))
      expect(yield* agent.get(id)).toEqual(AgentV2.Info.empty(id))

      yield* agent.transform((editor) => editor.remove(id))
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("defaults to maestro and never to another selectable agent", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const maestro = AgentV2.ID.make("maestro")
      const conductor = AgentV2.ID.make("conductor")
      yield* agent.transform((editor) =>
        editor.update(conductor, (info) => {
          info.mode = "primary"
        }),
      )

      expect(yield* agent.default()).toBeUndefined()
      expect(yield* agent.resolve()).toBeUndefined()
      expect(yield* agent.select()).toEqual({ id: maestro, info: undefined })

      yield* agent.transform((editor) =>
        editor.update(maestro, (info) => {
          info.mode = "primary"
        }),
      )
      expect((yield* agent.default())?.id).toBe(maestro)
      expect((yield* agent.select()).id).toBe(maestro)

      yield* agent.transform((editor) => editor.default(conductor))
      expect((yield* agent.default())?.id).toBe(conductor)
      expect((yield* agent.select()).id).toBe(conductor)
    }),
  )

  it.effect("falls back to maestro when the configured default cannot be selected", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const maestro = AgentV2.ID.make("maestro")
      const scout = AgentV2.ID.make("scout")
      yield* agent.transform((editor) => {
        editor.update(maestro, (info) => {
          info.mode = "primary"
        })
        editor.update(scout, (info) => {
          info.mode = "subagent"
        })
        editor.default(scout)
      })

      expect((yield* agent.default())?.id).toBe(maestro)
    }),
  )

  it.effect("does not ambiently opt built-in agents into bash", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      yield* AgentPlugin.Plugin.effect(
        host({
          agent: agentHost(agent),
        }),
      ).pipe(
        Effect.provideService(
          Location.Service,
          Location.Service.of(location({ directory: AbsolutePath.make("/project") })),
        ),
      )

      const agents = yield* agent.all()
      expect(agents.map((item) => String(item.id)).sort()).toEqual([
        "compaction",
        "explore",
        "general",
        "maestro",
        "summary",
        "title",
      ])
      expect(yield* agent.default()).toMatchObject({ id: "maestro", mode: "primary" })
      for (const item of agents) {
        expect(item.permissions.some((rule) => rule.action === "bash" && rule.effect !== "deny")).toBe(false)
      }
    }),
  )

  it.effect("gives built-in agents the prompts the V1 session path uses", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      yield* AgentPlugin.Plugin.effect(host({ agent: agentHost(agent) })).pipe(
        Effect.provideService(
          Location.Service,
          Location.Service.of(location({ directory: AbsolutePath.make("/project") })),
        ),
      )

      expect(Object.fromEntries((yield* agent.all()).map((item) => [item.id, item.system]))).toEqual({
        maestro: AgentPrompt.maestro,
        general: AgentPrompt.general,
        explore: AgentPrompt.explore,
        compaction: AgentPrompt.compaction,
        title: AgentPrompt.title,
        summary: AgentPrompt.summary,
      })
      expect(AgentPrompt.maestro).toStartWith("You are Maestro")
    }),
  )
})
