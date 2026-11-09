export * as SlackAuth from "./slack-auth"

import { createHash, randomBytes } from "node:crypto"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { Inbox } from "@orchestra/schema/inbox"
import { IntegrationID, IntegrationMethodID } from "@orchestra/schema/integration-id"
import { Credential } from "../credential"
import { makeGlobalNode } from "../effect/app-node"
import { decode, request, validateOptions, type Failure } from "../capability/channel/http"
import { OauthCallbackPage } from "../oauth/page"

export const clientID = "12522069070273.12514210171443"
export const redirectURI = "http://localhost:19877/inbox/slack/callback"
export const scopes = [
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:read",
  "im:history",
  "mpim:read",
  "mpim:history",
] as const

export class Error extends Schema.TaggedErrorClass<Error>()("Inbox.SlackAuthError", {
  reason: Schema.Literals(["busy", "unavailable"]),
}) {}

const Token = Schema.Struct({
  token_type: Schema.Literal("user"),
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.NonEmptyString,
  expires_in: Schema.Number,
  scope: Schema.String,
})
const Metadata = Schema.Struct({
  owner: Schema.String,
  teamID: Schema.NonEmptyString,
  userID: Schema.NonEmptyString,
  team: Schema.NonEmptyString,
  user: Schema.NonEmptyString,
  generation: Schema.optionalKey(Schema.NonEmptyString),
})

type Attempt = {
  id: string
  owner: string
  state: Inbox.SlackStatus["state"]
  expiresAt: number
  verifier: string
  nonce: string
  redirect: string
  controller: AbortController
  server?: Bun.Server<undefined>
  timer?: ReturnType<typeof setTimeout>
}

// Trusted construction only: the public API cannot set provider origins, callback ports or timeouts.
export function make(
  credentials: Credential.Interface,
  options: { fixtureOrigin?: string; port?: number; ttlMs?: number } = {},
) {
  const transport = { fixtureOrigin: options.fixtureOrigin, timeoutMs: 10_000, maxResponseBytes: 256 * 1024 }
  const attempts = new Map<string, Attempt>()
  const lock = Semaphore.makeUnsafe(1)
  const lifetime = { closed: false }
  const slot = (owner: string) => IntegrationID.make(`inbox.slack.${createHash("sha256").update(owner).digest("hex")}`)
  const call = (form: Record<string, string>) =>
    request(
      "https://slack.com",
      "",
      {
        method: "POST",
        path: "/api/oauth.v2.access",
        form,
      },
      transport,
    ).pipe(Effect.flatMap((raw) => decode(Schema.Struct({ ok: Schema.Literal(true) }), raw).pipe(Effect.as(raw))))
  const saved = (owner: string) =>
    Effect.gen(function* () {
      const row = (yield* credentials.list(slot(owner))).at(-1)
      // A dev profile must neither adopt nor rotate the installed app's private Slack grant.
      if (row && !(yield* credentials.inheritedFrom(row.id))) return row
    })
  const finish = (attempt: Attempt, state: Attempt["state"]) => {
    attempt.state = state
    attempt.verifier = ""
    attempt.nonce = ""
    if (attempt.timer) clearTimeout(attempt.timer)
    if (state !== "connected") attempt.controller.abort()
    void attempt.server?.stop()
  }
  const identity = (access: string) =>
    request(
      "https://slack.com",
      `Bearer ${access}`,
      {
        method: "POST",
        path: "/api/auth.test",
        form: {},
      },
      transport,
    ).pipe(
      Effect.flatMap((raw) =>
        decode(
          Schema.Struct({
            ok: Schema.Literal(true),
            team_id: Schema.NonEmptyString,
            user_id: Schema.NonEmptyString,
            team: Schema.NonEmptyString,
            user: Schema.NonEmptyString,
          }),
          raw,
        ),
      ),
    )
  const value = (token: typeof Token.Type, metadata: typeof Metadata.Type): Credential.OAuth => {
    if (
      !Number.isSafeInteger(token.expires_in) ||
      token.expires_in <= 0 ||
      !Number.isSafeInteger(Date.now() + token.expires_in * 1000) ||
      !scopes.every((scope) => token.scope.split(",").includes(scope))
    )
      throw new Error({ reason: "unavailable" })
    return {
      type: "oauth",
      methodID: IntegrationMethodID.make("inbox.slack.pkce"),
      access: token.access_token,
      refresh: token.refresh_token,
      expires: Date.now() + token.expires_in * 1000,
      metadata,
    }
  }
  const persist = (owner: string, token: typeof Token.Type, metadata: typeof Metadata.Type) =>
    Effect.gen(function* () {
      const current = yield* saved(owner)
      const next = yield* Effect.try({
        try: () => value(token, metadata),
        catch: () => new Error({ reason: "unavailable" }),
      })
      if (current) {
        yield* credentials.update(current.id, { value: next })
        return
      }
      yield* credentials.create({ integrationID: slot(owner), value: next, label: "Slack" })
    })
  const exchange = (attempt: Attempt, code: string) =>
    Effect.gen(function* () {
      const raw = yield* call({
        client_id: clientID,
        grant_type: "authorization_code",
        code,
        redirect_uri: attempt.redirect,
        code_verifier: attempt.verifier,
      })
      const grant = yield* decode(
        Schema.Struct({
          authed_user: Schema.Struct({ ...Token.fields, id: Schema.NonEmptyString }),
          team: Schema.Struct({ id: Schema.NonEmptyString }),
        }),
        raw,
      )
      const who = yield* identity(grant.authed_user.access_token)
      if (who.team_id !== grant.team.id || who.user_id !== grant.authed_user.id)
        return yield* new Error({ reason: "unavailable" })
      yield* lock.withPermit(
        Effect.gen(function* () {
          if (attempt.state !== "pending" || Date.now() >= attempt.expiresAt || lifetime.closed)
            return yield* new Error({ reason: "unavailable" })
          yield* persist(attempt.owner, grant.authed_user, {
            owner: attempt.owner,
            teamID: who.team_id,
            userID: who.user_id,
            team: who.team,
            user: who.user,
            generation: randomBytes(32).toString("base64url"),
          })
          finish(attempt, "connected")
        }),
      )
    })
  const page = (status: number, success = false) =>
    new Response(
      success
        ? OauthCallbackPage.success({ provider: "Slack", autoClose: false })
        : OauthCallbackPage.error("", { provider: "Slack" }),
      {
        status,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      },
    )
  const receive = async (attempt: Attempt, req: Request) => {
    if (req.method !== "GET") return page(405)
    const url = new URL(req.url)
    const expected = new URL(attempt.redirect)
    if (![expected.host, `127.0.0.1:${expected.port}`].includes(req.headers.get("host") ?? "")) return page(400)
    if (url.pathname !== expected.pathname) return page(404)
    if (req.headers.has("origin")) return page(400)
    if (
      attempt.state !== "pending" ||
      !attempt.nonce ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== attempt.nonce ||
      Date.now() >= attempt.expiresAt
    )
      return page(400)
    if (url.searchParams.has("error")) {
      finish(attempt, "failed")
      return page(400)
    }
    const code = url.searchParams.get("code")
    if (!code || code.length > 4096 || url.searchParams.getAll("code").length !== 1) return page(400)
    // Consume state before the first asynchronous operation, so concurrent callbacks cannot replay a code.
    attempt.nonce = ""
    const ok = await Effect.runPromise(
      exchange(attempt, code).pipe(
        Effect.as(true),
        Effect.catchCause(() => Effect.succeed(false)),
      ),
      { signal: attempt.controller.signal },
    ).catch(() => false)
    if (!ok && attempt.state === "pending") finish(attempt, "failed")
    return page(ok ? 200 : 400, ok)
  }
  const access = (owner: string) =>
    lock
      .withPermit(
        Effect.gen(function* () {
          if (lifetime.closed || !validateOptions(transport)) return yield* new Error({ reason: "unavailable" })
          const current = yield* saved(owner)
          if (!current || current.value.type !== "oauth") return yield* new Error({ reason: "unavailable" })
          const metadata = yield* decode(Metadata, current.value.metadata)
          if (metadata.owner !== owner) return yield* new Error({ reason: "unavailable" })
          if (current.value.expires > Date.now() + 60_000) return current.value.access
          if (yield* credentials.inheritedFrom(current.id)) return yield* new Error({ reason: "unavailable" })
          const raw = yield* call({
            client_id: clientID,
            grant_type: "refresh_token",
            refresh_token: current.value.refresh,
          })
          const token = yield* decode(Token, raw)
          const who = yield* identity(token.access_token)
          if (who.team_id !== metadata.teamID || who.user_id !== metadata.userID)
            return yield* new Error({ reason: "unavailable" })
          yield* persist(owner, token, metadata)
          return token.access_token
        }),
      )
      .pipe(Effect.mapError(() => new Error({ reason: "unavailable" })))

  return {
    start: (owner: string) =>
      lock.withPermit(
        Effect.gen(function* () {
          if (lifetime.closed || !validateOptions(transport)) return yield* new Error({ reason: "unavailable" })
          if ([...attempts.values()].some((attempt) => attempt.state === "pending"))
            return yield* new Error({ reason: "busy" })
          if (attempts.size >= 32) attempts.delete(attempts.keys().next().value!)
          const attempt: Attempt = {
            id: randomBytes(32).toString("base64url"),
            owner,
            state: "pending",
            verifier: randomBytes(32).toString("base64url"),
            nonce: randomBytes(32).toString("base64url"),
            redirect: redirectURI,
            expiresAt: Date.now() + (options.ttlMs ?? 300_000),
            controller: new AbortController(),
          }
          const server = yield* Effect.try({
            try: () =>
              Bun.serve({
                hostname: "127.0.0.1",
                port: options.port ?? 19877,
                fetch: (req) => receive(attempt, req),
                error: () => page(400),
              }),
            catch: () => new Error({ reason: "unavailable" }),
          })
          attempt.server = server
          attempt.redirect = `http://localhost:${server.port}/inbox/slack/callback`
          attempt.timer = setTimeout(() => {
            void Effect.runPromise(
              lock.withPermit(
                Effect.sync(() => {
                  if (attempt.state === "pending") finish(attempt, "expired")
                }),
              ),
            )
          }, options.ttlMs ?? 300_000)
          attempt.timer.unref()
          attempts.set(attempt.id, attempt)
          const url = new URL("https://slack.com/oauth/v2/authorize")
          Object.entries({
            client_id: clientID,
            scope: "",
            user_scope: scopes.join(","),
            redirect_uri: attempt.redirect,
            state: attempt.nonce,
            code_challenge_method: "S256",
            code_challenge: createHash("sha256").update(attempt.verifier).digest("base64url"),
          }).forEach(([key, value]) => url.searchParams.set(key, value))
          return { id: attempt.id, url: url.href, expiresAt: attempt.expiresAt }
        }),
      ),
    status: (owner: string, id?: string): Effect.Effect<Inbox.SlackStatus> =>
      Effect.gen(function* () {
        const connected = yield* access(owner).pipe(
          Effect.as(true),
          Effect.catch(() => Effect.succeed(false)),
        )
        const current = connected ? yield* saved(owner) : undefined
        const metadata = current?.value.metadata
        const attempt = id ? attempts.get(id) : undefined
        return {
          connected,
          ...(connected && typeof metadata?.team === "string" ? { team: metadata.team } : {}),
          ...(connected && typeof metadata?.user === "string" ? { user: metadata.user } : {}),
          state: id ? (attempt?.owner === owner ? attempt.state : "expired") : connected ? "connected" : "idle",
        }
      }),
    cancel: (owner: string, id: string) =>
      lock.withPermit(
        Effect.sync(() => {
          const attempt = attempts.get(id)
          if (attempt?.owner === owner && attempt.state === "pending") finish(attempt, "cancelled")
        }),
      ),
    disconnect: (owner: string) =>
      lock
        .withPermit(
          Effect.gen(function* () {
            attempts.forEach((attempt) => {
              if (attempt.owner === owner && attempt.state === "pending") finish(attempt, "cancelled")
            })
            const current = yield* saved(owner)
            if (current) yield* credentials.remove(current.id)
          }),
        )
        .pipe(Effect.mapError(() => new Error({ reason: "unavailable" }))),
    access,
    // Serialize the final generation check and consumer commit with reconnect/disconnect. Refresh happens
    // before taking this permit; reread the token under it rather than using a possibly replaced grant.
    withConnection: <A, E, R>(
      owner: string,
      generation: string | undefined,
      body: (connection: {
        access: string
        generation: string
        teamID: string
        userID: string
        rpc: (input: Parameters<typeof request>[2]) => Effect.Effect<Schema.Json, Failure>
      }) => Effect.Effect<A, E, R>,
    ) =>
      access(owner).pipe(
        Effect.flatMap(() =>
          lock.withPermit(
            Effect.gen(function* () {
              const current = yield* saved(owner)
              if (lifetime.closed || !current || current.value.type !== "oauth")
                return yield* new Error({ reason: "unavailable" })
              const metadata = yield* decode(Metadata, current.value.metadata)
              const identity = metadata.generation ?? current.id
              if (metadata.owner !== owner || (generation !== undefined && generation !== identity))
                return yield* new Error({ reason: "unavailable" })
              const token = current.value.access
              return yield* body({
                access: token,
                generation: identity,
                teamID: metadata.teamID,
                userID: metadata.userID,
                rpc: (input) => request("https://slack.com", `Bearer ${token}`, input, transport),
              })
            }),
          ),
        ),
      ),
    close: async () => {
      lifetime.closed = true
      await Effect.runPromise(
        lock.withPermit(
          Effect.sync(() => {
            attempts.forEach((attempt) => {
              if (attempt.state === "pending") finish(attempt, "cancelled")
            })
          }),
        ),
      )
      await Promise.all([...attempts.values()].map((attempt) => attempt.server?.stop(true)))
      attempts.clear()
    },
  }
}

export class Service extends Context.Service<Service, ReturnType<typeof make>>()("@orchestra/InboxSlackAuth") {}
export const node = makeGlobalNode({
  service: Service,
  deps: [Credential.node],
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      return yield* Effect.acquireRelease(
        Effect.sync(() => make(credentials)),
        (auth) => Effect.promise(() => auth.close()),
      )
    }),
  ),
})
