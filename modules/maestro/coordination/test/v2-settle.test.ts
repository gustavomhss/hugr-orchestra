import { expect, test } from "bun:test"
import { DateTime, Effect, type Layer, type Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { governanceLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const card = {
  outcome: "done",
  artifacts: [{ kind: "plan", path: "docs/plan.md" }],
  blockers: [],
  risks: ["scope may grow"],
  nextActions: ["review the plan"],
}

const terminal = ["Proposal ready.", "", "```upstream-result", JSON.stringify(card), "```", ""].join("\n")

/** Settles a foreground reply of `text` from a child of `agent`, as core Task does after the child completes. */
const settle = (directory: string, agent: string, text: string) =>
  Effect.gen(function* () {
    const parentID = yield* session({ directory, agent: "maestro" })
    const store = yield* SessionStore.Service
    const child = yield* store.get(yield* session({ directory, agent, parentID }))
    if (!child) return yield* Effect.die("fixture child missing")
    const governance = yield* TaskGovernance.Service
    const created = DateTime.makeUnsafe(0)
    return yield* governance.settle({
      child,
      reply: SessionMessage.Assistant.make({
        id: SessionMessage.ID.make("msg_settle_reply"),
        type: "assistant",
        agent,
        model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
        content: [SessionMessage.AssistantText.make({ type: "text", id: "text", text })],
        time: { created, completed: created },
      }),
      admission: {},
      context: {
        sessionID: parentID,
        agent: AgentV2.ID.make("maestro"),
        assistantMessageID: SessionMessage.ID.make("msg_settle_parent"),
        toolCallID: "call_settle",
      },
    })
  })

test("a foreground archie reply with one terminal upstream-result card settles as structured", () =>
  run((directory) =>
    Effect.gen(function* () {
      expect(yield* settle(directory, "archie", terminal)).toEqual({ text: terminal, structured: { upstreamResult: card } })
    }),
  ))

test("a reply without a valid terminal card, or from another seat, settles as its text only", () =>
  run((directory) =>
    Effect.gen(function* () {
      const trailing = `${terminal}\nOne more line after the card.`
      const excess = terminal.replace('"outcome":"done"', '"outcome":"done","extra":true')
      for (const text of ["Proposal ready, no card.", trailing, excess])
        expect(yield* settle(directory, "archie", text)).toEqual({ text })
      // Only archie's work result is the upstream card; another seat's identical text stays plain.
      expect(yield* settle(directory, "backend", terminal)).toEqual({ text: terminal })
      expect(yield* settle(directory, "general", terminal)).toEqual({ text: terminal })
    }),
  ))
