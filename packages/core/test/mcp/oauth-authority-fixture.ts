import path from "path"
import { Context, Deferred, Effect, Layer, Schema } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { FSUtil } from "@orchestra/core/fs-util"
import { auth } from "@modelcontextprotocol/sdk/client/auth.js"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { McpOAuthPendingProvider, McpOAuthProvider } from "@orchestra/core/mcp/oauth-provider"
import { McpAuth } from "@orchestra/core/mcp/auth"
import { Mcp } from "@orchestra/core/mcp"
import { Config } from "@orchestra/core/config"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { tmpdir } from "../fixture/tmpdir"
import { location } from "../fixture/location"

export const storage = Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )
  const file = path.join(tmp.path, "mcp-auth.json")
  const fs = Context.get(yield* Layer.build(AppNodeBuilder.build(FSUtil.node)), FSUtil.Service)
  const cipher = Context.get(yield* Layer.build(AppNodeBuilder.build(CredentialCipher.node)), CredentialCipher.Service)
  const controls = {
    firstRead: undefined as { entered: Deferred.Deferred<void>; release: Deferred.Deferred<void> } | undefined,
    secondContended: undefined as Deferred.Deferred<void> | undefined,
    secondReads: 0,
  }
  const fileSystem = (role: "first" | "second") =>
    Layer.succeed(
      FSUtil.Service,
      FSUtil.Service.of({
        ...fs,
        readJson: (target) =>
          Effect.gen(function* () {
            const value = yield* fs.readJson(target.endsWith("mcp-auth.json") ? file : target)
            if (!target.endsWith("mcp-auth.json")) return value
            if (role === "second") controls.secondReads++
            const hold = role === "first" ? controls.firstRead : undefined
            if (hold) {
              controls.firstRead = undefined
              yield* Deferred.succeed(hold.entered, undefined)
              yield* Deferred.await(hold.release)
            }
            return value
          }),
        writeJson: (target, value, mode) => fs.writeJson(target.endsWith("mcp-auth.json") ? file : target, value, mode),
        rename: (from, to) =>
          fs.rename(
            from.endsWith("mcp-auth.json") ? file : from,
            to.includes("mcp-auth.json.corrupt-") ? path.join(tmp.path, path.basename(to)) : to,
          ),
        makeDirectory: (target, options) =>
          fs
            .makeDirectory(target, options)
            .pipe(
              Effect.tapError((error) =>
                role === "second" &&
                target.endsWith(".lock") &&
                controls.secondContended &&
                ["AlreadyExists", "PermissionDenied", "Busy"].includes(error.reason._tag)
                  ? Deferred.succeed(controls.secondContended, undefined).pipe(Effect.asVoid)
                  : Effect.void,
              ),
            ),
      }),
    )
  const fsLayer = fileSystem("first")
  const global = Global.layerWith({
    home: tmp.path,
    data: tmp.path,
    state: path.join(tmp.path, "state"),
    config: path.join(tmp.path, "global"),
  })
  const first = Context.get(
    yield* Layer.build(
      AppNodeBuilder.build(McpAuth.node, [
        [FSUtil.node, fsLayer],
        [Global.node, global],
      ]).pipe(Layer.fresh),
    ),
    McpAuth.Service,
  )
  const second = Context.get(
    yield* Layer.build(
      AppNodeBuilder.build(McpAuth.node, [
        [FSUtil.node, fileSystem("second")],
        [Global.node, global],
      ]).pipe(Layer.fresh),
    ),
    McpAuth.Service,
  )
  return {
    first,
    second,
    file,
    directory: tmp.path,
    fsLayer,
    controls,
    seed: (data: Record<string, unknown>) => fs.writeJson(file, cipher.seal(JSON.stringify(data)), 0o600),
  }
})

export async function signIn(input: {
  auth: McpAuth.Interface
  url: string
  metadata: URL
  name?: string
  config?: { clientId?: string; clientSecret?: string }
}) {
  const name = input.name ?? "remote"
  const flow = await Effect.runPromise(input.auth.begin(name, input.url))
  const redirect: { url?: URL } = {}
  const pending = new McpOAuthPendingProvider(
    name,
    input.url,
    input.config ?? {},
    {
      onRedirect: (url) => {
        redirect.url = url
      },
    },
    input.auth,
    flow.binding,
  )
  const redirected = await auth(pending, { serverUrl: input.url, resourceMetadataUrl: input.metadata })
  if (redirected !== "REDIRECT") throw new Error("OAuth fixture did not begin its manual authorization")
  const state = redirect.url?.searchParams.get("state")
  if (!state) throw new Error("OAuth fixture did not produce a bound callback state")
  await Effect.runPromise(input.auth.consumeState(flow.binding, state))
  const authorized = await auth(pending, {
    serverUrl: input.url,
    resourceMetadataUrl: input.metadata,
    authorizationCode: "FIXTURE_CODE",
  })
  if (authorized !== "AUTHORIZED") throw new Error("OAuth fixture did not complete its manual exchange")
  await pending.commit()
  const binding = await Effect.runPromise(input.auth.checkout(name, input.url))
  return {
    binding,
    pending,
    provider: new McpOAuthProvider(name, input.url, input.config ?? {}, { onRedirect: () => {} }, input.auth, binding),
  }
}

export function endpoints() {
  const state = {
    issuer: "",
    public: false,
    tokenFailureA: false,
    metadataIssuer: undefined as string | undefined,
    registrationA: undefined as
      | {
          entered: ReturnType<typeof Promise.withResolvers<void>>
          release: ReturnType<typeof Promise.withResolvers<void>>
        }
      | undefined,
  }
  const calls: { server: string; path: string; body: string; authorization: string | null }[] = []
  const makeIssuer = (name: string) =>
    Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url)
        const body = await request.text()
        calls.push({ server: name, path: url.pathname, body, authorization: request.headers.get("authorization") })
        if (url.pathname.startsWith("/.well-known/"))
          return Response.json({
            issuer: state.metadataIssuer ?? url.origin,
            authorization_endpoint: `${url.origin}/authorize`,
            token_endpoint: `${url.origin}/token`,
            registration_endpoint: `${url.origin}/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
            code_challenge_methods_supported: ["S256"],
          })
        if (url.pathname === "/register") {
          if (name === "A" && state.registrationA) {
            state.registrationA.entered.resolve()
            await state.registrationA.release.promise
          }
          return Response.json(
            { ...JSON.parse(body), client_id: `client_${name}`, client_secret: `CLIENT_SECRET_${name}` },
            { status: 201 },
          )
        }
        if (url.pathname === "/token" && name === "A" && state.tokenFailureA)
          return Response.json({ error: "temporarily_unavailable" }, { status: 503 })
        if (url.pathname === "/token")
          return Response.json({
            access_token: `ACCESS_${name}`,
            refresh_token: `REFRESH_${name}`,
            token_type: "Bearer",
            expires_in: 3600,
          })
        return new Response("not found", { status: 404 })
      },
    })
  const a = makeIssuer("A")
  const b = makeIssuer("B")
  state.issuer = a.url.origin
  const resource = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url)
      const body = await request.text()
      calls.push({ server: "R", path: url.pathname, body, authorization: request.headers.get("authorization") })
      if (url.pathname === "/metadata" || url.pathname.startsWith("/.well-known/"))
        return Response.json({ resource: `${url.origin}/mcp`, authorization_servers: [state.issuer] })
      if (
        state.public ||
        request.headers.get("authorization") === "Bearer ACCESS_A" ||
        request.headers.get("authorization") === "Bearer ACCESS_B"
      ) {
        if (!body) return new Response(null, { status: 405 })
        const message = JSON.parse(body)
        if (message.id === undefined) return new Response(null, { status: 202 })
        return Response.json({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
            capabilities: {},
            serverInfo: { name: "authority-fixture", version: "1" },
          },
        })
      }
      return new Response("OAuth required", {
        status: 401,
        headers: { "www-authenticate": `Bearer resource_metadata="${url.origin}/metadata"` },
      })
    },
  })
  return {
    a,
    b,
    resource,
    state,
    calls,
    url: `${resource.url.origin}/mcp`,
    metadata: new URL(`${resource.url.origin}/metadata`),
    async [Symbol.asyncDispose]() {
      await Promise.all([a.stop(true), b.stop(true), resource.stop(true)])
    },
  }
}

export const network = Effect.acquireRelease(Effect.sync(endpoints), (servers) =>
  Effect.promise(() => servers[Symbol.asyncDispose]()),
)

export const manager = Effect.fn(function* (input: {
  auth: McpAuth.Interface
  directory: string
  url: string
  redirectUri: string
  oauth?: false
}) {
  return Context.get(
    yield* Layer.build(
      AppNodeBuilder.build(Mcp.node, [
        [McpAuth.node, Layer.succeed(McpAuth.Service, input.auth)],
        [Location.node, Layer.succeed(Location.Service, location({ directory: AbsolutePath.make(input.directory) }))],
        [
          Global.node,
          Global.layerWith({
            home: input.directory,
            config: path.join(input.directory, "global"),
            data: path.join(input.directory, "data"),
          }),
        ],
        [
          Config.node,
          Layer.succeed(
            Config.Service,
            Config.Service.of({
              entries: () =>
                Effect.succeed([
                  new Config.Document({
                    type: "document",
                    info: Schema.decodeUnknownSync(Config.Info)({
                      mcp: {
                        servers: {
                          remote: {
                            type: "remote",
                            url: input.url,
                            disabled: false,
                            oauth: input.oauth === false ? false : { redirect_uri: input.redirectUri },
                          },
                        },
                      },
                    }),
                  }),
                ]).pipe(Layer.fresh),
            }),
          ),
        ],
      ]),
    ),
    Mcp.Service,
  )
})

export async function callbackAddress() {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("probe") })
  const url = `http://127.0.0.1:${probe.port}/mcp/oauth/callback`
  await probe.stop(true)
  return url
}
