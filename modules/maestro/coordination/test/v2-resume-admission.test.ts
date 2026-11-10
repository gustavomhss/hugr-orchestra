import { expect, test } from "bun:test"
import { Effect, type Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { Seats } from "../src/seats"
import { MaestroAtlasSourceV2 } from "../src/v2/atlas-source"
import { ResumeAdmissionV2 } from "../src/v2/governance/resume-admission"
import { MaestroSeats } from "../src/v2/seats-service"
import { MaestroAtlasMemoryTools } from "../src/v2/tools/atlas-memory"
import { governanceLayer, session, worktree } from "./fixture/v2-governance"

// The earlier runtime's `AtlasResume.selectedRef` over V2 history: the latest admitted emit receipt of the unit names the checkpoint.

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

// R18: the review seat resumes strictly but holds no Atlas Memory, so a rereview's Task call admits only the resume
// marker that names the earlier round, and a first round admits nothing.
test("a review seat rereview admits only its resume marker, never an Atlas fold", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        const git = yield* GitCli.Service
        return yield* Effect.gen(function* () {
          const database = yield* Database.Service
          const events = yield* EventV2.Service
          const root = AbsolutePath.make(directory)
          const location = Location.Service.of({ directory: root, project: { id: Project.ID.global, directory: root } })
          const seats = MaestroSeats.make(Object.keys(Seats.all))
          const parentID = yield* session({ directory, agent: "maestro" })
          const childID = yield* session({ directory, agent: "lucy", parentID })
          const member = MaestroAtlasSourceV2.owner("lucy", seats)
          expect(Seats.all.lucy.strictResume).toBe(true)
          expect(member).toBeUndefined()
          expect(MaestroAtlasSourceV2.owner("jimmy", seats)).toBe("jimmy")
          const admit = (resumed: boolean, promptID: string) =>
            ResumeAdmissionV2.admit({ db: database.db, events, git, location }, {
              childID, promptID, parentID, callID: `call_${promptID}`, assistantMessageID: "msg_maestro", resumed, member,
              unit: undefined, history: [],
            })
          expect(yield* admit(false, "msg_first")).toBeUndefined()
          const rereview = yield* admit(true, "msg_rereview")
          expect(rereview).toEqual({ executionSessionID: childID, promptID: "msg_rereview", resumeRef: `${parentID}/call_msg_rereview` })
          expect(rereview?.atlasResume).toBeUndefined()
          // An exact retry of the same Task call reads the stored record.
          expect(yield* admit(true, "msg_rereview")).toEqual(rereview)
          expect(yield* ResumeAdmissionV2.readResumeRef(database.db, { childID, promptID: "msg_rereview", parentID }))
            .toBe(`${parentID}/call_msg_rereview`)
          expect(yield* ResumeAdmissionV2.readResumeRef(database.db, { childID, promptID: "msg_first", parentID })).toBeUndefined()
        }).pipe(Effect.provide(governanceLayer(directory)))
      }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>)),
    ),
  ))
