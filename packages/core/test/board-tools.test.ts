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
  it.live("registers the nine board tools and runs them for Maestro", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect((yield* toolDefinitions(registry)).map((tool) => tool.name).filter((name) => name.startsWith("board_")).toSorted()).toEqual([
        "board_decision",
        "board_epic",
        "board_issue",
        "board_move",
        "board_project",
        "board_question",
        "board_read",
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
