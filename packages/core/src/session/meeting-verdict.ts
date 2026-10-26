export * as MeetingVerdict from "./meeting-verdict"

import { and, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import type { Database } from "../database/database"
import { Identifier } from "../util/identifier"
import { MeetingSegmentTable, MeetingTable } from "./meeting.sql"
import { commitmentOf, latest, peopleMap } from "./meeting-memory"
import { MeetingItemTable, MeetingPersonTable, MeetingProposalTable } from "./meeting-memory.sql"

// The owner's writes on the meeting card. Every write inserts a new revision or a new row; failures are plain reasons.
type Db = Database.Interface["db"]
type MeetingRow = typeof MeetingTable.$inferSelect

export const confirm = Effect.fn("MeetingVerdict.confirm")(function* (
  db: Db,
  meeting: MeetingRow,
  input: Meeting.ConfirmInput,
) {
  const verdicts = [...new Map((input.items ?? []).map((item) => [item.id, item.verdict])).entries()]
  const current =
    verdicts.length === 0
      ? []
      : yield* latest(
          db,
          and(
            eq(MeetingItemTable.meeting_id, meeting.id),
            inArray(
              MeetingItemTable.id,
              verdicts.map((item) => item[0]),
            ),
          ),
        )
  const proposals = yield* db
    .select()
    .from(MeetingProposalTable)
    .where(eq(MeetingProposalTable.meeting_id, meeting.id))
    .all()
    .pipe(Effect.orDie)
  const answers = (input.people ?? []).map((answer) => ({
    answer,
    proposal: proposals.find((item) => item.id === answer.proposalID),
  }))
  // Nothing is written unless every id exists, and a merge needs the person it merges into.
  if (current.length !== verdicts.length) return yield* Effect.fail("missing_item" as const)
  if (answers.some((item) => !item.proposal || (item.answer.verdict === "merge" && !item.proposal.merge_with)))
    return yield* Effect.fail("missing_item" as const)
  yield* db
    .transaction(() =>
      Effect.gen(function* () {
        yield* Effect.forEach(
          current,
          (row) =>
            db
              .insert(MeetingItemTable)
              .values({ ...row, revision: row.revision + 1, status: verdicts.find((item) => item[0] === row.id)![1] })
              .run(),
          { discard: true },
        )
        yield* Effect.forEach(
          answers,
          (item) =>
            Effect.gen(function* () {
              const proposal = item.proposal!
              yield* db
                .update(MeetingProposalTable)
                .set({ verdict: item.answer.verdict })
                .where(eq(MeetingProposalTable.id, proposal.id))
                .run()
              // A merge never rewrites the target: the new row points at it, and clearing merged_into undoes the merge.
              if (item.answer.verdict === "dismissed") return
              yield* db
                .insert(MeetingPersonTable)
                .values({
                  id: `per_${Identifier.ascending()}`,
                  name: proposal.name,
                  merged_into: item.answer.verdict === "merge" ? proposal.merge_with : null,
                })
                .run()
            }),
          { discard: true },
        )
      }),
    )
    .pipe(Effect.orDie)
  return yield* card(db, meeting)
})

export const commitment = Effect.fn("MeetingVerdict.commitment")(function* (db: Db, input: Meeting.CommitmentInput) {
  const row = (yield* latest(db, eq(MeetingItemTable.id, input.id)))[0]
  if (!row || row.kind !== "commitment") return yield* Effect.fail("missing_item" as const)
  const next = { ...row, revision: row.revision + 1, state: input.state }
  yield* db.insert(MeetingItemTable).values(next).run().pipe(Effect.orDie)
  return commitmentOf(yield* peopleMap(db), next, next.status === "dismissed" ? "claimed" : next.status)
})

// Items and proposals cascade with the meeting by foreign key; they are deleted first only to count them.
// Person rows are the user's address book and stay.
export const remove = Effect.fn("MeetingVerdict.remove")(function* (db: Db, meetingID: Meeting.ID) {
  return yield* db
    .transaction(() =>
      Effect.gen(function* () {
        const items = yield* db
          .delete(MeetingItemTable)
          .where(eq(MeetingItemTable.meeting_id, meetingID))
          .returning({ id: MeetingItemTable.id, kind: MeetingItemTable.kind })
          .all()
        const proposals = yield* db
          .delete(MeetingProposalTable)
          .where(eq(MeetingProposalTable.meeting_id, meetingID))
          .returning({ id: MeetingProposalTable.id })
          .all()
        const segments = yield* db
          .delete(MeetingSegmentTable)
          .where(eq(MeetingSegmentTable.meeting_id, meetingID))
          .returning({ id: MeetingSegmentTable.id })
          .all()
        yield* db.delete(MeetingTable).where(eq(MeetingTable.id, meetingID)).run()
        const ids = (kind: boolean) =>
          new Set(items.filter((item) => (item.kind === "commitment") === kind).map((item) => item.id)).size
        return { segments: segments.length, claims: ids(false), commitments: ids(true), people: proposals.length }
      }),
    )
    .pipe(Effect.orDie)
})
