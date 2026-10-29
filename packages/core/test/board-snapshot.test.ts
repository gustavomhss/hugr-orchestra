import { describe, expect } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { pathToFileURL } from "url"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardAttemptTable, BoardNoteTable } from "@orchestra/core/board/sql"
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

// The fake scanner gets gitleaks' arguments with the worktree last, and reports a secret while a `leak` file exists.
const scanner = path.join(mkdtempSync(path.join(tmpdir(), "orchestra-board-snapshot-scanner-")), "gitleaks")
writeFileSync(scanner, '#!/bin/sh\nfor last; do :; done\n[ -f "$last/leak" ] && exit 1\nexit 0\n', { mode: 0o755 })

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({ scanner }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

// The fake scanner is a shell script, which Windows cannot spawn as a program.
describe.skipIf(process.platform === "win32")("BoardSnapshot", () => {
  it.live("pushes the worktree to the attempt's wip ref without touching its index or HEAD", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("SNP")
      yield* board.project({ key: "SNP", name: "Snapshots", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "SNP", title: "Code", branch: "card-1", reason: "Plan." })
      expect(yield* board.snapshotPush("SNP", 1)).toEqual({ status: "none" })

      yield* board.issue({ project: "SNP", number: 1, session: "ses_snapshot_one", reason: "Dispatch." })
      yield* write(card.worktree, "work.txt", "one\n")
      expect(yield* board.pushState("SNP", 1)).toBe("local")
      const first = yield* board.snapshotPush("SNP", 1)
      expect(first).toMatchObject({ status: "pushed", ref: "refs/orchestra/wip/SNP-1/a1" })
      if (first.status !== "pushed") return
      expect(yield* run(card.remote, "rev-parse", first.ref)).toBe(first.sha)
      expect(yield* run(card.worktree, "rev-parse", `${first.sha}^`)).toBe(card.head)
      expect(yield* run(card.worktree, "rev-parse", "HEAD")).toBe(card.head)
      expect(yield* run(card.worktree, "status", "--porcelain")).toBe("?? work.txt")
      expect(yield* board.pushState("SNP", 1)).toBe("pushed")
      expect((yield* board.issuePage("SNP", 1)).pushState).toBe("pushed")
      expect(yield* board.snapshotPush("SNP", 1)).toEqual({ status: "unchanged", ref: first.ref, sha: first.sha })

      // The next snapshot builds on the last one, so the ref only moves forward.
      yield* write(card.worktree, "work.txt", "two\n")
      expect(yield* board.pushState("SNP", 1)).toBe("local")
      const second = yield* board.snapshotPush("SNP", 1)
      expect(second).toMatchObject({ status: "pushed", ref: first.ref })
      if (second.status !== "pushed") return
      expect(yield* run(card.worktree, "rev-parse", `${second.sha}^`)).toBe(first.sha)
    }),
  )

  it.live("a new Session opens the next attempt and ends the open one by its crash reason", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("SNR")
      yield* board.project({ key: "SNR", name: "Redispatch", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "SNR", title: "Code", branch: "card-1", session: "ses_snapshot_a", reason: "Plan." })
      yield* board.issue({ project: "SNR", number: 1, crash_reason: "Out of memory.", reason: "Crashed." })
      const redispatched = yield* board.issue({ project: "SNR", number: 1, session: "ses_snapshot_b", crash_reason: null, reason: "Again." })
      if (!redispatched.issue) return expect(redispatched.issue).toBeDefined()
      const database = yield* Database.Service
      const attempts = yield* database.db
        .select({ n: BoardAttemptTable.n, session: BoardAttemptTable.session_id, cause: BoardAttemptTable.cause, outcome: BoardAttemptTable.outcome })
        .from(BoardAttemptTable)
        .where(eq(BoardAttemptTable.issue_id, redispatched.issue.id))
        .orderBy(BoardAttemptTable.n)
        .all()
        .pipe(Effect.orDie)
      expect(attempts).toEqual([
        { n: 1, session: "ses_snapshot_a", cause: null, outcome: "failed" },
        { n: 2, session: "ses_snapshot_b", cause: "failed:Out of memory.", outcome: null },
      ])
      const notes = yield* database.db
        .select({ kind: BoardNoteTable.kind, author: BoardNoteTable.author })
        .from(BoardNoteTable)
        .where(eq(BoardNoteTable.issue_id, redispatched.issue.id))
        .all()
        .pipe(Effect.orDie)
      expect(notes).toContainEqual({ kind: "rework", author: "orchestra" })

      yield* write(card.worktree, "work.txt", "again\n")
      expect(yield* board.snapshotPush("SNR", 1)).toMatchObject({ status: "pushed", ref: "refs/orchestra/wip/SNR-1/a2" })
    }),
  )

  it.live("a scanner hit blocks the push and the card stays local", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("SNL")
      yield* board.project({ key: "SNL", name: "Leak", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "SNL", title: "Code", branch: "card-1", session: "ses_snapshot_leak", reason: "Plan." })

      yield* write(card.worktree, "leak", "token\n")
      expect(yield* board.snapshotPush("SNL", 1)).toMatchObject({ status: "blocked", reason: expect.stringContaining("secret") })
      expect(yield* run(card.remote, "for-each-ref", "refs/orchestra")).toBe("")
      expect(yield* board.pushState("SNL", 1)).toBe("local")
    }),
  )

  it.live("a gone worktree with a snapshot is restored at its path", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const card = yield* repository("SNG")
      yield* board.project({ key: "SNG", name: "Gone", repo: card.directory, reason: "Start." })
      yield* board.issue({ project: "SNG", title: "Code", branch: "card-1", session: "ses_snapshot_gone", reason: "Plan." })

      yield* write(card.worktree, "work.txt", "kept\n")
      yield* Effect.promise(() => fs.rm(path.join(card.worktree, "README.md")))
      expect(yield* board.snapshotPush("SNG", 1)).toMatchObject({ status: "pushed", ref: "refs/orchestra/wip/SNG-1/a1" })
      yield* Effect.promise(() => fs.rm(card.worktree, { recursive: true, force: true }))

      expect(yield* board.snapshotPush("SNG", 1)).toMatchObject({ status: "restored", ref: "refs/orchestra/wip/SNG-1/a1", worktree: card.worktree })
      expect(yield* Effect.promise(() => fs.readFile(path.join(card.worktree, "work.txt"), "utf8"))).toBe("kept\n")
      expect(yield* run(card.worktree, "symbolic-ref", "HEAD")).toBe("refs/heads/card-1")
      expect(yield* run(card.worktree, "rev-parse", "HEAD")).toBe(card.head)
      expect((yield* run(card.worktree, "status", "--porcelain")).split("\n").map((line) => line.trim()).toSorted()).toEqual(["?? work.txt", "D README.md"])
    }),
  )
})

// A repository on main pushed to a bare origin, and a card worktree on branch card-1.
function repository(name: string) {
  return Effect.gen(function* () {
    const made = yield* Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-snapshot-${name}-`)))
      const directory = path.join(root, "repo")
      const remote = path.join(root, "origin.git")
      await git(root, "init", "--bare", remote)
      await git(root, "-c", "init.defaultBranch=main", "init", directory)
      await fs.writeFile(path.join(directory, "README.md"), "base\n")
      await git(directory, "add", ".")
      await git(directory, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "base")
      await git(directory, "remote", "add", "origin", pathToFileURL(remote).href)
      await git(directory, "worktree", "add", "-b", "card-1", path.join(root, "card-1"))
      return { directory, remote, worktree: path.join(root, "card-1") }
    })
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: ProjectSchema.ID.make(`prj_board_snapshot_${name}`), worktree: AbsolutePath.make(made.directory), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    return { ...made, head: yield* run(made.worktree, "rev-parse", "HEAD") }
  })
}

function run(directory: string, ...args: string[]) {
  return Effect.promise(() => Bun.$`git -C ${directory} ${args}`.quiet().text()).pipe(Effect.map((text) => text.trim()))
}

function write(directory: string, file: string, text: string) {
  return Effect.promise(() => fs.writeFile(path.join(directory, file), text))
}
