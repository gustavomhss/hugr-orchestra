import { array, check, locationData, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

const missingSource = route("/api/rag-studio/sources/{sourceId}", { sourceId: "src_httpapi_missing" })
const missingRevision = route("/api/rag-studio/revisions/{revisionId}", { revisionId: "rev_httpapi_missing" })
const missingQuestion = route("/api/rag-studio/questions/{questionId}", { questionId: "q_httpapi_missing" })

function rejected(body: unknown) {
  object(body)
  check(body._tag === "InvalidRequestError" && body.message === "rejected", "a missing id is rejected, not invented")
}

export const ragStudioScenarios: Scenario[] = [
  http.protected.get("/api/rag-studio/sources", "v2.ragStudio.sources").json(200, locationData(array)),
  http.protected
    .get("/api/rag-studio/sources/{sourceId}", "v2.ragStudio.source")
    .at((ctx) => ({ path: missingSource, headers: ctx.headers() }))
    .json(400, rejected),
  http.protected
    .post("/api/rag-studio/sources", "v2.ragStudio.admit")
    .at((ctx) => ({
      path: "/api/rag-studio/sources",
      headers: ctx.headers(),
      body: { path: `${ctx.directory}/note.txt` },
    }))
    .json(200, locationData((value) => {
      object(value)
      check(value.refused === "atlas", "a path inside the project stays in Atlas")
    })),
  http.protected
    .delete("/api/rag-studio/sources/{sourceId}", "v2.ragStudio.remove")
    .at((ctx) => ({ path: missingSource, headers: ctx.headers() }))
    .status(204, undefined, "status"),
  http.protected
    .post("/api/rag-studio/sources/{sourceId}/parse", "v2.ragStudio.parse")
    .at((ctx) => ({ path: `${missingSource}/parse`, headers: ctx.headers() }))
    .json(400, rejected),
  http.protected.get("/api/rag-studio/pipeline", "v2.ragStudio.pipeline").json(
    200,
    locationData((value) => {
      object(value)
      check(value.embedding === false && value.lexical === true, "embedding stays off")
      check(value.k === 4 && value.boundary === "document", "the default cut is the whole document")
    }),
  ),
  http.protected
    .patch("/api/rag-studio/pipeline", "v2.ragStudio.pipelineUpdate")
    .mutating()
    .at((ctx) => ({
      path: "/api/rag-studio/pipeline",
      headers: ctx.headers(),
      body: { field: "k", value: 2 },
    }))
    .json(
      200,
      locationData((value) => {
        object(value)
        check(value.k === 2 && value.embedding === false, "only the named field changes, and embedding stays off")
      }),
      "status",
    ),
  http.protected
    .post("/api/rag-studio/revisions", "v2.ragStudio.revision")
    .mutating()
    .json(
      200,
      locationData((value) => {
        object(value)
        check(typeof value.id === "string" && value.fill === "complete", "an empty location still opens a complete revision")
      }),
      "status",
    ),
  http.protected
    .get("/api/rag-studio/revisions/{revisionId}", "v2.ragStudio.revisionRead")
    .at((ctx) => ({ path: missingRevision, headers: ctx.headers() }))
    .json(400, rejected),
  http.protected
    .post("/api/rag-studio/search", "v2.ragStudio.search")
    .at((ctx) => ({
      path: "/api/rag-studio/search",
      headers: ctx.headers(),
      body: { revisionId: "rev_httpapi_missing", word: "beta" },
    }))
    .json(400, rejected),
  http.protected
    .post("/api/rag-studio/ask", "v2.ragStudio.ask")
    .at((ctx) => ({
      path: "/api/rag-studio/ask",
      headers: ctx.headers(),
      body: { revisionId: "rev_httpapi_missing", text: "beta" },
    }))
    .json(400, rejected),
  http.protected
    .post("/api/rag-studio/questions", "v2.ragStudio.question")
    .at((ctx) => ({
      path: "/api/rag-studio/questions",
      headers: ctx.headers(),
      body: {
        revisionId: "rev_httpapi_missing",
        text: "beta",
        span: { sourceId: "src_httpapi_missing", start: 0, end: 4 },
      },
    }))
    .json(400, rejected),
  http.protected
    .post("/api/rag-studio/questions/{questionId}/retrieval", "v2.ragStudio.retrieval")
    .at((ctx) => ({
      path: `${missingQuestion}/retrieval`,
      headers: ctx.headers(),
      body: { revisionId: "rev_httpapi_missing" },
    }))
    .json(200, locationData((value) => {
      object(value)
      check(value.ok === false, "a missing question is not a retrieval hit")
    })),
  http.protected
    .post("/api/rag-studio/questions/{questionId}/citation", "v2.ragStudio.citation")
    .at((ctx) => ({
      path: `${missingQuestion}/citation`,
      headers: ctx.headers(),
      body: { sentence: "beta" },
    }))
    .json(200, locationData((value) => {
      object(value)
      check(value.ok === false, "a missing question is not a citation")
    })),
  http.protected
    .post("/api/rag-studio/compare", "v2.ragStudio.compare")
    .at((ctx) => ({
      path: "/api/rag-studio/compare",
      headers: ctx.headers(),
      body: { leftId: "rev_a", rightId: "rev_b", proofSetId: "other" },
    }))
    .json(200, locationData((value) => {
      object(value)
      check(value.rejected === true, "revisions that were never opened cannot be compared")
    })),
  http.protected.post("/api/rag-studio/embedding", "v2.ragStudio.embedding").json(
    200,
    locationData((value) => {
      object(value)
      check(value.refused === "embedding_off", "embedding stays off")
    }),
  ),
  http.protected
    .post("/api/rag-studio/passes", "v2.ragStudio.pass")
    .at((ctx) => ({
      path: "/api/rag-studio/passes",
      headers: ctx.headers(),
      body: { pass: "redo_numbers", sourceId: "src_httpapi_missing" },
    }))
    .json(200, locationData((value) => {
      object(value)
      check(value.pass === "redo_numbers" && value.result === "not_applicable", "redo numbers writes nothing")
    })),
  http.protected
    .post("/api/rag-studio/passes/batch", "v2.ragStudio.passes")
    .at((ctx) => ({
      path: "/api/rag-studio/passes/batch",
      headers: ctx.headers(),
      body: { passes: ["reparse", "rechunk"] },
    }))
    .json(200, locationData((value) => {
      object(value)
      check(value.refused === "one_pass", "two passes do not run")
    })),
]
