export * as AgentPlugin from "./agent"

import path from "path"
import { define } from "./internal"
import { Effect } from "effect"
import { AgentV2 } from "../agent"
import { AgentPrompt } from "../agent/prompt"
import { Global } from "../global"
import { PermissionV2 } from "../permission"

const TRUNCATION_GLOB = path.join(Global.Path.data, "tool-output", "*")

export const Plugin = define({
  id: "agent",
  effect: Effect.fn(function* (ctx) {
    const whitelistedDirs = [TRUNCATION_GLOB, path.join(Global.Path.tmp, "*")]
    const readonlyExternalDirectory: PermissionV2.Ruleset = [
      { action: "external_directory", resource: "*", effect: "ask" },
      ...whitelistedDirs.map(
        (resource): PermissionV2.Rule => ({ action: "external_directory", resource, effect: "allow" }),
      ),
    ]
    // Reads every file but .env files, which hold secrets; .env.example stays readable. Last match wins, so an agent's
    // own read allow goes before these.
    const envRead: PermissionV2.Ruleset = [
      { action: "read", resource: "*", effect: "allow" },
      { action: "read", resource: "*.env", effect: "ask" },
      { action: "read", resource: "*.env.*", effect: "ask" },
      { action: "read", resource: "*.env.example", effect: "allow" },
    ]
    // Commands that publish work: Maestro and general ask the owner first, and configuration can allow them.
    const publish: PermissionV2.Ruleset = ["git push *", "git -C * push *", "gh pr create *", "gh pr merge *", "gh release *"].map(
      (resource) => ({ action: "bash", resource, effect: "ask" }),
    )
    const publishDeny: PermissionV2.Ruleset = publish.map((rule) => ({ ...rule, effect: "deny" }))
    const defaults: PermissionV2.Ruleset = [
      { action: "*", resource: "*", effect: "allow" },
      ...readonlyExternalDirectory,
      { action: "question", resource: "*", effect: "deny" },
      ...envRead,
    ]

    yield* ctx.agent.transform((draft) => {
      draft.update(AgentV2.defaultID, (item) => {
        item.description =
          "High-agency development orchestrator. Uses governed approval only when explicitly requested."
        item.system ??= AgentPrompt.maestro
        item.mode = "primary"
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "question", resource: "*", effect: "allow" }], publish))
      })

      draft.update(AgentV2.ID.make("general"), (item) => {
        item.description =
          "General-purpose work from a full brief: research, analysis or multi-step changes. Edits files and runs shell commands; cannot ask the owner questions or start teammates. Returns the outcome, what changed, how it was checked and what is left."
        item.system = AgentPrompt.general
        item.mode = "subagent"
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "todowrite", resource: "*", effect: "deny" }], publish))
      })

      draft.update(AgentV2.ID.make("explore"), (item) => {
        item.description =
          'Read-only codebase exploration: finds files and code and explains how they work. Reads and searches files and the web, and runs read-only shell commands; cannot edit. Say how thorough to be: "quick", "medium" or "very thorough". Returns findings with file and line references.'
        item.system = AgentPrompt.explore
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(
            defaults,
            [
              { action: "*", resource: "*", effect: "deny" },
              { action: "grep", resource: "*", effect: "allow" },
              { action: "glob", resource: "*", effect: "allow" },
              // The shell is sandboxed with no write root (tool/bash.ts READ_ONLY_SHELL), and explore never publishes.
              { action: "bash", resource: "*", effect: "allow" },
              ...publishDeny,
              { action: "webfetch", resource: "*", effect: "allow" },
              { action: "websearch", resource: "*", effect: "allow" },
            ],
            envRead,
            readonlyExternalDirectory,
          ),
        )
      })

      draft.update(AgentV2.ID.make("compaction"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = AgentPrompt.compaction
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("title"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = AgentPrompt.title
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("summary"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = AgentPrompt.summary
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })
    })
  }),
})
