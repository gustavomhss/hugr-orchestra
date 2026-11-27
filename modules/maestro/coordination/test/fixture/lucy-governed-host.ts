import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DateTime, Effect, Layer, Option } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV2 } from "@orchestra/core/permission"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import type { SessionV2 } from "@orchestra/core/session"
import type { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SkillV2 } from "@orchestra/core/skill"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { GovernanceBackgroundV2 } from "../../src/v2/governance/background"
import { WriteRootsV2 } from "../../src/v2/governance/write-roots"
import { MaestroSeats } from "../../src/v2/seats-service"
import { MaestroToolsV2 } from "../../src/v2/tools"
import { MaestroReviewTools } from "../../src/v2/tools/review"
import { directory, projectID } from "./lucy-governed-repository"

export const sessionID = SessionSchema.ID.make("ses_governed_checks")
export const time = { created: DateTime.makeUnsafe(1_700_000_000_000) }
export const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
export const prompts: string[] = []
export const briefsBySession = new Map<string, string>()
export const child = {
  create: (_input: { readonly id: SessionSchema.ID; readonly parentID: SessionSchema.ID }) => Effect.void,
  resume: (_id: SessionSchema.ID) => Effect.void,
}
export const sessions = {
  create: (input: { readonly id: SessionSchema.ID; readonly parentID: SessionSchema.ID }) =>
    Effect.suspend(() => child.create(input)).pipe(Effect.as({ id: input.id })),
  prompt: (input: { readonly prompt: { readonly text: string }; readonly sessionID?: SessionSchema.ID }) =>
    Effect.sync(() => {
      prompts.push(input.prompt.text)
      if (input.sessionID) briefsBySession.set(input.sessionID, input.prompt.text)
    }),
  messages: (input: { readonly sessionID: SessionSchema.ID }) =>
    Effect.succeed(scripted.messages(input.sessionID) ?? reviewHistory(input.sessionID)),
} as unknown as SessionV2.Interface
export const scripted: {
  messages: (sessionID: SessionSchema.ID) => ReturnType<typeof reviewHistory> | undefined
} = { messages: () => undefined }
export const execution = { resume: (id: SessionSchema.ID) => Effect.suspend(() => child.resume(id)) } as unknown as SessionExecution.Interface

export function reviewSkills() {
  const root = path.resolve(import.meta.dir, "../../../../../packages/lucy-specialist/skills")
  const skill = (name: string, file: string) => ({ name, location: AbsolutePath.make(path.join(root, file)), content: "Procedure." })
  return [
    skill("lucy-review", "lucy-review/SKILL.md"),
    skill("lucy-review-plan", "lucy-review/plan/SKILL.md"),
    skill("lucy-review-code", "lucy-review/code/SKILL.md"),
    skill("lucy-review-rereview", "lucy-review/rereview/SKILL.md"),
    skill("lucy-lens-correctness-logic", "lucy-lens/correctness/logic/SKILL.md"),
    skill("lucy-lens-correctness-edges", "lucy-lens/correctness/edges/SKILL.md"),
    skill("lucy-lens-correctness-reliability", "lucy-lens/correctness/reliability/SKILL.md"),
    skill("lucy-lens-tests", "lucy-lens/tests/SKILL.md"),
    skill("lucy-review-prove-quote", "lucy-review/prove/quote/SKILL.md"),
    skill("lucy-review-prove-property", "lucy-review/prove/property/SKILL.md"),
  ]
}

export const host = AppNodeBuilder.build(LayerNode.group([
  MaestroToolsV2.node, ToolRegistry.node, ToolRegistry.toolsNode, Database.node, EventV2.node,
]), [
  [ToolRegistry.node, ToolRegistry.nativeNode],
  [ToolRegistry.toolsNode, ToolRegistry.nativeToolsNode],
  [ToolSafety.node, WriteRootsV2.safetyNode],
  [Database.node, Database.layerFromPath(":memory:")],
  [Global.node, Layer.unwrap(Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "maestro-governed-data-"))),
    (data) => Effect.promise(() => fs.rm(data, { recursive: true, force: true })),
  ).pipe(Effect.map((data) => Global.layerWith({ data }))))],
  [Location.node, Layer.succeed(Location.Service, Location.Service.of({ directory, project: { id: projectID, directory } }))],
  [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  [PermissionV2.node, Layer.succeed(PermissionV2.Service, PermissionV2.Service.of({
    evaluate: () => Effect.die("unused"), authorize: () => Effect.die("unused"), askExplicit: () => Effect.die("unused"),
    assert: () => Effect.void, ask: () => Effect.die("unused"), reply: () => Effect.die("unused"),
    cancelSession: () => Effect.void, get: () => Effect.die("unused"), forSession: () => Effect.die("unused"), list: () => Effect.die("unused"),
  }))],
  [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed(reviewSkills()) })],
  [MaestroSeats.node, Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["backend", "lucy"]))],
  [AgentV2.node, Layer.mock(AgentV2.Service, {
    get: (id) => Effect.succeed(["maestro", "backend", "lucy"].includes(id) ? AgentV2.Info.empty(id) : undefined),
  })],
  [Config.node, Layer.mock(Config.Service, {
    entries: () => Effect.succeed([new Config.Document({ type: "document", info: new Config.Info({ maestro: { atlas: { projectID, directory: "." } } }) })]),
  })],
  [GovernanceBackgroundV2.sessionsNode, Layer.succeed(GovernanceBackgroundV2.Sessions, Option.some(sessions))],
  [MaestroReviewTools.executionNode, Layer.succeed(MaestroReviewTools.Execution, Option.some(execution))],
]) as Layer.Layer<ToolRegistry.Service | Database.Service | EventV2.Service>

export function reviewHistory(id: SessionSchema.ID) {
  const promptID = (key: string) => SessionMessage.ID.make(`msg_lucy_review_${createHash("sha256").update(`${id}\0${key}`).digest("hex")}`)
  const entry = ["```review-entry", JSON.stringify({
    status: "eligible",
    context: { intent: "nothing found", acceptance: "nothing found", invariants: "nothing found", assumptions: "nothing found" },
    overlays: { confirmed: [], declined: [], added: [] }, slices: [],
  }), "```"].join("\n")
  const turn = (key: string, text: string) => {
    const messageID = promptID(key)
    return [
      SessionMessage.User.make({ id: messageID, type: "user", text: key, time }),
      SessionMessage.Assistant.make({
        id: SessionMessage.ID.make(`${messageID}_reply`), type: "assistant", agent: "lucy", model,
        content: [{ type: "text", id: "text", text }], time: { created: time.created, completed: time.created }, finish: "stop",
      }),
    ]
  }
  return [...turn("entry", entry), ...turn("finish", "recorded")]
}

export function turn(id: SessionSchema.ID, key: string, text: string) {
  const messageID = SessionMessage.ID.make(`msg_lucy_review_${createHash("sha256").update(`${id}\0${key}`).digest("hex")}`)
  return [
    SessionMessage.User.make({ id: messageID, type: "user", text: key, time }),
    SessionMessage.Assistant.make({
      id: SessionMessage.ID.make(`${messageID}_reply`), type: "assistant", agent: "lucy", model,
      content: [{ type: "text", id: "text", text }], time: { created: time.created, completed: time.created }, finish: "stop",
    }),
  ]
}
