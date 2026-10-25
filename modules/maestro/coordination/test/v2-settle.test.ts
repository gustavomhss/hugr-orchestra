import path from "node:path"
import { expect, test } from "bun:test"
import { DateTime, Effect, type Layer, type Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { Seats } from "../src/seats"
import { WorkResultV2 } from "../src/v2/governance/work-result"
import { WriteRootsV2 } from "../src/v2/governance/write-roots"
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
const settle = (
  directory: string,
  agent: string,
  text: string,
  permission?: { permission: string; pattern: string; action: "allow" | "deny" | "ask" }[],
) =>
  Effect.gen(function* () {
    const parentID = yield* session({ directory, agent: "maestro" })
    const store = yield* SessionStore.Service
    const child = yield* store.get(yield* session({ directory, agent, parentID, permission }))
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
      // Only archie's work result is the upstream card: backend parses only its own card, and a non-seat stays plain.
      const backend = yield* settle(directory, "backend", terminal)
      expect(backend.text).toBe(terminal)
      expect(backend.structured?.workResult).toMatchObject({ card: { parsed: false }, changes: [], terminal: { reason: "ended" } })
      expect(yield* settle(directory, "general", terminal)).toEqual({ text: terminal })
    }),
  ))

const backendCard = {
  outcome: "done",
  changes: [{ path: "src/api.ts", change: "modified" }],
  checks: [{ checkId: "unit", command: "bun test", cwd: ".", status: "pass", exitCode: 0 }],
  blockers: [],
  risks: [],
  nextActions: ["review the change"],
}

const backendReply = (value: unknown) =>
  ["Change applied.", "", "```backend-result", JSON.stringify(value), "```", ""].join("\n")

test("a backend reply settles its work result with the card, the tree and the bound write roots (V1 SeatWork.track)", () =>
  run((directory) =>
    Effect.gen(function* () {
      const text = backendReply(backendCard)
      const settled = yield* settle(directory, "backend", text, [
        { permission: WriteRootsV2.PERMISSION, pattern: "*", action: "deny" },
        { permission: WriteRootsV2.PERMISSION, pattern: path.join(directory, "src"), action: "allow" },
      ])
      expect(settled.text).toBe(text)
      const result = settled.structured?.workResult as { executionSessionId: string; authoritySessionId: string }
      expect(result).toMatchObject({
        schema: "backend-work-result-v1",
        memberId: "backend",
        mode: "delegated",
        acceptance: { state: "pending" },
        verification: { state: "not-host-verified" },
        card: { parsed: true, messageID: "msg_settle_reply" },
        outcome: "done",
        changes: backendCard.changes,
        checks: backendCard.checks,
        nextActions: backendCard.nextActions,
        terminal: { reason: "ended" },
        memory: { reads: [], writes: [] },
        writeRoots: ["src"],
        shellWrites: expect.stringMatching(/^(enforced|unenforced)$/),
        shellSandbox: { kind: expect.stringMatching(/^(seatbelt|srt|appcontainer|none)$/) },
      })
      const store = yield* SessionStore.Service
      const child = yield* store.get(SessionSchema.ID.make(result.executionSessionId))
      expect(child?.agent).toBe("backend")
      expect(result.authoritySessionId).toBe(child?.parentID)
    }),
  ))

test("a blocked backend card lowers the terminal, an unbound child reports no write roots, a loose card is unparsed", () =>
  run((directory) =>
    Effect.gen(function* () {
      const blocked = yield* settle(directory, "backend", backendReply({ ...backendCard, outcome: "blocked" }))
      expect(blocked.structured?.workResult).toMatchObject({ outcome: "blocked", terminal: { reason: "blocked" } })
      expect(blocked.structured?.workResult).not.toHaveProperty("writeRoots")
      expect(blocked.structured?.workResult).not.toHaveProperty("shellWrites")
      const loose = yield* settle(directory, "backend", backendReply({ ...backendCard, extra: true }))
      expect(loose.structured?.workResult).toMatchObject({ card: { parsed: false }, changes: [], terminal: { reason: "ended" } })
    }),
  ))

test("memory outcomes come from the execution Session's Atlas receipts, keyed by tool call", () => {
  const created = DateTime.makeUnsafe(0)
  const tool = (id: string, structured: Record<string, unknown>) =>
    SessionMessage.AssistantTool.make({
      type: "tool",
      id,
      name: "atlas_memory",
      provider: { executed: false },
      state: { status: "completed", input: {}, content: [], structured },
      time: { created },
    })
  const reply = SessionMessage.Assistant.make({
    id: SessionMessage.ID.make("msg_memory_reply"),
    type: "assistant",
    agent: "backend",
    model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
    content: [
      tool("call_recall", { atlasMemory: { schema: "atlas-memory-receipt-v1", op: "recall", outcome: "read", refs: [] } }),
      tool("call_emit", { atlasMemory: { schema: "atlas-memory-receipt-v1", op: "emit", outcome: "refused" } }),
      tool("call_other", { atlasMemory: { schema: "other", op: "emit", outcome: "admitted" } }),
      SessionMessage.AssistantText.make({ type: "text", id: "text", text: backendReply(backendCard) }),
    ],
    time: { created, completed: created },
  })
  const result = WorkResultV2.assemble({
    seat: { ...Seats.all.backend, workResult: "backend-work-result-v1" },
    reply,
    history: [reply],
    executionSessionID: "ses_child",
    authoritySessionID: "ses_root",
  })
  expect(result.memory).toEqual({
    reads: [{ outcome: "read", callID: "call_recall", refs: [] }],
    writes: [{ outcome: "refused", callID: "call_emit" }],
  })
})

test("a research reply settles from the dispatch's closed inquiry card, never from its text (V1 DiscoveryResult)", () =>
  run((directory) =>
    Effect.gen(function* () {
      const text = "The answer is in src/a.ts:1-3."
      const settled = yield* settle(directory, "jimmy", text)
      expect(settled.text).toStartWith("Inquiry not closed: the host holds no card for this dispatch")
      expect(settled.text).toContain(JSON.stringify(text))
      const result = settled.structured?.workResult as Record<string, unknown>
      expect(result).toMatchObject({
        schema: "discovery-work-result-v1",
        memberId: "jimmy",
        card: { parsed: false, messageID: "msg_settle_reply" },
        referencesChecked: false,
        changes: [],
        checks: [],
        blockers: [],
        risks: ["Inquiry not closed: the dispatch ended without inquiry close, so no card exists."],
        nextActions: ["Reopen retained research evidence before relying on the final report."],
        terminal: { reason: "ended" },
      })
      expect(result.outcome).toBeUndefined()
      expect(result.discovery).toBeUndefined()
    }),
  ))

test("the shell fact rides beside the write roots and only there (V1 SeatWork.project)", () => {
  const fact = { shellWrites: "unenforced", shellSandbox: { kind: "none", reason: "no-sandbox" } } as const
  const reply = SessionMessage.Assistant.make({
    id: SessionMessage.ID.make("msg_shell_reply"),
    type: "assistant",
    agent: "backend",
    model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
    content: [],
    time: { created: DateTime.makeUnsafe(0), completed: DateTime.makeUnsafe(0) },
  })
  const base = {
    seat: { ...Seats.all.backend, workResult: "backend-work-result-v1" },
    reply,
    history: [reply],
    executionSessionID: "ses_child",
    authoritySessionID: "ses_root",
  }
  expect(WorkResultV2.assemble({ ...base, writeRoots: ["src"], shell: fact })).toMatchObject({ writeRoots: ["src"], ...fact })
  expect(WorkResultV2.assemble({ ...base, shell: fact })).not.toHaveProperty("shellWrites")
})
