import { expect } from "bun:test"
import { CapabilityConnectionVerification } from "@orchestra/core/capability/connection/verify"
import { Failure } from "@orchestra/core/capability/channel/http"
import { Capability } from "@orchestra/schema/capability"
import type { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Cause, Context, Deferred, Effect, Exit, Fiber } from "effect"
import { it } from "./lib/effect"

const key = "fixture-only-identity-secret"
const slack = { ok: true, team_id: "T123", user_id: "U456", bot_id: "B789" }

function fixture(fetch: (request: Request) => Response | Promise<Response>, options: CapabilityConnectionVerification.Options = {}) {
  return Effect.gen(function* () {
    const seen: { path: string; method: string; authorization: string | null; body: string; contentType: string | null }[] = []
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        seen.push({ path: new URL(request.url).pathname + new URL(request.url).search, method: request.method,
          authorization: request.headers.get("authorization"), body: await request.clone().text(),
          contentType: request.headers.get("content-type") })
        return fetch(request)
      },
    })), (server) => Effect.promise(() => server.stop(true)))
    const verifier = yield* CapabilityConnectionVerification.make({ ...options, fixtureOrigin: server.url.origin })
    return { server, verifier, seen }
  })
}

function rejected<A, E>(exit: Exit.Exit<A, E>, code: Capability.ErrorCode) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("VERIFICATION_ACCEPTED_INVALID_INPUT")
  expect(exit.cause.reasons.length).toBeGreaterThan(0)
  exit.cause.reasons.forEach((reason) => {
    expect(Cause.isFailReason(reason)).toBe(true)
    if (!Cause.isFailReason(reason)) throw new Error("UNEXPECTED_VERIFICATION_CAUSE")
    expect(reason.error).toBeInstanceOf(Capability.Failure)
    expect(reason.error).toMatchObject({ code, message: "Capability connection verification is unavailable" })
    expect(JSON.stringify(reason.error)).not.toContain(key)
  })
}

it.live("fixed vendor routes and exact authorization produce frozen vendor identity proofs", () => Effect.gen(function* () {
  const f = yield* fixture((req) => Response.json(new URL(req.url).pathname === "/api/auth.test" ?
    { ...slack, team: key, user: key, url: `https://untrusted.invalid/${key}`, secret: key, scope: "admin" }
    : { id: "123456789012345678", bot: true, username: key, token: key }))
  expect(Object.isFrozen(f.verifier)).toBe(true)
  const s = yield* f.verifier.verify({ provider: "slack", key, label: "caller identity T999/U999" })
  const d = yield* f.verifier.verify({ provider: "discord", key, label: "caller identity 999" })
  expect(s).toMatchObject({ provider: "slack", endpoint: "https://slack.com/api",
    integrationID: "capability.slack", subjectID: '["T123","U456","B789"]' })
  expect(d).toMatchObject({ provider: "discord", endpoint: "https://discord.com/api/v10",
    integrationID: "capability.discord", subjectID: "123456789012345678" })
  ;[s, d].forEach((proof) => {
    expect(Object.isFrozen(proof)).toBe(true)
    expect(Object.keys(proof).sort()).toEqual(["endpoint", "integrationID", "provider", "scopeHash", "subjectID"])
    expect(proof.scopeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(proof)).not.toContain(key)
    expect(JSON.stringify(proof)).not.toContain("untrusted.invalid")
  })
  expect(f.seen).toEqual([
    { path: "/api/auth.test", method: "POST", authorization: `Bearer ${key}`, body: "{}", contentType: "application/json" },
    { path: "/api/v10/users/@me", method: "GET", authorization: `Bot ${key}`, body: "", contentType: null },
  ])
}))

it.live("hash binds exact key, fixed endpoint, and verified subject; ignores labels and fixture origins", () => Effect.gen(function* () {
  const identity = { ...slack }
  const f = yield* fixture(() => Response.json(identity))
  const g = yield* fixture(() => Response.json(slack))
  const first = yield* f.verifier.verify({ provider: "slack", key })
  expect(yield* f.verifier.verify({ provider: "slack", key, label: "new label" })).toEqual(first)
  expect(yield* g.verifier.verify({ provider: "slack", key })).toEqual(first)
  expect((yield* f.verifier.verify({ provider: "slack", key: key + "-changed" })).scopeHash).not.toBe(first.scopeHash)
  identity.team_id = "T999"
  const team = yield* f.verifier.verify({ provider: "slack", key })
  expect(team.subjectID).toBe('["T999","U456","B789"]')
  expect(team.scopeHash).not.toBe(first.scopeHash)
  identity.user_id = "W999"
  expect((yield* f.verifier.verify({ provider: "slack", key })).scopeHash).not.toBe(team.scopeHash)
  identity.bot_id = "B999"
  expect((yield* f.verifier.verify({ provider: "slack", key })).subjectID).toBe('["T999","W999","B999"]')
  const user = yield* fixture(() => Response.json({ ok: true, team_id: "T123", user_id: "U456" }))
  expect((yield* user.verifier.verify({ provider: "slack", key })).subjectID).toBe('["T123","U456",null]')
}))

const badSlack = [
  { ...slack, ok: false }, { ...slack, ok: "true" }, { ok: true, user_id: "U456" }, { ok: true, team_id: "T123" },
  { ...slack, team_id: "U123" }, { ...slack, user_id: "T456" }, { ...slack, bot_id: "U789" },
  { ...slack, team_id: "T123\n" }, { ...slack, user_id: "U456\n" }, { ...slack, bot_id: "B789\n" },
  { ...slack, team_id: "T" + "A".repeat(64) }, { ...slack, user_id: "U" }, { ...slack, bot_id: null },
  { ...slack, team_id: key }, { ...slack, user_id: key }, { ...slack, bot_id: key }, null, [],
]
badSlack.forEach((body, index) => it.live(`Slack rejects missing/mismatched identity or false ok ${index}`, () => Effect.gen(function* () {
  const f = yield* fixture(() => Response.json(body))
  rejected(yield* f.verifier.verify({ provider: "slack", key }).pipe(Effect.exit), "connection_unavailable")
  expect(f.seen).toHaveLength(1)
})))

;["invalid_auth", "token_revoked", "token_expired", "not_authed", "account_inactive", key].forEach((error) =>
  it.live(`Slack rejection sanitized ${error === key ? "adversarial text" : error}`, () => Effect.gen(function* () {
    const f = yield* fixture(() => Response.json({ ...slack, ok: false, error, detail: key }))
    rejected(yield* f.verifier.verify({ provider: "slack", key }).pipe(Effect.exit),
      error === key ? "connection_unavailable" : "authentication_required")
  })))

;[{ bot: true }, { id: 123, bot: true }, { id: "", bot: true }, { id: "123\n", bot: true },
  { id: "1".repeat(21), bot: true }, { id: "U123", bot: true }, { id: key, bot: true },
  { user: { id: "123" }, bot: true }, null, [], "malformed-user"].forEach((body, index) =>
  it.live(`Discord rejects missing/mismatched identity ${index}`, () => Effect.gen(function* () {
    const f = yield* fixture(() => Response.json(body))
    rejected(yield* f.verifier.verify({ provider: "discord", key }).pipe(Effect.exit), "connection_unavailable")
    expect(f.seen).toHaveLength(1)
  })))

;[undefined, null, false, "true", 1, {}, [], key].forEach((bot, index) =>
  it.live(`Discord requires explicit vendor bot true ${index}`, () => Effect.gen(function* () {
    const f = yield* fixture(() => Response.json({ id: "123", bot, username: key }))
    rejected(yield* f.verifier.verify({ provider: "discord", key }).pipe(Effect.exit), "connection_unavailable")
    expect(f.seen).toHaveLength(1)
  })))

it.live("valid-looking provider identity cannot echo exact credential into proof", () => Effect.gen(function* () {
  const s = yield* fixture(() => Response.json(slack))
  rejected(yield* s.verifier.verify({ provider: "slack", key: "U456" }).pipe(Effect.exit), "connection_unavailable")
  const d = yield* fixture(() => Response.json({ id: "123", bot: true }))
  rejected(yield* d.verifier.verify({ provider: "discord", key: "123" }).pipe(Effect.exit), "connection_unavailable")
}))

it.live("input descriptors, proxies, serializers and bounded strict fields reject before network without executing code", () => Effect.gen(function* () {
  const f = yield* fixture(() => Response.json(slack))
  const calls = { code: 0 }
  const hostile = () => { calls.code++; throw new Error(key) }
  const proxy = new Proxy({}, { get: hostile, ownKeys: hostile, getPrototypeOf: hostile, getOwnPropertyDescriptor: hostile })
  const revoked = Proxy.revocable({}, {})
  revoked.revoke()
  const inputs: unknown[] = [null, [], proxy, revoked.proxy, { provider: "slack", key: proxy },
    { provider: "slack", get key() { return hostile() } }, { provider: "slack", key, toJSON: hostile },
    Object.create({ provider: "slack", key }), Object.defineProperty({ provider: "slack" }, "key", { value: key }),
    { provider: "slack", key, [Symbol("hidden")]: key }, { provider: "unsupported", key },
    { provider: "slack", key: "" }, { provider: "slack", key: " " + key }, { provider: "slack", key: key + "\t" },
    { provider: "slack", key: key + "\r\nheader" }, { provider: "slack", key: "x".repeat(4097) },
    { provider: "slack", key, label: "x".repeat(129) }, { provider: "slack", key, label: proxy },
    ...["endpoint", "subjectID", "credentialID", "agentID", "integrationID", "fixtureOrigin", "transport"].map((field) =>
      ({ provider: "slack", key, [field]: "caller-controlled" })),
  ]
  yield* Effect.forEach(inputs, (input) => f.verifier.verify(input as CapabilitySetup.Input).pipe(Effect.exit,
    Effect.tap((exit) => Effect.sync(() => rejected(exit, "unsupported_schema")))))
  expect(calls.code).toBe(0)
  expect(f.seen).toEqual([])
  yield* f.verifier.verify({ provider: "slack", key: "x".repeat(4096), label: "x".repeat(128) })
  expect(f.seen).toHaveLength(1)
}))

;(["slack", "discord"] as const).forEach((provider) =>
  it.live(`${provider} rejects internal key whitespace before network; exact valid key succeeds`, () => Effect.gen(function* () {
    const f = yield* fixture(() => Response.json(provider === "slack" ? slack : { id: "123", bot: true }))
    yield* Effect.forEach([" ", "\t", "\r", "\n", "\v", "\f", "\u00a0", "\u2003", "\ufeff"], (space) =>
      f.verifier.verify({ provider, key: `fixture${space}secret` }).pipe(Effect.exit,
        Effect.tap((exit) => Effect.sync(() => rejected(exit, "unsupported_schema")))))
    expect(f.seen).toEqual([])
    expect((yield* f.verifier.verify({ provider, key })).provider).toBe(provider)
    expect(f.seen).toHaveLength(1)
    expect(f.seen[0].authorization).toBe(`${provider === "slack" ? "Bearer" : "Bot"} ${key}`)
  })))

it.live("captures input and construction options before effects; later mutation cannot switch identity or origin", () => Effect.gen(function* () {
  const f = yield* fixture(() => Response.json(slack))
  const input: { provider: CapabilitySetup.Provider; key: string } = { provider: "slack", key }
  const pending = f.verifier.verify(input)
  input.provider = "discord"
  input.key = "changed"
  expect((yield* pending).provider).toBe("slack")
  const options = { fixtureOrigin: f.server.url.origin, timeoutMs: 1000 }
  const building = CapabilityConnectionVerification.make(options)
  options.fixtureOrigin = "https://untrusted.invalid"
  options.timeoutMs = 0
  const verifier = yield* building
  yield* verifier.verify({ provider: "slack", key })
  expect(f.seen.map((req) => req.authorization)).toEqual([`Bearer ${key}`, `Bearer ${key}`])
}))

it.live("fixed origin validation and transport bounds reject unsafe construction", () => Effect.gen(function* () {
  const f = yield* fixture(() => Response.json(slack))
  const calls = { code: 0 }
  const hostile = () => { calls.code++; throw new Error(key) }
  const invalid: unknown[] = [
    ...["https://slack.com", "https://127.0.0.1", "http://untrusted.invalid", "http://127.0.0.1@untrusted.invalid",
      `${f.server.url.origin}/api`, `${f.server.url.origin}?q=x`, `${f.server.url.origin}#fragment`,
      f.server.url.origin.replace("//", "//user:pass@"), "", "not a URL"].map((fixtureOrigin) => ({ fixtureOrigin })),
    ...[0, -1, 1.5, Infinity, 60001].map((timeoutMs) => ({ timeoutMs })),
    ...[0, -1, 1.5, Infinity, 1048577].map((maxResponseBytes) => ({ maxResponseBytes })),
    { endpoint: f.server.url.origin }, { transport: () => Response.json(slack) },
    new Proxy({}, { ownKeys: hostile, getPrototypeOf: hostile, get: hostile }),
    { get fixtureOrigin() { return hostile() } }, { fixtureOrigin: f.server.url.origin, toJSON: hostile },
  ]
  yield* Effect.forEach(invalid, (options) => CapabilityConnectionVerification.make(options as CapabilityConnectionVerification.Options)
    .pipe(Effect.exit, Effect.tap((exit) => Effect.sync(() => rejected(exit, "unsupported_schema")))))
  expect(f.seen).toEqual([])
  expect(calls.code).toBe(0)
  expect(Object.isFrozen(yield* CapabilityConnectionVerification.make({ timeoutMs: 60000, maxResponseBytes: 1048576 }))).toBe(true)
}))

;[401, 403, 404, 429, 500].forEach((status) => it.live(`HTTP ${status} exposes constant failure only`, () => Effect.gen(function* () {
  const f = yield* fixture(() => Response.json({ secret: key, message: key }, { status }))
  rejected(yield* f.verifier.verify({ provider: "discord", key }).pipe(Effect.exit),
    status === 401 || status === 403 ? "authentication_required" : "connection_unavailable")
})))

it.live("redirect never forwards authorization to second server", () => Effect.gen(function* () {
  const receiver = yield* fixture(() => Response.json(slack))
  const f = yield* fixture(() => new Response(key, { status: 302, headers: { location: receiver.server.url.href + "stolen" } }))
  rejected(yield* f.verifier.verify({ provider: "slack", key }).pipe(Effect.exit), "connection_unavailable")
  yield* Effect.sleep("20 millis")
  expect(receiver.seen).toEqual([])
  expect(f.seen).toHaveLength(1)
  yield* receiver.verifier.verify({ provider: "slack", key })
  expect(receiver.seen).toHaveLength(1)
}))

it.live("byte ceiling and malformed JSON reject bounded actual HTTP responses", () => Effect.gen(function* () {
  const f = yield* fixture(() => Response.json({ ...slack, padding: key.repeat(100) }), { maxResponseBytes: 128 })
  rejected(yield* f.verifier.verify({ provider: "slack", key }).pipe(Effect.exit), "connection_unavailable")
  const invalid = yield* fixture(() => new Response(key))
  rejected(yield* invalid.verifier.verify({ provider: "slack", key }).pipe(Effect.exit), "connection_unavailable")
  expect(f.seen).toHaveLength(1)
  const exact = JSON.stringify(slack)
  const bounded = yield* fixture(() => new Response(exact), { maxResponseBytes: Buffer.byteLength(exact) })
  expect((yield* bounded.verifier.verify({ provider: "slack", key })).subjectID).toBe('["T123","U456","B789"]')
}))

it.live("timeout bounds header wait", () => Effect.gen(function* () {
  const f = yield* fixture(async () => { await Bun.sleep(100); return Response.json(slack) }, { timeoutMs: 30 })
  rejected(yield* f.verifier.verify({ provider: "slack", key }).pipe(Effect.exit), "connection_unavailable")
  expect(f.seen).toHaveLength(1)
}))

it.live("timeout also bounds unfinished response body", () => Effect.gen(function* () {
  const f = yield* fixture(() => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("{")) },
  })), { timeoutMs: 30 })
  rejected(yield* f.verifier.verify({ provider: "slack", key }).pipe(Effect.exit), "connection_unavailable")
  expect(f.seen).toHaveLength(1)
}))

it.live("native cancellation aborts shared HTTP body wait and preserves interruption", () => Effect.gen(function* () {
  const received = yield* Deferred.make<void>()
  const aborted = yield* Deferred.make<void>()
  const f = yield* fixture((request) => {
    request.signal.addEventListener("abort", () => Deferred.doneUnsafe(aborted, Effect.void), { once: true })
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("{")); setImmediate(() => Deferred.doneUnsafe(received, Effect.void)) },
      cancel() { Deferred.doneUnsafe(aborted, Effect.void) },
    }))
  })
  const fiber = yield* f.verifier.verify({ provider: "slack", key }).pipe(Effect.forkChild)
  yield* Deferred.await(received).pipe(Effect.timeout("2 seconds"))
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) return yield* Effect.die("CANCELLATION_BECAME_PROOF")
  expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  yield* Deferred.await(aborted).pipe(Effect.timeout("2 seconds"))
  expect(f.seen).toHaveLength(1)
}))

it.effect("pure Cause projection preserves mixed errors, repeated reasons, defects, interrupts and annotations", () => Effect.gen(function* () {
  const annotations = Context.makeUnsafe(new Map([["verification-test", "keep"]]))
  const known = new Capability.Failure({ code: "target_denied", message: "original mixed error" })
  const defect = new Error("original defect")
  const transport = Cause.makeFailReason(new Failure({ reason: "http", status: 401 })).annotate(annotations)
  const cause = Cause.fromReasons<Failure | Capability.Failure>([
    transport, transport, Cause.makeFailReason(known).annotate(annotations),
    Cause.makeDieReason(defect).annotate(annotations), Cause.makeInterruptReason(42).annotate(annotations),
  ])
  const mapped = CapabilityConnectionVerification.transportCause(cause)
  expect(mapped.reasons).toHaveLength(cause.reasons.length)
  mapped.reasons.forEach((reason) => expect(reason.annotations.get("verification-test")).toBe("keep"))
  expect(mapped.reasons.filter(Cause.isFailReason).map((reason) =>
    reason.error instanceof Capability.Failure ? reason.error.code : undefined)).toEqual([
    "authentication_required", "authentication_required", "target_denied",
  ])
  expect(mapped.reasons.filter(Cause.isFailReason)[2].error).toBe(known)
  expect(mapped.reasons.filter(Cause.isDieReason)[0]).toBe(cause.reasons.filter(Cause.isDieReason)[0])
  expect(mapped.reasons.filter(Cause.isInterruptReason)[0]).toBe(cause.reasons.filter(Cause.isInterruptReason)[0])
  expect(CapabilityConnectionVerification.transportCause(Cause.empty).reasons).toEqual([])
  yield* Effect.void
}))
