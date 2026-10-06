import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Npm } from "@opencode-ai/core/npm"
import { Layer } from "effect"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { Plugin } from "../../src/plugin"
import { NpmTest } from "../fake/npm"
import { testInstanceStoreLayer } from "../fixture/fixture"

// The services ShellTool runs with. Config starts a detached npm install into every .opencode directory it loads, the
// repository's own when a test runs in the checkout. A real one outlives its test and, on Windows, starves file I/O
// for later test files in the same process.
export const shellLayer = Layer.mergeAll(
  LayerNode.compile(
    LayerNode.group([
      CrossSpawnSpawner.node,
      FSUtil.node,
      Plugin.node,
      Truncate.node,
      Config.node,
      Agent.node,
      RuntimeFlags.node,
    ]),
    [[Npm.node, NpmTest.noop]],
  ),
  testInstanceStoreLayer,
)
