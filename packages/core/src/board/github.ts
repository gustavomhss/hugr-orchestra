export * as BoardGithub from "./github"

import { and, asc, eq, isNull, or, sql } from "drizzle-orm"
import { Clock, Effect, Option, Schema, Semaphore } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { Database } from "../database/database"
import { AppProcess } from "../process"
import { which } from "../util/which"
import {
  BoardCiRunTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
  BoardQuestionTable,
  BoardStepTable,
} from "./sql"
import { endOf } from "./shared"

// The GitHub Issues mirror (docs/specs/projects-board/CONTRACT.md section 6). Transport is the signed-in `gh` CLI, so
// there is no token here to store or log. Every call goes through an injected `Gh` runner, which tests replace with
// recorded responses.

export type GhResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
/** Runs `gh <args>`. It never fails: a missing or crashing CLI is a nonzero exit code with the reason on stderr. */
export type Gh = (args: ReadonlyArray<string>, stdin?: string) => Effect.Effect<GhResult>

type Tx = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type ProjectRow = typeof BoardProjectTable.$inferSelect
type IssueRow = typeof BoardIssueTable.$inferSelect
type Changed = { readonly project: string; readonly issue?: string; readonly activity: string }

export type Outcome =
  | { readonly status: "missing" }
  | { readonly status: "off" }
  | { readonly status: "done"; readonly state: Board.GithubState; readonly error: string | null }

export interface Deps {
  /** One immediate transaction; storage failures are defects. */
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  /** Publishes `board.changed` after a committed write. */
  readonly publish: (changed: Changed) => Effect.Effect<void>
  readonly log: (
    tx: Tx,
    input: {
      readonly project: Board.ProjectID
      readonly issue?: Board.IssueID | null
      readonly actor: Board.Actor
      readonly action: Board.Action
      readonly reason?: string | null
      readonly before?: Record<string, unknown> | null
      readonly after?: Record<string, unknown> | null
    },
  ) => Effect.Effect<Board.ActivityID, unknown>
  readonly gh: Gh
}

/** The real runner: the user's `gh`, with its own sign-in, never prompting. */
export function runner(proc: AppProcess.Interface, env?: NodeJS.ProcessEnv): Gh {
  return (args, stdin) =>
    Effect.suspend(() => {
      const executable = which("gh", env ?? process.env)
      if (!executable) return Effect.succeed({ exitCode: 127, stdout: "", stderr: "gh is not installed on this server" })
      return proc
        .run(
          ChildProcess.make(executable, [...args], {
            env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
            extendEnv: true,
            stdin: "ignore",
          }),
          { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "30 seconds", stdin },
        )
        .pipe(
          Effect.map((result) => ({
            exitCode: result.exitCode,
            stdout: result.stdout.toString("utf8"),
            stderr: result.stderr.toString("utf8"),
          })),
          Effect.catch((error) => Effect.succeed({ exitCode: 1, stdout: "", stderr: error.message })),
        )
    })
}

class Failure extends Schema.TaggedErrorClass<Failure>()("Board.GithubFailure", {
  kind: Schema.Literals(["signed_out", "rate_limited", "error"]),
  message: Schema.String,
  status: Schema.optional(Schema.Int),
}) {}

const Label = Schema.Struct({ name: Schema.String })
const Login = Schema.NullOr(Schema.Struct({ login: Schema.String }))
const Issue = Schema.Struct({
  number: Schema.Int,
  node_id: Schema.String,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  state: Schema.String,
  updated_at: Schema.String,
  user: Login,
  labels: Schema.Array(Label),
  pull_request: Schema.optional(Schema.Unknown),
})
const Comment = Schema.Struct({ id: Schema.Int, issue_url: Schema.String, body: Schema.String, updated_at: Schema.String, user: Login })
const Created = Schema.Struct({ number: Schema.Int, node_id: Schema.optional(Schema.String) })
const decodeIssues = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Issue)))
const decodeIssue = Schema.decodeUnknownOption(Schema.fromJsonString(Issue))
const decodeComments = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Comment)))
const decodeCreated = Schema.decodeUnknownOption(Schema.fromJsonString(Created))

const Pull = Schema.Struct({
  head: Schema.Struct({ sha: Schema.String }),
  state: Schema.optional(Schema.String),
  merged: Schema.optional(Schema.Boolean),
})
const Runs = Schema.Struct({
  workflow_runs: Schema.Array(
    Schema.Struct({ id: Schema.Int, name: Schema.NullOr(Schema.String), status: Schema.String, run_attempt: Schema.optional(Schema.Int) }),
  ),
})
const Timing = Schema.Struct({ billable: Schema.optional(Schema.Record(Schema.String, Schema.Struct({ total_ms: Schema.Finite }))) })
const decodePull = Schema.decodeUnknownOption(Schema.fromJsonString(Pull))
const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Runs))
const decodeTiming = Schema.decodeUnknownOption(Schema.fromJsonString(Timing))

// GitHub's per-minute rates for hosted runners; public repositories bill nothing, which the timing endpoint reports as 0 ms.
const RATES: Record<string, number> = { UBUNTU: 0.008, WINDOWS: 0.016, MACOS: 0.08 }
/** CI minutes are refreshed at most this often unless the owner forces it. */
const CI_TTL = 10 * 60_000

const PAGE = 100
const MAX_PAGES = 5
const MARKER = /<!-- orchestra-board:([A-Z]+)-(\d+) -->/
const FOOTER = "\n\n---\nTracked on the Orchestra board as "
const COLORS = { stage: "5319e7", type: "0e8a16" }

export function make(deps: Deps) {
  const gate = Semaphore.makeUnsafe(1)

  /** Pulls from GitHub, then pushes dirty cards. Manual retry and the 60 second poll both come here. */
  const sync = (key: string): Effect.Effect<Outcome> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const project = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get())
        if (!project) return { status: "missing" } as const
        if (!project.github_repo) return { status: "off" } as const
        const failed = yield* pull(project, project.github_repo).pipe(
          Effect.andThen(follow(project, project.github_repo)),
          Effect.andThen(push(project, project.github_repo)),
          Effect.as(undefined),
          Effect.catch((failure: Failure) => Effect.succeed(failure)),
        )
        const state = failed ? failed.kind : "ok"
        const error = failed ? failed.message : null
        yield* settle(project, state, error)
        return { status: "done", state, error } as const
      }),
    )

  /**
   * Fetches the Actions runs of every card's PR and caches their billable minutes in `board_ci_run`. Spend reads that
   * cache, never GitHub, so a render never waits on the network. Runs are fetched once they complete and never again.
   */
  const ci = (key: string, force = false): Effect.Effect<Outcome> =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        const project = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get())
        if (!project) return { status: "missing" } as const
        if (!project.github_repo) return { status: "off" } as const
        const repo = project.github_repo
        const now = yield* Clock.currentTimeMillis
        if (!force && project.ci_synced_at !== null && now - project.ci_synced_at < CI_TTL)
          return { status: "done", state: project.github_state, error: project.github_error } as const
        const issues = yield* deps.quiet((tx) =>
          tx
            .select()
            .from(BoardIssueTable)
            .where(and(eq(BoardIssueTable.project_id, project.id), sql`${BoardIssueTable.pr_number} is not null`, sql`${BoardIssueTable.stage} != 'cut'`))
            .all(),
        )
        const failed = yield* Effect.forEach(issues, (issue) => runs(project, repo, issue), { discard: true }).pipe(
          Effect.as(undefined),
          Effect.catch((failure: Failure) => Effect.succeed(failure)),
        )
        if (!failed)
          yield* deps.quiet((tx) => tx.update(BoardProjectTable).set({ ci_synced_at: now }).where(eq(BoardProjectTable.id, project.id)).run())
        const state = failed ? failed.kind : "ok"
        const error = failed ? failed.message : null
        yield* settle(project, state, error)
        return { status: "done", state, error } as const
      }),
    )

  const runs = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow) {
    const pull = Option.getOrUndefined(decodePull((yield* get(`repos/${repo}/pulls/${issue.pr_number}`, null)).body))
    if (!pull) return
    const found = Option.getOrUndefined(
      decodeRuns((yield* get(`repos/${repo}/actions/runs?head_sha=${encodeURIComponent(pull.head.sha)}&per_page=${PAGE}`, null)).body),
    )
    const known = new Set(
      (yield* deps.quiet((tx) =>
        tx.select({ id: BoardCiRunTable.run_id }).from(BoardCiRunTable).where(eq(BoardCiRunTable.issue_id, issue.id)).all(),
      )).map((row) => row.id),
    )
    const fresh = (found?.workflow_runs ?? []).filter((run) => run.status === "completed" && !known.has(run.id))
    yield* Effect.forEach(
      fresh,
      (run) =>
        Effect.gen(function* () {
          const timing = Option.getOrUndefined(decodeTiming((yield* get(`repos/${repo}/actions/runs/${run.id}/timing`, null)).body))
          const billable = Object.entries(timing?.billable ?? {})
          const ms = billable.reduce((all, [, value]) => all + value.total_ms, 0)
          const cost = billable.reduce((all, [runner, value]) => all + (value.total_ms / 60_000) * (RATES[runner.toUpperCase()] ?? RATES.UBUNTU), 0)
          yield* deps.quiet((tx) =>
            tx
              .insert(BoardCiRunTable)
              .values({
                run_id: run.id,
                project_id: project.id,
                issue_id: issue.id,
                name: run.name ?? "workflow",
                attempt: run.run_attempt ?? 1,
                billable_ms: Math.round(ms),
                cost_usd: cost,
              })
              .onConflictDoNothing()
              .run(),
          )
        }),
      { discard: true },
    )
  })

  /**
   * The PR is the fact a card follows on every sync: an open PR moves a Building card to Review, a merged one moves it
   * from Building or Review to Shipped and clears its crash reason. Maestro still moves every other stage; a paused
   * project or card, and an owner hold before merge, keep the card where it is.
   */
  const follow = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    if (project.status !== "active") return
    const issues = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardIssueTable)
        .where(
          and(
            eq(BoardIssueTable.project_id, project.id),
            sql`${BoardIssueTable.pr_number} is not null`,
            sql`${BoardIssueTable.stage} in ('building', 'review')`,
          ),
        )
        .all(),
    )
    yield* Effect.forEach(issues, (issue) => advance(project, repo, issue), { discard: true })
  })

  const advance = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow) {
    // One unreadable PR (deleted, renamed repo, a blip) leaves its card alone; it must not stop the rest of the sync.
    const read = yield* get(`repos/${repo}/pulls/${issue.pr_number}`, null).pipe(Effect.option)
    const pull = Option.getOrUndefined(Option.flatMap(read, (result) => decodePull(result.body)))
    const stage = pull?.merged ? ("shipped" as const) : pull?.state === "open" ? ("review" as const) : undefined
    if (!stage || issue.paused) return
    const from: ReadonlyArray<Board.Stage> = stage === "shipped" ? ["building", "review"] : ["building"]
    if (!from.includes(issue.stage) || (stage === "shipped" && issue.hold_before_merge)) return
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const next = {
          stage,
          position: yield* endOf(tx, project.id, stage),
          stage_entered_at: now,
          ...(stage === "shipped" ? { crash_reason: null } : {}),
        }
        yield* tx.update(BoardIssueTable).set({ ...next, github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
        const activity = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "issue.move",
          reason: stage === "shipped" ? `PR #${issue.pr_number} merged on GitHub.` : `PR #${issue.pr_number} is open on GitHub.`,
          before: {
            stage: issue.stage,
            position: issue.position,
            stage_entered_at: issue.stage_entered_at,
            ...(stage === "shipped" ? { crash_reason: issue.crash_reason } : {}),
          },
          after: next,
        })
        return { project: project.id, issue: issue.id, activity }
      }),
    )
    yield* deps.publish(changed)
  })

  const settle = Effect.fnUntraced(function* (project: ProjectRow, state: Board.GithubState, error: string | null) {
    const now = yield* Clock.currentTimeMillis
    const set = { github_state: state, github_error: error, ...(state === "ok" ? { github_synced_at: now } : {}) }
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardProjectTable).set(set).where(eq(BoardProjectTable.id, project.id)).run()
        if (project.github_state === state && project.github_error === error) return undefined
        const activity = yield* deps.log(tx, {
          project: project.id,
          actor: "github",
          action: "github.state",
          before: { github_state: project.github_state, github_error: project.github_error },
          after: { github_state: state, github_error: error },
        })
        return { project: project.id, activity }
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  // ---- GitHub to board ----

  const pull = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    const now = yield* Clock.currentTimeMillis
    // The mirror starts now: issues that were already on GitHub are not imported into Intake.
    const start = project.github_since ?? now
    const issues = yield* pages(repo, "issues", "state=all&sort=updated&direction=asc", start, project.github_issues_etag, decodeIssues)
    for (const item of issues.items) if (!item.pull_request) yield* ingest(project, item)
    const comments = yield* pages(repo, "issues/comments", "sort=updated&direction=asc", start, project.github_comments_etag, decodeComments)
    for (const item of comments.items) yield* comment(project, item)
    const newest = issues.items.reduce((high, item) => Math.max(high, Date.parse(item.updated_at) || 0), start)
    yield* deps.quiet((tx) =>
      tx
        .update(BoardProjectTable)
        .set({
          github_since: newest,
          github_issues_etag: issues.etag ?? project.github_issues_etag,
          github_comments_etag: comments.etag ?? project.github_comments_etag,
        })
        .where(eq(BoardProjectTable.id, project.id))
        .run(),
    )
  })

  /** Reads a list endpoint with `since` and the stored ETag; a 304 is an empty page. */
  const pages = <T extends { readonly updated_at: string }>(
    repo: string,
    path: string,
    query: string,
    since: number,
    etag: string | null,
    decode: (text: string) => Option.Option<ReadonlyArray<T>>,
  ) =>
    Effect.gen(function* () {
      const items: T[] = []
      let cursor = since
      let seen = etag
      let latest: string | null = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = yield* get(`repos/${repo}/${path}?${query}&per_page=${PAGE}&since=${new Date(cursor).toISOString()}`, seen)
        if (res.status === 304) break
        const batch = decode(res.body)
        if (Option.isNone(batch)) return yield* new Failure({ kind: "error", message: `GitHub returned ${path} in a shape the board does not read.` })
        items.push(...batch.value)
        latest = res.etag ?? latest
        seen = null
        const last = batch.value.at(-1)?.updated_at
        const next = last ? Date.parse(last) : cursor
        if (batch.value.length < PAGE || !(next > cursor)) break
        cursor = next
      }
      return { items, etag: latest }
    })

  const ingest = Effect.fnUntraced(function* (project: ProjectRow, item: typeof Issue.Type) {
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const marker = MARKER.exec(item.body ?? "")
        const rows = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.project_id, project.id)).all()
        const known =
          rows.find((row) => row.github_number === item.number) ??
          (marker?.[1] === project.key ? rows.find((row) => row.number === Number(marker[2]) && row.github_number === null) : undefined)
        if (!known) {
          // Closed issues are history; a marker with no matching card is another board's.
          if (item.state !== "open" || marker) return undefined
          return yield* intake(tx, project, item)
        }
        if (known.github_number === null)
          yield* tx.update(BoardIssueTable).set({ github_number: item.number, github_node_id: item.node_id }).where(eq(BoardIssueTable.id, known.id)).run()
        // A pending push or an issue the owner has not accepted yet is not compared.
        if (known.github_dirty || known.stage === "intake") return undefined
        return yield* compare(tx, project, known, item)
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  const intake = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, item: typeof Issue.Type) {
    const fresh = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, project.id)).get()
    const stage = project.auto_accept_intake ? ("backlog" as const) : ("intake" as const)
    const id = Board.IssueID.create()
    const number = fresh?.next_issue_number ?? project.next_issue_number
    const names = item.labels.map((label) => label.name.toLowerCase())
    const row = {
      id,
      project_id: project.id,
      number,
      title: item.title,
      body: item.body ?? "",
      type: names.includes("bug") ? ("bug" as const) : names.includes("chore") ? ("chore" as const) : ("feature" as const),
      stage,
      position: yield* endOf(tx, project.id, stage),
      stage_entered_at: yield* Clock.currentTimeMillis,
      github_number: item.number,
      github_node_id: item.node_id,
      // An accepted card still needs its stage label and footer on GitHub.
      github_dirty: stage !== "intake",
    }
    yield* tx.insert(BoardIssueTable).values(row).run()
    yield* tx.update(BoardProjectTable).set({ next_issue_number: number + 1 }).where(eq(BoardProjectTable.id, project.id)).run()
    const activity = yield* deps.log(tx, {
      project: project.id,
      issue: id,
      actor: "github",
      action: "issue.create",
      reason: `Opened on GitHub as #${item.number} by ${item.user?.login ?? "someone"}.`,
      after: { number, title: row.title, body: row.body, type: row.type, stage },
    })
    return { project: project.id, issue: id, activity } as Changed
  })

  // Board wins for stage and steps; GitHub's edits to title or body are overwritten, but the owner can undo that.
  const compare = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, item: typeof Issue.Type) {
    const ref = `${project.key}-${issue.number}`
    const text = item.body ?? ""
    let last: Board.ActivityID | undefined
    if (MARKER.test(text)) {
      const theirs: Record<string, string> = {}
      const ours: Record<string, string> = {}
      const body = unmirrored(text)
      if (item.title !== issue.title) {
        theirs.title = item.title
        ours.title = issue.title
      }
      if (body !== issue.body.trim()) {
        theirs.body = body
        ours.body = issue.body
      }
      if (Object.keys(theirs).length > 0) {
        last = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "github.overwrite",
          reason: `GitHub had a different ${Object.keys(theirs).join(" and ")} for ${ref}; the next push restores the board's.`,
          before: theirs,
          after: ours,
        })
        yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
      }
    }
    const shut = issue.stage === "shipped" || issue.stage === "cut"
    if ((item.state === "closed") !== shut) {
      const said = item.state === "closed" ? "closed" : "reopened"
      const asked = `GitHub #${item.number} (${ref}) was ${said} on GitHub, but the board has it in ${issue.stage}.`
      const open = yield* tx
        .select({ id: BoardQuestionTable.id })
        .from(BoardQuestionTable)
        .where(and(eq(BoardQuestionTable.issue_id, issue.id), eq(BoardQuestionTable.status, "open"), eq(BoardQuestionTable.text, asked)))
        .get()
      if (!open) {
        const id = Board.QuestionID.create()
        yield* tx
          .insert(BoardQuestionTable)
          .values({
            id,
            project_id: project.id,
            issue_id: issue.id,
            text: asked,
            options: [
              { id: "keep", label: "Keep the board's stage", consequence: "The next push puts the GitHub issue back the way the board has it." },
              { id: "follow", label: "Follow GitHub", consequence: "Move the card to match GitHub, then the two agree." },
            ],
            recommended: "keep",
            cost_of_waiting: null,
            blocking: false,
            status: "open",
          })
          .run()
        last = yield* deps.log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "github",
          action: "question.ask",
          reason: `GitHub #${item.number} was ${said}; the board does not apply that on its own.`,
          after: { id, text: asked, blocking: false },
        })
      }
      // The next push restores the board's state unless the plan changes first.
      yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
    }
    return last ? ({ project: project.id, issue: issue.id, activity: last } as Changed) : undefined
  })

  const comment = Effect.fnUntraced(function* (project: ProjectRow, item: typeof Comment.Type) {
    const number = Number(item.issue_url.split("/").at(-1))
    const changed = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const issue = yield* tx
          .select()
          .from(BoardIssueTable)
          .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.github_number, number)))
          .get()
        if (!issue) return undefined
        const have = yield* tx.select({ id: BoardNoteTable.id }).from(BoardNoteTable).where(eq(BoardNoteTable.github_comment_id, item.id)).get()
        if (have) return undefined
        const id = Board.NoteID.create()
        const author = `github:${item.user?.login ?? "unknown"}`
        yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author, body: item.body, github_comment_id: item.id }).run()
        const activity = yield* deps.log(tx, { project: project.id, issue: issue.id, actor: "github", action: "note.add", after: { id, author } })
        return { project: project.id, issue: issue.id, activity } as Changed
      }),
    )
    if (changed) yield* deps.publish(changed)
  })

  // ---- board to GitHub ----

  const push = Effect.fnUntraced(function* (project: ProjectRow, repo: string) {
    const due = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardIssueTable)
        .where(
          and(
            eq(BoardIssueTable.project_id, project.id),
            sql`${BoardIssueTable.stage} != 'intake'`,
            or(eq(BoardIssueTable.github_dirty, true), isNull(BoardIssueTable.github_number)),
          ),
        )
        .orderBy(asc(BoardIssueTable.time_updated))
        .all(),
    )
    const labels = new Set<string>()
    for (const issue of due) yield* pushOne(project, repo, issue, labels)
  })

  const pushOne = Effect.fnUntraced(function* (project: ProjectRow, repo: string, issue: IssueRow, labels: Set<string>) {
    const ref = `${project.key}-${issue.number}`
    const { steps, epic } = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const steps = yield* tx.select().from(BoardStepTable).where(eq(BoardStepTable.issue_id, issue.id)).orderBy(asc(BoardStepTable.position)).all()
        const epic = issue.epic_id ? yield* tx.select().from(BoardEpicTable).where(eq(BoardEpicTable.id, issue.epic_id)).get() : undefined
        return { steps, epic }
      }),
    )
    const milestone = epic ? yield* milestoneOf(project, repo, epic) : null
    const ours = [`stage:${issue.stage}`, `type:${issue.type}`]
    for (const name of ours) {
      if (labels.has(name)) continue
      yield* send("POST", `repos/${repo}/labels`, { name, color: COLORS[name.startsWith("stage") ? "stage" : "type"] }, [422])
      labels.add(name)
    }
    const shut = issue.stage === "shipped" || issue.stage === "cut"
    const state = shut ? { state: "closed", state_reason: issue.stage === "cut" ? "not_planned" : "completed" } : { state: "open" }
    const content = { title: issue.title, body: render(project.key, issue, steps) }

    const existing = issue.github_number
    const created =
      existing === null
        ? Option.getOrUndefined(decodeCreated((yield* send("POST", `repos/${repo}/issues`, { ...content, labels: ours, ...(milestone ? { milestone } : {}) })).body))
        : undefined
    if (existing === null && !created) return yield* new Failure({ kind: "error", message: `GitHub did not return the new issue for ${ref}.` })
    const number = (created?.number ?? existing) as number
    // Keep labels people added; only the board's stage and type labels are replaced.
    const theirs =
      existing === null
        ? []
        : Option.match(decodeIssue((yield* get(`repos/${repo}/issues/${number}`, null)).body), {
            onNone: () => [],
            onSome: (found) => found.labels.map((label) => label.name).filter((name) => !/^(stage|type):/.test(name)),
          })
    // A new issue is created open with its labels; closing it, and every update, goes through PATCH.
    if (existing !== null || shut)
      yield* send("PATCH", `repos/${repo}/issues/${number}`, { ...content, ...state, labels: [...theirs, ...ours], milestone })
    yield* deps.quiet((tx) =>
      tx
        .update(BoardIssueTable)
        .set({
          github_number: number,
          github_node_id: created?.node_id ?? issue.github_node_id,
          // A write that landed while the push was in flight keeps the card dirty.
          github_dirty: sql`case when ${BoardIssueTable.time_updated} = ${issue.time_updated} then 0 else 1 end`,
        })
        .where(eq(BoardIssueTable.id, issue.id))
        .run(),
    )
  })

  const milestoneOf = Effect.fnUntraced(function* (project: ProjectRow, repo: string, epic: typeof BoardEpicTable.$inferSelect) {
    if (epic.github_milestone !== null) return epic.github_milestone
    const made = Option.getOrUndefined(
      decodeCreated((yield* send("POST", `repos/${repo}/milestones`, { title: `${project.key}-E${epic.number}: ${epic.title}`, description: epic.goal })).body),
    )
    if (!made) return yield* new Failure({ kind: "error", message: `GitHub did not return the milestone for ${project.key}-E${epic.number}.` })
    yield* deps.quiet((tx) => tx.update(BoardEpicTable).set({ github_milestone: made.number }).where(eq(BoardEpicTable.id, epic.id)).run())
    return made.number
  })

  // ---- gh ----

  /** GET with headers, so the ETag and a 304 are visible. */
  const get = Effect.fnUntraced(function* (endpoint: string, etag: string | null) {
    const result = yield* deps.gh(["api", "-i", endpoint, ...(etag ? ["-H", `If-None-Match: ${etag}`] : [])])
    const head = /^HTTP\/\S+\s+(\d{3})/.exec(result.stdout)
    const status = head ? Number(head[1]) : undefined
    if (status === 304) return { status, body: "", etag }
    if (status !== undefined && status >= 200 && status < 300 && result.exitCode === 0) {
      const split = /\r?\n\r?\n/.exec(result.stdout)
      const headers = result.stdout.slice(0, split?.index ?? 0)
      return { status, body: result.stdout.slice((split?.index ?? 0) + (split?.[0].length ?? 0)), etag: /^etag:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null }
    }
    return yield* fail(result, status)
  })

  const send = Effect.fnUntraced(function* (method: "POST" | "PATCH", endpoint: string, payload: unknown, tolerate: ReadonlyArray<number> = []) {
    const result = yield* deps.gh(["api", "-X", method, endpoint, "--input", "-"], JSON.stringify(payload))
    if (result.exitCode === 0) return { body: result.stdout }
    const status = Number(/HTTP (\d{3})/.exec(result.stderr)?.[1] ?? NaN)
    if (tolerate.includes(status)) return { body: result.stdout }
    return yield* fail(result, Number.isNaN(status) ? undefined : status)
  })

  const fail = (result: GhResult, status: number | undefined) => {
    const line = result.stderr.split(/\r?\n/).find((text) => text.trim()) ?? `gh exited with ${result.exitCode}`
    const code = status ?? (Number(/HTTP (\d{3})/.exec(result.stderr)?.[1]) || undefined)
    const signedOut =
      result.exitCode === 4 || /auth login|not logged in|not authenticated|HTTP 401|401 Unauthorized|Bad credentials/i.test(result.stderr) || code === 401
    const limited = code === 429 || /rate limit/i.test(result.stderr) || (code === 403 && /x-ratelimit-remaining:\s*0/i.test(result.stdout))
    return new Failure({
      kind: signedOut ? "signed_out" : limited ? "rate_limited" : "error",
      message: redact(signedOut ? `GitHub is not signed in on this server: ${line}` : line).slice(0, 300),
      status: code,
    })
  }

  return { sync, ci }
}

/** The issue body GitHub shows: the card body, the steps as a task list, and the footer with the hidden marker. */
export function render(key: string, issue: Pick<IssueRow, "number" | "body">, steps: ReadonlyArray<{ readonly title: string; readonly status: Board.StepStatus }>) {
  const list = steps.map((step) => `- [${step.status === "done" || step.status === "skipped" ? "x" : " "}] ${step.status === "skipped" ? `~~${step.title}~~` : step.title}`)
  return [
    issue.body.trim(),
    list.length > 0 ? `### Steps\n${list.join("\n")}` : "",
    `---\nTracked on the Orchestra board as ${key}-${issue.number}. <!-- orchestra-board:${key}-${issue.number} -->`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** The card's own text inside a mirrored body: without the steps list and the footer the mirror appends. */
export function unmirrored(text: string) {
  const plain = text.replace(/\r\n/g, "\n")
  const cut = plain.lastIndexOf(FOOTER)
  const head = cut >= 0 ? plain.slice(0, cut) : plain.replace(/^---\nTracked on the Orchestra board as .*$/m, "")
  const steps = head.lastIndexOf("### Steps\n")
  const tail = steps >= 0 ? head.slice(steps + "### Steps\n".length) : ""
  const listed = steps >= 0 && tail.split("\n").every((line) => /^- \[[ x]\] /.test(line))
  return (listed ? head.slice(0, steps) : head).trim()
}

function redact(text: string) {
  return text.replace(/\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})/g, "[token]")
}
