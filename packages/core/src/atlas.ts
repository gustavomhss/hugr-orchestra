export * as Atlas from "./atlas"

import { existsSync } from "node:fs"
import { join } from "node:path"
import { mineSites, mineWith } from "@orchestra/atlas-boundary/mine"
import type { MineResult, MineSites } from "@orchestra/atlas-boundary/mine"
import { openSurface } from "@orchestra/atlas-boundary/surface"
import type {
  AtlasAnswerInput,
  AtlasDecideInput,
  AtlasDraftInput,
  AtlasDraftResult,
  AtlasEmitInput,
  AtlasEmitResult,
  AtlasHealthResult,
  AtlasHoldInput,
  AtlasInstallResult,
  AtlasInterviewQuestion,
  AtlasLinkInput,
  AtlasLinkResult,
  AtlasMemoryDecideInput,
  AtlasOwnResult,
  AtlasPromoteInput,
  AtlasPromoteResult,
  AtlasProposeInput,
  AtlasReasoningResult,
  AtlasReleaseInput,
  AtlasReviewResult,
  AtlasReviewWriteResult,
  AtlasSnapshotResult,
  AtlasTerritoryInput,
  AtlasVerifyInput,
  AtlasVerifyResult,
} from "@orchestra/atlas-boundary/surface"
import { Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { Npm } from "./npm"
import type { AppProcess } from "./process"

// The host side of the Atlas screen, shared by the legacy instance routes and the V2 server. `open` binds the Atlas
// surface (the boundary's `./surface` entry) to one store root and runs each read or write in process. The surface is
// synchronous: `own`, `health` and every write compose Atlas's runtime, which walks the tracked tree, so those calls
// hold the fiber for as long as that takes. A throw (an unreadable store, a disk fault during a commit) becomes
// `Unavailable`, never a defect.
// Setup (D37, D38): `install` creates the store and `index` runs the indexer the plan names. Mining (D39, D40) runs the
// boundary's `./mine` entry; `delegate` (D33) drafts interview answers. Both take the model call from the host, which
// owns provider resolution.

export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("AtlasSurface.Unavailable", {
  message: Schema.String,
}) {}

type Empty = { readonly state: "empty" }
export type MineSitesResult = Empty | ({ readonly state: "ok" } & MineSites)
export type MineWithResult = Empty | ({ readonly state: "ok" } & MineResult)
export type MineWithInput = {
  readonly ceiling: number
  readonly answers: Readonly<Record<string, string>>
  readonly model: string
}

export type IndexResult =
  | Empty
  | {
      readonly state: "ok"
      readonly ran: boolean
      readonly tool: string | null
      readonly exitCode: number | null
      /** Documents in the index after the run, or null when there is none. */
      readonly documents: number | null
      readonly message: string | null
    }

export interface Interface {
  readonly snapshot: () => Effect.Effect<AtlasSnapshotResult, Unavailable>
  readonly reasoning: (id: string) => Effect.Effect<AtlasReasoningResult, Unavailable>
  readonly own: (scope: string) => Effect.Effect<AtlasOwnResult, Unavailable>
  readonly health: () => Effect.Effect<AtlasHealthResult, Unavailable>
  readonly promote: (input: AtlasPromoteInput) => Effect.Effect<AtlasPromoteResult, Unavailable>
  readonly draft: (input: AtlasDraftInput) => Effect.Effect<AtlasDraftResult, Unavailable>
  readonly emit: (input: AtlasEmitInput) => Effect.Effect<AtlasEmitResult, Unavailable>
  readonly link: (input: AtlasLinkInput) => Effect.Effect<AtlasLinkResult, Unavailable>
  readonly verify: (input: AtlasVerifyInput) => Effect.Effect<AtlasVerifyResult, Unavailable>
  readonly review: () => Effect.Effect<AtlasReviewResult, Unavailable>
  readonly hold: (input: AtlasHoldInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly release: (input: AtlasReleaseInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly propose: (input: AtlasProposeInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly decide: (input: AtlasDecideInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly answer: (input: AtlasAnswerInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly memoryDecide: (input: AtlasMemoryDecideInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly territory: (
    input: Omit<AtlasTerritoryInput, "projectId">,
  ) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly install: () => Effect.Effect<AtlasInstallResult, Unavailable>
  readonly index: () => Effect.Effect<IndexResult, Unavailable>
  readonly mineSites: (ceiling: number) => Effect.Effect<MineSitesResult, Unavailable>
  readonly mineWith: (input: MineWithInput) => Effect.Effect<MineWithResult, Unavailable>
}

export type Dependencies = { readonly npm: Npm.Interface; readonly processes: AppProcess.Interface }

/** The store root (D5): the project worktree, or the directory when the project has none ("/"). */
export const storeRoot = (worktree: string, directory: string) => (worktree === "/" ? directory : worktree)

/**
 * The surface over the store at `root`. `projectID` is the Orchestra project id the first territory catalog records
 * (issues/c-engine.md item 2): the client never sends it, and an existing catalog of another project refuses the write.
 */
export const open = (dependencies: Dependencies, root: string, projectID: string): Interface => {
  const runAt = <A>(name: string, call: () => A) =>
    Effect.try({ try: call, catch: (cause) => new Unavailable({ message: firstLine(cause) }) }).pipe(
      Effect.withSpan(`AtlasSurface.${name}`),
    )
  const run = <A>(name: string, call: (surface: ReturnType<typeof openSurface>) => A) =>
    runAt(name, () => call(openSurface(root)))
  const stored = () => existsSync(join(root, ".atlas"))
  const health = () => run("health", (surface) => surface.health())
  return {
    snapshot: () => run("snapshot", (surface) => surface.snapshot()),
    reasoning: (id) => run("reasoning", (surface) => surface.reasoning(id)),
    own: (scope) => run("own", (surface) => surface.own(scope)),
    health,
    promote: (input) => run("promote", (surface) => surface.promote(input)),
    draft: (input) => run("draft", (surface) => surface.draft(input)),
    emit: (input) => run("emit", (surface) => surface.emit(input)),
    link: (input) => run("link", (surface) => surface.link(input)),
    verify: (input) => run("verify", (surface) => surface.verify(input)),
    review: () => run("review", (surface) => surface.review()),
    hold: (input) => run("hold", (surface) => surface.hold(input)),
    release: (input) => run("release", (surface) => surface.release(input)),
    propose: (input) => run("propose", (surface) => surface.propose(input)),
    decide: (input) => run("decide", (surface) => surface.decide(input)),
    answer: (input) => run("answer", (surface) => surface.answer(input)),
    memoryDecide: (input) => run("memoryDecide", (surface) => surface.memoryDecide(input)),
    territory: (input) => run("territory", (surface) => surface.territory({ ...input, projectId: projectID })),
    install: () => run("install", (surface) => surface.install()),
    index: () => index(dependencies, health, root),
    mineSites: (ceiling) =>
      runAt("mineSites", (): MineSitesResult => (stored() ? { state: "ok", ...mineSites(root, ceiling) } : EMPTY)),
    mineWith: (input) =>
      runAt(
        "mineWith",
        (): MineWithResult =>
          stored() ? { state: "ok", ...mineWith(root, input.ceiling, input.answers, input.model) } : EMPTY,
      ),
  }
}

const EMPTY: Empty = { state: "empty" }

// D38: Orchestra runs the indexer the store's plan names, from the repository root, so Genesis has the code graph it
// ranks sites by. TypeScript first, else Python, else nothing: both tools write the one `.atlas/index.scip` the readers
// open. The package comes from Orchestra's package cache at the version Atlas pins (adapter-io/src/scip.ts) and runs with
// Orchestra's own Bun, so the machine needs no Node. A failed run reports the tail of its stderr.
const PACKAGES = [
  ["scip-typescript", "@sourcegraph/scip-typescript"],
  ["scip-python", "@sourcegraph/scip-python"],
] as const

const index = Effect.fn("AtlasIndex.index")(function* (
  dependencies: Dependencies,
  health: () => Effect.Effect<AtlasHealthResult, Unavailable>,
  root: string,
) {
  const before = yield* health()
  if (before.state === "empty") return EMPTY
  const planned = PACKAGES.flatMap(([tool, pkg]) =>
    before.index.configured.filter((lang) => lang.plan.tool === tool).map((lang) => ({ ...lang.plan, pkg })),
  )[0]
  if (!planned) return indexed(false, null, null, null, "no indexer is configured for this repository's languages")
  const bin = yield* dependencies.npm.which(`${planned.pkg}@${planned.version}`, planned.tool)
  if (!bin) return indexed(false, planned.tool, null, null, `could not install ${planned.pkg}@${planned.version}`)
  const args = [
    ...planned.args,
    ...(planned.tool === "scip-typescript" && !existsSync(join(root, "tsconfig.json")) ? ["--infer-tsconfig"] : []),
  ]
  const ran = yield* dependencies.processes
    .run(
      ChildProcess.make(process.execPath, [bin, ...args], {
        cwd: root,
        env: { BUN_BE_BUN: "1" },
        extendEnv: true,
        stdin: "ignore",
      }),
      { timeout: "10 minutes", maxOutputBytes: 1_000_000, maxErrorBytes: 64_000 },
    )
    .pipe(
      Effect.map((result) => ({ exitCode: result.exitCode, stderr: result.stderr.toString("utf8") })),
      Effect.catch((error) => Effect.succeed({ exitCode: -1, stderr: error.message })),
    )
  const after = yield* health()
  const documents = after.state === "ok" && after.index.scip.kind === "present" ? after.index.scip.documents : null
  const failure = ran.stderr.trim().slice(-300) || `${planned.tool} exited with ${ran.exitCode}`
  return indexed(true, planned.tool, ran.exitCode, documents, ran.exitCode === 0 ? null : failure)
})

function indexed(
  ran: boolean,
  tool: string | null,
  exitCode: number | null,
  documents: number | null,
  message: string | null,
): IndexResult {
  return { state: "ok", ran, tool, exitCode, documents, message }
}

// R11 delegation (DECISIONS.md D33). A model drafts an answer to each chosen open interview question, one call per
// question, replying `{ answer, why }`. Each draft is written through the surface as an `answer` carrying `drafted`. A
// draft never ratifies and keeps its question open (D29): a person accepts it by answering with the same text. One
// question's failure (unknown model, provider error, unreadable reply, a refused write) is that question's row; only an
// unavailable store fails the whole call.

export type DelegateInput = {
  readonly questionIds: readonly string[]
  readonly providerID: string
  readonly modelID: string
}
export type Drafted = { readonly questionId: string; readonly ok: boolean; readonly rejected: string | null }
export type DelegateResult = Empty | { readonly state: "ok"; readonly drafted: readonly Drafted[] }

// An empty system prompt would fall back to the model's general coding prompt.
export const DELEGATE_SYSTEM =
  "You draft an answer to one open question about a codebase's recorded knowledge. A person reviews every draft before it counts. Answer only from what the question gives you. When the question lists options, the answer must be exactly one of those option strings, copied character for character, with nothing added: for a tier question the answer reads like T1 or T0. The why is one or two plain sentences on what the answer rests on, and says so when the question does not give enough to decide."

export const Reply = Schema.Struct({ answer: Schema.String, why: Schema.String })
export type Reply = typeof Reply.Type

export const REPLY_JSON_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" }, why: { type: "string" } },
  required: ["answer", "why"],
  additionalProperties: false,
}

/** A `{ answer, why }` reply, read from the outermost JSON object so a fenced reply still counts; else `undefined`. */
export const decodeReply = (text: string) =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.fromJsonString(Reply))(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)),
  )

export type DelegateServices = {
  readonly atlas: Pick<Interface, "review" | "answer">
  /** One model call for one question's prompt; `undefined` when the reply is not a readable `{ answer, why }`. */
  readonly draft: (prompt: string) => Effect.Effect<Reply | undefined, unknown>
}

export const delegate = Effect.fn("AtlasDelegate.delegate")(function* (
  services: DelegateServices,
  input: DelegateInput,
) {
  const review = yield* services.atlas.review()
  if (review.state === "empty") return EMPTY as DelegateResult
  const drafted = yield* Effect.forEach(input.questionIds, (questionId) => {
    const question = review.interview.batch.find((item) => item.id === questionId)
    if (!question) return Effect.succeed(refused(questionId, "not an open question in the current interview batch"))
    return draftOne(services, input, question).pipe(
      Effect.catch((error) => Effect.succeed(refused(questionId, firstLine(error)))),
    )
  })
  return { state: "ok", drafted } as DelegateResult
})

const draftOne = Effect.fn("AtlasDelegate.draftOne")(function* (
  services: DelegateServices,
  input: DelegateInput,
  question: AtlasInterviewQuestion,
) {
  const reply = yield* services.draft(delegatePrompt(question))
  if (!reply || !reply.answer.trim())
    return refused(question.id, "the model did not reply with a non-empty answer and why")
  const written = yield* services.atlas.answer({
    questionId: question.id,
    answer: reply.answer.trim(),
    drafted: { model: `${input.providerID}/${input.modelID}`, why: reply.why.trim() },
  })
  if (written.state === "empty") return refused(question.id, "the Atlas store is gone")
  if (!written.ok) return refused(question.id, written.rejected ?? "the surface refused the draft")
  return { questionId: question.id, ok: true, rejected: null }
})

function delegatePrompt(question: AtlasInterviewQuestion) {
  return [
    `Question (${question.kind}): ${question.ask}`,
    `Subject: ${question.subject}`,
    `Site: ${question.site}`,
    ...(question.options
      ? [
          `Options: ${question.options.join(", ")}`,
          "The answer must be exactly one of these option strings, and nothing else.",
        ]
      : []),
    "Reply with a JSON object with two string fields: answer and why.",
  ].join("\n")
}

function refused(questionId: string, rejected: string): Drafted {
  return { questionId, ok: false, rejected }
}

// Genesis mining from the screen (DECISIONS.md D40). The boundary lists the sites the advisory pass visits with the
// exact prompt `atlas mine` would send; the host asks the chosen model once per site, four at a time, as plain text;
// the boundary runs the pass again answering each site from those replies, through Atlas's own answer gate and
// admission, and stages the candidates. A site whose call fails is left out and abstains. Nothing is promoted.

export type MineInput = { readonly providerID: string; readonly modelID: string; readonly ceiling: number }

// An empty system prompt would fall back to the model's general coding prompt.
export const MINE_SYSTEM =
  "You read one unit of a codebase and follow the message's instructions exactly. A program reads your reply, so reply only in the format the message asks for."

export type MineServices = {
  readonly atlas: Pick<Interface, "mineSites" | "mineWith">
  /** Resolves the chosen model once; its failure fails the whole run. The returned call answers one site's prompt. */
  readonly model: Effect.Effect<(prompt: string) => Effect.Effect<string, unknown>, unknown>
}

export const mine = Effect.fn("AtlasMine.mine")(function* (services: MineServices, input: MineInput) {
  const ceiling = Math.min(200, Math.max(1, Math.floor(input.ceiling)))
  const listed = yield* services.atlas.mineSites(ceiling)
  if (listed.state === "empty") return listed
  const ask = yield* services.model.pipe(Effect.mapError((error) => new Unavailable({ message: firstLine(error) })))
  const replies = yield* Effect.forEach(
    listed.sites,
    (site) =>
      ask(site.prompt).pipe(
        Effect.map((text) => [[site.key, text] as const]),
        Effect.catch((error) =>
          Effect.logWarning("Atlas mine: the model call failed; the site abstains", {
            site: site.key,
            error: firstLine(error),
          }).pipe(Effect.as([])),
        ),
      ),
    { concurrency: 4 },
  )
  return yield* services.atlas.mineWith({
    ceiling,
    answers: Object.fromEntries(replies.flat()),
    model: `${input.providerID}/${input.modelID}`,
  })
})

export function firstLine(error: unknown) {
  const text = error instanceof Error && error.message ? error.message : String(error)
  return text.split("\n")[0]!.slice(0, 300)
}
