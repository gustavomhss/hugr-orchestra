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
  AtlasHoldInput,
  AtlasMemoryDecideInput,
  AtlasProposeInput,
  AtlasReleaseInput,
  AtlasTerritoryInput,
} from "@orchestra/schema/atlas-review"
import { AtlasMineInput } from "@orchestra/schema/atlas-setup"
import {
  AtlasDelegateResult,
  AtlasDraftInput,
  AtlasDraftResult,
  AtlasEmitInput,
  AtlasEmitResult,
  AtlasHealthResult,
  AtlasIndexResult,
  AtlasInstall,
  AtlasLinkInput,
  AtlasLinkResult,
  AtlasMineResult,
  AtlasOwnResult,
  AtlasPromoteInput,
  AtlasPromoteResult,
  AtlasReasoningResult,
  AtlasReviewResult,
  AtlasReviewWriteResult,
  AtlasSnapshotResult,
  AtlasVerifyInput,
  AtlasVerifyResult,
} from "@orchestra/schema/atlas-screen"

// The Atlas screen's legacy routes: reads and writes over the instance's Atlas store through the boundary's
// `./surface` entry (server/atlas-surface.ts). The wire shapes live in @orchestra/schema/atlas-screen, shared with V2.

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
  install: `${root}/install`,
  index: `${root}/index`,
  mine: `${root}/mine`,
} as const

export const AtlasOwnQuery = Schema.Struct({ ...WorkspaceRoutingQueryFields, scope: Schema.String })
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
          doc("atlas.own", "Get an Atlas own briefing", "The live own briefing Atlas composes for one scope."),
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
          doc(
            "atlas.hold",
            "Hold a staged Atlas candidate",
            "Every promote skips a held candidate until it is released.",
          ),
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
          doc(
            "atlas.propose",
            "Propose an Atlas tier raise",
            "Record a proposal to raise a fact to T1 or T0 for a person to decide.",
          ),
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
        HttpApiEndpoint.post("install", AtlasPaths.install, {
          query: WorkspaceRoutingQuery,
          success: AtlasInstall,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.install",
            "Set Atlas up in this project",
            "Create the store, write a policy granting the acting person every scope, and make git ignore the store.",
          ),
        ),
        HttpApiEndpoint.post("index", AtlasPaths.index, {
          query: WorkspaceRoutingQuery,
          success: AtlasIndexResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.index",
            "Index the project's code for Atlas",
            "Run the SCIP indexer the store's plan names, from the project root, and report the result.",
          ),
        ),
        HttpApiEndpoint.post("mine", AtlasPaths.mine, {
          query: WorkspaceRoutingQuery,
          payload: AtlasMineInput,
          success: AtlasMineResult,
          error: ServiceUnavailableError,
        }).annotateMerge(
          doc(
            "atlas.mine",
            "Mine candidate facts with a model",
            "Ask a model about each site Genesis ranks and stage the facts that pass admission as candidates.",
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
