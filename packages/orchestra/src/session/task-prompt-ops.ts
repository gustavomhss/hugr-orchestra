export * as TaskPromptOperations from "./task-prompt-ops"

import path from "node:path"
import os from "node:os"
import { pathToFileURL } from "node:url"
import { Effect, Option, Types } from "effect"
import type { FSUtil } from "@orchestra/core/fs-util"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionSchema } from "@orchestra/core/session/schema"
import type { Agent } from "@/agent/agent"
import { ConfigMarkdown } from "@/config/markdown"
import { InstanceState } from "@/effect/instance-state"
import type { ArsenalBindings } from "@/maestro/arsenal-bindings"
import type { TaskPromptOps } from "@/tool/task"
import type { SessionPrompt } from "./prompt"
import { PromptGuard } from "./prompt-guard"
import type { SessionRunState } from "./run-state"
import { SessionID } from "./schema"

/** Private Task callbacks share the already captured native host and instance-scoped prompt services. */
export function make(deps: {
  readonly fs: FSUtil.Interface
  readonly agents: Agent.Interface
  readonly state: SessionRunState.Interface
  readonly nativeHost: Pick<Effect.Success<typeof ArsenalBindings.make>, "withSession">
  readonly prompt: SessionPrompt.Interface["prompt"]
}) {
  const ops = Effect.fn("SessionPrompt.ops")(function* () {
    const execution = yield* Effect.serviceOption(SessionExecution.Service)
    const result = {
      cancel: (sessionID: SessionID) => cancel(sessionID),
      resolvePromptParts: (template: string) => resolvePromptParts(template),
      prompt: (input: Parameters<TaskPromptOps["prompt"]>[0], options?: Parameters<TaskPromptOps["prompt"]>[1]) =>
        deps.nativeHost.withSession(input.sessionID, PromptGuard.wrap(deps.prompt)(input, options)),
      resumeNotice: (sessionID: SessionID) => Option.isSome(execution)
        ? execution.value.resume(SessionSchema.ID.make(sessionID)).pipe(Effect.orDie)
        : Effect.die(new Error("UPSTREAM_NOTICE_RESUME_UNAVAILABLE")),
    }
    return result satisfies TaskPromptOps
  })

  const cancel = Effect.fn("SessionPrompt.cancel")(function* (sessionID: SessionID) {
    yield* Effect.logInfo("cancel", { "session.id": sessionID })
    yield* deps.state.cancel(sessionID)
  })

  const resolvePromptParts = Effect.fn("SessionPrompt.resolvePromptParts")(function* (template: string) {
    const ctx = yield* InstanceState.context
    const parts: Types.DeepMutable<SessionPrompt.PromptInput["parts"]> = [{ type: "text", text: template }]
    const files = ConfigMarkdown.files(template)
    const seen = new Set<string>()
    yield* Effect.forEach(
      files,
      Effect.fnUntraced(function* (match) {
        const name = match[1]
        if (!name) return
        if (seen.has(name)) return
        seen.add(name)

        const filepath = name.startsWith("~/")
          ? path.join(os.homedir(), name.slice(2))
          : path.resolve(ctx.worktree, name)

        const info = yield* deps.fs.stat(filepath).pipe(Effect.option)
        if (Option.isNone(info)) {
          const found = yield* deps.agents.get(name)
          if (found) parts.push({ type: "agent", name: found.name })
          return
        }
        const stat = info.value
        parts.push({
          type: "file",
          url: pathToFileURL(filepath).href,
          filename: name,
          mime: stat.type === "Directory" ? "application/x-directory" : "text/plain",
        })
      }),
      { concurrency: "unbounded", discard: true },
    )
    return parts
  })

  return { ops, cancel, resolvePromptParts }
}
