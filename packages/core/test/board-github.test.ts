import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardGithub } from "@orchestra/core/board/github"
import { BoardActivityTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { testEffect } from "./lib/effect"

// A stand-in for api.github.com behind the injected `gh` runner. It answers in the shapes `gh api` prints (headers with
// -i, JSON bodies, ETag and 304), keeps the issues it was told about, and records every call.
type Remote = {
  number: number
  node_id: string
  title: string
  body: string
  state: "open" | "closed"
  state_reason: string | null
  updated_at: string
  user: { login: string }
  labels: string[]
  milestone: number | null
  pull_request?: object
}
type Remark = { id: number; issue: number; body: string; login: string; updated_at: string }
type Call = { args: ReadonlyArray<string>; stdin?: string }

const github = (() => {
  const state = {
    issues: [] as Remote[],
    comments: [] as Remark[],
    labels: [] as string[],
    milestones: [] as { number: number; title: string }[],
    pulls: {} as Record<number, { state: "open" | "closed"; merged: boolean }>,
    calls: [] as Call[],
    version: 0,
    stamp: 0,
    notModified: 0,
    mode: "ok" as "ok" | "signed_out" | "rate_limited" | "leak",
  }
  const stamp = () => {
    state.stamp = Math.max(state.stamp + 1000, Date.now() + 1000)
    state.version++
    return new Date(state.stamp).toISOString()
  }
  const json = (value: unknown) => JSON.stringify(value)
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: "" })
  const since = (endpoint: string) => Date.parse(new URL(`https://x/${endpoint}`).searchParams.get("since") ?? "") || 0

  const run: BoardGithub.Gh = (args, stdin) =>
    Effect.sync(() => {
      state.calls.push({ args, stdin })
      if (state.mode === "signed_out")
        return { exitCode: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login\n" }
      if (state.mode === "rate_limited") return { exitCode: 1, stdout: "", stderr: "gh: API rate limit exceeded (HTTP 429)\n" }
      if (state.mode === "leak")
        return { exitCode: 1, stdout: "", stderr: "gh: boom with ghp_abcdefghijklmnop1234 and github_pat_abcdefghij1234567\n" }

      if (args[0] === "api" && args[1] === "-i") {
        const endpoint = args[2]
        const etag = `W/"${state.version}"`
        const match = args[3] === "-H" && args[4] === `If-None-Match: ${etag}`
        const head = `HTTP/2.0 200 OK\r\nContent-Type: application/json\r\nEtag: ${etag}\r\n\r\n`
        if (match) {
          state.notModified++
          return ok("HTTP/2.0 304 Not Modified\r\n\r\n")
        }
        const pull = /\/pulls\/(\d+)$/.exec(endpoint)
        if (pull) {
          const found = state.pulls[Number(pull[1])]
          if (!found) return { exitCode: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" }
          return ok(head + json({ head: { sha: `sha${pull[1]}` }, ...found }))
        }
        const single = /\/issues\/(\d+)$/.exec(endpoint)
        if (single) return ok(head + json(wire(state.issues.find((item) => item.number === Number(single[1])))))
        if (endpoint.includes("/issues/comments?"))
          return ok(
            head +
              json(
                state.comments
                  .filter((item) => Date.parse(item.updated_at) >= since(endpoint))
                  .map((item) => ({
                    id: item.id,
                    issue_url: `https://api.github.com/repos/acme/widgets/issues/${item.issue}`,
                    body: item.body,
                    updated_at: item.updated_at,
                    user: { login: item.login },
                  })),
              ),
          )
        return ok(head + json(state.issues.filter((item) => Date.parse(item.updated_at) >= since(endpoint)).map(wire)))
      }

      const method = args[2]
      const endpoint = args[3] ?? ""
      const input = stdin ? JSON.parse(stdin) : {}
      if (method === "POST" && endpoint.endsWith("/labels")) {
        state.labels.push(input.name)
        return ok(json({ name: input.name }))
      }
      if (method === "POST" && endpoint.endsWith("/milestones")) {
        const made = { number: state.milestones.length + 1, title: input.title }
        state.milestones.push(made)
        return ok(json(made))
      }
      if (method === "POST" && endpoint.endsWith("/issues")) {
        const made: Remote = {
          number: state.issues.length + 1,
          node_id: `I_${state.issues.length + 1}`,
          title: input.title,
          body: input.body,
          state: "open",
          state_reason: null,
          updated_at: stamp(),
          user: { login: "orchestra" },
          labels: input.labels ?? [],
          milestone: input.milestone ?? null,
        }
        state.issues.push(made)
        return ok(json({ number: made.number, node_id: made.node_id }))
      }
      const patch = /\/issues\/(\d+)$/.exec(endpoint)
      if (method === "PATCH" && patch) {
        const target = state.issues.find((item) => item.number === Number(patch[1]))
        if (!target) return { exitCode: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" }
        Object.assign(target, {
          title: input.title ?? target.title,
          body: input.body ?? target.body,
          state: input.state ?? target.state,
          state_reason: input.state_reason ?? null,
          labels: input.labels ?? target.labels,
          milestone: input.milestone ?? null,
          updated_at: stamp(),
        })
        return ok(json({ number: target.number }))
      }
      return { exitCode: 1, stdout: "", stderr: `fake gh does not know ${args.join(" ")}` }
    })

  return {
    state,
    run,
    reset() {
      Object.assign(state, {
        issues: [],
        comments: [],
        labels: [],
        milestones: [],
        pulls: {},
        calls: [],
        version: 0,
        notModified: 0,
        mode: "ok",
      })
    },
    /** Someone else opens an issue. */
    open(input: Partial<Remote> & { title: string }) {
      const made: Remote = {
        number: state.issues.length + 1,
        node_id: `I_${state.issues.length + 1}`,
        body: "",
        state: "open",
        state_reason: null,
        updated_at: stamp(),
        user: { login: "someone" },
        labels: [],
        milestone: null,
        ...input,
      }
      state.issues.push(made)
      return made.number
    },
    comment(issue: number, login: string, body: string) {
      state.comments.push({ id: 9000 + state.comments.length, issue, body, login, updated_at: stamp() })
    },
    edit(number: number, fields: Partial<Remote>) {
      Object.assign(remote(number), fields, { updated_at: stamp() })
    },
    writes: () => state.calls.filter((call) => call.args[1] === "-X").map((call) => `${call.args[2]} ${call.args[3]}`),
  }

  function remote(number: number) {
    const found = state.issues.find((item) => item.number === number)
    if (!found) throw new Error(`no remote issue ${number}`)
    return found
  }
  function wire(item: Remote | undefined) {
    return item && { ...item, labels: item.labels.map((name) => ({ name })) }
  }
})()

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({ gh: github.run, poll: false }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

const SECRET = "sk-board-github-4d2a9c61"

describe("Board GitHub mirror", () => {
  it.live("pushes a card as an issue with steps, labels, milestone and a link back, and closes it on Shipped", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "OUT", name: "Out", github_repo: "acme/widgets", reason: "Start." })
      yield* board.epic({ project: "OUT", title: "Launch", goal: "Ship the launch.", reason: "Group." })
      yield* board.issue({ project: "OUT", title: "Write docs", body: "Plan body", type: "chore", epic: 1, reason: "Plan." })
      yield* board.steps({
        project: "OUT",
        number: 1,
        steps: [
          { title: "Draft", status: "done" },
          { title: "Review", status: "pending" },
          { title: "Old idea", status: "skipped" },
        ],
        reason: "Break it down.",
      })
      yield* board.issue({ project: "OUT", title: "Drop me", reason: "Plan." })

      expect(yield* board.sync("OUT")).toEqual({ state: "ok", error: null })
      const [docs, dropped] = github.state.issues
      expect(docs?.title).toBe("Write docs")
      expect(docs?.body).toBe(
        [
          "Plan body",
          "### Steps\n- [x] Draft\n- [ ] Review\n- [x] ~~Old idea~~",
          "---\nTracked on the Orchestra board as OUT-1. <!-- orchestra-board:OUT-1 -->",
        ].join("\n\n"),
      )
      expect(docs?.labels).toEqual(["stage:backlog", "type:chore"])
      expect(docs?.milestone).toBe(1)
      expect(github.state.milestones).toEqual([{ number: 1, title: "OUT-E1: Launch" }])
      expect(dropped?.labels).toEqual(["stage:backlog", "type:feature"])
      expect(dropped?.milestone).toBeNull()
      expect((yield* board.snapshot("OUT")).issues.map((issue) => issue.githubNumber)).toEqual([1, 2])

      // Nothing is dirty any more: the next sync writes nothing.
      const before = github.writes().length
      yield* board.sync("OUT")
      expect(github.writes().length).toBe(before)

      yield* board.move({ project: "OUT", number: 1, stage: "shipped", reason: "Docs are live." })
      yield* board.move({ project: "OUT", number: 2, stage: "cut", reason: "Not needed." })
      yield* board.sync("OUT")
      expect(github.state.issues[0]).toMatchObject({ state: "closed", state_reason: "completed" })
      expect(github.state.issues[0]?.labels).toContain("stage:shipped")
      expect(github.state.issues[1]).toMatchObject({ state: "closed", state_reason: "not_planned" })
      expect(github.state.issues[1]?.labels).toContain("stage:cut")

      // Our own pushes coming back are not conflicts.
      expect((yield* activity("OUT")).filter((row) => row.action === "github.overwrite")).toEqual([])
      expect((yield* board.snapshot("OUT")).questions).toEqual([])
    }),
  )

  it.live("never puts notes, attachments, secrets or questions in the issue body", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "SEC", name: "Secrets", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "SEC", title: "Rotate keys", body: "Plan only.", reason: "Plan." })
      yield* board.note("SEC", 1, { body: "Private owner note NOTE-MARKER" })
      yield* board.attach("SEC", 1, { kind: "secret", name: "deploy key", value: SECRET })
      yield* board.question({
        action: "ask",
        project: "SEC",
        issue: 1,
        text: "QUESTION-MARKER which vault?",
        options: [
          { id: "a", label: "A", consequence: "One." },
          { id: "b", label: "B", consequence: "Two." },
        ],
        recommended: "a",
        reason: "Blocks the work.",
      })

      yield* board.sync("SEC")
      const sent = JSON.stringify(github.state.calls)
      expect(github.state.issues[0]?.body).toBe(
        "Plan only.\n\n---\nTracked on the Orchestra board as SEC-1. <!-- orchestra-board:SEC-1 -->",
      )
      expect(github.state.calls.length).toBeGreaterThan(0)
      for (const text of [SECRET, "NOTE-MARKER", "QUESTION-MARKER", "deploy key"]) expect(sent).not.toContain(text)
    }),
  )

  it.live("a new issue from someone else lands in Intake; pull requests, closed issues and other boards' issues do not", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "INT", name: "Intake", github_repo: "acme/widgets", reason: "Start." })
      yield* board.sync("INT")

      github.open({ title: "Crash on start", body: "It crashes.", labels: ["bug"] })
      github.open({ title: "A pull request", pull_request: {} })
      github.open({ title: "Old news", state: "closed" })
      github.open({ title: "Mirror", body: "x\n\n<!-- orchestra-board:OTH-4 -->" })
      yield* board.sync("INT")
      yield* board.sync("INT")

      const snapshot = yield* board.snapshot("INT")
      expect(snapshot.issues).toHaveLength(1)
      expect(snapshot.issues[0]).toMatchObject({ title: "Crash on start", body: "It crashes.", type: "bug", stage: "intake", githubNumber: 1 })
      expect((yield* activity("INT")).filter((row) => row.action === "issue.create")).toEqual([
        expect.objectContaining({ actor: "github" }),
      ])
      // Intake is the owner's to accept, so nothing is written to GitHub yet.
      expect(github.writes()).toEqual([])

      yield* board.accept("INT", 1)
      yield* board.sync("INT")
      expect(github.state.issues[0]?.labels).toEqual(["bug", "stage:backlog", "type:bug"])
      expect(github.state.issues[0]?.body).toContain("<!-- orchestra-board:INT-1 -->")
    }),
  )

  it.live("auto_accept_intake sends the new issue to Backlog and mirrors it", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "AUT", name: "Auto", github_repo: "acme/widgets", reason: "Start." })
      yield* database.db.update(BoardProjectTable).set({ auto_accept_intake: true }).where(eq(BoardProjectTable.key, "AUT")).run().pipe(Effect.orDie)
      yield* board.sync("AUT")

      github.open({ title: "Add dark mode" })
      yield* board.sync("AUT")
      expect((yield* board.snapshot("AUT")).issues[0]).toMatchObject({ title: "Add dark mode", stage: "backlog" })
      expect(github.state.issues[0]?.labels).toEqual(["stage:backlog", "type:feature"])
    }),
  )

  it.live("a card follows its PR: open moves Building to Review, merged moves it to Shipped; a hold or a pause keeps it", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "PRS", name: "Pulls", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "PRS", title: "Code", seat: "backend", reason: "Plan." })
      yield* board.issue({ project: "PRS", title: "Held", seat: "backend", reason: "Plan." })
      yield* board.issue({ project: "PRS", title: "Gone", seat: "backend", reason: "Plan." })
      yield* Effect.forEach([1, 2, 3], (number) => board.move({ project: "PRS", number, stage: "building", reason: "Dispatched." }))
      yield* board.issue({ project: "PRS", number: 1, pr: 11, crash_reason: "Stalled twice.", reason: "PR is up." })
      yield* board.issue({ project: "PRS", number: 2, pr: 12, reason: "PR is up." })
      yield* board.issue({ project: "PRS", number: 3, pr: 13, reason: "PR is up." })
      yield* board.hold("PRS", 2, { hold: true })
      github.state.pulls = { 11: { state: "open", merged: false }, 12: { state: "closed", merged: true } }

      expect((yield* board.sync("PRS")).state).toBe("ok")
      const stages = () => board.snapshot("PRS").pipe(Effect.map((snapshot) => snapshot.issues.toSorted((a, b) => a.number - b.number).map((issue) => issue.stage)))
      // PR 13 does not exist on GitHub: its card stays and the sync still succeeds.
      expect(yield* stages()).toEqual(["review", "building", "building"])
      expect((yield* activity("PRS")).filter((row) => row.actor === "github" && row.action === "issue.move")).toEqual([
        expect.objectContaining({ reason: "PR #11 is open on GitHub." }),
      ])

      github.state.pulls[11] = { state: "closed", merged: true }
      yield* board.sync("PRS")
      expect(yield* stages()).toEqual(["shipped", "building", "building"])
      expect((yield* board.proof("PRS", 1)).crashReason).toBeNull()
      expect(github.state.issues.find((issue) => issue.body.includes("orchestra-board:PRS-1 "))).toMatchObject({
        state: "closed",
        state_reason: "completed",
      })

      yield* board.hold("PRS", 2, { hold: false })
      yield* board.pause("PRS", { reason: "Owner pause." })
      yield* board.sync("PRS")
      expect(yield* stages()).toEqual(["shipped", "building", "building"])
      yield* board.resume("PRS")
      yield* board.sync("PRS")
      expect(yield* stages()).toEqual(["shipped", "shipped", "building"])
    }),
  )

  it.live("a GitHub comment on a mirrored issue becomes a note, once", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "COM", name: "Comments", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "COM", title: "Talk", reason: "Plan." })
      yield* board.sync("COM")

      github.comment(1, "alice", "Have you tried turning it off?")
      github.comment(7, "bob", "On an issue the board does not track.")
      yield* board.sync("COM")
      yield* board.sync("COM")

      expect((yield* board.issuePage("COM", 1)).notes).toEqual([
        expect.objectContaining({ author: "github:alice", body: "Have you tried turning it off?" }),
      ])
    }),
  )

  it.live("a GitHub edit is overwritten by the board, logged as github.overwrite, and undo takes GitHub's text", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "OVR", name: "Overwrite", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "OVR", title: "Board title", body: "Board body", reason: "Plan." })
      yield* board.sync("OVR")

      github.edit(1, { title: "GitHub title" })
      yield* board.sync("OVR")
      expect(github.state.issues[0]?.title).toBe("Board title")
      const overwrite = (yield* activity("OVR")).find((row) => row.action === "github.overwrite")
      expect(overwrite).toMatchObject({ actor: "github", before: { title: "GitHub title" }, after: { title: "Board title" } })

      yield* board.undo("OVR", overwrite!.id)
      expect((yield* board.snapshot("OVR")).issues[0]?.title).toBe("GitHub title")
      yield* board.sync("OVR")
      expect(github.state.issues[0]?.title).toBe("GitHub title")
      expect((yield* activity("OVR")).filter((row) => row.action === "github.overwrite")).toHaveLength(1)
    }),
  )

  it.live("a close or reopen on GitHub asks Maestro and is never applied silently", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "CLS", name: "Close", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "CLS", title: "Still open here", reason: "Plan." })
      yield* board.sync("CLS")

      github.edit(1, { state: "closed" })
      yield* board.sync("CLS")
      const snapshot = yield* board.snapshot("CLS")
      expect(snapshot.issues[0]?.stage).toBe("backlog")
      expect(snapshot.questions).toHaveLength(1)
      expect(snapshot.questions[0]).toMatchObject({ blocking: false, recommended: "keep" })
      expect(snapshot.questions[0]?.text).toContain("closed on GitHub")
      // The board's stage stands, so GitHub is put back.
      expect(github.state.issues[0]?.state).toBe("open")

      yield* board.move({ project: "CLS", number: 1, stage: "shipped", reason: "Done." })
      yield* board.sync("CLS")
      github.edit(1, { state: "open" })
      yield* board.sync("CLS")
      expect((yield* board.snapshot("CLS")).questions.map((question) => question.text)).toEqual([
        expect.stringContaining("closed on GitHub"),
        expect.stringContaining("reopened on GitHub"),
      ])
      expect((yield* board.snapshot("CLS")).issues[0]?.stage).toBe("shipped")
    }),
  )

  it.live("signed out, rate limited and errors are shown as facts, the board keeps working, and a retry recovers", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "OFF", name: "Offline", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "OFF", title: "Keep going", reason: "Plan." })

      github.state.mode = "signed_out"
      const out = yield* board.sync("OFF")
      expect(out.state).toBe("signed_out")
      expect(out.error).toContain("not signed in")
      expect((yield* board.snapshot("OFF")).project).toMatchObject({ githubState: "signed_out", githubError: out.error })
      yield* board.issue({ project: "OFF", title: "Written while offline", reason: "Plan." })
      yield* board.sync("OFF")
      expect((yield* activity("OFF")).filter((row) => row.action === "github.state")).toHaveLength(1)

      github.state.mode = "rate_limited"
      expect((yield* board.sync("OFF")).state).toBe("rate_limited")

      github.state.mode = "leak"
      const failed = yield* board.sync("OFF")
      expect(failed.state).toBe("error")
      expect(failed.error).not.toContain("ghp_")
      expect(failed.error).not.toContain("github_pat_")

      github.state.mode = "ok"
      expect(yield* board.sync("OFF")).toEqual({ state: "ok", error: null })
      expect(github.state.issues.map((issue) => issue.title)).toEqual(["Keep going", "Written while offline"])
      expect((yield* board.snapshot("OFF")).project).toMatchObject({ githubState: "ok", githubError: null })
    }),
  )

  it.live("asks GitHub with the stored ETag and treats 304 as nothing new", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "TAG", name: "Etag", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "TAG", title: "One", reason: "Plan." })
      yield* board.sync("TAG")
      yield* board.sync("TAG")
      const before = github.state.notModified
      yield* board.sync("TAG")
      expect(github.state.notModified).toBeGreaterThan(before)
      expect(github.state.calls.some((call) => call.args.includes("-H"))).toBe(true)
      expect(yield* board.sync("TAG")).toEqual({ state: "ok", error: null })
    }),
  )

  it.live("sync refuses a project without a repository and one that does not exist", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "NOR", name: "No repo", reason: "Start." })
      expect((yield* Effect.flip(board.sync("NOR"))).message).toContain("no GitHub repository")
      expect(yield* Effect.flip(board.sync("NOPE"))).toBeInstanceOf(Board.NotFoundError)
      expect(github.state.calls).toEqual([])
    }),
  )
})

function activity(key: string) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const board = yield* Board.Service
    const project = (yield* board.snapshot(key)).project
    return yield* database.db
      .select()
      .from(BoardActivityTable)
      .where(eq(BoardActivityTable.project_id, project.id))
      .orderBy(BoardActivityTable.id)
      .all()
      .pipe(Effect.orDie)
  })
}
