import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Effect } from "effect"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { AdmissionConflictError, readAdmission, recordAdmission } from "../../src/maestro/admission-record"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node])))

const input = {
  sessionID: "ses_01",
  messageID: "msg_01",
  methodVersion: "admit-request-v1",
  assessment: {
    kind: "work" as const,
    goal: "Add dark mode to settings.",
    known: [{ text: "Settings page exists.", source: "orientation" as const }],
    proposals: [{ text: "Draft scope first.", source: "maestro" as const }],
    unknowns: [],
    uncertainty: "Persistence needs later inspection.",
    activeWorkEffect: "none" as const,
    reason: "Goal is usable for a draft.",
  },
}

describe("Maestro admission record", () => {
  it.instance("persists and replays one deterministic admission result", () =>
    Effect.gen(function* () {
      const first = yield* recordAdmission(input)
      const replay = yield* recordAdmission(input)
      const stored = yield* readAdmission(input)

      expect(first).toEqual({ ...input, outcome: "READY_TO_DRAFT", assessment: input.assessment })
      expect(replay).toEqual(first)
      expect(stored).toEqual(first)
    }),
  )

  it.instance("refuses altered input for an existing admission key", () =>
    Effect.gen(function* () {
      yield* recordAdmission(input)
      const conflict = yield* recordAdmission({
        ...input,
        assessment: { ...input.assessment, unknowns: ["Choose theme behavior."] },
      }).pipe(Effect.flip)

      expect(conflict._tag).toBe("MaestroAdmissionConflict")
    }),
  )
})
