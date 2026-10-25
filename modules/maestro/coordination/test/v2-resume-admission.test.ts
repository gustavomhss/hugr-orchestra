import { expect, test } from "bun:test"
import { ResumeAdmissionV2 } from "../src/v2/governance/resume-admission"
import { MaestroAtlasMemoryTools } from "../src/v2/tools/atlas-memory"

// V1's `AtlasResume.selectedRef` over V2 history: the latest admitted emit receipt of the unit names the checkpoint.

const key = { projectID: "prj", memoryOwner: "backend", kind: "task", id: "t" } as const
const emit = (input: { eventId: string; outcome?: string; reconciled?: boolean; owner?: string; taskId?: string }) => ({
  type: "assistant",
  content: [
    {
      type: "tool",
      state: {
        status: "completed",
        input: { entry: { taskId: input.taskId ?? "t" } },
        structured: {
          [MaestroAtlasMemoryTools.RECEIPT_KEY]: {
            schema: "atlas-memory-receipt-v1",
            op: "emit",
            outcome: input.outcome ?? "admitted",
            ref: { eventId: input.eventId },
            reconciled: input.reconciled ?? false,
            binding: { memoryOwner: input.owner ?? "backend", projectID: "prj" },
          },
        },
      },
    },
  ],
})
const select = (history: unknown[]) => ResumeAdmissionV2.selectedRef(history as never, key)?.eventId

test("the latest admitted emit of the unit is selected", () => {
  expect(select([emit({ eventId: "evt_1" }), emit({ eventId: "evt_2" })])).toBe("evt_2")
  expect(select([])).toBeUndefined()
})

test("refused, foreign-owner, other-unit and reconciled duplicate receipts never advance the checkpoint", () => {
  expect(
    select([
      emit({ eventId: "evt_1" }),
      emit({ eventId: "evt_2" }),
      emit({ eventId: "evt_3", outcome: "refused" }),
      emit({ eventId: "evt_4", owner: "jimmy" }),
      emit({ eventId: "evt_5", taskId: "other" }),
      emit({ eventId: "evt_1", reconciled: true }),
    ]),
  ).toBe("evt_2")
  // A reconciled receipt of a record no earlier receipt admitted still counts.
  expect(select([emit({ eventId: "evt_1" }), emit({ eventId: "evt_9", reconciled: true })])).toBe("evt_9")
})
