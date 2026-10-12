import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { ProjectV2 } from "@orchestra/core/project"
import { Npm } from "@orchestra/core/npm"
import { AgentExecution } from "@orchestra/server/agent-execution"
import { Effect, Layer, Schema } from "effect"
import { Agent } from "../../src/agent/agent"
import { InstanceStore } from "../../src/project/instance-store"
import { HostAgentExecution } from "../../src/server/routes/instance/httpapi/handlers/agent-execution"
import { modelSupportsExecution } from "../../../app/src/hooks/model-execution"
import { tmpdirScoped, testInstanceStoreLayer } from "../fixture/fixture"
import { NpmTest } from "../fake/npm"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Agent.node, [[Npm.node, NpmTest.noop]]),
    testInstanceStoreLayer,
    AppNodeBuilder.build(CrossSpawnSpawner.node),
  ),
)

it.live(
  "actual Location registry annotates stable engines without changing modes, hidden rows or API choices",
  () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service
      const instances = yield* InstanceStore.Service
      const rows = [
        AgentV2.Info.make({
          ...AgentV2.Info.empty(AgentV2.ID.make("maestro")),
          mode: "primary",
          request: { headers: { "x-original": "keep" }, body: { temperature: 0.25 } },
        }),
        AgentV2.Info.make({ ...AgentV2.Info.empty(AgentV2.ID.make("cc-hidden")), mode: "subagent", hidden: true }),
        AgentV2.Info.make({ ...AgentV2.Info.empty(AgentV2.ID.make("normal")), mode: "primary" }),
      ]
      const standalone = yield* AgentExecution.Annotate
      const plain = yield* standalone(rows).pipe(
        Effect.provideService(Location.Service, {
          directory: AbsolutePath.make("/standalone-agent-test"),
          project: { id: ProjectV2.ID.global, directory: AbsolutePath.make("/standalone-agent-test") },
        }),
      )
      expect(plain).toEqual(rows)
      expect(plain.every((agent) => agent.engine === undefined)).toBe(true)
      expect(
        modelSupportsExecution("anthropic", { options: { executionHost: "claude-code" } }, {}, plain[0].engine),
      ).toBe(false)

      for (const engine of ["claude-code", "orchestra"] as const) {
        const directory = yield* tmpdirScoped({
          git: true,
          config: {
            formatter: false,
            lsp: false,
            agent: {
              maestro: { engine },
              "cc-hidden": { engine: "claude-code", mode: "subagent", hidden: true, name: "Hidden Claude display" },
              normal: { mode: "primary", name: "cc-hidden" },
            },
          },
        })
        const facts = yield* instances.provide(
          { directory },
          Effect.gen(function* () {
            return [yield* agents.get("maestro"), yield* agents.get("cc-hidden"), yield* agents.get("normal")]
          }),
        )
        expect(facts[0].engine).toBe(engine)
        expect(facts[1]).toMatchObject({ id: "cc-hidden", engine: "claude-code", mode: "subagent", hidden: true })
        expect(facts[2]).toMatchObject({ id: "normal", name: "cc-hidden" })
        expect(facts[2].engine).toBeUndefined()
        const annotated = yield* Effect.gen(function* () {
          const annotate = yield* AgentExecution.Annotate
          return yield* annotate(rows)
        }).pipe(
          Effect.provideService(Location.Service, {
            directory: AbsolutePath.make(directory),
            project: { id: ProjectV2.ID.global, directory: AbsolutePath.make(directory) },
          }),
          Effect.provide(HostAgentExecution.layer),
        )
        const wire = annotated.map((agent) => Schema.encodeSync(AgentV2.Info)(agent))
        expect(wire[0].engine).toBe(engine)
        expect(wire[1]).toMatchObject({ id: "cc-hidden", engine: "claude-code", mode: "subagent", hidden: true })
        expect(wire[2].engine).toBe("orchestra")
        expect(annotated.map(({ engine: _engine, ...agent }) => agent)).toEqual(rows)
        expect(
          modelSupportsExecution("anthropic", { options: { executionHost: "claude-code" } }, {}, wire[0].engine),
        ).toBe(engine === "claude-code")
        expect(modelSupportsExecution("openai", { options: { tenant: "api-connected" } }, {}, wire[0].engine)).toBe(
          true,
        )
      }
    }),
  60_000,
)
