import { describe, expect } from "bun:test"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { Effect, Exit } from "effect"
import { Board } from "@orchestra/core/board/board"
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

// The scoped command is a real script in the card's worktree: it passes while the file `verdict` reads "pass".
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

const CHECK = `process.exit((await Bun.file(new URL("verdict", import.meta.url)).text()).trim() === "pass" ? 0 : 1)\n`

describe("BoardCi", () => {
  it.live("a scoped green is keyed by tree: it survives a commit with the same tree and drops after an edit", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("CIT", { scoped: { tests: "bun check.ts {files}", workflows: [] }, merge: "merge" })
      yield* board.project({ key: "CIT", name: "Checks", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "CIT", title: "Code", branch: "card-1", reason: "Plan." })

      yield* write(card.worktree, "verdict", "pass\n")
      const green = yield* board.ciRun({ project: "CIT", issue: 1 })
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

      const red = yield* board.ciRun({ project: "CIT", issue: 1 })
      expect(red.state).toBe("scoped-red")
      expect(red.checks).toEqual([expect.objectContaining({ outcome: "fail", treeSha: edited.tree })])
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

// A repository on main with the contract committed, and a card worktree on branch card-1.
function repository(name: string, contract?: unknown) {
  return Effect.gen(function* () {
    const made = yield* Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-ci-${name}-`)))
      const directory = path.join(root, "repo")
      await git(root, "-c", "init.defaultBranch=main", "init", directory)
      await fs.writeFile(path.join(directory, "check.ts"), CHECK)
      await fs.writeFile(path.join(directory, "verdict"), "fail\n")
      if (contract) {
        await fs.mkdir(path.join(directory, ".orchestra"))
        await fs.writeFile(path.join(directory, ".orchestra", "ci.json"), JSON.stringify(contract))
      }
      await commit(directory, ".")
      await git(directory, "worktree", "add", "-b", "card-1", path.join(root, "card-1"))
      return { directory, worktree: path.join(root, "card-1") }
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
