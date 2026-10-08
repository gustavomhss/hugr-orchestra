import { expect } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Context, Effect, Fiber, Layer, Schema } from "effect"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { Credential } from "../../src/credential"
import { Database } from "../../src/database/database"
import { EventV2 } from "../../src/event"
import { LayerNode } from "../../src/effect/layer-node"
import { Integration } from "../../src/integration"
import { Siwc } from "../../src/auth/siwc"
import { SiwcRefresh } from "../../src/auth/siwc-refresh"
import { it } from "../lib/effect"

const fixture = Effect.fn(function* () {
  const directory = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "siwc-refresh-")))
  yield* Effect.addFinalizer(() => Effect.promise(() => rm(directory, { recursive: true, force: true })))
  const filename = join(directory, "store.db")
  const key = yield* Effect.promise(() => generateKeyPair("RS256", { extractable: true }))
  const refreshKey = yield* Effect.promise(() => generateKeyPair("RS256", { extractable: true }))
  const alien = yield* Effect.promise(() => generateKeyPair("RS256"))
  const jwk = yield* Effect.promise(() => exportJWK(key.publicKey))
  const refreshJwk = yield* Effect.promise(() => exportJWK(refreshKey.publicKey))
  const clientId = "fixture-issued-client"
  const subject = "fixture-subject"
  const authTime = Math.floor(Date.now() / 1000) - 300
  const sign = (claims: Record<string, unknown>, badKey = false, signingIn = false) => new SignJWT({ iss: Siwc.issuer, aud: clientId,
    sub: subject, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: signingIn ? "signin-key" : "refresh-key" })
    .sign(badKey ? alien.privateKey : signingIn ? key.privateKey : refreshKey.privateKey)
  const attempt = Siwc.begin({ hostId: "fixture-host", redirect: "http://127.0.0.1:54321/auth/callback" })
  const original = yield* Effect.promise(() => sign({ nonce: attempt.nonce, auth_time: authTime }, false, true))
  const control: { mode: string; retired: boolean; signInToken: string; forms: Array<Record<string, string>>; block?: { entered: ReturnType<typeof Promise.withResolvers<void>>; release: ReturnType<typeof Promise.withResolvers<void>> } } = { mode: "normal", retired: false, signInToken: original, forms: [] }
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/jwks") return Response.json({ keys: [
      ...control.retired ? [] : [{ ...jwk, kid: "signin-key", alg: "RS256", use: "sig" }],
      { ...refreshJwk, kid: "refresh-key", alg: "RS256", use: "sig" },
    ] })
    const form = Object.fromEntries(new URLSearchParams(await request.text()))
    control.forms.push(form)
    if (form.grant_type === "authorization_code") return Response.json({ access_token: "fixture-expired",
      refresh_token: "fixture-refresh", token_type: "Bearer", expires_in: 3600, scope: Siwc.scopes, id_token: control.signInToken })
    const block = control.block
    block?.entered.resolve()
    if (block) await block.release.promise
    const claims = control.mode === "nonce" ? { nonce: attempt.nonce } : control.mode === "bad-nonce" ? { nonce: "wrong" }
      : control.mode === "subject" ? { sub: "wrong" } : control.mode === "issuer" ? { iss: "https://wrong.example" }
      : control.mode === "audience" ? { aud: "wrong" } : control.mode === "expired" ? { exp: 1 }
      : control.mode === "auth-time" ? { auth_time: authTime + 1 } : {}
    return Response.json({ access_token: "fixture-access", token_type: "Bearer", expires_in: 3600,
      ...(control.mode === "omit-refresh" || control.mode === "omit-both" ? {} : { refresh_token: "fixture-rotated" }),
      ...(control.mode === "omit-scope" || control.mode === "omit-both" ? {} : { scope: control.mode === "revoked" ? "openid email" : Siwc.scopes }),
      ...(control.mode === "no-id" || control.mode === "revoked" ? {} : { id_token: await sign(claims, control.mode === "signature") }) })
  } })), (server) => Effect.sync(() => server.stop(true)))
  const callback = new URL(attempt.redirect)
  callback.search = new URLSearchParams({ state: attempt.state, code: "fixture-code", client_id: clientId }).toString()
  const authorized = yield* Effect.promise(() => Siwc.exchange(attempt, callback, Integration.MethodID.make("chatgpt-browser"),
    (_url, init) => fetch(new URL("/token", server.url), init), new URL("/jwks", server.url)))
  const expiredHint = yield* Effect.promise(() => sign({ nonce: attempt.nonce, auth_time: authTime,
    iat: Math.floor(Date.now() / 1000) - 100, exp: Math.floor(Date.now() / 1000) - 1 }, false, true))
  const initial = Credential.OAuth.make({ ...authorized, expires: 1, metadata: { ...authorized.metadata, idToken: expiredHint } })
  control.forms.splice(0)
  const layer = Credential.layerFrom(undefined).pipe(Layer.provide(Database.layerFromPath(filename)))
  const credentials = Context.get(yield* Layer.build(Layer.fresh(layer)), Credential.Service)
  const created = yield* credentials.create({ integrationID: Integration.ID.make("openai"), label: "original", value: initial })
  const refresh = (value: Credential.OAuth) => Effect.tryPromise(() => SiwcRefresh.exchange(value,
    (url, init) => {
      expect(url).toBe(`${Siwc.issuer}/api/accounts/oauth/token`)
      return fetch(new URL("/token", server.url), init)
    }, new URL("/jwks", server.url)))
  const resolve = () => SiwcRefresh.resolve({ credentials, credentialID: created.id, storePath: filename, refresh })
  const events = Context.get(yield* Layer.build(Layer.fresh(LayerNode.compile(EventV2.node))), EventV2.Service)
  const location = Effect.fn(function* () {
    const integration = Context.get(yield* Layer.build(Layer.fresh(Integration.locationLayerFrom(filename).pipe(
      Layer.provide(Layer.merge(Layer.succeed(Credential.Service, credentials), Layer.succeed(EventV2.Service, events))),
    ))), Integration.Service)
    yield* integration.transform((draft) => draft.method.update({ integrationID: Integration.ID.make("openai"),
      method: { type: "oauth", id: initial.methodID, label: "fixture" }, authorize: () => Effect.fail("unused"), refresh }))
    return integration
  })
  const connection = { type: "credential" as const, id: created.id, label: created.label }
  return { directory, filename, credentials, created, initial, control, resolve, refresh, location, connection, server, sign, authTime }
})

it.live("SQLite value CAS preserves labels, rejects stale/key replacements and never resurrects deleted credentials", () => Effect.gen(function* () {
  const f = yield* fixture()
  const next = Credential.OAuth.make({ ...f.initial, access: "fixture-next" })
  yield* f.credentials.update(f.created.id, { label: "renamed" })
  expect(yield* f.credentials.replaceValueIf(f.created.id, f.initial, next)).toBe(true)
  expect(yield* f.credentials.replaceValueIf(f.created.id, f.initial, f.initial)).toBe(false)
  expect((yield* f.credentials.get(f.created.id))?.label).toBe("renamed")
  const key = Credential.Key.make({ type: "key", key: "fixture-key-replacement" })
  yield* f.credentials.update(f.created.id, { value: key })
  expect(yield* f.credentials.replaceValueIf(f.created.id, next, f.initial)).toBe(false)
  expect((yield* f.credentials.get(f.created.id))?.value).toEqual(key)
  yield* f.credentials.remove(f.created.id)
  expect(yield* f.credentials.replaceValueIf(f.created.id, key, f.initial)).toBe(false)
  expect(yield* f.credentials.get(f.created.id)).toBeUndefined()
}))

it.live("two Location-scoped integrations refresh one credential once; raw expired lookup does not refresh", () => Effect.gen(function* () {
  const f = yield* fixture()
  const first = yield* f.location()
  const second = yield* f.location()
  expect(first).not.toBe(second)
  expect(yield* first.connection.saved(f.connection)).toEqual(f.initial)
  expect(f.control.forms).toEqual([])
  const values = yield* Effect.all([first.connection.resolve(f.connection), second.connection.resolve(f.connection)], { concurrency: "unbounded" })
  expect(values[0]).toEqual(values[1])
  expect(f.control.forms).toEqual([{ grant_type: "refresh_token", client_id: "fixture-issued-client",
    refresh_token: "fixture-refresh", resource: Siwc.resource }])
  expect((yield* f.credentials.get(f.created.id))?.value).toEqual(values[0])
}))

it.live("a separate process waits on the same public-ID/store-path lease and rereads the rotated token", () => Effect.gen(function* () {
  const f = yield* fixture()
  const block = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  f.control.block = block
  const owner = yield* f.resolve().pipe(Effect.forkChild)
  yield* Effect.promise(() => block.entered.promise)
  const child = Bun.spawn([process.execPath, "-e", `
    import { Effect, Layer } from "effect";
    import { Credential } from "./src/credential";
    import { Database } from "./src/database/database";
    import { SiwcRefresh } from "./src/auth/siwc-refresh";
    const path = process.argv.at(-3), id = process.argv.at(-2), url = process.argv.at(-1);
    if (!path || !id || !url) throw new Error("Missing fixture args");
    await Effect.runPromise(Effect.gen(function* () {
      const credentials = yield* Credential.Service;
      console.log("ready");
      const value = yield* SiwcRefresh.resolve({ credentials, credentialID: Credential.ID.make(id), storePath: path,
        refresh: (value) => Effect.tryPromise(() => SiwcRefresh.exchange(value, (_url, init) => fetch(new URL("/token", url), init), new URL("/jwks", url))) });
      console.log(value?.type === "oauth" ? value.access : "wrong fixture value");
    }).pipe(Effect.provide(Credential.layerFrom(undefined).pipe(Layer.provide(Database.layerFromPath(path))))));
  `, f.filename, f.created.id, f.server.url.href], { cwd: join(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" })
  yield* Effect.addFinalizer(() => Effect.sync(() => { if (child.exitCode === null) child.kill() }))
  const reader = child.stdout.getReader()
  const ready = yield* Effect.promise(() => reader.read())
  expect(new TextDecoder().decode(ready.value)).toContain("ready")
  block.release.resolve()
  yield* Fiber.join(owner)
  const rest = yield* Effect.promise(async () => {
    const chunks: string[] = []
    while (true) { const chunk = await reader.read(); if (chunk.done) return chunks.join(""); chunks.push(new TextDecoder().decode(chunk.value)) }
  })
  expect(yield* Effect.promise(() => child.exited)).toBe(0)
  expect(rest).toContain("fixture-access")
  expect(f.control.forms.length).toBe(1)
}))

it.live("racing auth writes and deletion win over a completed HTTP refresh without blind resolver writes", () => Effect.gen(function* () {
  for (const operation of ["replace", "remove"] as const) {
    const f = yield* fixture()
    const integration = yield* f.location()
    const block = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
    f.control.block = block
    const run = yield* integration.connection.resolve(f.connection).pipe(Effect.forkChild)
    yield* Effect.promise(() => block.entered.promise)
    const key = Credential.Key.make({ type: "key", key: "fixture-new-login" })
    if (operation === "replace") yield* f.credentials.update(f.created.id, { value: key })
    if (operation === "remove") yield* f.credentials.remove(f.created.id)
    block.release.resolve()
    expect(yield* Fiber.join(run)).toEqual(operation === "replace" ? key : undefined)
    expect((yield* f.credentials.get(f.created.id))?.value).toEqual(operation === "replace" ? key : undefined)
  }
}))

it.live("interruption waits for native refresh, atomic replacement and lease release", () => Effect.gen(function* () {
  const f = yield* fixture()
  const block = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  f.control.block = block
  const owner = yield* f.resolve().pipe(Effect.forkChild)
  yield* Effect.promise(() => block.entered.promise)
  const interruption = yield* Fiber.interrupt(owner).pipe(Effect.forkChild)
  const follower = yield* f.resolve().pipe(Effect.forkChild)
  block.release.resolve()
  yield* Fiber.join(interruption)
  expect((yield* Fiber.join(follower))?.type).toBe("oauth")
  expect(f.control.forms.length).toBe(1)
  expect((yield* f.credentials.get(f.created.id))?.value).toMatchObject({ access: "fixture-access", refresh: "fixture-rotated" })
}))

it.live("refresh checks real signatures and original identity/nonce; atomically persists scope loss and omitted ID tokens", () => Effect.gen(function* () {
  const f = yield* fixture()
  for (const mode of ["signature", "subject", "issuer", "audience", "expired", "bad-nonce", "auth-time"]) {
    f.control.mode = mode
    const exit = yield* f.resolve().pipe(Effect.exit)
    expect(exit._tag).toBe("Failure")
    expect((yield* f.credentials.get(f.created.id))?.value).toEqual(f.initial)
  }
  for (const mode of ["normal", "nonce", "no-id", "revoked"]) {
    yield* f.credentials.update(f.created.id, { value: f.initial })
    f.control.mode = mode
    const value = yield* f.resolve()
    expect(value).toMatchObject({ access: "fixture-access", refresh: "fixture-rotated" })
    if (value?.type !== "oauth") throw new Error("Expected fixture OAuth value")
    expect(value.expires).toBeGreaterThan(Date.now())
    expect((yield* f.credentials.get(f.created.id))?.value).toEqual(value)
    if (mode === "no-id" || mode === "revoked") expect(value.metadata?.idToken).toBe(f.initial.metadata?.idToken)
    if (mode === "revoked") expect(() => Siwc.requirePlanUsage(value)).toThrow("plan use is not authorized")
  }
}))

it.live("retired original key is unnecessary; optional refresh fields retain the captured rotated grant", () => Effect.gen(function* () {
  const f = yield* fixture()
  const original = Siwc.continuity(f.initial.metadata)
  expect(original).toMatchObject({ issuer: Siwc.issuer, clientId: "fixture-issued-client", subject: "fixture-subject",
    audiences: ["fixture-issued-client"], authTime: f.authTime })
  f.control.retired = true
  const jwks = yield* Effect.promise(async () => Schema.decodeUnknownSync(Schema.fromJsonString(
    Schema.Struct({ keys: Schema.Array(Schema.Struct({ kid: Schema.String })) }),
  ))(await (await fetch(new URL("/jwks", f.server.url))).text()))
  expect(jwks.keys.map((key) => key.kid)).toEqual(["refresh-key"])
  // First refresh rotates with new-key-only JWKS, then omission must retain
  // that replacement rather than the pre-rotation refresh token or grant.
  const rotated = yield* f.resolve()
  if (rotated?.type !== "oauth") throw new Error("Expected rotated fixture")
  expect(rotated.refresh).toBe("fixture-rotated")
  expect(rotated.metadata?.idToken).not.toBe(f.initial.metadata?.idToken)
  for (const mode of ["omit-refresh", "omit-scope", "omit-both", "revoked", "omit-both"]) {
    const captured = (yield* f.credentials.get(f.created.id))?.value
    if (captured?.type !== "oauth") throw new Error("Expected captured fixture")
    yield* f.credentials.update(f.created.id, { value: Credential.OAuth.make({ ...captured, expires: 1 }) })
    f.control.mode = mode
    const next = yield* f.resolve()
    if (next?.type !== "oauth") throw new Error("Expected refreshed fixture")
    expect(next.refresh).toBe("fixture-rotated")
    expect(f.control.forms.at(-1)?.refresh_token).toBe(captured.refresh)
    expect(next.metadata?.validatedIdentity).toEqual(f.initial.metadata?.validatedIdentity)
    expect((yield* f.credentials.get(f.created.id))?.value).toEqual(next)
    if (mode !== "revoked") expect(next.metadata?.scopes).toEqual(captured.metadata?.scopes)
    if (mode === "revoked") expect(next.metadata?.scopes).toEqual(["openid", "email"])
  }
  const limited = (yield* f.credentials.get(f.created.id))?.value
  if (limited?.type !== "oauth") throw new Error("Expected limited fixture")
  expect(() => Siwc.requirePlanUsage(limited)).toThrow("plan use is not authorized")
}))

it.live("unverified sign-in cannot produce continuity; missing or conflicting stored facts fail before HTTP", () => Effect.gen(function* () {
  const f = yield* fixture()
  const attempt = Siwc.begin({ hostId: "fixture-host", redirect: "http://127.0.0.1:54321/auth/callback" })
  f.control.signInToken = yield* Effect.promise(() => f.sign({ nonce: attempt.nonce }, true, true))
  const callback = new URL(attempt.redirect)
  callback.search = new URLSearchParams({ state: attempt.state, code: "fixture-code", client_id: "fixture-issued-client" }).toString()
  const failed = yield* Effect.tryPromise(() => Siwc.exchange(attempt, callback, f.initial.methodID,
    (_url, init) => fetch(new URL("/token", f.server.url), init), new URL("/jwks", f.server.url))).pipe(Effect.exit)
  expect(failed._tag).toBe("Failure")
  const before = f.control.forms.length
  for (const identity of [undefined, { ...Siwc.continuity(f.initial.metadata), subject: "wrong" }]) {
    yield* f.credentials.update(f.created.id, { value: Credential.OAuth.make({ ...f.initial,
      metadata: { ...f.initial.metadata, validatedIdentity: identity } }) })
    expect((yield* f.resolve().pipe(Effect.exit))._tag).toBe("Failure")
  }
  expect(f.control.forms.length).toBe(before)
}))

it.live("inherited credentials reject CAS and refresh before HTTP", () => Effect.gen(function* () {
  const f = yield* fixture()
  const release = join(f.directory, "release.db")
  const installed = yield* Effect.scoped(Effect.gen(function* () {
    const store = Context.get(yield* Layer.build(Layer.fresh(Credential.layerFrom(undefined).pipe(Layer.provide(Database.layerFromPath(release))))), Credential.Service)
    return yield* store.create({ integrationID: Integration.ID.make("openai"), value: f.initial })
  }))
  const dev = join(f.directory, "dev.db")
  const credentials = Context.get(yield* Layer.build(Layer.fresh(Credential.layerFrom(release).pipe(Layer.provide(Database.layerFromPath(dev))))), Credential.Service)
  expect(yield* credentials.inheritedFrom(installed.id)).toBe(release)
  expect((yield* credentials.get(installed.id))?.value).toEqual(f.initial)
  expect((yield* credentials.replaceValueIf(installed.id, f.initial, f.initial).pipe(Effect.flip))).toBeInstanceOf(Credential.InheritedError)
  const exit = yield* SiwcRefresh.resolve({ credentials, credentialID: installed.id, storePath: dev,
    refresh: f.refresh }).pipe(Effect.exit)
  expect(exit._tag).toBe("Failure")
  expect(f.control.forms).toEqual([])
  expect((yield* credentials.get(installed.id))?.value).toEqual(f.initial)
}))
