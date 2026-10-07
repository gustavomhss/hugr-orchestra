import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { Npm } from "@orchestra/core/npm"
import { Auth } from "../../src/auth"
import { Workspace } from "../../src/control-plane/workspace"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { Project } from "../../src/project/project"
import { Vcs } from "../../src/project/vcs"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { NpmTest } from "../fake/npm"

// Instance bootstrap loads Config, which starts a detached npm install into every .orchestra directory it loads, the
// repository's own when a request falls back to the working directory. A real one outlives its test and, on Windows,
// starves file I/O for later test files in the same process.
export const workspaceLayerWithRuntimeFlags = (overrides: Partial<RuntimeFlags.Info>) =>
  AppNodeBuilder.build(
    LayerNode.group([
      Workspace.node,
      Auth.node,
      Session.node,
      SessionPrompt.node,
      Project.node,
      Vcs.node,
      Database.node,
      EventV2Bridge.node,
      FSUtil.node,
      InstanceStore.node,
    ]),
    [
      [InstanceStore.bootstrapNode, InstanceBootstrap.node],
      [RuntimeFlags.node, RuntimeFlags.layer(overrides)],
      [Npm.node, NpmTest.noop],
    ],
  )
