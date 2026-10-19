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
  http.protected.get("/atlas/review", "atlas.review").json(200, empty, "status"),
  http.protected
    .post("/atlas/hold", "atlas.hold")
    .mutating()
    .at((ctx) => ({ path: "/atlas/hold", headers: ctx.headers(), body: { nodeKey: "k1" } }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/release", "atlas.release")
    .mutating()
    .at((ctx) => ({ path: "/atlas/release", headers: ctx.headers(), body: { nodeKey: "k1" } }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/propose", "atlas.propose")
    .mutating()
    .at((ctx) => ({
      path: "/atlas/propose",
      headers: ctx.headers(),
      body: { nodeKey: "k1", toTier: "T1", reason: "r" },
    }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/decide", "atlas.decide")
    .mutating()
    .at((ctx) => ({
      path: "/atlas/decide",
      headers: ctx.headers(),
      body: { proposalId: "p1", verdict: "rejected", reason: "r" },
    }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/answer", "atlas.answer")
    .mutating()
    .at((ctx) => ({ path: "/atlas/answer", headers: ctx.headers(), body: { questionId: "q1", answer: "a" } }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/memory-decide", "atlas.memoryDecide")
    .mutating()
    .at((ctx) => ({
      path: "/atlas/memory-decide",
      headers: ctx.headers(),
      body: { proposalId: "p1", verdict: "discarded" },
    }))
    .json(200, empty, "status"),
  http.protected
    .post("/atlas/territory", "atlas.territory")
    .mutating()
    .at((ctx) => ({
      path: "/atlas/territory",
      headers: ctx.headers(),
      body: { name: "t", owner: "o", tier: "T1", globs: ["src/**"] },
    }))
    .json(200, empty, "status"),
]
