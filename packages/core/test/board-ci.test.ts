import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { Effect, Exit, Schedule } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardCi } from "@orchestra/core/board/ci"
import { BoardCheckTable, BoardIssueTable } from "@orchestra/core/board/sql"
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

// GitHub answers `gh run view <id>` from `views`; a run this process started never reaches it.
const views = new Map<string, unknown>()
const gh = (args: ReadonlyArray<string>) => {
  const view = args[0] === "run" && args[1] === "view" ? views.get(args[2] ?? "") : undefined
  return Effect.succeed(view ? { exitCode: 0, stdout: JSON.stringify(view), stderr: "" } : { exitCode: 1, stdout: "", stderr: "not found" })
}

// The scoped command is a real script in the card's worktree: it passes while the file `verdict` reads "pass".
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({ gh }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

const CHECK = `process.exit((await Bun.file(new URL("verdict", import.meta.url)).text()).trim() === "pass" ? 0 : 1)\n`
// Each run holds a file in the shared `running` folder next to the worktrees and records how many it saw there.
const SLOW = `import fs from "fs/promises"
const dir = new URL("../running/", import.meta.url).pathname
await fs.mkdir(dir, { recursive: true })
const own = dir + crypto.randomUUID()
await fs.writeFile(own, "")
await Bun.sleep(1000)
await fs.appendFile(new URL("../peaks", import.meta.url).pathname, (await fs.readdir(dir)).length + "\\n")
await fs.rm(own)
`

describe("BoardCi", () => {
  it.live("a scoped green is keyed by tree: it survives a commit with the same tree and drops after an edit", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("CIT", { scoped: { tests: "bun check.ts {files}", workflows: [] }, merge: "merge" })
      yield* board.project({ key: "CIT", name: "Checks", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "CIT", title: "Code", branch: "card-1", reason: "Plan." })

      yield* write(card.worktree, "verdict", "pass\n")
      const started = yield* board.ciRun({ project: "CIT", issue: 1 })
      expect(started.state).toBeNull()
      expect(started.checks).toEqual([expect.objectContaining({ kind: "scoped", outcome: "pending" })])
      expect(started.notes.join(" ")).toContain("run in the background")
      const green = yield* settled(board, "CIT", 1)
      expect(green.state).toBe("scoped-green")
      expect(green.checks).toEqual([expect.objectContaining({ kind: "scoped", command: "bun check.ts", outcome: "pass", treeSha: green.tree })])

      // Maestro's commit in land keeps the tree, so the green stands and nothing runs again.
      yield* Effect.promise(() => commit(card.worktree, "verdict"))
      const committed = yield* board.ciRun({ project: "CIT", issue: 1 })
      expect(committed.tree).toBe(green.tree)
      expect(committed.state).toBe("scoped-green")
      expect(committed.checks.map((check) => check.id)).toEqual(green.checks.map((check) => check.id))

      yield* write(card.worktree, "verdict", "fail\n")
      const edited = yield* board.ciRun({ project: "CIT", issue: 1, run: false })
      expect(edited.tree).not.toBe(green.tree)
      expect(edited.state).toBeNull()
      expect(edited.checks).toEqual([])

      yield* board.ciRun({ project: "CIT", issue: 1 })
      const red = yield* settled(board, "CIT", 1)
      expect(red.state).toBe("scoped-red")
      expect(red.checks).toEqual([expect.objectContaining({ outcome: "fail", treeSha: edited.tree })])
    }),
  )

  it.live("at most 3 scoped runs go at once across cards, and every card still settles", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("CIC", { scoped: { tests: "bun slow.ts" }, merge: "merge" }, { "slow.ts": SLOW })
      yield* board.project({ key: "CIC", name: "Cap", repo: card.directory, reason: "Start." })
      yield* Effect.forEach([1, 2, 3, 4], (number) =>
        Effect.gen(function* () {
          if (number > 1) yield* Effect.promise(() => git(card.directory, "worktree", "add", "-b", `card-${number}`, path.join(card.root, `card-${number}`)))
          yield* board.issue({ project: "CIC", title: `Code ${number}`, branch: `card-${number}`, reason: "Plan." })
        }),
      )

      const started = yield* Effect.forEach([1, 2, 3, 4], (issue) => board.ciRun({ project: "CIC", issue }))
      expect(started.flatMap((result) => result.checks.map((check) => check.outcome))).toEqual(["pending", "pending", "pending", "pending"])
      const done = yield* Effect.forEach([1, 2, 3, 4], (issue) => settled(board, "CIC", issue))
      expect(done.map((result) => result.state)).toEqual(["scoped-green", "scoped-green", "scoped-green", "scoped-green"])
      const peaks = (yield* Effect.promise(() => fs.readFile(path.join(card.root, "peaks"), "utf8"))).trim().split("\n").map(Number)
      expect(peaks).toHaveLength(4)
      expect(Math.max(...peaks)).toBe(3)
    }),
  )

  it.live("a pending run the host lost settles from GitHub by its URL, or becomes an error without one", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      const card = yield* repository("CIG", { scoped: { tests: "bun check.ts" }, merge: "merge" })
      yield* board.project({ key: "CIG", name: "Lost", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "CIG", title: "Lost run", branch: "card-1", reason: "Plan." })
      const tree = (yield* board.ciRun({ project: "CIG", issue: 1, run: false })).tree
      const issue = (yield* database.db.select().from(BoardIssueTable).all().pipe(Effect.orDie)).find((row) => row.title === "Lost run")
      const row = (id: string, url: string | null, startedAt: number) => ({
        id: Board.CheckID.make(id),
        issue_id: issue!.id,
        attempt: issue!.attempts,
        kind: "scoped" as const,
        command: "bun check.ts",
        tree_sha: tree,
        commit_sha: null,
        outcome: "pending" as const,
        url,
        failing: [],
        started_at: startedAt,
        ended_at: null,
      })
      const insert = (id: string, url: string | null, startedAt: number) =>
        database.db.insert(BoardCheckTable).values(row(id, url, startedAt)).run().pipe(Effect.orDie)

      yield* insert("chk_lost_pass", "https://github.com/acme/app/actions/runs/101", 1)
      views.set("101", { status: "in_progress", conclusion: "", jobs: [] })
      const running = yield* board.ciRun({ project: "CIG", issue: 1, run: false })
      expect(running.checks).toEqual([expect.objectContaining({ outcome: "pending" })])
      views.set("101", { status: "completed", conclusion: "success", jobs: [{ name: "test (linux)", conclusion: "success" }] })
      const green = yield* board.ciRun({ project: "CIG", issue: 1, run: false })
      expect(green.state).toBe("scoped-green")

      yield* insert("chk_lost_fail", "https://github.com/acme/app/actions/runs/102", 2)
      views.set("102", { status: "completed", conclusion: "failure", jobs: [{ name: "test (linux)", conclusion: "failure" }] })
      const red = yield* board.ciRun({ project: "CIG", issue: 1, run: false })
      expect(red.state).toBe("scoped-red")
      expect(red.checks.at(-1)).toEqual(expect.objectContaining({ outcome: "fail", failing: ["test (linux)"] }))

      yield* insert("chk_lost_none", null, 3)
      const lost = yield* board.ciRun({ project: "CIG", issue: 1, run: false })
      expect(lost.checks.at(-1)).toEqual(expect.objectContaining({ outcome: "error" }))
    }),
  )

  it.live("a repository with no contract and no CI runs nothing and says so", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("CIN")
      yield* board.project({ key: "CIN", name: "None", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "CIN", title: "Code", branch: "card-1", reason: "Plan." })

      const result = yield* board.ciRun({ project: "CIN", issue: 1 })
      expect(result.state).toBeNull()
      expect(result.checks).toEqual([])
      expect(result.notes.join(" ")).toContain("land's verification only")
    }),
  )

  it.live("a contract that asks for any merge but merge is refused", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("CIS", { scoped: { tests: "bun check.ts" }, merge: "squash" })
      yield* board.project({ key: "CIS", name: "Squash", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "CIS", title: "Code", branch: "card-1", reason: "Plan." })

      const refused = yield* board.ciRun({ project: "CIS", issue: 1 }).pipe(Effect.exit)
      expect(Exit.isFailure(refused)).toBe(true)
      expect(JSON.stringify(refused)).toContain("Board.RefusedError")
    }),
  )
})

// Reports until no scoped run of the card is pending.
function settled(board: Board.Interface, project: string, issue: number) {
  return board.ciRun({ project, issue, run: false }).pipe(
    Effect.repeat({ while: (result) => result.checks.some((check) => check.outcome === "pending"), schedule: Schedule.spaced("50 millis") }),
  )
}

// A repository on main with the contract committed, and a card worktree on branch card-1.
function repository(name: string, contract?: unknown, files: Record<string, string> = {}) {
  return Effect.gen(function* () {
    const made = yield* Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-ci-${name}-`)))
      const directory = path.join(root, "repo")
      await git(root, "-c", "init.defaultBranch=main", "init", directory)
      await fs.writeFile(path.join(directory, "check.ts"), CHECK)
      await fs.writeFile(path.join(directory, "verdict"), "fail\n")
      await Promise.all(Object.entries(files).map(([file, text]) => fs.writeFile(path.join(directory, file), text)))
      if (contract) {
        await fs.mkdir(path.join(directory, ".orchestra"))
        await fs.writeFile(path.join(directory, ".orchestra", "ci.json"), JSON.stringify(contract))
      }
      await commit(directory, ".")
      await git(directory, "worktree", "add", "-b", "card-1", path.join(root, "card-1"))
      return { root, directory, worktree: path.join(root, "card-1") }
    })
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: ProjectSchema.ID.make(`prj_board_ci_${name}`), worktree: AbsolutePath.make(made.directory), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    return made
  })
}

function write(directory: string, file: string, text: string) {
  return Effect.promise(() => fs.writeFile(path.join(directory, file), text))
}

async function commit(directory: string, file: string) {
  await git(directory, "add", file)
  await git(directory, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "change")
}

test("failing reads the file of a TypeScript error", () => {
  expect(BoardCi.failing("src/x.ts:4:2 - error TS2345: y")).toEqual(["src/x.ts"])
})
