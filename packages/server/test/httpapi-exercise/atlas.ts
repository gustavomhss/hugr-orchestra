import { check, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Atlas screen routes (/atlas/* and V2 /api/atlas/*). The scenario project has no `.atlas/` store, so every route answers
// `{ state: "empty" }`; the store-backed answers are covered by test/server/atlas-httpapi.test.ts.
function empty(body: unknown) {
  object(body)
  check(body.state === "empty", "a project without an Atlas store should answer empty")
}

function installed(body: unknown) {
  object(body)
  check(body.state === "ok", "install answers ok, whether it set Atlas up or refused")
}

function data(inner: (body: unknown) => void) {
  return (body: unknown) => {
    object(body)
    object(body.location)
    inner(body.data)
  }
}

export const atlasScenarios: Scenario[] = [
  // V2: the same routes in the requested Location, each answer wrapped with that Location.
  http.protected.get("/api/atlas/snapshot", "v2.atlas.snapshot").json(200, data(empty), "status"),
  http.protected
    .get("/api/atlas/reasoning/{id}", "v2.atlas.reasoning")
    .at((ctx) => ({ path: route("/api/atlas/reasoning/{id}", { id: "abc" }), headers: ctx.headers() }))
    .json(200, data(empty), "status"),
  http.protected
    .get("/api/atlas/own", "v2.atlas.own")
    .at((ctx) => ({ path: "/api/atlas/own?scope=src", headers: ctx.headers() }))
    .json(200, data(empty), "status"),
  http.protected.get("/api/atlas/health", "v2.atlas.health").json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/promote", "v2.atlas.promote")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/promote", headers: ctx.headers(), body: {} }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/draft", "v2.atlas.draft")
    .at((ctx) => ({
      path: "/api/atlas/draft",
      headers: ctx.headers(),
      body: { anchor: "src/a.ts", slot: "invariant", claim: "x" },
    }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/emit", "v2.atlas.emit")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/emit", headers: ctx.headers(), body: { fact: {}, at: "abc" } }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/link", "v2.atlas.link")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/link", headers: ctx.headers(), body: { a: "x", b: "y" } }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/verify", "v2.atlas.verify")
    .at((ctx) => ({
      path: "/api/atlas/verify",
      headers: ctx.headers(),
      body: { kind: "dependency", target: "x", scope: "src" },
    }))
    .json(200, data(empty), "status"),
  http.protected.get("/api/atlas/review", "v2.atlas.review").json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/hold", "v2.atlas.hold")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/hold", headers: ctx.headers(), body: { nodeKey: "k1" } }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/release", "v2.atlas.release")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/release", headers: ctx.headers(), body: { nodeKey: "k1" } }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/propose", "v2.atlas.propose")
    .mutating()
    .at((ctx) => ({
      path: "/api/atlas/propose",
      headers: ctx.headers(),
      body: { nodeKey: "k1", toTier: "T1", reason: "r" },
    }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/decide", "v2.atlas.decide")
    .mutating()
    .at((ctx) => ({
      path: "/api/atlas/decide",
      headers: ctx.headers(),
      body: { proposalId: "p1", verdict: "rejected", reason: "r" },
    }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/answer", "v2.atlas.answer")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/answer", headers: ctx.headers(), body: { questionId: "q1", answer: "a" } }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/memory-decide", "v2.atlas.memoryDecide")
    .mutating()
    .at((ctx) => ({
      path: "/api/atlas/memory-decide",
      headers: ctx.headers(),
      body: { proposalId: "p1", verdict: "discarded" },
    }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/territory", "v2.atlas.territory")
    .mutating()
    .at((ctx) => ({
      path: "/api/atlas/territory",
      headers: ctx.headers(),
      body: { name: "t", owner: "o", tier: "T1", globs: ["src/**"] },
    }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/delegate", "v2.atlas.delegate")
    .mutating()
    .at((ctx) => ({
      path: "/api/atlas/delegate",
      headers: ctx.headers(),
      body: { questionIds: ["q1"], providerID: "openai", modelID: "gpt-5.2" },
    }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/index", "v2.atlas.index")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/index", headers: ctx.headers(), body: {} }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/mine", "v2.atlas.mine")
    .mutating()
    .at((ctx) => ({
      path: "/api/atlas/mine",
      headers: ctx.headers(),
      body: { providerID: "openai", modelID: "gpt-5.2", ceiling: 5 },
    }))
    .json(200, data(empty), "status"),
  http.protected
    .post("/api/atlas/install", "v2.atlas.install")
    .mutating()
    .at((ctx) => ({ path: "/api/atlas/install", headers: ctx.headers(), body: {} }))
    .json(200, data(installed), "status"),
]
