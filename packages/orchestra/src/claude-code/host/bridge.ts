export * as ClaudeHostBridge from "./bridge"

import { Effect } from "effect"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import type { Session } from "@/session/session"
import type { ClaudeHostMcp } from "./mcp"
import type { ClaudeHostMirror } from "./mirror"
import type { ClaudeHostOptions } from "./options"

export type Live = {
  readonly agent: Agent.Info
  readonly sessionID: ClaudeHostOptions.Context["sessionID"]
  readonly turn?: { readonly view: ClaudeHostMirror.Mirror }
  readonly known: { readonly calls: Map<string, ClaudeHostMirror.Mirror> }
  readonly run: ClaudeHostMcp.Bridge["run"]
}

/** Runs Orchestra tools in the host's instance context and completes their mirrored calls. */
export function create(live: Live, ctx: ClaudeHostOptions.Context, services: {
  readonly sessions: Session.Interface
  readonly permission: Permission.Interface
}): ClaudeHostMcp.Bridge {
  const sessions = services.sessions
  const permission = services.permission
  return {
    run: (effect) => live.run(effect),
    claim: (name) => Effect.gen(function* () {
      // Claude Code may call the tool before the mirror has seen its tool_use block: wait for it.
      for (let round = 0; round < 1500; round++) {
        // The running turn first, then the mirrors of earlier turns, whose background subagents may still call.
        const part = live.turn?.view.claim(name) ??
          [...new Set(live.known.calls.values())].map((mirror) => mirror.claim(name)).find((found) => found !== undefined)
        if (part) return part
        yield* Effect.sleep("20 millis")
      }
      return yield* Effect.die(new Error(`no mirrored ${name} call to run`))
    }),
    complete: (part) => live.turn?.view.complete(part) ?? live.known.calls.get(part.callID)?.complete(part) ?? Effect.void,
    messages: () => sessions.messages({ sessionID: live.sessionID }).pipe(Effect.orDie),
    context: (part) => ({
      sessionID: part.sessionID, messageID: part.messageID, callID: part.callID, agent: live.agent.name, agentID: live.agent.id,
      abort: ctx.abort.signal, messages: [], extra: { claudeCode: true },
      metadata: (value) => Effect.gen(function* () {
        const current = live.turn?.view.tool(part.callID) ?? live.known.calls.get(part.callID)?.tool(part.callID)
        if (!current || current.state.status !== "running") return
        yield* create(live, ctx, services).complete({ ...current, state: { ...current.state, title: value.title ?? current.state.title,
          metadata: { ...current.state.metadata, ...value.metadata } } })
      }),
      ask: (request) => Effect.gen(function* () {
        const session = yield* sessions.get(part.sessionID).pipe(Effect.orDie)
        yield* permission.ask({ ...request, sessionID: part.sessionID, tool: { messageID: part.messageID, callID: part.callID },
          ruleset: Permission.merge(live.agent.permission, session.permission ?? []) }).pipe(Effect.orDie)
      }),
    }),
  }
}
