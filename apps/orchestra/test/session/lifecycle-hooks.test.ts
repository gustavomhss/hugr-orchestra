import { describe, expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { pathToFileURL } from "url"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Auth } from "../../src/auth"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Npm } from "@orchestra/core/npm"
import { Plugin } from "@/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([
    Session.node,
    EventV2Bridge.node,
    SessionProjector.node,
    Plugin.node,
    CrossSpawnSpawner.node,
  ]), [
    [Auth.node, AuthTest.empty],
    [Npm.node, NpmTest.noop],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ]),
)

const recordingPlugin = [
  "const bus = globalThis.__lifecycleBus ?? (globalThis.__lifecycleBus = { starts: [], ends: [], stops: [] })",
  "export default async () => ({",
  '  "session.start": async (input, output) => {',
  "    bus.starts.push({ sessionID: input.sessionID, cwd: input.cwd, agent: input.agent, timestamp: input.timestamp })",
  "    output.metadata.fromPlugin = 'yes'",
  "    output.metadata.owned = 'plugin'",
  "  },",
  '  "session.end": async (input, output) => {',
  "    bus.ends.push({ sessionID: input.sessionID, reason: input.reason, duration_ms: input.duration_ms })",
  "  },",
  "})",
  "",
].join("\n")

const readBus = () => (globalThis as any).__lifecycleBus ?? { starts: [], ends: [], stops: [] }

const clearBus = () => {
  ;(globalThis as any).__lifecycleBus = { starts: [], ends: [], stops: [] }
}

const installPlugin = Effect.gen(function* () {
  const test = yield* TestInstance
  const file = path.join(test.directory, "lifecycle-plugin.ts")
  yield* Effect.promise(() => Bun.write(file, recordingPlugin))
  yield* Effect.promise(() =>
    Bun.write(
      path.join(test.directory, "orchestra.json"),
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        plugin: [pathToFileURL(file).href],
      }),
    ),
  )
})

describe("session lifecycle hooks (E2E via Session.create)", () => {
  it.instance("Session.create fires session.start with correct input", () =>
    Effect.gen(function* () {
      clearBus()
      yield* installPlugin
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "Hook Test" })

      const bus = readBus()
      expect(bus.starts.length).toBe(1)
      expect(bus.starts[0].sessionID).toBe(session.id)
      expect(typeof bus.starts[0].cwd).toBe("string")
      expect(bus.starts[0].cwd.length).toBeGreaterThan(0)
      expect(typeof bus.starts[0].timestamp).toBe("number")
    }),
  )

  it.instance("session.start metadata is stored on the session without overriding creator keys", () =>
    Effect.gen(function* () {
      clearBus()
      yield* installPlugin
      const sessions = yield* Session.Service
      const created = yield* sessions.create({ title: "Metadata Test", metadata: { owned: "creator" } })
      const stored = yield* sessions.get(created.id)

      expect(created.metadata).toEqual({ owned: "creator", fromPlugin: "yes" })
      expect(stored.metadata).toEqual({ owned: "creator", fromPlugin: "yes" })
    }),
  )
})
