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
import { AtlasMineInput } from "@orchestra/schema/atlas-setup"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ServiceUnavailableError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

// The Atlas screen over the requested Location's Atlas store: the legacy `/atlas/*` instance routes with the same wire
// shapes (an absent value is `null`, never omitted). A repository with no `.atlas/` answers `{ state: "empty" }`.
export const AtlasGroup = HttpApiGroup.make("server.atlas")
  .add(
    HttpApiEndpoint.get("atlas.snapshot", "/api/atlas/snapshot", {
      query: LocationQuery,
      success: Location.response(AtlasSnapshotResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.snapshot",
          summary: "Get the Atlas snapshot",
          description:
            "Facts, candidates, drift, store files, dependents, the tree, committed Own, Memory and territories.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("atlas.reasoning", "/api/atlas/reasoning/:id", {
      params: { id: Schema.String },
      query: LocationQuery,
      success: Location.response(AtlasReasoningResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.reasoning",
          summary: "Get a staged fact's reasoning",
          description: "The model reasoning a staged row's answerRef names, by the fact's 12-character why.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("atlas.own", "/api/atlas/own", {
      query: Schema.Struct({ ...LocationQuery.fields, scope: Schema.String }),
      success: Location.response(AtlasOwnResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.own",
          summary: "Get an Atlas own briefing",
          description: "The live own briefing Atlas composes for one scope.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("atlas.health", "/api/atlas/health", {
      query: LocationQuery,
      success: Location.response(AtlasHealthResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.health",
          summary: "Get Atlas store health",
          description: "Provenance, CAS audit, proof re-verification, index plan and hot-set size.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.promote", "/api/atlas/promote", {
      query: LocationQuery,
      payload: AtlasPromoteInput,
      success: Location.response(AtlasPromoteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.promote",
          summary: "Promote staged Atlas candidates",
          description: "Present every staged row to the governed emit door, as atlas promote does.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.draft", "/api/atlas/draft", {
      query: LocationQuery,
      payload: AtlasDraftInput,
      success: Location.response(AtlasDraftResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.draft",
          summary: "Draft and check an Atlas fact",
          description: "Compose a fact at an anchor and dry-run the emit gates; nothing is written.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.emit", "/api/atlas/emit", {
      query: LocationQuery,
      payload: AtlasEmitInput,
      success: Location.response(AtlasEmitResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.emit",
          summary: "Emit an Atlas fact",
          description: "Write a drafted fact through the governed emit door at the draft's rev.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.link", "/api/atlas/link", {
      query: LocationQuery,
      payload: AtlasLinkInput,
      success: Location.response(AtlasLinkResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.link",
          summary: "Link two Atlas facts",
          description: "Assert, or retract, that two facts are the same fact, through the governed link door.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.verify", "/api/atlas/verify", {
      query: LocationQuery,
      payload: AtlasVerifyInput,
      success: Location.response(AtlasVerifyResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.verify",
          summary: "Verify a claim against the code index",
          description:
            "Prove, refute or abstain on a dependency, count, definition or negation claim; nothing is written.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("atlas.review", "/api/atlas/review", {
      query: LocationQuery,
      success: Location.response(AtlasReviewResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.review",
          summary: "Get the Atlas review queue",
          description:
            "Held candidates, open tier proposals, open memory proposals and the interview batch with its drafts.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.hold", "/api/atlas/hold", {
      query: LocationQuery,
      payload: AtlasHoldInput,
      success: Location.response(AtlasReviewWriteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.hold",
          summary: "Hold a staged Atlas candidate",
          description: "Every promote skips a held candidate until it is released.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.release", "/api/atlas/release", {
      query: LocationQuery,
      payload: AtlasReleaseInput,
      success: Location.response(AtlasReviewWriteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.release",
          summary: "Release a held Atlas candidate",
          description: "The next promote presents the candidate again.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.propose", "/api/atlas/propose", {
      query: LocationQuery,
      payload: AtlasProposeInput,
      success: Location.response(AtlasReviewWriteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.propose",
          summary: "Propose an Atlas tier raise",
          description: "Record a proposal to raise a fact to T1 or T0 for a person to decide.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.decide", "/api/atlas/decide", {
      query: LocationQuery,
      payload: AtlasDecideInput,
      success: Location.response(AtlasReviewWriteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.decide",
          summary: "Decide an Atlas tier proposal",
          description:
            "Ratify a proposal, re-emitting the fact at its tier through the governed emit door, or reject it.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.answer", "/api/atlas/answer", {
      query: LocationQuery,
      payload: AtlasAnswerInput,
      success: Location.response(AtlasReviewWriteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.answer",
          summary: "Answer an Atlas interview question",
          description:
            "Record a person's answer, or a model's draft that keeps the question open until a person accepts it.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.memoryDecide", "/api/atlas/memory-decide", {
      query: LocationQuery,
      payload: AtlasMemoryDecideInput,
      success: Location.response(AtlasReviewWriteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.memoryDecide",
          summary: "Decide an Atlas memory proposal",
          description: "Index a proposed project rule into the member's memory, or discard it.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.territory", "/api/atlas/territory", {
      query: LocationQuery,
      payload: AtlasTerritoryInput,
      success: Location.response(AtlasReviewWriteResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.territory",
          summary: "Declare an Atlas territory",
          description: "Write a territory, its owner, tier and globs to the territory catalog.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.delegate", "/api/atlas/delegate", {
      query: LocationQuery,
      payload: AtlasDelegateInput,
      success: Location.response(AtlasDelegateResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.delegate",
          summary: "Delegate Atlas interview questions to a model",
          description:
            "A model drafts an answer to each open question; each draft keeps its question open until a person accepts it.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.install", "/api/atlas/install", {
      query: LocationQuery,
      success: Location.response(AtlasInstall),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.install",
          summary: "Set Atlas up in this project",
          description:
            "Create the store, write a policy granting the acting person every scope, and make git ignore the store.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.index", "/api/atlas/index", {
      query: LocationQuery,
      success: Location.response(AtlasIndexResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.index",
          summary: "Index the project's code for Atlas",
          description: "Run the SCIP indexer the store's plan names, from the project root, and report the result.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("atlas.mine", "/api/atlas/mine", {
      query: LocationQuery,
      payload: AtlasMineInput,
      success: Location.response(AtlasMineResult),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.atlas.mine",
          summary: "Mine candidate facts with a model",
          description:
            "Ask a model about each site Genesis ranks and stage the facts that pass admission as candidates.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "atlas", description: "Atlas screen routes." }))
