import { describe, expect } from "bun:test"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { pathToFileURL } from "url"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardConflicts } from "@orchestra/core/board/conflicts"
import { BoardAttemptTable, BoardIssueTable, BoardNoteTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { ProjectSchema } from "@orchestra/core/project/schema"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { git } from "./fixture/git"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({}),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

const LINES = "one\ntwo\nthree\nfour\nfive\n"

describe("BoardConflicts", () => {
  it.live("a base advance notes only the cards whose write set it touched", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("CFT")
      yield* board.project({ key: "CFT", name: "Conflicts", repo: repo.directory, reason: "Start." })
      const first = yield* card(repo, "CFT", "card-1", "a.txt", "ONE\ntwo\nthree\nfour\nfive\n")
      const second = yield* card(repo, "CFT", "card-2", "b.txt", "ONE\ntwo\nthree\nfour\nfive\n")
      // The first sighting only records where base stands.
      expect(yield* board.conflictSweep()).toEqual([])

      yield* advance(repo, "a.txt", "one\ntwo\nthree\nfour\nFIVE\n")
      const notices = yield* board.conflictSweep()
      expect(notices).toMatchObject([{ issue: first, verdict: "clean", touched: ["a.txt"], files: [], cleared: false }])
      expect(yield* notes(first)).toEqual([expect.stringContaining("touched a.txt; merges clean.")])
      expect(yield* notes(second)).toEqual([])

      yield* advance(repo, "c.txt", "new\n")
      expect(yield* board.conflictSweep()).toEqual([])
      expect(yield* board.conflictSweep()).toEqual([])
    }),
  )

  it.live("a conflict is recorded on the attempt and cleared when base merges clean again", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("CFC")
      yield* board.project({ key: "CFC", name: "Conflict", repo: repo.directory, reason: "Start." })
      const issue = yield* card(repo, "CFC", "card-1", "a.txt", "ONE\ntwo\nthree\nfour\nfive\n")
      yield* board.conflictSweep()

      const conflicting = yield* advance(repo, "a.txt", "uno\ntwo\nthree\nfour\nfive\n")
      expect(yield* board.conflictSweep()).toMatchObject([{ issue, verdict: "conflict", files: ["a.txt"] }])
      expect(yield* attempt(issue)).toEqual({ base: conflicting, files: ["a.txt"] })
      expect((yield* notes(issue)).at(-1)).toContain("conflicts with this card in a.txt. Merge main in the card's worktree")

      // A change elsewhere still checks the conflicted card again.
      yield* advance(repo, "c.txt", "new\n")
      expect(yield* board.conflictSweep()).toMatchObject([{ issue, verdict: "conflict", touched: [] }])

      yield* advance(repo, "a.txt", "ONE\ntwo\nthree\nfour\nfive\n")
      expect(yield* board.conflictSweep()).toMatchObject([{ issue, verdict: "clean", cleared: true }])
      expect(yield* attempt(issue)).toEqual({ base: null, files: null })
      expect((yield* notes(issue)).at(-1)).toContain("merges clean with this card again.")
    }),
  )

  it.live("a project with no watched card is fetched on a slow cadence, a watched one on every sweep", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      const repo = yield* repository("CFS")
      yield* board.project({ key: "CFS", name: "Cadence", repo: repo.directory, reason: "Start." })
      // The real git behind a counter, so the test sees every command the sweep spawns.
      const spawned: string[] = []
      const conflicts = BoardConflicts.make({
        quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie),
        git: (cwd, args) =>
          Effect.promise(async () => {
            spawned.push(args[0]!)
            const child = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" })
            const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
            return { code: await child.exited, out: out.trim(), err: err.trim() }
          }),
        base: () => Effect.succeed("main"),
        publish: () => Effect.void,
      })
      const fetches = () => spawned.filter((command) => command === "fetch").length
      const baseSha = () =>
        database.db
          .select({ sha: BoardProjectTable.base_sha })
          .from(BoardProjectTable)
          .where(eq(BoardProjectTable.key, "CFS"))
          .get()
          .pipe(
            Effect.orDie,
            Effect.map((row) => row?.sha),
          )

      // The first sweep fetches once and records where base stands.
      yield* conflicts.sweep()
      expect(fetches()).toBe(1)
      expect(yield* baseSha()).toBeTruthy()

      // Nobody waits on this project, so later sweeps fetch nothing. The local ref still moved, and the sweep sees it.
      yield* conflicts.sweep()
      const moved = yield* advance(repo, "c.txt", "new\n")
      yield* conflicts.sweep()
      expect(fetches()).toBe(1)
      expect(yield* baseSha()).toBe(moved)

      // A card in Review waits for a verdict, so every sweep fetches again.
      yield* card(repo, "CFS", "card-1", "a.txt", "ONE\ntwo\nthree\nfour\nfive\n")
      yield* conflicts.sweep()
      yield* conflicts.sweep()
      expect(fetches()).toBe(3)
    }),
  )
})

type Repo = { readonly root: string; readonly directory: string }

// A repository on main pushed to a bare origin, with a five-line a.txt and b.txt.
function repository(name: string) {
  return Effect.gen(function* () {
    const made = yield* Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-conflicts-${name}-`)))
      const directory = path.join(root, "repo")
      const remote = path.join(root, "origin.git")
      await git(root, "init", "--bare", remote)
      await git(root, "-c", "init.defaultBranch=main", "init", directory)
      await fs.writeFile(path.join(directory, "a.txt"), LINES)
      await fs.writeFile(path.join(directory, "b.txt"), LINES)
      await commit(directory, "base")
      await git(directory, "remote", "add", "origin", pathToFileURL(remote).href)
      await git(directory, "push", "--quiet", "origin", "main")
      return { root, directory }
    })
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: ProjectSchema.ID.make(`prj_board_conflicts_${name}`), worktree: AbsolutePath.make(made.directory), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    return made
  })
}

// A Review card on its own branch that committed one change to `file`.
function card(repo: Repo, key: string, branch: string, file: string, text: string) {
  return Effect.gen(function* () {
    const board = yield* Board.Service
    yield* Effect.promise(async () => {
      const worktree = path.join(repo.root, branch)
      await git(repo.directory, "worktree", "add", "-b", branch, worktree)
      await fs.writeFile(path.join(worktree, file), text)
      await commit(worktree, branch)
    })
    const created = yield* board.issue({ project: key, title: branch, branch, session: `ses_conflicts_${key}_${branch}`, reason: "Plan." })
    if (!created.issue) return yield* Effect.die("The card was not created.")
    const database = yield* Database.Service
    yield* database.db.update(BoardIssueTable).set({ stage: "review" }).where(eq(BoardIssueTable.id, created.issue.id)).run().pipe(Effect.orDie)
    return created.issue.id
  })
}

// Commits one change on main and pushes it, the way a merged PR advances base.
function advance(repo: Repo, file: string, text: string) {
  return Effect.promise(async () => {
    await fs.writeFile(path.join(repo.directory, file), text)
    await commit(repo.directory, `change ${file}`)
    await git(repo.directory, "push", "--quiet", "origin", "main")
    return (await Bun.$`git -C ${repo.directory} rev-parse HEAD`.quiet().text()).trim()
  })
}

async function commit(directory: string, message: string) {
  await git(directory, "add", ".")
  await git(directory, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "--quiet", "-m", message)
}

function notes(issue: typeof BoardNoteTable.$inferSelect.issue_id) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const rows = yield* database.db
      .select({ body: BoardNoteTable.body })
      .from(BoardNoteTable)
      .where(eq(BoardNoteTable.issue_id, issue))
      .orderBy(BoardNoteTable.id)
      .all()
      .pipe(Effect.orDie)
    return rows.map((row) => row.body)
  })
}

function attempt(issue: typeof BoardAttemptTable.$inferSelect.issue_id) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const row = yield* database.db
      .select({ base: BoardAttemptTable.conflict_base, files: BoardAttemptTable.conflict_files })
      .from(BoardAttemptTable)
      .where(eq(BoardAttemptTable.issue_id, issue))
      .get()
      .pipe(Effect.orDie)
    return row
  })
}
