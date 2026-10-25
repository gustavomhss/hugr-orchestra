import { check, object } from "./assertions"
import { http, route } from "./dsl"
import type { Scenario } from "./types"

const artifactPath = "/api/session/{sessionID}/research/{artifactID}"
const artifactID = "cart_00000000000000000000000000"
const probe = { path: `/api/session/ses_httpapi_missing/research/${artifactID}?revision=1` }

// Admitting a research artifact needs a retained task binding and a `research_record` tool invocation, and neither has
// an HTTP surface. Core's research tests cover the admitted pages; these scenarios cover what the route itself decides
// when no artifact is admitted: refusals and query validation.
export const researchArtifactScenarios: Scenario[] = [
  http.protected
    .get(artifactPath, "v2.research.artifact.missing-session")
    .probe(probe)
    .at((ctx) => ({
      path: `${route(artifactPath, { sessionID: "ses_httpapi_missing", artifactID })}?revision=1`,
      headers: ctx.headers(),
    }))
    .json(
      404,
      (body) => {
        object(body)
        check(body._tag === "SessionNotFoundError", "a missing session should map to the declared session 404")
      },
      "status",
    ),
  http.protected
    .get(artifactPath, "v2.research.artifact.unbound-session")
    .probe(probe)
    .seeded((ctx) => ctx.session())
    .at((ctx) => ({
      path: `${route(artifactPath, { sessionID: ctx.state.id, artifactID })}?revision=1`,
      headers: ctx.headers(),
    }))
    .json(404, notFound, "status"),
  ...[undefined, "0", "-1", "1.5", "not-a-number"].map((revision) =>
    http.protected
      .get(artifactPath, `v2.research.artifact.revision-invalid.${revision ?? "missing"}`)
      .probe(probe)
      .seeded((ctx) => ctx.session())
      .at((ctx) => ({
        path:
          route(artifactPath, { sessionID: ctx.state.id, artifactID }) +
          (revision === undefined ? "" : `?revision=${revision}`),
        headers: ctx.headers(),
      }))
      .json(
        400,
        (body) => {
          object(body)
          check(
            body._tag === "InvalidRequestError" && body.kind === "Query",
            "revision decoding should return declared query validation error",
          )
        },
        "status",
      ),
  ),
]

function notFound(body: unknown) {
  object(body)
  check(
    body._tag === "ResearchArtifactNotFoundError",
    "unadmitted or foreign artifact should map to declared research 404",
  )
  check(
    body.message === "Research artifact not found",
    "research 404 should not disclose retained placement or bytes",
  )
}
