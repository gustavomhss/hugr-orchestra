import { check, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Atlas screen routes (/atlas/*). The scenario project has no `.atlas/` store, so every route answers
// `{ state: "empty" }`; the store-backed answers are covered by test/server/atlas-httpapi.test.ts.
function empty(body: unknown) {
  object(body)
  check(body.state === "empty", "a project without an Atlas store should answer empty")
}

export const atlasScenarios: Scenario[] = [
  http.protected.get("/atlas/snapshot", "atlas.snapshot").json(200, empty, "status"),
  http.protected
    .get("/atlas/reasoning/{id}", "atlas.reasoning")
    .at((ctx) => ({ path: route("/atlas/reasoning/{id}", { id: "abc" }), headers: ctx.headers() }))
    .json(200, empty, "status"),
  http.protected
    .get("/atlas/own", "atlas.own")
    .at((ctx) => ({ path: "/atlas/own?scope=src", headers: ctx.headers() }))
    .json(200, empty, "status"),
  http.protected.get("/atlas/health", "atlas.health").json(200, empty, "status"),
  http.protected
    .post("/atlas/promote", "atlas.promote")
    .mutating()
    .at((ctx) => ({ path: "/atlas/promote", headers: ctx.headers(), body: {} }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/draft", "atlas.draft")
    .at((ctx) => ({
      path: "/atlas/draft",
      headers: ctx.headers(),
      body: { anchor: "src/a.ts", slot: "invariant", claim: "x" },
    }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/emit", "atlas.emit")
    .mutating()
    .at((ctx) => ({ path: "/atlas/emit", headers: ctx.headers(), body: { fact: {}, at: "abc" } }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/link", "atlas.link")
    .mutating()
    .at((ctx) => ({ path: "/atlas/link", headers: ctx.headers(), body: { a: "x", b: "y" } }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/verify", "atlas.verify")
    .at((ctx) => ({
      path: "/atlas/verify",
      headers: ctx.headers(),
      body: { kind: "dependency", target: "x", scope: "src" },
    }))
    .json(200, empty, "status"),
]
