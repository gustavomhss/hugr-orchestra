import { afterAll, expect } from "bun:test"
import { Npm } from "@orchestra/core/npm"
import { Effect } from "effect"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { ProviderTest } from "../fake/provider"
import { SkillTest } from "../fake/skill"
import { testEffect } from "../lib/effect"
import { PLUGIN_AGENT } from "../fixture/agent-plugin.constants"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"

// `it.instance` skips InstanceBootstrap so LSP / MCP don't spin up — those
// services hang during scope teardown on Windows and aren't needed
// to verify plugin → config hook → Agent.list.
//
// Plugin SDK admission indexes every node_modules above a plugin before importing it. Loaded from
// test/fixture, that is the whole monorepo install, which took 17-30 s of the 30 s budget on CI.
// A copy in its own directory has the footprint of a real local plugin.
const pluginDir = await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-agent-plugin-"))
const pluginFile = path.join(pluginDir, "agent-plugin.ts")
await Bun.write(pluginFile, Bun.file(path.join(import.meta.dir, "..", "fixture", "agent-plugin.ts")))
afterAll(() => fs.rm(pluginDir, { recursive: true, force: true }))
const pluginUrl = pathToFileURL(pluginFile).href

const provider = ProviderTest.fake()
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Agent.node, Plugin.node]), [
    [Auth.node, AuthTest.empty],
    [Npm.node, NpmTest.noop],
    [Provider.node, provider.layer],
    [Skill.node, SkillTest.empty],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ]),
)

it.instance(
  "plugin-registered agents appear in Agent.list",
  () =>
    Effect.gen(function* () {
      yield* Plugin.Service.use((p) => p.init())
      const agents = yield* Agent.use.list()
      const added = agents.find((agent) => agent.name === PLUGIN_AGENT.name)
      expect(added?.description).toBe(PLUGIN_AGENT.description)
      expect(added?.mode).toBe(PLUGIN_AGENT.mode)
    }),
  { config: { plugin: [pluginUrl] } },
)
