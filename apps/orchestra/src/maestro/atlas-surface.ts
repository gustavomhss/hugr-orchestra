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
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Context, Effect, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"

// The host side of the Atlas screen. Each call opens the Atlas surface (the boundary's `./surface` entry) over the
// instance's store and runs one read or write in process. The surface is synchronous: `own`, `health` and every write
// compose Atlas's runtime, which walks the tracked tree, so those calls hold the fiber for as long as that takes.
// A throw (an unreadable store, a disk fault during a commit) becomes `Unavailable`, never a defect.

export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("AtlasSurface.Unavailable", {
  message: Schema.String,
}) {}

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
  readonly territory: (input: Omit<AtlasTerritoryInput, "projectId">) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/AtlasSurface") {}

// D5: the store lives at the instance worktree, or at the directory when the instance has no worktree ("/"), the same
// root `AtlasMemory.open` binds (maestro/atlas-memory.ts).
const run = <A>(name: string, call: (surface: ReturnType<typeof openSurface>) => A) =>
  Effect.gen(function* () {
    const ctx = yield* InstanceState.context
    const repoPath = ctx.worktree === "/" ? ctx.directory : ctx.worktree
    return yield* Effect.try({
      try: () => call(openSurface(repoPath)),
      catch: (cause) =>
        new Unavailable({
          message: (cause instanceof Error ? cause.message : String(cause)).split("\n")[0]!.slice(0, 300),
        }),
    })
  }).pipe(Effect.withSpan(`AtlasSurface.${name}`))

const layer = Layer.succeed(
  Service,
  Service.of({
    snapshot: () => run("snapshot", (surface) => surface.snapshot()),
    reasoning: (id) => run("reasoning", (surface) => surface.reasoning(id)),
    own: (scope) => run("own", (surface) => surface.own(scope)),
    health: () => run("health", (surface) => surface.health()),
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
    // The first territory catalog needs the Orchestra project id (issues/c-engine.md item 2). The client never sends
    // it: the host fills it from the instance, and an existing catalog of another project refuses the write.
    territory: (input) =>
      Effect.gen(function* () {
        const ctx = yield* InstanceState.context
        return yield* run("territory", (surface) => surface.territory({ ...input, projectId: ctx.project.id }))
      }),
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })

export * as AtlasSurface from "./atlas-surface"
