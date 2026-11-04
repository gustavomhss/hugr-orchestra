import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Board } from "@orchestra/core/board/board"
import { BoardTools } from "@orchestra/core/board/tools"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { testEffect } from "./lib/effect"
import { executeTool, toolDefinitions, toolIdentity } from "./lib/tool"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([BoardTools.node, Board.node, ToolRegistry.node, ToolRegistry.toolsNode]), [
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ]),
)

const sessionID = SessionV2.ID.make("ses_board_tools")
const maestro = { agent: AgentV2.defaultID, assistantMessageID: SessionMessage.ID.make("msg_board_tools") }
const SECRET = "sk-board-tool-4e8a2b"

const call = (registry: ToolRegistry.Interface, who: typeof toolIdentity, name: string, input: unknown) =>
  executeTool(registry, { sessionID, ...who, call: { type: "tool-call", id: `call-${name}`, name, input } })

describe("BoardTools", () => {
  it.live("registers the board tools and runs them for Maestro", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect((yield* toolDefinitions(registry)).map((tool) => tool.name).filter((name) => name.startsWith("board_")).toSorted()).toEqual([
        "board_bundle",
        "board_decision",
        "board_dequeue",
        "board_epic",
        "board_issue",
        "board_move",
        "board_project",
        "board_question",
        "board_queue",
        "board_read",
        "board_request_move",
        "board_settings",
        "board_steps",
      ])

      expect((yield* call(registry, maestro, "board_project", { key: "BTL", name: "Tools", reason: "Start." })).type).not.toBe(
        "error",
      )
      expect((yield* call(registry, maestro, "board_issue", { project: "BTL", title: "Wire it", reason: "Plan." })).type).not.toBe(
        "error",
      )
      expect(
        yield* call(registry, maestro, "board_move", { project: "BTL", number: 1, stage: "review", reason: "Done." }),
      ).toEqual({ type: "error", value: "BTL-1 has no PR; link one with board_issue before Review." })
      expect(JSON.stringify(yield* call(registry, maestro, "board_read", { project: "BTL" }))).toContain("BTL-1")
    }),
  )

  it.live("C2/C6: any seat creates with host attribution but cannot update or move; requests do not move", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const board = yield* Board.Service
      yield* board.project({ key: "BTA", name: "Attribution", reason: "Start." })
      const made = yield* call(registry, toolIdentity, "board_issue", {
        project: "BTA", title: "Seat proposal", reason: "Found a gap.",
        writer: { kind: "owner", seat: "maestro" },
      })
      expect(made.type).not.toBe("error")
      const creation = (yield* board.activity("BTA")).find((entry) => entry.action === "issue.create")!
      expect(creation.actor).toBe("seat")
      expect(creation.after?.writer).toEqual({
        kind: "seat", seat: toolIdentity.agent, sessionID,
        messageID: toolIdentity.assistantMessageID, callID: "call-board_issue", model: null,
      })
      expect((yield* call(registry, toolIdentity, "board_issue", {
        project: "BTA", number: 1, title: "Hijacked", reason: "No.",
      }))).toEqual({ type: "error", value: "Only Maestro updates an existing issue; create a proposal or request a move instead." })
      expect((yield* call(registry, toolIdentity, "board_move", {
        project: "BTA", number: 1, stage: "building", reason: "Ready.",
      }))).toEqual({ type: "error", value: "Only Maestro moves issues; request a move instead." })
      expect((yield* call(registry, toolIdentity, "board_request_move", {
        project: "BTA", number: 1, stage: "building", reason: "Please dispatch.",
      })).type).not.toBe("error")
      expect((yield* board.snapshot("BTA")).issues[0]).toMatchObject({ title: "Seat proposal", stage: "backlog" })
      expect((yield* board.activity("BTA")).at(-1)).toMatchObject({
        actor: "seat", action: "issue.move.request", reason: "Please dispatch.", after: { requestedStage: "building" },
      })
      yield* call(registry, toolIdentity, "board_request_move", { project: "BTA", number: 1, stage: "shipped", reason: "Request only." })
      expect((yield* board.execution("BTA", 1)).receipts).toEqual([])
      expect((yield* board.snapshot("BTA")).issues[0].stage).toBe("backlog")
      yield* board.pause("BTA", {})
      expect(yield* call(registry, toolIdentity, "board_issue", { project: "BTA", title: "Paused proposal", reason: "Proposal." })).toEqual({
        type: "error", value: "BTA is paused by the owner; new proposals and execution changes wait for the owner to resume it. Movement requests are still accepted through board_request_move.",
      })
      yield* board.resume("BTA")
      yield* call(registry, maestro, "board_issue", { project: "BTA", number: 1, seat: "backend", reason: "Assign." })
      expect((yield* board.activity("BTA")).find((entry) => entry.action === "issue.create")).toEqual(creation)
      yield* call(registry, maestro, "board_move", { project: "BTA", number: 1, stage: "ready", reason: "Admit." })
      const moved = (yield* board.activity("BTA")).findLast((entry) => entry.action === "issue.move")!
      yield* call(registry, toolIdentity, "board_request_move", { project: "BTA", number: 1, stage: "cut", reason: "Request, not a plan edit." })
      yield* board.undo("BTA", moved.id)
      expect((yield* board.snapshot("BTA")).issues[0].stage).toBe("backlog")
    }),
  )

  it.live("board_read without a project lists the projects and their keys", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const board = yield* Board.Service
      yield* board.project({ key: "BTP", name: "Listed", goal: "Find me.", reason: "Start." })
      const listed = yield* call(registry, maestro, "board_read", {})
      expect(listed.type).not.toBe("error")
      expect(JSON.stringify(listed)).toContain('"key":"BTP"')
      expect(JSON.stringify(listed)).toContain("Find me.")
      expect(yield* call(registry, toolIdentity, "board_read", {})).toEqual({
        type: "error",
        value: "The board tools belong to Maestro; ask Maestro to change the board.",
      })
    }),
  )

  it.live("C2: a creation captures the invoking turn's model and keeps it after reassignment", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const board = yield* Board.Service
      yield* board.project({ key: "BTM", name: "Model provenance", reason: "Start." })
      const model = { id: Model.ID.make("creation-model"), providerID: Provider.ID.make("creation-provider") }
      const made = yield* executeTool(registry, {
        sessionID, ...toolIdentity, model,
        call: { type: "tool-call", id: "call-creation-model", name: "board_issue", input: { project: "BTM", title: "Proposal", reason: "Found work." } },
      })
      expect(made.type).not.toBe("error")
      const before = (yield* board.execution("BTM", 1)).creator
      expect(before?.writer).toMatchObject({ seat: toolIdentity.agent, model, callID: "call-creation-model" })
      yield* call(registry, maestro, "board_issue", { project: "BTM", number: 1, seat: "backend", session: "ses_changed", reason: "Assign." })
      expect((yield* board.execution("BTM", 1)).creator).toEqual(before)
    }),
  )

  it.live("refuses every seat other than Maestro", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const refused = { type: "error", value: "The board tools belong to Maestro; ask Maestro to change the board." } as const
      expect(yield* call(registry, toolIdentity, "board_project", { key: "BTN", name: "Nope", reason: "Start." })).toEqual(refused)
      expect(yield* call(registry, toolIdentity, "board_read", { project: "BTN" })).toEqual(refused)
      const board = yield* Board.Service
      expect((yield* Effect.flip(board.snapshot("BTN")))._tag).toBe("Board.NotFoundError")
    }),
  )

  it.live("board_read shows a secret's label and never its value", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const board = yield* Board.Service
      yield* board.project({ key: "BTS", name: "Secrets", reason: "Start." })
      yield* board.issue({ project: "BTS", title: "Deploy", reason: "Plan." })
      yield* board.attach("BTS", 1, { kind: "secret", name: "Deploy token", value: SECRET })
      const read = JSON.stringify(yield* call(registry, maestro, "board_read", { project: "BTS", issue: 1 }))
      expect(read).toContain("Deploy token")
      expect(read).not.toContain(SECRET)
    }),
  )
})
