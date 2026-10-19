import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ServiceUnavailableError } from "../errors"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import {
  AtlasAnswerInput,
  AtlasDecideInput,
  AtlasDelegateInput,
  AtlasDelegateOk,
  AtlasHoldInput,
  AtlasMemoryDecideInput,
  AtlasProposeInput,
  AtlasReleaseInput,
  AtlasReview,
  AtlasTerritoryInput,
} from "./atlas-review"

// The Atlas screen's routes: reads and writes over the instance's Atlas store through the boundary's `./surface`
// entry (server/atlas-surface.ts). The schemas transcribe modules/atlas/packages/adapter-io/src/surface/types.ts and
// types-memory.ts field for field; a repository with no `.atlas/` answers `{ state: "empty" }` on every route.

const root = "/atlas"

export const AtlasPaths = {
  snapshot: `${root}/snapshot`,
  reasoning: `${root}/reasoning/:id`,
  own: `${root}/own`,
  health: `${root}/health`,
  promote: `${root}/promote`,
  draft: `${root}/draft`,
  emit: `${root}/emit`,
  link: `${root}/link`,
  verify: `${root}/verify`,
  review: `${root}/review`,
  hold: `${root}/hold`,
  release: `${root}/release`,
  propose: `${root}/propose`,
  decide: `${root}/decide`,
  answer: `${root}/answer`,
  memoryDecide: `${root}/memory-decide`,
  territory: `${root}/territory`,
  delegate: `${root}/delegate`,
} as const

export const AtlasEmpty = Schema.Struct({ state: Schema.Literal("empty") }).annotate({ identifier: "AtlasEmpty" })

const Strings = Schema.Array(Schema.String)

export const AtlasDrift = Schema.Struct({
  hunks: Schema.Array(Schema.Struct({ at: Schema.String, lines: Strings })),
  stat: Schema.String,
  commits: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
}).annotate({ identifier: "AtlasDrift" })

export const AtlasFact = Schema.Struct({
  key: Schema.String,
  hash: Schema.String,
  claim: Schema.String,
  file: Schema.String,
  family: Schema.String,
  tier: Schema.String,
  scope: Schema.String,
  derivedAt: Schema.String,
  subtree: Schema.String,
  obvious: Schema.NullOr(Schema.String),
  promoted: Schema.Boolean,
  why: Schema.NullOr(Schema.String),
  kind: Schema.NullOr(Schema.String),
  authoring: Schema.NullOr(Schema.String),
  storedFreshness: Schema.NullOr(Schema.String),
  obviousBy: Schema.NullOr(Schema.String),
  anchor: Schema.NullOr(Schema.Struct({ kind: Schema.String, qualifiedPath: Schema.String })),
  slot: Schema.NullOr(Schema.String),
  seal: Schema.NullOr(Schema.String),
  supersededBy: Schema.NullOr(Schema.String),
  sameAs: Schema.NullOr(Strings),
  provenance: Schema.NullOr(
    Schema.Record(
      Schema.String,
      Schema.Struct({ source: Schema.String, trusted: Schema.Boolean, sha: Schema.optional(Schema.String) }),
    ),
  ),
  drift: Schema.optional(AtlasDrift),
}).annotate({ identifier: "AtlasFact" })

export const AtlasOwnSnapshot = Schema.Struct({
  status: Schema.Literals(["READY", "HOLD"]),
  reason: Schema.NullOr(Schema.String),
  snapshot: Schema.NullOr(Schema.String),
  sourceRevision: Schema.NullOr(Schema.String),
  sourcePaths: Strings,
  units: Schema.Array(Schema.Unknown),
  coverage: Schema.NullOr(
    Schema.Struct({ snapshot: Schema.String, sourceRevision: Schema.String, units: Strings }),
  ),
  skills: Schema.Array(Schema.Struct({ path: Schema.String, size: Schema.Finite, head: Schema.String })),
}).annotate({ identifier: "AtlasOwnSnapshot" })

export const AtlasMemoryRecord = Schema.Struct({
  eventId: Schema.String,
  seq: Schema.Finite,
  member: Schema.String,
  kind: Schema.String,
  text: Schema.String,
  scope: Schema.NullOr(Schema.String),
  at: Schema.NullOr(Schema.String),
  refs: Strings,
  entry: Schema.Unknown,
}).annotate({ identifier: "AtlasMemoryRecord" })

export const AtlasOrientationEvent = Schema.Struct({
  eventId: Schema.String,
  seq: Schema.Finite,
  channel: Schema.String,
  label: Schema.String,
  supersedes: Strings,
}).annotate({ identifier: "AtlasOrientationEvent" })

export const AtlasTerritory = Schema.Struct({
  name: Schema.String,
  owner: Schema.String,
  tier: Schema.String,
  globs: Strings,
}).annotate({ identifier: "AtlasTerritory" })

export const AtlasSnapshot = Schema.Struct({
  state: Schema.Literal("ok"),
  project: Schema.String,
  head: Schema.String,
  builtAt: Schema.String,
  gen: Schema.Finite,
  stagingGen: Schema.Finite,
  identity: Schema.NullOr(Schema.String),
  casObjects: Schema.Finite,
  policy: Schema.Record(Schema.String, Strings),
  t0Keywords: Strings,
  scip: Schema.Boolean,
  tracked: Schema.Struct({
    projection: Schema.Boolean,
    cas: Schema.Finite,
    staging: Schema.Boolean,
    policy: Schema.Boolean,
    memory: Schema.Boolean,
  }),
  sealed: Schema.Finite,
  casAudit: Schema.Struct({
    objects: Schema.Finite,
    referenced: Schema.Finite,
    missing: Schema.Finite,
    orphan: Schema.Finite,
  }),
  generations: Strings,
  abstained: Schema.Finite,
  langs: Schema.Record(Schema.String, Schema.Finite),
  facts: Schema.Array(AtlasFact),
  candidates: Schema.Array(AtlasFact),
  dependents: Schema.Record(Schema.String, Strings),
  dependentCount: Schema.Record(Schema.String, Schema.Finite),
  children: Schema.Record(Schema.String, Strings),
  own: Schema.NullOr(AtlasOwnSnapshot),
  memory: Schema.Record(Schema.String, Schema.Array(AtlasMemoryRecord)),
  orientation: Schema.Array(AtlasOrientationEvent),
  territories: Schema.Array(AtlasTerritory),
}).annotate({ identifier: "AtlasSnapshot" })

export const AtlasSnapshotResult = Schema.Union([AtlasEmpty, AtlasSnapshot]).annotate({
  identifier: "AtlasSnapshotResult",
})

export const AtlasReasoningResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({ state: Schema.Literal("ok"), id: Schema.String, text: Schema.String }),
  Schema.Struct({ state: Schema.Literal("missing"), id: Schema.String }),
]).annotate({ identifier: "AtlasReasoningResult" })

export const AtlasOwnResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    state: Schema.Literal("ok"),
    scope: Schema.String,
    tool: Schema.String,
    pack: Schema.Unknown,
    readRefusal: Schema.NullOr(Schema.String),
  }).annotate({ identifier: "AtlasOwn" }),
]).annotate({ identifier: "AtlasOwnResult" })

const AtlasPlannedLang = Schema.Struct({
  plan: Schema.Struct({
    lang: Schema.String,
    tool: Schema.String,
    args: Strings,
    version: Schema.optional(Schema.String),
  }),
  files: Schema.Finite,
})

export const AtlasHealth = Schema.Struct({
  state: Schema.Literal("ok"),
  actor: Schema.String,
  provenance: Schema.Literals(["trusted", "tracked-staging", "tracked-provable"]),
  readRefusal: Schema.NullOr(Schema.String),
  readAdvisory: Schema.NullOr(Schema.String),
  cas: Schema.Struct({
    objects: Schema.Finite,
    corrupt: Strings,
    unreadable: Strings,
    missing: Strings,
    orphan: Schema.Finite,
    referenced: Schema.Finite,
    sound: Schema.Boolean,
  }),
  proofs: Schema.Struct({
    sealedProven: Schema.Finite,
    reProven: Schema.Finite,
    broken: Schema.Finite,
    unverifiable: Schema.Finite,
    dangling: Schema.Finite,
  }),
  index: Schema.Struct({
    scipRel: Schema.String,
    scip: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("absent") }),
      Schema.Struct({ kind: Schema.Literal("unreadable"), reason: Schema.String }),
      Schema.Struct({ kind: Schema.Literal("present"), documents: Schema.Finite }),
    ]),
    configured: Schema.Array(AtlasPlannedLang),
    holes: Schema.Array(AtlasPlannedLang),
  }),
  hotSet: Schema.Finite,
}).annotate({ identifier: "AtlasHealth" })

export const AtlasHealthResult = Schema.Union([AtlasEmpty, AtlasHealth]).annotate({ identifier: "AtlasHealthResult" })

export const AtlasPromoteResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    state: Schema.Literal("ok"),
    read: Schema.Boolean,
    refusal: Schema.optional(Schema.Literals(["contended", "unreadable", "untrusted"])),
    candidates: Schema.Finite,
    promoted: Schema.Finite,
    refused: Schema.Finite,
    rows: Schema.Array(
      Schema.Struct({
        nodeKey: Schema.String,
        settled: Schema.Boolean,
        id: Schema.optional(Schema.String),
        rejected: Schema.optional(Schema.String),
      }),
    ),
    held: Schema.optional(Strings),
    unknown: Schema.optional(Strings),
  }).annotate({ identifier: "AtlasPromote" }),
]).annotate({ identifier: "AtlasPromoteResult" })

/** The fields every door verdict carries (surface `AtlasVerdict`); each verdict struct adds its own `data`. */
const VerdictFields = {
  state: Schema.Literal("ok"),
  ok: Schema.Boolean,
  rejected: Schema.optional(Schema.String),
  guidance: Schema.Struct({ next: Schema.String, invariant: Schema.String }),
}

export const AtlasDraftResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        draft: Schema.Struct({
          fact: Schema.Unknown,
          rev: Schema.String,
          operation: Schema.Literals(["CREATE", "UPDATE"]),
          route: Schema.Literals(["auto-accept", "full-ratify"]),
          requires: Schema.optional(Schema.String),
        }),
        check: Schema.NullOr(
          Schema.Struct({
            wouldEmit: Schema.Boolean,
            gates: Schema.Array(
              Schema.Struct({
                gate: Schema.Literals(["shape", "truth", "authz", "ratify"]),
                pass: Schema.Boolean,
                reason: Schema.optional(Schema.String),
                remedy: Schema.optional(Schema.String),
              }),
            ),
          }),
        ),
      }),
    ),
  }).annotate({ identifier: "AtlasDraft" }),
]).annotate({ identifier: "AtlasDraftResult" })

export const AtlasEmitResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        emitted: Schema.Boolean,
        id: Schema.optional(Schema.String),
        nodeKey: Schema.optional(Schema.String),
        rejected: Schema.optional(Schema.String),
      }),
    ),
  }).annotate({ identifier: "AtlasEmit" }),
]).annotate({ identifier: "AtlasEmitResult" })

export const AtlasLinkResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        linked: Schema.Boolean,
        rejected: Schema.optional(Schema.String),
        a: Schema.optional(Schema.String),
        b: Schema.optional(Schema.String),
        retracted: Schema.optional(Schema.Boolean),
      }),
    ),
  }).annotate({ identifier: "AtlasLink" }),
]).annotate({ identifier: "AtlasLinkResult" })

export const AtlasVerifyResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(
      Schema.Struct({
        kind: Schema.Literals(["dependency", "count", "definition", "negation"]),
        verdict: Schema.Literals(["proven", "refuted", "abstain"]),
        reason: Schema.optional(Schema.String),
        oracle: Schema.String,
        target: Schema.String,
        scope: Schema.String,
      }),
    ),
  }).annotate({ identifier: "AtlasVerify" }),
]).annotate({ identifier: "AtlasVerifyResult" })

export const AtlasReviewResult = Schema.Union([AtlasEmpty, AtlasReview]).annotate({ identifier: "AtlasReviewResult" })

/** Every review write (hold, release, propose, decide, answer, memory-decide, territory) answers this verdict. */
export const AtlasReviewWriteResult = Schema.Union([
  AtlasEmpty,
  Schema.Struct({
    ...VerdictFields,
    data: Schema.optional(Schema.Struct({ id: Schema.String })),
  }).annotate({ identifier: "AtlasReviewWrite" }),
]).annotate({ identifier: "AtlasReviewWriteResult" })

export const AtlasDelegateResult = Schema.Union([AtlasEmpty, AtlasDelegateOk]).annotate({
  identifier: "AtlasDelegateResult",
})

export const AtlasOwnQuery = Schema.Struct({ ...WorkspaceRoutingQueryFields, scope: Schema.String })
export const AtlasPromoteInput = Schema.Struct({
  token: Schema.optional(Schema.String),
  nodeKeys: Schema.optional(Schema.Array(Schema.String)),
})
export const AtlasDraftInput = Schema.Struct({
  anchor: Schema.String,
  slot: Schema.String,
  claim: Schema.String,
  supersede: Schema.optional(Schema.Boolean),
  token: Schema.optional(Schema.String),
})
export const AtlasEmitInput = Schema.Struct({
  fact: Schema.Unknown,
  at: Schema.String,
  token: Schema.optional(Schema.String),
})
export const AtlasLinkInput = Schema.Struct({
  a: Schema.String,
  b: Schema.String,
  retract: Schema.optional(Schema.Boolean),
  token: Schema.optional(Schema.String),
})
export const AtlasVerifyInput = Schema.Struct({
  kind: Schema.String,
  target: Schema.String,
  scope: Schema.String,
  world: Schema.optional(Schema.String),
  min: Schema.optional(Schema.Finite),
  exact: Schema.optional(Schema.Boolean),
})

const doc = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier, summary, description })

export const AtlasApi = HttpApi.make("atlas")
  .add(
    HttpApiGroup.make("atlas")
      .add(
        HttpApiEndpoint.get("snapshot", AtlasPaths.snapshot, {
          query: WorkspaceRoutingQuery,
          success: AtlasSnapshotResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.snapshot",
            "Get the Atlas snapshot",
            "Facts, candidates, drift, store files, dependents, the tree, committed Own, Memory and territories.",
          ),
        ),
        HttpApiEndpoint.get("reasoning", AtlasPaths.reasoning, {
          params: { id: Schema.String },
          query: WorkspaceRoutingQuery,
          success: AtlasReasoningResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.reasoning",
            "Get a staged fact's reasoning",
            "The model reasoning a staged row's answerRef names, by the fact's 12-character why.",
          ),
        ),
        HttpApiEndpoint.get("own", AtlasPaths.own, {
          query: AtlasOwnQuery,
          success: AtlasOwnResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.own",
            "Get an Atlas own briefing",
            "The live own briefing Atlas composes for one scope.",
          ),
        ),
        HttpApiEndpoint.get("health", AtlasPaths.health, {
          query: WorkspaceRoutingQuery,
          success: AtlasHealthResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.health",
            "Get Atlas store health",
            "Provenance, CAS audit, proof re-verification, index plan and hot-set size.",
          ),
        ),
        HttpApiEndpoint.post("promote", AtlasPaths.promote, {
          query: WorkspaceRoutingQuery,
          payload: AtlasPromoteInput,
          success: AtlasPromoteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.promote",
            "Promote staged Atlas candidates",
            "Present every staged row to the governed emit door, as atlas promote does.",
          ),
        ),
        HttpApiEndpoint.post("draft", AtlasPaths.draft, {
          query: WorkspaceRoutingQuery,
          payload: AtlasDraftInput,
          success: AtlasDraftResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.draft",
            "Draft and check an Atlas fact",
            "Compose a fact at an anchor and dry-run the emit gates; nothing is written.",
          ),
        ),
        HttpApiEndpoint.post("emit", AtlasPaths.emit, {
          query: WorkspaceRoutingQuery,
          payload: AtlasEmitInput,
          success: AtlasEmitResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.emit",
            "Emit an Atlas fact",
            "Write a drafted fact through the governed emit door at the draft's rev.",
          ),
        ),
        HttpApiEndpoint.post("link", AtlasPaths.link, {
          query: WorkspaceRoutingQuery,
          payload: AtlasLinkInput,
          success: AtlasLinkResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.link",
            "Link two Atlas facts",
            "Assert, or retract, that two facts are the same fact, through the governed link door.",
          ),
        ),
        HttpApiEndpoint.post("verify", AtlasPaths.verify, {
          query: WorkspaceRoutingQuery,
          payload: AtlasVerifyInput,
          success: AtlasVerifyResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.verify",
            "Verify a claim against the code index",
            "Prove, refute or abstain on a dependency, count, definition or negation claim; nothing is written.",
          ),
        ),
        HttpApiEndpoint.get("review", AtlasPaths.review, {
          query: WorkspaceRoutingQuery,
          success: AtlasReviewResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.review",
            "Get the Atlas review queue",
            "Held candidates, open tier proposals, open memory proposals and the interview batch with its drafts.",
          ),
        ),
        HttpApiEndpoint.post("hold", AtlasPaths.hold, {
          query: WorkspaceRoutingQuery,
          payload: AtlasHoldInput,
          success: AtlasReviewWriteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc("atlas.hold", "Hold a staged Atlas candidate", "Every promote skips a held candidate until it is released."),
        ),
        HttpApiEndpoint.post("release", AtlasPaths.release, {
          query: WorkspaceRoutingQuery,
          payload: AtlasReleaseInput,
          success: AtlasReviewWriteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc("atlas.release", "Release a held Atlas candidate", "The next promote presents the candidate again."),
        ),
        HttpApiEndpoint.post("propose", AtlasPaths.propose, {
          query: WorkspaceRoutingQuery,
          payload: AtlasProposeInput,
          success: AtlasReviewWriteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc("atlas.propose", "Propose an Atlas tier raise", "Record a proposal to raise a fact to T1 or T0 for a person to decide."),
        ),
        HttpApiEndpoint.post("decide", AtlasPaths.decide, {
          query: WorkspaceRoutingQuery,
          payload: AtlasDecideInput,
          success: AtlasReviewWriteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.decide",
            "Decide an Atlas tier proposal",
            "Ratify a proposal, re-emitting the fact at its tier through the governed emit door, or reject it.",
          ),
        ),
        HttpApiEndpoint.post("answer", AtlasPaths.answer, {
          query: WorkspaceRoutingQuery,
          payload: AtlasAnswerInput,
          success: AtlasReviewWriteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.answer",
            "Answer an Atlas interview question",
            "Record a person's answer, or a model's draft that keeps the question open until a person accepts it.",
          ),
        ),
        HttpApiEndpoint.post("memoryDecide", AtlasPaths.memoryDecide, {
          query: WorkspaceRoutingQuery,
          payload: AtlasMemoryDecideInput,
          success: AtlasReviewWriteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.memoryDecide",
            "Decide an Atlas memory proposal",
            "Index a proposed project rule into the member's memory, or discard it.",
          ),
        ),
        HttpApiEndpoint.post("territory", AtlasPaths.territory, {
          query: WorkspaceRoutingQuery,
          payload: AtlasTerritoryInput,
          success: AtlasReviewWriteResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.territory",
            "Declare an Atlas territory",
            "Write a territory, its owner, tier and globs to the territory catalog.",
          ),
        ),
        HttpApiEndpoint.post("delegate", AtlasPaths.delegate, {
          query: WorkspaceRoutingQuery,
          payload: AtlasDelegateInput,
          success: AtlasDelegateResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.delegate",
            "Delegate Atlas interview questions to a model",
            "A model drafts an answer to each open question; each draft keeps its question open until a person accepts it.",
          ),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({ title: "atlas", description: "Atlas screen routes over the instance's Atlas store." }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "orchestra experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
