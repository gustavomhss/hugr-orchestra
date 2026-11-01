export * as BoardConflicts from "./conflicts"

import { and, eq, inArray, isNull, ne } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardAttemptTable, BoardIssueTable, BoardNoteTable, BoardProjectTable } from "./sql"
import { changed, log, worktree } from "./shared"
import type { Changed, Git, ProjectRow, Tx } from "./shared"

// Targeted rebase notices (docs/specs/maestro-lead/merge-queue.md section 8.4): when base advances, only cards whose
// write set the merge touched are checked with `git merge-tree`, and only they get a note. The host never rebases or
// merges into a seat's worktree.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly git: Git
  /** The project's base branch from its CI contract. */
  readonly base: (directory: string, project: ProjectRow) => Effect.Effect<string, { readonly message: string }>
  readonly publish: (changed: Changed) => Effect.Effect<void>
}

/**
 * What one base advance meant for one card: `clean` merges, `conflict` names the files that do not. `cleared` marks a
 * card that conflicted before and merges clean now.
 */
export type Notice = {
  readonly issue: Board.IssueID
  readonly base: string
  readonly touched: ReadonlyArray<string>
  readonly verdict: "clean" | "conflict"
  readonly files: ReadonlyArray<string>
  readonly cleared: boolean
}

// Review cards are about to queue and queued cards are about to be bundled: a conflict holds a queued card out of the
// next bundle until its worktree merges base.
const WATCHED: ReadonlyArray<Board.Stage> = ["review", "queue"]

// A project with no watched card has nobody to warn, so its fetch can wait. A later sweep diffs from the stored base
// SHA to the new head, so a delayed fetch loses no changed file; it only delays the note.
const IDLE_FETCH = 5 * 60_000
// Projects are checked two at a time: each check spawns git and writes the database.
const CONCURRENCY = 2

export function make(deps: Deps) {
  // When each project's remote base was last fetched, in process memory: a restart fetches once on the first sweep.
  const fetched = new Map<string, number>()

  const project = Effect.fnUntraced(function* (row: ProjectRow) {
    const directory = yield* deps.quiet((tx) => worktree(tx, row))
    if (!directory) return []
    const base = yield* deps.base(directory, row).pipe(Effect.orElseSucceed(() => undefined))
    if (!base) return []
    // The ref read below is local and cheap, so every sweep sees a base that any other fetch already moved.
    const now = yield* Clock.currentTimeMillis
    const last = fetched.get(row.id)
    if (last === undefined || now - last >= IDLE_FETCH || (yield* watching(row))) {
      fetched.set(row.id, now)
      yield* deps.git(directory, ["fetch", "--quiet", "--no-tags", "origin", base])
    }
    const head = (yield* deps.git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).out
    if (!head || head === row.base_sha) return []
    // The first sighting only records where base stands: there is no earlier merge to compare with.
    if (!row.base_sha) {
      yield* deps.quiet((tx) => tx.update(BoardProjectTable).set({ base_sha: head }).where(eq(BoardProjectTable.id, row.id)).run())
      return []
    }
    const touched = (yield* deps.git(directory, ["diff", "--name-only", `${row.base_sha}..${head}`])).out.split("\n").filter(Boolean)
    const cards = yield* deps.quiet((tx) =>
      tx
        .select({ issue: BoardIssueTable, attempt: BoardAttemptTable })
        .from(BoardIssueTable)
        .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
        .where(and(eq(BoardIssueTable.project_id, row.id), inArray(BoardIssueTable.stage, [...WATCHED]), isNull(BoardAttemptTable.outcome)))
        .all(),
    )
    const notices = yield* Effect.forEach(cards, (card) =>
      Effect.gen(function* () {
        const tip = card.issue.branch
          ? (yield* deps.git(directory, ["rev-parse", "--verify", "--quiet", `refs/heads/${card.issue.branch}`])).out
          : ""
        const target = tip || card.attempt.snapshot_sha
        if (!target) return undefined
        // The declared write set plus what the card really changed, so a card with no declared set is still covered.
        const writes = [
          ...card.attempt.write_paths,
          ...(yield* deps.git(directory, ["diff", "--name-only", `${head}...${target}`])).out.split("\n").filter(Boolean),
        ]
        const overlap = touched.filter((file) => writes.some((site) => covers(site, file)))
        // A card that conflicted before is checked again on every advance, so a fix on base clears it.
        if (overlap.length === 0 && !card.attempt.conflict_base) return undefined
        const merged = yield* deps.git(directory, ["merge-tree", "--write-tree", "--name-only", "--no-messages", head, target])
        if (merged.code > 1) return undefined
        const files = merged.code === 1 ? merged.out.split("\n").slice(1).filter(Boolean) : []
        return {
          issue: card.issue.id,
          base: head,
          touched: overlap,
          verdict: files.length > 0 ? "conflict" : "clean",
          files: [...new Set(files)],
          cleared: files.length === 0 && card.attempt.conflict_base !== null,
        } satisfies Notice
      }),
    ).pipe(Effect.map((all) => all.filter((notice) => notice !== undefined)))
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardProjectTable).set({ base_sha: head }).where(eq(BoardProjectTable.id, row.id)).run()
        return yield* Effect.forEach(notices, (notice) => record(tx, row, base, notice))
      }),
    )
    yield* Effect.forEach(published, (item) => (item ? deps.publish(item) : Effect.void))
    return notices
  })

  /** Whether a card in Review or Queue has an open attempt: the only reason to fetch on every sweep. */
  const watching = Effect.fnUntraced(function* (row: ProjectRow) {
    const found = yield* deps.quiet((tx) =>
      tx
        .select({ id: BoardIssueTable.id })
        .from(BoardIssueTable)
        .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
        .where(and(eq(BoardIssueTable.project_id, row.id), inArray(BoardIssueTable.stage, [...WATCHED]), isNull(BoardAttemptTable.outcome)))
        .limit(1)
        .get(),
    )
    return found !== undefined
  })

  /** Writes the card's conflict state and one note. */
  const record = Effect.fnUntraced(function* (tx: Tx, row: ProjectRow, base: string, notice: Notice) {
    const conflict = notice.verdict === "conflict"
    yield* tx
      .update(BoardAttemptTable)
      .set({ conflict_base: conflict ? notice.base : null, conflict_files: conflict ? [...notice.files] : null })
      .where(and(eq(BoardAttemptTable.issue_id, notice.issue), isNull(BoardAttemptTable.outcome)))
      .run()
    const at = `${base} at ${notice.base.slice(0, 10)}`
    const body = conflict
      ? `${at} conflicts with this card in ${notice.files.join(", ")}. Merge ${base} in the card's worktree on its next dispatch.`
      : notice.cleared
        ? `${at} merges clean with this card again.`
        : `${at} touched ${notice.touched.join(", ")}; merges clean.`
    const id = Board.NoteID.create()
    yield* tx.insert(BoardNoteTable).values({ id, issue_id: notice.issue, author: "orchestra", body }).run()
    const activity = yield* log(tx, { project: row.id, issue: notice.issue, actor: "github", action: "note.add", after: { id, author: "orchestra", body } })
    return changed(row.id, activity, notice.issue)
  })

  return {
    /** Checks every active project's base; the poll runs it every minute. A project with no watched card fetches at most every 5 minutes. */
    sweep: Effect.fnUntraced(function* () {
      const rows = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(ne(BoardProjectTable.status, "archived")).all())
      return (yield* Effect.forEach(rows, project, { concurrency: CONCURRENCY })).flat()
    }),
  }
}

export type Interface = ReturnType<typeof make>

/** The arsenal's `conflictVerdict` site semantics against a changed file: line ranges drop, patterns are globs. */
function covers(site: string, file: string) {
  const bare = site.replace(/:L\d+(?:-\d+)?$/, "").replace(/^\.\//, "")
  if (/(?<!\\)[*?]/.test(bare)) return new Bun.Glob(bare).match(file)
  return bare.replace(/\\([\\*?])/g, "$1") === file
}
