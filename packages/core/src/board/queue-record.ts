import { createHash } from "crypto"
import { asc, desc, eq, inArray } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import {
  appendAttempt,
  appendBoardEvent,
  appendCardEvent,
  appendLogbookEntry,
  appendMilestone,
  attemptNumbers,
  readBoard,
  readCard,
} from "@orchestra/atlas-boundary/record-log"
import { Board } from "@orchestra/schema/board"
import { PartTable, SessionTable } from "../session/sql"
import type { BoardRecord } from "./record"
import {
  BoardActivityTable,
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardQueueTable,
} from "./sql"
import { BoardTree } from "./tree"
import { RefusedError, worktree } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { AUTHOR, insertNote, release } from "./queue-shared"
import type { Context } from "./queue-shared"

const Pull = Schema.Struct({ head: Schema.Struct({ sha: Schema.String, ref: Schema.String }) })
const decodePull = Schema.decodeUnknownOption(Schema.fromJsonString(Pull))

/** The PR reads and the notes and records written about a card: head, note, moved, describe, recordBundle, recordOf. */
export function makeRecord(ctx: Context) {
  const deps = ctx.deps
  const git = ctx.git

  /** Reads a PR's head through the API, fetches it, and checks the fetched commit is that head. */
  const head = Effect.fnUntraced(function* (directory: string, repo: string, pr: number) {
    const pulled = yield* deps.gh(["api", `repos/${repo}/pulls/${pr}`])
    const pull = pulled.exitCode === 0 ? Option.getOrUndefined(decodePull(pulled.stdout)) : undefined
    if (!pull) return yield* new RefusedError({ message: `PR #${pr} could not be read: ${pulled.stderr.trim() || "no head"}.` })
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", pull.head.ref])
    const fetched = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `${pull.head.sha}^{commit}`])).out
    if (fetched !== pull.head.sha)
      return yield* new RefusedError({ message: `PR #${pr}'s head ${pull.head.sha.slice(0, 10)} is not on origin/${pull.head.ref}.` })
    return { sha: pull.head.sha, tree: (yield* git(directory, ["rev-parse", `${pull.head.sha}^{tree}`])).out }
  })

  /** A queued card whose PR head moved since it queued goes back to Review: its new head is not verified. */
  const moved = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, sha: string | undefined) {
    const back = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const why = `The PR head moved${sha ? ` to ${sha.slice(0, 10)}` : ""} after it queued; verify it and queue it again.`
        yield* insertNote(tx, row, issue, why)
        return yield* release(tx, row, issue, "github", "queue.remove", why)
      }),
    )
    yield* deps.publish(back)
  })

  const note = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, body: string) {
    const done = yield* deps.quiet((tx) => insertNote(tx, row, issue, body))
    yield* deps.publish(done)
  })

  /** Rewrites the card's PR body through the record port; unbound, the body stays as the seat wrote it. */
  const describe = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    if (!deps.record || !row.github_repo) return
    const found = yield* recordOf(row, issue, base)
    if (!found?.pr) return
    yield* deps.gh(["pr", "edit", String(found.pr), "--repo", row.github_repo, "--body-file", "-"], deps.record.pr(found.record))
  })

  /**
   * Section 4.7: the commit on top of a bundle that carries the board log since the tree's last record, and each
   * member's thread, attempts, logbook entry and Orientation milestone, all through Atlas's writers. The bundle is
   * assembled from base's tip on every rebuild, so an ejected card leaves nothing behind.
   */
  const recordBundle = Effect.fnUntraced(function* (row: ProjectRow, scratch: string, issues: ReadonlyArray<IssueRow>, label: string) {
    const now = yield* Clock.currentTimeMillis
    // An unknown visibility is treated as public, so free text never reaches a tree that might be.
    const visibility = yield* deps.gh(["api", `repos/${row.github_repo}`, "--jq", ".private"])
    const redact = visibility.exitCode !== 0 || visibility.stdout.trim() !== "true"
    const ids = issues.map((issue) => issue.id)
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const attempts = yield* tx.select().from(BoardAttemptTable).where(inArray(BoardAttemptTable.issue_id, ids)).all()
        const sessions = attempts.flatMap((attempt) => (attempt.session_id ? [attempt.session_id as (typeof SessionTable.$inferSelect)["id"]] : []))
        return {
          attempts,
          activity: yield* tx
            .select()
            .from(BoardActivityTable)
            .where(eq(BoardActivityTable.project_id, row.id))
            .orderBy(asc(BoardActivityTable.time_created), asc(BoardActivityTable.id))
            .all(),
          numbers: yield* tx.select({ id: BoardIssueTable.id, number: BoardIssueTable.number }).from(BoardIssueTable).where(eq(BoardIssueTable.project_id, row.id)).all(),
          notes: yield* tx
            .select()
            .from(BoardNoteTable)
            .where(inArray(BoardNoteTable.issue_id, ids))
            .orderBy(asc(BoardNoteTable.time_created), asc(BoardNoteTable.id))
            .all(),
          checks: yield* tx.select().from(BoardCheckTable).where(inArray(BoardCheckTable.issue_id, ids)).all(),
          sessions: sessions.length ? yield* tx.select().from(SessionTable).where(inArray(SessionTable.id, sessions)).all() : [],
          parts: sessions.length
            ? yield* tx
                .select({ session: PartTable.session_id, id: PartTable.id, data: PartTable.data })
                .from(PartTable)
                .where(inArray(PartTable.session_id, sessions))
                .orderBy(asc(PartTable.id))
                .all()
            : [],
        }
      }),
    )
    const iso = (ms: number) => new Date(ms).toISOString()
    const keyOf = (issue: Board.IssueID) => found.numbers.find((item) => item.id === issue)?.number
    yield* Effect.sync(() => {
      const written = new Set(readBoard(scratch).events.map((event) => event.activity))
      found.activity
        .filter((item) => !written.has(item.id))
        .forEach((item) => {
          const number = item.issue_id ? keyOf(item.issue_id) : undefined
          appendBoardEvent(scratch, BoardTree.event(row.key, number ? `${row.key}-${number}` : undefined, item), { redact })
        })
      issues.forEach((issue) => {
        const key = `${row.key}-${issue.number}`
        // readCard's events omit text, which collapses the union; narrow on the fields themselves.
        const seen = new Set(
          readCard(scratch, key).events.flatMap((event) =>
            "thread" in event && "from" in event ? [`${event.at} ${event.thread} ${event.from}`] : [],
          ),
        )
        found.notes
          .filter((note) => note.issue_id === issue.id)
          .forEach((note) => {
            const at = iso(note.time_created)
            if (!note.kind || seen.has(`${at} ${note.kind} ${note.author}`)) return
            appendCardEvent(scratch, key, { kind: "message", thread: note.kind, from: note.author, text: note.body, at }, { redact })
          })
        const own = found.attempts.filter((attempt) => attempt.issue_id === issue.id)
        const recorded = new Set(attemptNumbers(scratch, key))
        const last = Math.max(0, ...own.map((attempt) => attempt.n))
        own
          .filter((attempt) => !recorded.has(attempt.n))
          .forEach((attempt) => {
            const session = found.sessions.find((item) => item.id === attempt.session_id)
            if (!session) return
            const parts = found.parts.filter((part) => part.session === session.id)
            appendAttempt(
              scratch,
              key,
              attempt.n,
              {
                seat: attempt.seat ?? "",
                session: session.id,
                engine: session.model?.providerID ?? "",
                model: session.model?.id ?? "",
                tokensIn: session.tokens_input,
                tokensOut: session.tokens_output + session.tokens_reasoning,
                tokensCache: session.tokens_cache_read + session.tokens_cache_write,
                toolUses: parts.filter((part) => part.data.type === "tool").length,
                wallTime: session.time_updated - session.time_created,
                retries: 0,
                reworks: attempt.n - 1,
                gates: found.checks.filter((check) => check.issue_id === issue.id).map((check) => `${check.kind} ${check.command}`),
                verdict: attempt.n === last ? "landed" : "reworked",
                // The digest of the stored transcript parts; the transcript itself travels with the session archive.
                transcriptSha: createHash("sha256").update(JSON.stringify(parts)).digest("hex") as Parameters<typeof appendAttempt>[3]["transcriptSha"],
                costMicroUsd: Math.round(session.cost * 1_000_000),
              },
              { redact, at: iso(session.time_updated) },
            )
          })
        const record = issue.record
        if (!issue.pr_number || !record) return
        appendLogbookEntry(
          scratch,
          {
            prId: String(issue.pr_number),
            at: iso(now),
            territories: [],
            shipped: record.change?.trim() || record.intent?.trim() || issue.title,
            decisions: record.decisions ?? "",
            tradeoffs: record.not_covered ?? "",
            risks: [record.risk?.level, record.risk?.breaks, record.risk?.undo && `Undo: ${record.risk.undo}`].filter(Boolean).join(". "),
            openThreads: record.follow_ups?.length ? record.follow_ups.join(", ") : "None.",
            links: [key],
          },
          { redact },
        )
        appendMilestone(scratch, { card: key, pr: issue.pr_number })
      })
    })
    yield* git(scratch, ["add", "--", ".atlas"])
    if ((yield* git(scratch, ["diff", "--cached", "--quiet"])).code === 0) return
    yield* git(scratch, [...AUTHOR, "commit", "--quiet", "-m", `chore(queue): record ${label}`])
  })

  /** The card's record as Atlas reads it: Maestro's fields plus the host's facts, checks, cost, lineage and integration. */
  const recordOf = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    const now = yield* Clock.currentTimeMillis
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const card = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue)).get()
        const checks = yield* tx.select().from(BoardCheckTable).where(eq(BoardCheckTable.issue_id, issue)).all()
        const attempts = yield* tx.select().from(BoardAttemptTable).where(eq(BoardAttemptTable.issue_id, issue)).orderBy(asc(BoardAttemptTable.n)).all()
        const queued = yield* tx.select().from(BoardQueueTable).where(eq(BoardQueueTable.issue_id, issue)).get()
        const bundle = yield* tx
          .select({ n: BoardBundleTable.n, status: BoardBundleTable.status, base: BoardBundleTable.base_sha, head: BoardBundleMemberTable.head_sha })
          .from(BoardBundleMemberTable)
          .innerJoin(BoardBundleTable, eq(BoardBundleTable.id, BoardBundleMemberTable.bundle_id))
          .where(eq(BoardBundleMemberTable.issue_id, issue))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        const epic = card?.epic_id
          ? yield* tx.select({ number: BoardEpicTable.number }).from(BoardEpicTable).where(eq(BoardEpicTable.id, card.epic_id)).get()
          : undefined
        const depends = yield* tx
          .select({ number: BoardIssueTable.number })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .where(eq(BoardDependencyTable.issue_id, issue))
          .all()
        return { card, checks, attempts, queued, bundle, epic, depends, directory: yield* worktree(tx, row) }
      }),
    )
    const card = found.card
    const record = card?.record
    if (!card || !record?.risk?.level) return undefined
    const head = found.bundle?.head ?? found.queued?.head_sha
    // Against the bundle's base once bundled: after it ships, base already contains the card.
    const numstat =
      head && found.directory
        ? (yield* git(found.directory, ["diff", "--numstat", `${found.bundle?.base ?? `refs/remotes/origin/${base}`}...${head}`])).out
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\t"))
        : []
    const state =
      card.stage === "shipped" ? "merged" : found.bundle?.status === "open" ? "bundled" : found.queued ? "queued" : "not queued"
    return {
      pr: card.pr_number,
      title: card.title,
      head: head ?? "",
      record: {
        intent: record.intent ?? "",
        change: { text: record.change ?? "", start: [] },
        decisions: record.decisions?.trim() ? [record.decisions] : [],
        notCovered: record.not_covered ?? "",
        risk: { level: record.risk.level, breaks: record.risk.breaks ?? "", notice: "", undo: record.risk.undo ?? "" },
        followUps: record.follow_ups ?? [],
        facts: {
          files: numstat.length,
          added: numstat.reduce((sum, item) => sum + (Number(item[0]) || 0), 0),
          removed: numstat.reduce((sum, item) => sum + (Number(item[1]) || 0), 0),
          packages: [],
          ownUnits: [],
        },
        evidence: {
          doneWhen: [],
          reviews: [],
          checks: found.checks.map((check) => ({
            name: `${check.kind} ${check.command}`,
            state: check.outcome,
            ...(check.url ? { url: check.url } : {}),
          })),
          used: "unseen",
        },
        cost: {
          attempts: found.attempts.map((attempt) => ({ n: attempt.n, cause: attempt.cause ?? "" })),
          ciRuns: found.checks.length,
          ciMinutes: Math.round(
            found.checks.reduce((sum, check) => sum + Math.max(0, (check.ended_at ?? check.started_at) - check.started_at), 0) / 60_000,
          ),
          wallMs: now - card.time_created,
        },
        lineage: {
          card: `${row.key}-${card.number}`,
          ...(found.epic ? { epic: `${row.key}-E${found.epic.number}` } : {}),
          dependsOn: found.depends.map((dep) => `${row.key}-${dep.number}`),
          seats: [...new Set(found.attempts.map((attempt) => attempt.seat).filter((seat) => seat !== null))],
        },
        integration: {
          state,
          ...(found.bundle ? { bundle: `${row.key}-B${found.bundle.n}`, testedOn: found.bundle.base } : {}),
        },
      } satisfies BoardRecord.PrRecord,
    }
  })

  return { head, moved, note, describe, recordBundle, recordOf }
}
